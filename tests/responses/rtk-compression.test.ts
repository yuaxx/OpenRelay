import { describe, expect, test } from "bun:test";
import { compressBody, createRtkStats, RTK_LIMITS } from "../../src/compression/rtk";
import type { RtkProtocol } from "../../src/compression/rtk";

const green = "bun test v1.4.0\r\n" + Array.from({ length: 100 }, (_, i) => `(pass) synthetic test ${i} ✓ [1.00ms]\r\n`).join("") + "100 pass\r\n0 fail\r\nRan 100 tests across 1 file.\r\n";
function body(protocol: RtkProtocol, text = green, name = "exec_command", command = "bun test"): Record<string, unknown> {
  const args = name === "exec_command" ? { cmd: command } : { command };
  if (protocol === "responses") return { model: "demo", input: [
    { type: "function_call", id: "item-1", call_id: "call-1", name, arguments: JSON.stringify(args) },
    { type: "function_call_output", id: "item-2", call_id: "call-1", output: text, exit_code: 0 },
  ] };
  if (protocol === "chat") return { model: "demo", messages: [
    { role: "assistant", tool_calls: [{ type: "function", id: "call-1", function: { name, arguments: JSON.stringify(args) } }] },
    { role: "tool", tool_call_id: "call-1", content: text, exit_code: 0 },
  ] };
  return { model: "demo", messages: [
    { role: "assistant", content: [{ type: "tool_use", id: "call-1", name, input: args }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "call-1", content: text, exit_code: 0 }] },
  ] };
}
const run = (value: unknown, protocol: RtkProtocol = "responses") => compressBody(value, protocol, { enabled: true });

for (const protocol of ["responses", "chat", "messages"] as const) describe(protocol, () => {
  test("duplicate call/result ids and reversed history never qualify", () => {
    for (const mode of ["call", "result", "missing", "reversed"]) {
      const value = body(protocol);
      const rows = value[protocol === "responses" ? "input" : "messages"] as unknown[];
      if (mode === "call") rows.unshift(structuredClone(rows[0]));
      if (mode === "result") rows.push(structuredClone(rows[1]));
      if (mode === "missing") rows.shift();
      if (mode === "reversed") rows.reverse();
      expect(run(value, protocol).body).toBe(value);
    }
  });
  test("copy-on-write compression preserves call ids, exit code, order and original", () => {
    const source = body(protocol), snapshot = structuredClone(source);
    const result = run(source, protocol);
    expect(source).toEqual(snapshot);
    expect(result.body).not.toBe(source);
    expect(result.replacements.get("call-1")?.after).toContain("100 pass\r\n0 fail");
    expect(result.replacements.get("call-1")?.after).not.toContain("synthetic test");
    expect(JSON.stringify(result.body)).toContain('"exit_code":0');
    expect(JSON.stringify(result.body)).toContain('"call-1"');
    expect(result.stats.compressedResults).toBe(1);
  });
  test("off, unknown tools, commands, write_stdin and compound commands are identity no-ops", () => {
    const source = body(protocol);
    expect(compressBody(source, protocol).body).toBe(source);
    expect(compressBody(source, protocol, { enabled: false }).body).toBe(source);
    for (const name of ["Read", "write_stdin", "exec", "terminal_unknown"]) {
      const value = body(protocol, green, name);
      expect(run(value, protocol).body).toBe(value);
    }
    for (const command of ["cat source.ts", "bun test && git status", "bun test; echo ok", "bun test | head", "bun test\necho ok", "$(bun test)", "powershell -Command bun test"]) {
      const value = body(protocol, green, "exec_command", command);
      expect(run(value, protocol).body).toBe(value);
    }
  });
  test("failure, warnings, exit-code wrappers and unrecognized output stay byte-identical", () => {
    for (const text of [green + "warning: deprecated API\n", green + "\u001b[31mFAIL\u001b[0m assertion\n", green + "Process exited with code 2\n", green + "Traceback: original details\n", "source code\n".repeat(300)]) {
      const value = body(protocol, text);
      expect(run(value, protocol).body).toBe(value);
    }
  });
  test("small, oversized, long-line and excessive-line results fall back", () => {
    for (const text of ["1 pass\n0 fail\n", "x".repeat(RTK_LIMITS.resultBytes + 1), "x".repeat(17_000) + "\n" + green, "\n".repeat(RTK_LIMITS.lines) + green]) {
      const value = body(protocol, text);
      expect(run(value, protocol).body).toBe(value);
    }
  });
  test("time, reserve and property-access exceptions return the original", () => {
    const value = body(protocol);
    let tick = 0;
    expect(compressBody(value, protocol, { enabled: true, now: () => tick += 11 }).body).toBe(value);
    expect(compressBody(value, protocol, { enabled: true, reserve: () => { throw new Error("memory full"); } }).body).toBe(value);
    expect(compressBody(value, protocol, { enabled: true, reserve: () => () => { throw new Error("release failed"); } }).body).toBe(value);
    const poisoned = Object.defineProperty({}, "messages", { enumerable: true, get() { throw new Error("bad getter"); } });
    expect(run(poisoned, protocol).body).toBe(poisoned);
  });
});

