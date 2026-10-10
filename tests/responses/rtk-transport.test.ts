import { expect, test } from "bun:test";
import { parseRequest } from "../../src/responses/parser";
import { createRtkTransport, registerRtkSource, wrapRtkAdapter, rtkTransportStats } from "../../src/compression/rtk/transport";
import { createGoogleAdapter } from "../../src/adapters/google";
import { createOpenAIChatAdapter } from "../../src/adapters/openai-chat";
import { createResponsesPassthroughAdapter } from "../../src/adapters/openai-responses";
import { chatCompletionsToResponsesBody } from "../../src/chat/inbound";
import { anthropicToResponsesBody } from "../../src/claude/inbound";
import { createTranslatorBudget } from "../../src/lib/translator-budget";
import { configSchema } from "../../src/config/schema/config-schema";
import type { OcxParsedRequest } from "../../src/types";
import type { OcxConfig } from "../../src/types";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveConfig } from "../../src/config";
import { handleResponses } from "../../src/server/responses";
import { handleChatCompletions } from "../../src/server/chat-completions";
import { handleClaudeMessages } from "../../src/server/claude-messages";
import { acquireOwnedSpendHome } from "../helpers/owned-spend-home";
import { removeTreeWithRetry } from "../helpers/remove-tree";

const output = "bun test v1.4.0\n" + "(pass) fixture terminal success [1ms]\n".repeat(100) + "100 pass\n0 fail\nRan 100 tests across 1 file.\n";
const responses = () => ({ model: "claude-opus-4.8", stream: false, input: [
  { type: "function_call", call_id: "fixture-call", name: "exec_command", arguments: '{"cmd":"bun test"}' },
  { type: "function_call_output", call_id: "fixture-call", output },
] });
const chat = () => ({ model: "claude-opus-4.8", messages: [
  { role: "assistant", content: null, tool_calls: [{ type: "function", id: "fixture-call", function: { name: "exec_command", arguments: '{"cmd":"bun test"}' } }] },
  { role: "tool", tool_call_id: "fixture-call", content: output },
] });
const messages = () => ({ model: "claude-opus-4.8", max_tokens: 100, messages: [
  { role: "assistant", content: [{ type: "tool_use", id: "fixture-call", name: "Bash", input: { command: "bun test" } }] },
  { role: "user", content: [{ type: "tool_result", tool_use_id: "fixture-call", content: output }] },
] });

for (const phase of ["matching", "copying", "exception"] as const) test(`transport ${phase} shares deadline and memoizes rollback`, () => {
  const parsed = parseRequest(responses());
  const message = parsed.context.messages.find(message => message.role === "toolResult")!;
  let clock = 0, reads = 0;
  Object.defineProperty(message, phase === "matching" ? "content" : "extra", { enumerable: true, get() {
    reads++;
    if (phase === "exception") throw new Error("projection refused");
    clock = 11;
    return phase === "matching" ? output : "preserved";
  } });
  const before = rtkTransportStats();
  const transport = createRtkTransport(true, undefined, false, { now: () => clock });
  expect(transport.prepareParsed(parsed)).toBe(parsed);
  const after = rtkTransportStats(), firstReads = reads;
  expect(after.requests - before.requests).toBe(1);
  expect(after.fallbacks - before.fallbacks).toBe(1);
  expect(after.compressedResults - before.compressedResults).toBe(0);
  expect(after.elapsedMs - before.elapsedMs).toBeGreaterThan(0);
  expect(transport.prepareParsed(parsed)).toBe(parsed);
  expect(reads).toBe(firstReads);
  expect(rtkTransportStats()).toEqual(after);
});

