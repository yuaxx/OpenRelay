import { expect, test } from "bun:test";
import { createNativeRtk } from "../../src/compression/rtk/native";
import { createRtkTransport, rtkTransportStats, wrapRtkAdapter } from "../../src/compression/rtk/transport";
import { parseRequest } from "../../src/responses/parser";
import { createGoogleAdapter } from "../../src/adapters/google";
import { createResponsesPassthroughAdapter } from "../../src/adapters/openai-responses";
import { NativeInjectionChannel } from "../../src/server/responses/native-injection";
import { NativeInjectionReplay } from "../../src/server/responses/native-injection-replay";
import { createTranslatorBudget } from "../../src/lib/translator-budget";
import { codexWsUpstreamFetch } from "../../src/server/responses/ws-upstream";
import type { NativeResponseControl } from "../../src/server/responses/native-response-control";
import { installInjectionFixture, beginInjection, injectionConfig, InjectionSocket, acknowledgeInjection, completeInjection, waitForInjection } from "../helpers/native-injection-fixture";

installInjectionFixture();
type Frame = Record<string, any>;
const output = "Chunk ID: synthetic\nWall time: 0.1 seconds\nProcess exited with code 0\nFinal output:\nbun test v1.4.0\n"
  + "(pass) synthetic terminal test [1ms]\n".repeat(100) + "100 pass\n0 fail\nRan 100 tests across 1 file.\n";
const call = (extra: Frame = {}) => ({ type: "function_call", id: "synthetic-item", call_id: "synthetic-call", name: "exec_command", arguments: '{"cmd":"bun test"}', ...extra });
const result = (extra: Frame = {}) => ({ type: "function_call_output", call_id: "synthetic-call", output, ...extra });
const frame = (extra: Frame = {}) => ({ type: "response.inject", response_id: "synthetic-response", input: [result()], ...extra });
function native(enabled = true, item = call(), options = {}) {
  const rtk = createNativeRtk(enabled, options);
  rtk.observe({ type: "response.output_item.done", item });
  return rtk;
}

test("native terminal success compresses a wire copy and counts exactly once", () => {
  const rtk = native(), original = frame(), snapshot = structuredClone(original), before = rtkTransportStats();
  const next = rtk.prepare(original);
  expect(next).not.toBe(original);
  expect(JSON.stringify(next)).not.toContain("synthetic terminal test");
  expect(next.input[0].output).toContain("Process exited with code 0");
  expect(original).toEqual(snapshot);
  expect(next.input[0].call_id).toBe(original.input[0].call_id);
  const counted = rtkTransportStats();
  expect(counted.requests - before.requests).toBe(1);
  expect(counted.compressedResults - before.compressedResults).toBe(1);
  expect(rtk.prepare(original)).toBe(next);
  expect(rtk.prepare(next)).toBe(next);
  expect(rtk.prepare({ ...original }, original)).toBe(next);
  expect(rtkTransportStats()).toEqual(counted);
});

test("native disabled mode is original and byte-identical without statistics", () => {
  const rtk = native(false), original = frame(), bytes = JSON.stringify(original), before = rtkTransportStats();
  expect(rtk.prepare(original)).toBe(original);
  expect(JSON.stringify(rtk.prepare(original))).toBe(bytes);
  expect(rtkTransportStats()).toEqual(before);
});

test("disabling RTK on a retained connection stops compression but still restores pending echoes", () => {
  let enabled = true;
  const rtk = createNativeRtk(() => enabled);
  rtk.observe({ type: "response.output_item.done", item: call() });
  const original = frame(), wire = rtk.prepare(original), counted = rtkTransportStats();
  enabled = false;
  expect(rtk.prepare(frame())).toEqual(original);
  expect(rtkTransportStats()).toEqual(counted);
  expect(rtk.observe({ type: "response.inject.failed", input: wire.input }).input).toEqual(original.input);
});