test("duplicate calls, duplicate results, missing calls and reversed pairing are not guessed", () => {
  for (const mode of ["call", "result", "missing", "reversed"]) {
    const value = body("responses");
    const input = value.input as unknown[];
    if (mode === "call") input.unshift(structuredClone(input[0]));
    if (mode === "result") input.push(structuredClone(input[1]));
    if (mode === "missing") input.shift();
    if (mode === "reversed") input.reverse();
    expect(run(value).body).toBe(value);
  }
});

test("explicit failure metadata protects successful-looking content", () => {
  for (const metadata of [{ exit_code: 1 }, { exitCode: -1 }, { is_error: true }, { isError: true }, { status: "failed" }]) {
    const value = body("responses");
    Object.assign((value.input as object[])[1], metadata);
    expect(run(value).body).toBe(value);
  }
});

test("git status keeps every path including Unicode, conflicts and untracked paths", () => {
  const paths = Array.from({ length: 100 }, (_, i) => `\tmodified: src/żółć-${i}.ts\r\n`).join("");
  const original = `On branch feature\r\nChanges not staged for commit:\r\n  (use "git add <file>..." to update what will be committed)\r\n${paths}Untracked files:\r\n\tnew-file.ts\r\n`;
  const result = run(body("responses", original, "shell", "git status"));
  const output = result.replacements.get("call-1")!.after;
  expect(output).toContain(paths.trimEnd());
  expect(output).toContain("new-file.ts");
  expect(output).not.toContain("(use ");
});

test("build progress is removed, success, assets and diagnostics are preserved", () => {
  const text = "vite v8 building\n" + "transforming...\n".repeat(300) + "dist/index.js 12 kB\n✓ built in 400ms\n";
  const value = body("responses", text, "exec_command", "bun run build");
  const result = run(value);
  expect(result.replacements.get("call-1")?.after).toContain("dist/index.js 12 kB\n✓ built in 400ms");
  const warning = body("responses", text + "Warning: chunks exceed 500 kB\n", "exec_command", "bun run build");
  expect(run(warning).body).toBe(warning);
});

test("ANSI success rows can be removed, skip rows and Unicode summaries remain", () => {
  const text = green.replaceAll("(pass)", "\u001b[32m(pass)\u001b[0m") + "(skip) przykład ✓\r\n";
  const result = run(body("responses", text));
  expect(result.replacements.get("call-1")?.after).toContain("(skip) przykład ✓");
});

test("images and reasoning are untouched; cache_control anywhere protects the prefix", () => {
  const value = body("responses");
  const input = value.input as unknown[];
  const reason = { type: "reasoning", encrypted_content: "opaque", summary: [] };
  const image = { role: "user", content: [{ type: "input_image", image_url: "data:image/png;base64,AAAA" }] };
  input.unshift(reason, image);
  const result = run(value).body as { input: unknown[] };
  expect(result.input[0]).toBe(reason);
  expect(result.input[1]).toBe(image);
  for (const marker of [null, { type: "ephemeral" }]) {
    Object.assign(image.content[0], { cache_control: marker });
    expect(run(value).body).toBe(value);
  }
  const mixed = body("responses");
  (mixed.input as Array<Record<string, unknown>>)[1].output = [{ type: "input_text", text: green }, { type: "input_image", image_url: "data:image/png;base64,AAAA" }];
  expect(run(mixed).body).toBe(mixed);
});

test("single text blocks are supported without changing block fields", () => {
  for (const protocol of ["responses", "chat", "messages"] as const) {
    const value = body(protocol);
    const rows = value[protocol === "responses" ? "input" : "messages"] as Array<Record<string, unknown>>;
    const row = protocol === "messages" ? (rows[1].content as Array<Record<string, unknown>>)[0] : rows[1];
    row[protocol === "responses" ? "output" : "content"] = [{ type: "text", text: green, extra: "preserved" }];
    expect(JSON.stringify(run(value, protocol).body)).toContain('"extra":"preserved"');
    expect(run(value, protocol).stats.compressedResults).toBe(1);
  }
});

test("result count and aggregate size limits roll back every candidate", () => {
  for (const [count, text] of [[33, green], [5, "(pass) unit\n".repeat(23_000) + "1 pass\n0 fail\n"]] as const) {
    const input = Array.from({ length: count }, (_, i) => (body("responses", text).input as Array<Record<string, unknown>>).map(row => ({ ...row, call_id: `call-${i}` }))).flat();
    const value = { input };
    expect(run(value).body).toBe(value);
    expect(run(value).stats.compressedResults).toBe(0);
  }
});