test("successful projection is reused without filtering, matching or counting on rebuild", () => {
  const parsed = parseRequest(responses());
  const message = parsed.context.messages.find(message => message.role === "toolResult")!;
  let reads = 0, clock = 0;
  Object.defineProperty(message, "extra", { enumerable: true, get() { reads++; return "preserved"; } });
  const transport = createRtkTransport(true, undefined, false, { now: () => clock });
  const first = transport.prepareParsed(parsed), counted = rtkTransportStats(), initialReads = reads;
  expect(first).not.toBe(parsed);
  clock = 1000;
  const retry = transport.prepareParsed({ ...parsed, modelId: "current-model" });
  expect(retry.modelId).toBe("current-model");
  expect(retry.context.messages).toBe(first.context.messages);
  expect((retry._rawBody as { input: unknown[] }).input).toBe((first._rawBody as { input: unknown[] }).input);
  expect(reads).toBe(initialReads);
  expect(rtkTransportStats()).toEqual(counted);
});

test("retained allocation refusal and abort count one fallback with elapsed time", () => {
  for (const aborted of [false, true]) {
    const controller = new AbortController();
    if (aborted) controller.abort();
    const budget = createTranslatorBudget();
    budget.chargeRetained = () => { throw new Error("retained allocation refused"); };
    const transport = createRtkTransport(true, budget, false, { signal: controller.signal });
    const raw = responses(), before = rtkTransportStats();
    expect(transport.prepareBody(raw, "responses")).toBe(raw);
    const after = rtkTransportStats();
    expect(after.requests - before.requests).toBe(1);
    expect(after.fallbacks - before.fallbacks).toBe(1);
    expect(after.elapsedMs - before.elapsedMs).toBeGreaterThan(0);
    expect(transport.prepareBody(raw, "responses")).toBe(raw);
    expect(rtkTransportStats()).toEqual(after);
    expect(budget.snapshot().currentBytes).toBe(0);
    budget.dispose();
  }
});

test("Responses copied request keeps original parsed context and replay body unchanged", () => {
  const raw = responses(), parsed = parseRequest(raw);
  const snapshot = structuredClone(raw), context = structuredClone(parsed.context);
  const prepared = createRtkTransport(true).prepareParsed(parsed);
  expect(prepared).not.toBe(parsed);
  expect(parsed._rawBody).toBe(raw);
  expect(raw).toEqual(snapshot);
  expect(parsed.context).toEqual(context);
  expect(JSON.stringify(prepared.context)).not.toContain("fixture terminal success");
  expect(JSON.stringify(prepared._rawBody)).not.toContain("fixture terminal success");
});

for (const protocol of ["chat", "messages"] as const) test(`${protocol} bridge requires original-source eligibility and preserves cache markers`, () => {
  const source = protocol === "chat" ? chat() : messages();
  const raw = protocol === "chat" ? chatCompletionsToResponsesBody(source) : anthropicToResponsesBody(source);
  const parsed = parseRequest(raw), snapshot = structuredClone(raw);
  const request = new Request("http://localhost/v1/responses", { method: "POST" });
  registerRtkSource(request, source, protocol);
  expect(createRtkTransport(true).prepareParsed(parsed, request)).not.toBe(parsed);
  expect(raw).toEqual(snapshot);
  Object.assign(source.messages[0], { cache_control: { type: "ephemeral" } });
  expect(createRtkTransport(true).prepareParsed(parsed, request)).toBe(parsed);
});

test("retained diagnostic and media metadata never gets replaced by a successful-looking source", () => {
  for (const field of ["isError", "containsEncryptedContent"] as const) {
    const parsed = parseRequest(responses());
    const message = parsed.context.messages.find(message => message.role === "toolResult")!;
    if (message.role === "toolResult") message[field] = true;
    expect(createRtkTransport(true).prepareParsed(parsed)).toBe(parsed);
  }
  const parsed = parseRequest(responses());
  const message = parsed.context.messages.find(message => message.role === "toolResult")!;
  if (message.role === "toolResult") message.content = [{ type: "text", text: output }, { type: "image", imageUrl: "data:image/png;base64,AAAA" }];
  expect(createRtkTransport(true).prepareParsed(parsed)).toBe(parsed);
});