for (const extra of [{ is_error: true }, { status: "failed" }, { exit_code: 1 }, { exitCode: -1 },
  { output: output.replace("code 0", "code 2") }, { output: "short result" },
  { output: output + "(pass) special [1ms] DeprecationWarning: legacy feature\n" },
  { output: output + "(pass) special [1ms] trailing diagnostics\n", exit_code: 1 },
  { output: [{ type: "input_text", text: output }, { type: "input_image", image_url: "data:image/png;base64,AAAA" }] },
  { cache_control: { type: "ephemeral" } }, { output: [{ type: "input_text", text: output, prompt_cache_breakpoint: { mode: "explicit" } }] }]) {
  test(`native preserves failed, protected or ambiguous result ${JSON.stringify(extra).slice(0, 50)}`, () => {
    const original = frame({ input: [result(extra)] });
    expect(native().prepare(original)).toBe(original);
  });
}

test("native retains trailing diagnostics while dropping only separate success noise", () => {
  const original = frame({ input: [result({ output: output + "(pass) special [1ms] trailing diagnostics\n" })] });
  const next = native().prepare(original);
  expect(next.input[0].output).toContain("(pass) special [1ms] trailing diagnostics");
});

test("native rejects missing, duplicate or unsupported call identities", () => {
  for (const item of [call({ call_id: undefined }), call({ name: "write_stdin" }),
    { type: "local_shell_call", call_id: "synthetic-call", action: { type: "unknown", command: ["bun", "test"] } },
    { type: "local_shell_call", call_id: "synthetic-call", action: { type: "exec", command: ["sh", "-c", "bun test"] } }]) {
    const original = frame();
    expect(native(true, item as ReturnType<typeof call>).prepare(original)).toBe(original);
  }
  const rtk = native();
  rtk.observe({ type: "response.output_item.done", item: call() });
  const original = frame();
  expect(rtk.prepare(original)).toBe(original);
  for (const input of [[result(), result()], [result({ call_id: undefined })]]) {
    const original = frame({ input });
    expect(native().prepare(original)).toBe(original);
  }
});

test("native local-shell schema preserves ordering, adjacency, exit metadata and timestamps", () => {
  const item = { type: "local_shell_call", call_id: "synthetic-call", action: { type: "exec", command: ["bun", "test"] } };
  const original = frame({ type: "response.create", input: [result({ type: "local_shell_call_output", exit_code: 0, timestamp: 123, stderr: "", signature: "opaque" }),
    { type: "reasoning", encrypted_content: "opaque", summary: [] }, { type: "message", role: "user", content: "continue" }] });
  const next = native(true, item as ReturnType<typeof call>).prepare(original);
  expect(next.input.map((row: Frame) => row.type)).toEqual(original.input.map((row: Frame) => row.type));
  expect({ ...next.input[0], output: original.input[0].output }).toEqual(original.input[0]);
  expect(next.input[1]).toBe(original.input[1]); expect(next.input[2]).toBe(original.input[2]);
  expect(next.input[0].output.length).toBeLessThan(output.length);
});

test("native abort, deadline and exception roll back and memoize fallback", () => {
  for (const mode of ["abort", "deadline", "exception"] as const) {
    const controller = new AbortController(); let clock = 0;
    if (mode === "abort") controller.abort();
    const rtk = native(true, call(), { signal: controller.signal, now: () => clock });
    const original = frame();
    if (mode !== "abort") Object.defineProperty(original, "input", { enumerable: true, get() {
      if (mode === "exception") throw new Error("synthetic failure");
      clock = 11; return [result()];
    } });
    const before = rtkTransportStats();
    expect(rtk.prepare(original)).toBe(original);
    const counted = rtkTransportStats();
    expect(counted.fallbacks - before.fallbacks).toBe(1);
    expect(counted.elapsedMs).toBeGreaterThanOrEqual(before.elapsedMs);
    expect(rtk.prepare(original)).toBe(original);
    expect(rtkTransportStats()).toEqual(counted);
  }
});

test("abort after preparation never returns a shortened native frame or recounts it", () => {
  const controller = new AbortController(), rtk = native(true, call(), { signal: controller.signal });
  const original = frame();
  expect(rtk.prepare(original)).not.toBe(original);
  const counted = rtkTransportStats();
  controller.abort();
  expect(rtk.prepare(original)).toBe(original);
  expect(rtkTransportStats()).toEqual(counted);
});

