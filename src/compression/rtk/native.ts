import { compressBody, RtkWork, RTK_LIMITS } from "./compress";
import { failed, record } from "./eligibility";
import { recordRtkPreparation } from "./transport";

type Frame = Record<string, unknown>;

function boundedCall(root: Frame): boolean {
  const stack: unknown[] = [root], seen = new Set<object>();
  let characters = 0, fields = 0;
  while (stack.length) {
    const value = stack.pop();
    if (typeof value === "string") characters += value.length;
    else if (value && typeof value === "object") {
      if (seen.has(value) || seen.size >= 256) return false;
      seen.add(value);
      for (const key in value) {
        if (++fields > 256) return false;
        characters += key.length;
        stack.push((value as Frame)[key]);
      }
    }
    if (characters > 32 * 1024) return false;
  }
  return true;
}

/** Connection-local wire copies; the channel and its replay journal keep original results. */
export function createNativeRtk(enabled: boolean | (() => boolean), options: { signal?: AbortSignal; now?: () => number } = {}) {
  let disposed = false;
  const active = () => !disposed && (typeof enabled === "function" ? enabled() : enabled);
  const calls = new Map<string, Frame>();
  const ambiguous = new Set<string>();
  const echoed = new Map<string, { before: unknown; after: unknown }>();
  let prepared = new WeakMap<object, Frame>();
  let callBytes = 0, retainedBytes = 0, refused = false;
  const remember = (value: unknown, terminal = false) => {
    const row = record(value);
    if (!row || !["function_call", "local_shell_call"].includes(String(row.type))) return;
    const id = row.call_id ?? (row.type === "local_shell_call" ? row.id : undefined);
    if (typeof id !== "string" || !id || id.length > 1024) { refused = true; return; }
    if (!boundedCall(row)) { refused = true; return; }
    if (failed(row)) { refused = true; return; }
    const old = calls.get(id);
    if (old) {
      if (!terminal || JSON.stringify(old) !== JSON.stringify(row)) ambiguous.add(id);
      return;
    }
    const bytes = Buffer.byteLength(JSON.stringify(row));
    if (calls.size >= 32 || callBytes + bytes > 256 * 1024) { refused = true; return; }
    calls.set(id, row); callBytes += bytes;
  };
  const restoreItem = (value: unknown): unknown => {
    const row = record(value);
    if (!row || !["function_call_output", "local_shell_call_output"].includes(String(row.type)) || typeof row.call_id !== "string") return value;
    const replacement = echoed.get(row.call_id);
    return replacement && JSON.stringify(row.output) === JSON.stringify(replacement.after)
      ? { ...row, output: replacement.before } : value;
  };
  const restoreArray = (value: unknown): unknown => {
    if (!Array.isArray(value) || value.length > 4096) return value;
    const next = value.map(restoreItem);
    return next.some((item, index) => item !== value[index]) ? next : value;
  };
  return {
    dispose(): void {
      disposed = true; calls.clear(); ambiguous.clear(); echoed.clear(); prepared = new WeakMap();
      callBytes = retainedBytes = 0;
    },
    observe(frame: Frame): Frame {
      if (!active() && !echoed.size) return frame;
      try {
        if (frame.type === "response.output_item.done") remember(frame.item);
        const response = record(frame.response);
        if (Array.isArray(response?.output) && response.output.length <= 4096) {
          const ids = new Set<string>();
          for (const item of response.output) {
            const row = record(item), id = row?.call_id ?? row?.id;
            if (typeof id === "string" && ids.has(id) && calls.has(id)) ambiguous.add(id);
            if (typeof id === "string") ids.add(id);
            remember(item, true);
          }
        }
        const item = restoreItem(frame.item), input = restoreArray(frame.input);
        const output = restoreArray(response?.output);
        return item !== frame.item || input !== frame.input || output !== response?.output
          ? { ...frame, ...(item !== frame.item ? { item } : {}), ...(input !== frame.input ? { input } : {}),
            ...(output !== response?.output ? { response: { ...response, output } } : {}) } : frame;
      } catch { refused = true; return frame; }
    },
    prepare(frame: Frame, source: object = frame): Frame {
      if (!active()) return frame;
      const cached = prepared.get(source);
      if (cached) return options.signal?.aborted ? frame : cached;
      const work = new RtkWork(options.now, options.signal);
      const stats = { requests: 1, compressedResults: 0, inputBytes: 0, outputBytes: 0, fallbacks: 0, elapsedMs: 0 };
      let next = frame;
      let retained = 0;
      const additions: Array<[string, { before: unknown; after: unknown }]> = [];
      try {
        work.check();
        if (!["response.create", "response.inject"].includes(String(frame.type))) return frame;
        if (!refused && Array.isArray(frame.input) && frame.input.length <= 32 && echoed.size < 32) {
          const evidence = [...calls.entries()].filter(([id]) => !ambiguous.has(id)).map(([, row]) => row);
          const virtual = { ...frame, input: [...evidence, ...frame.input] };
          const result = compressBody(virtual, "native-responses", { enabled: true, work, reserve: bytes => {
            if (bytes + retainedBytes * 2 + callBytes * 2 > RTK_LIMITS.memoryBytes) throw new Error("memory_limit");
            return () => {};
          } });
          Object.assign(stats, result.stats);
          if (result.replacements.size) {
            const compressed = (result.body as Frame).input as unknown[];
            const input = compressed.slice(evidence.length);
            let bytes = 0;
            for (let index = 0; index < input.length; index++) {
              work.check();
              const row = record(frame.input[index]), changed = record(input[index]);
              if (row && changed && changed !== row && typeof row.call_id === "string") {
                if (echoed.has(row.call_id)) throw new Error("repeated_result");
                bytes += Buffer.byteLength(JSON.stringify(row.output)) + Buffer.byteLength(JSON.stringify(changed.output));
                additions.push([row.call_id, { before: row.output, after: changed.output }]);
              }
            }
            if (echoed.size + additions.length > 32 || retainedBytes + bytes > 2 * RTK_LIMITS.requestBytes) throw new Error("retention_limit");
            next = { ...frame, input };
            retained = bytes;
          }
        }
        work.check();
        for (const [id, replacement] of additions) echoed.set(id, replacement);
        retainedBytes += retained;
      } catch {
        next = frame;
        Object.assign(stats, { compressedResults: 0, inputBytes: 0, outputBytes: 0, fallbacks: 1 });
      }
      stats.elapsedMs = work.elapsed();
      prepared.set(frame, next);
      prepared.set(source, next);
      if (next !== frame) prepared.set(next, next);
      recordRtkPreparation(stats);
      return next;
    },
  };
}