test("retry and refreshed adapter builds reuse compression while respecting current model options", async () => {
  const parsed = parseRequest(responses());
  const request = new Request("http://localhost/v1/responses");
  const transport = createRtkTransport(true);
  const before = rtkTransportStats().requests;
  const provider = { adapter: "openai-chat", baseUrl: "https://fixture.invalid/v1", apiKey: "fixture-key" };
  const first = wrapRtkAdapter(createOpenAIChatAdapter(provider), transport, request);
  const initial = await first.buildRequest(parsed);
  const retry = await first.buildRequest(parsed);
  expect(initial.body).toBe(retry.body);
  parsed.modelId = "fixture-new-model";
  const refreshed = wrapRtkAdapter(createOpenAIChatAdapter(provider), transport, request);
  const rebuilt = await refreshed.buildRequest(parsed);
  expect(JSON.parse(rebuilt.body).model).toBe("fixture-new-model");
  expect(rebuilt.body).not.toContain("fixture terminal success");
  expect(rtkTransportStats().requests - before).toBe(1);
  expect(JSON.stringify(parsed._rawBody)).toContain("fixture terminal success");
});

test("native Responses builder sends the shortened raw copy, never mutates replay", async () => {
  const parsed = parseRequest(responses());
  const adapter = wrapRtkAdapter(createResponsesPassthroughAdapter({ adapter: "openai-responses", baseUrl: "https://fixture.invalid/v1", apiKey: "fixture-key" }), createRtkTransport(true), new Request("http://localhost/v1/responses"));
  const budget = createTranslatorBudget();
  const wire = await adapter.buildRequest(parsed, { headers: new Headers(), translatorBudget: budget });
  expect(wire.body).not.toContain("fixture terminal success");
  expect(wire.body).toContain("100 pass");
  expect(JSON.stringify(parsed._rawBody)).toContain("fixture terminal success");
  wire.releaseBodyObservation?.();
  budget.dispose();
});

test("Antigravity synthetic functionResponse carries compressed text and the original id", async () => {
  const raw = responses(), parsed = parseRequest(raw), snapshot = structuredClone(raw);
  const adapter = wrapRtkAdapter(createGoogleAdapter({
    adapter: "google", googleMode: "cloud-code-assist", baseUrl: "https://fixture.invalid",
    apiKey: "fixture-token", project: "fixture-project",
  }), createRtkTransport(true), new Request("http://localhost/v1/responses"));
  // Builder only: no fetch, authentication store or model execution.
  const wire = JSON.parse((await adapter.buildRequest(parsed)).body);
  const result = wire.request.contents.flatMap((turn: { parts: unknown[] }) => turn.parts)
    .find((part: { functionResponse?: unknown }) => part.functionResponse)?.functionResponse;
  expect(result.id).toBe("fixture-call");
  expect(result.response.result).toContain("100 pass");
  expect(result.response.result).not.toContain("fixture terminal success");
  expect(raw).toEqual(snapshot);
});

test("off is identity and byte-identical through the existing adapter", async () => {
  const raw = responses(), parsed = parseRequest(raw);
  const transport = createRtkTransport(false);
  expect(transport.prepareParsed(parsed)).toBe(parsed);
  expect(transport.prepareBody(raw, "responses")).toBe(raw);
  const provider = { adapter: "openai-chat", baseUrl: "https://fixture.invalid/v1", apiKey: "fixture-key" };
  const plain = await createOpenAIChatAdapter(provider).buildRequest(parsed);
  const wrapped = await wrapRtkAdapter(createOpenAIChatAdapter(provider), transport, new Request("http://localhost/v1/responses")).buildRequest(parsed);
  expect(wrapped.body).toBe(plain.body);
});

test("translator memory refusal falls back to original body and parsed request", () => {
  const budget = createTranslatorBudget({ maxTurnBytes: 1 });
  const raw = responses(), parsed = parseRequest(raw);
  const transport = createRtkTransport(true, budget);
  expect(transport.prepareBody(raw, "responses")).toBe(raw);
  expect(transport.prepareParsed(parsed)).toBe(parsed);
  expect(budget.snapshot().currentBytes).toBe(0);
  budget.dispose();
});