test("native result, batch and retained-call limits leave original frames unchanged", () => {
  const ordinary = frame();
  expect(native(true, call({ arguments: "x".repeat(1024 * 1024) })).prepare(ordinary)).toBe(ordinary);
  const tooLarge = frame({ input: [result({ output: output + "x".repeat(256 * 1024) })] });
  expect(native().prepare(tooLarge)).toBe(tooLarge);
  const batch = frame({ input: Array.from({ length: 33 }, (_, index) => result({ call_id: `synthetic-${index}` })) });
  expect(native().prepare(batch)).toBe(batch);
  const rtk = native();
  for (let index = 0; index < 33; index++) rtk.observe({ type: "response.output_item.done", item: call({ call_id: `synthetic-${index}` }) });
  const original = frame();
  expect(rtk.prepare(original)).toBe(original);
});

test("native memory admission includes retained original and shortened echo evidence", () => {
  const rtk = createNativeRtk(true, { now: () => 0 });
  let large = "(pass) synthetic success [1ms]\n".repeat(6000) + "6000 pass\n0 fail\n";
  while (large.length + 1001 <= 256 * 1024) large += "z".repeat(1000) + "\n";
  large += "z".repeat(256 * 1024 - large.length);
  for (let index = 0; index < 8; index++) rtk.observe({ type: "response.output_item.done", item: call({ id: `item-${index}`, call_id: `call-${index}` }) });
  const batch = (start: number) => frame({ input: Array.from({ length: 4 }, (_, offset) => result({ call_id: `call-${start + offset}`, output: large })) });
  const first = batch(0);
  expect(rtk.prepare(first)).not.toBe(first);
  const second = batch(4), before = rtkTransportStats();
  expect(rtk.prepare(second)).toBe(second);
  expect(rtkTransportStats().fallbacks - before.fallbacks).toBe(1);
});

test("native rejected injections and terminal echoes preserve original replay results", () => {
  const rtk = native(), original = frame(), wire = rtk.prepare(original);
  const rejection = { type: "response.inject.failed", input: wire.input, error: { code: "response_already_completed" }, sequence_number: 9 };
  const restored = rtk.observe(rejection);
  expect(restored.input).toEqual(original.input);
  expect(rejection.input).toBe(wire.input);
  const completed = { type: "response.completed", response: { id: "synthetic-response", output: [call(), ...wire.input] } };
  expect(rtk.observe(completed).response.output[1]).toEqual(original.input[0]);
});

test("channel journal accepts wire echoes while storing only original history", () => {
  const rtk = createNativeRtk(true), remembered: Frame[] = [], sent: Frame[] = [];
  const channel = new NativeInjectionChannel({ multi_agent: { enabled: true } });
  channel.replayFactory = () => new NativeInjectionReplay([], (_input, response) => remembered.push(response));
  const detach = channel.attach(value => sent.push(rtk.prepare(value)), () => {});
  const observe = (value: Frame) => channel.observe(rtk.observe(value));
  observe({ type: "response.created", response: { id: "synthetic-response" } });
  observe({ type: "response.output_item.added", output_index: 0, item: call() });
  observe({ type: "response.output_item.done", output_index: 0, item: call() });
  channel.inject(frame());
  observe({ type: "response.inject.created", response_id: "synthetic-response", sequence_number: 1 });
  observe({ type: "response.completed", response: { id: "synthetic-response", output: [call(), ...sent[0].input] } });
  expect(remembered[0].output[1]).toEqual(result());
  expect(sent[0].input[0].output.length).toBeLessThan(output.length);
  detach();
});