test("stats contain aggregates only and snapshots cannot mutate their owner", () => {
  const stats = createRtkStats();
  const result = run(body("responses"));
  stats.add(result.stats);
  expect(stats.snapshot().compressedResults).toBe(1);
  expect(JSON.stringify(stats.snapshot())).not.toContain("call-1");
  expect(JSON.stringify(stats.snapshot())).not.toContain("synthetic");
  expect(stats.snapshot()).not.toBe(stats.snapshot());
});

test("late time exhaustion rolls back tentative changes, and a cyclic body is unchanged", () => {
  const value = body("responses"), snapshot = structuredClone(value);
  let count = 0;
  const result = compressBody(value, "responses", { enabled: true, now: () => ++count > 12 ? 11 : 0 });
  expect(result.body).toBe(value);
  expect(value).toEqual(snapshot);
  expect(result.stats.compressedResults).toBe(0);
  const cyclic: Record<string, unknown> = body("responses");
  cyclic.self = cyclic;
  expect(run(cyclic).body).toBe(cyclic);
});

test("no saving, malformed argv and localized/unknown git formats remain unchanged", () => {
  for (const text of [("On branch main\n" + "\tmodified: src/example.ts\n".repeat(100)).trimEnd(), "Na gałęzi main\n" + "zmieniony plik\n".repeat(200)]) {
    const value = body("responses", text, "shell", "git status");
    expect(run(value).body).toBe(value);
  }
  const value = body("responses");
  (value.input as Array<Record<string, unknown>>)[0].arguments = '{"cmd":';
  expect(run(value).body).toBe(value);
  const ambiguous = body("responses");
  (ambiguous.input as Array<Record<string, unknown>>)[0].arguments = '{"cmd":"bun test","command":"cat source.ts"}';
  expect(run(ambiguous).body).toBe(ambiguous);
  const foreign = body("responses");
  (foreign.input as Array<Record<string, unknown>>)[0].namespace = "collaboration";
  expect(run(foreign).body).toBe(foreign);
  expect(RTK_LIMITS).toEqual({ minBytes: 2048, resultBytes: 262144, requestBytes: 1048576, results: 32, timeMs: 10, memoryBytes: 8388608, lines: 10000 });
});

test("fixture benchmark measures byte savings without inventing token counts", () => {
  const value = body("responses"), result = run(value);
  expect(result.stats.inputBytes).toBe(Buffer.byteLength(green));
  expect(result.stats.outputBytes).toBe(Buffer.byteLength(result.replacements.get("call-1")!.after));
  expect(result.stats.outputBytes).toBeLessThan(result.stats.inputBytes);
});


test("git help recognition never consumes untracked filenames or arbitrary use lines", () => {
  const help = '  (use "git add <file>..." to include in what will be committed)';
  const names = ['\t(use real-file)', '\t(use "git add <file>..." to include in what will be committed)', '  (use unrecognized instruction)'];
  const output = 'On branch main\nUntracked files:\n' + help + '\n' + names.join('\n') + '\n' + '\tordinary-file\n'.repeat(200);
  const result = run(body("responses", output, "exec_command", "git status"));
  expect(result.stats.compressedResults).toBe(1);
  for (const name of names) expect(result.replacements.get("call-1")?.after).toContain(name);
  expect(result.replacements.get("call-1")?.after).not.toContain('\n' + help + '\n');
});

test("success markers do not authorize stripping warnings or trailing diagnostics", () => {
  for (const diagnostic of [
    '(pass) special [1ms] DeprecationWarning: legacy feature',
    '(pass) special [1ms] Warnings: legacy feature',
    '(pass) special [1ms] diagnostic: important detail',
    'PASS special.ts diagnostic: important detail',
    '? special (1ms) diagnostic: important detail',
  ]) {
    for (const protocol of ["responses", "chat", "messages"] as const) {
      const value = body(protocol, green + diagnostic + '\r\n');
      const result = run(value, protocol);
      const after = result.replacements.get("call-1")?.after ?? green + diagnostic + '\r\n';
      expect(after).toContain(diagnostic);
      if (/Warning/.test(diagnostic)) expect(result.body).toBe(value);
    }
  }
});

test("exceptions, timeout and abort report elapsed time with a single fallback", () => {
  const controller = new AbortController(); controller.abort();
  for (const options of [
    { signal: controller.signal },
    { reserve: () => { throw new Error("refused"); } },
    { now: (() => { let ticks = 0; return () => ticks++ * 11; })() },
  ]) {
    const value = body("responses");
    const result = compressBody(value, "responses", { enabled: true, ...options });
    expect(result.body).toBe(value);
    expect(result.stats.requests).toBe(1);
    expect(result.stats.fallbacks).toBe(1);
    expect(result.stats.compressedResults).toBe(0);
    expect(result.stats.elapsedMs).toBeGreaterThan(0);
  }
});