test("compaction bypasses RTK and invalid config cannot enable it", () => {
  const parsed = parseRequest(responses());
  parsed._compactionRequest = true;
  expect(createRtkTransport(true).prepareParsed(parsed)).toBe(parsed);
  for (const rtk of [undefined, { enabled: "true" }, { enabled: 1 }, { enabled: true, extra: true }]) {
    expect(configSchema.parse({ port: 10100, defaultProvider: "fixture", providers: { fixture: { adapter: "openai-chat", baseUrl: "https://fixture.invalid/v1" } }, rtk }).rtk?.enabled).not.toBe(true);
  }
  expect(configSchema.parse({ port: 10100, defaultProvider: "fixture", providers: { fixture: { adapter: "openai-chat", baseUrl: "https://fixture.invalid/v1" } }, rtk: { enabled: true } }).rtk?.enabled).toBe(true);
});

test("parsed-only injected results without matching raw evidence remain untouched", () => {
  const parsed = parseRequest(responses());
  (parsed.context.messages.find(message => message.role === "toolResult") as { content: string }).content = "different";
  expect(createRtkTransport(true).prepareParsed(parsed)).toBe(parsed);
  const missing = { ...parsed, _rawBody: undefined } as OcxParsedRequest;
  expect(createRtkTransport(true).prepareParsed(missing)).toBe(missing);
});

test("bridge fallback without original provenance is excluded", () => {
  const parsed = parseRequest(responses());
  const transport = createRtkTransport(true, undefined, true);
  expect(transport.prepareParsed(parsed, new Request("http://localhost/v1/responses"))).toBe(parsed);
});

for (const lane of ["responses", "chat", "messages", "messages-native", "off"] as const) test(`real ${lane} ingress reaches only synthetic upstream with expected RTK text`, async () => {
  const previousHome = process.env.OPENCODEX_HOME;
  const home = mkdtempSync(join(tmpdir(), "ocx-rtk-ingress-"));
  process.env.OPENCODEX_HOME = home;
  let release: (() => void) | undefined;
  let captured = "";
  const native = lane === "messages-native";
  const upstream = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    captured = await request.text();
    if (!native && JSON.parse(captured).stream === true) {
      const chunk = { id: "fixture-completion", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", content: "fixture reply" }, finish_reason: "stop" }] };
      return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
    }
    return native ? Response.json({ id: "msg_fixture", type: "message", role: "assistant", model: "fixture-model", content: [{ type: "text", text: "fixture reply" }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 1 } })
      : Response.json({ id: "fixture-completion", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: "fixture reply" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 } });
  } });
  try {
    const config: OcxConfig = { port: 0, defaultProvider: "fixture", rtk: { enabled: lane !== "off" },
      providers: { fixture: { adapter: native ? "anthropic" : "openai-chat", authMode: "key", apiKey: "fixture-key", allowPrivateNetwork: true, baseUrl: upstream.url.toString().replace(/\/$/, "") } },
      claudeCode: { enabled: true }, ...(native ? { protocols: { rollout: { managedMessagesNative: true } } } : {}),
    };
    release = acquireOwnedSpendHome();
    saveConfig(config);
    const source = lane === "chat" ? chat() : lane.startsWith("messages") ? messages() : responses();
    source.model = "fixture/fixture-model";
    const request = new Request(`http://localhost/v1/${lane === "chat" ? "chat/completions" : lane.startsWith("messages") ? "messages" : "responses"}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(source) });
    const response = lane === "chat" ? await handleChatCompletions(request, config, {})
      : lane.startsWith("messages") ? await handleClaudeMessages(request, config, {}) : await handleResponses(request, config, {});
    const reply = await response.text();
    expect(response.status, reply).toBe(200);
    expect(captured).toContain("100 pass");
    if (lane === "off") expect(captured).toContain("fixture terminal success");
    else expect(captured).not.toContain("fixture terminal success");
  } finally {
    release?.();
    await upstream.stop(true);
    if (previousHome === undefined) delete process.env.OPENCODEX_HOME;
    else process.env.OPENCODEX_HOME = previousHome;
    removeTreeWithRetry(home);
  }
});