test("native next-turn Responses and Antigravity builders share one immutable prepared result", async () => {
  const raw = { model: "synthetic-model", stream: true, input: [
    { type: "local_shell_call", call_id: "synthetic-call", action: { type: "exec", command: ["bun", "test"] } }, result(),
  ] }, snapshot = structuredClone(raw), parsed = parseRequest(raw);
  const transport = createRtkTransport(true, undefined, false, { native: true });
  const request = new Request("http://localhost/v1/responses");
  const nativeAdapter = wrapRtkAdapter(createResponsesPassthroughAdapter({ adapter: "openai-responses", baseUrl: "https://fixture.invalid/v1", apiKey: "fixture-key" }), transport, request);
  const before = rtkTransportStats();
  const budget = createTranslatorBudget(), incoming = { headers: new Headers(), translatorBudget: budget };
  const first = await nativeAdapter.buildRequest(parsed, incoming), retry = await nativeAdapter.buildRequest(parsed, incoming);
  expect(first.body).toBe(retry.body);
  expect(first.body).not.toContain("synthetic terminal test");
  const counted = rtkTransportStats();
  const google = wrapRtkAdapter(createGoogleAdapter({ adapter: "google", googleMode: "cloud-code-assist", baseUrl: "https://fixture.invalid", project: "fixture-project", apiKey: "fixture-token" }), transport, request);
  const translated = await google.buildRequest(parsed);
  expect(translated.body).toContain("functionResponse");
  const responsePart = JSON.parse(translated.body).request.contents.flatMap((turn: Frame) => turn.parts).find((part: Frame) => part.functionResponse).functionResponse;
  expect(responsePart.id).toBe("synthetic-call");
  expect(translated.body).not.toContain("synthetic terminal test");
  expect(rtkTransportStats()).toEqual(counted);
  expect(counted.compressedResults - before.compressedResults).toBe(1);
  expect(raw).toEqual(snapshot);
  first.releaseBodyObservation?.(); retry.releaseBodyObservation?.(); budget.dispose();
});

test("native upstream exchange sends compressed injection and relays original echoes", async () => {
  const initial = { model: "synthetic-model", multi_agent: { enabled: true }, input: "initial" };
  const channel: NativeResponseControl = new NativeInjectionChannel(initial);
  const remembered: Frame[] = [];
  channel.replayFactory = () => new NativeInjectionReplay([], (_input, response) => remembered.push(response));
  channel.rtk = createNativeRtk(true);
  const response = await codexWsUpstreamFetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: { authorization: "Bearer fixture-public-key" }, body: JSON.stringify(initial),
  }, async () => { throw new Error("synthetic HTTP fallback forbidden"); }, "1.4.0", undefined, undefined, channel);
  const text = response.text();
  const socket = InjectionSocket.all.at(-1)!;
  socket.emit({ type: "response.output_item.added", output_index: 0, item: call() });
  socket.emit({ type: "response.output_item.done", output_index: 0, item: call() });
  const original = frame({ response_id: socket.root }), before = rtkTransportStats();
  channel.inject!(original);
  expect(socket.frames[1].input[0].output.length).toBeLessThan(output.length);
  expect(rtkTransportStats().compressedResults - before.compressedResults).toBe(1);
  acknowledgeInjection(socket);
  completeInjection(socket, { output: [call(), ...socket.frames[1].input] });
  expect(await text).toContain("synthetic terminal test");
  expect(remembered[0].output[1]).toEqual(result());
  expect(original.input[0].output).toBe(output);
});

test("real native handler terminal injection increments RTK statistics without a model call", async () => {
  const config = { ...injectionConfig(true), rtk: { enabled: true } };
  const { socket, send, sent, ws, id } = await beginInjection({ tools: [{ type: "function", name: "exec_command", parameters: { type: "object", properties: {} } }] }, config);
  socket.emit({ type: "response.output_item.added", output_index: 0, item: call() });
  socket.emit({ type: "response.output_item.done", output_index: 0, item: call() });
  const before = rtkTransportStats();
  const original = frame({ response_id: id });
  send(original);
  expect(socket.frames[1].input[0].output.length).toBeLessThan(output.length);
  expect(rtkTransportStats().compressedResults - before.compressedResults).toBe(1);
  acknowledgeInjection(socket);
  completeInjection(socket, { output: [call(), ...socket.frames[1].input] });
  await waitForInjection(() => !ws.data.nativeControl);
  expect(sent.at(-1)?.response.output[1]).toEqual(result());
  expect(original.input[0].output).toBe(output);
});
