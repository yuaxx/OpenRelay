import { filterOutput } from "./filters";
import { protocolDraft, type RtkProtocol } from "./protocols";
import { record } from "./eligibility";
import type { RtkStats } from "./stats";

export const RTK_LIMITS = Object.freeze({ minBytes: 2048, resultBytes: 256 * 1024, requestBytes: 1024 * 1024, results: 32, timeMs: 10, memoryBytes: 8 * 1024 * 1024, lines: 10_000 });
export interface RtkOptions {
  enabled?: boolean;
  /** Injectable monotonic clock for deterministic budget tests. */
  now?: () => number;
  signal?: AbortSignal;
  work?: RtkWork;
  reserve?: (bytes: number) => (() => void);
}

/** One synchronous preparation transaction, including transport projection. */
export class RtkWork {
  private readonly realStart = performance.now();
  private start: number | undefined;
  private spent = 0;
  constructor(private readonly now = () => performance.now(), private readonly signal?: AbortSignal) {}
  check(): void {
    const current = this.now();
    this.start ??= current;
    this.spent = Math.max(this.spent, current - this.start);
    if (this.signal?.aborted) throw new Error("aborted");
    if (this.spent > RTK_LIMITS.timeMs) throw new Error("time_limit");
  }
  elapsed(): number {
    return Math.max(this.spent, performance.now() - this.realStart);
  }
}
export interface RtkResult {
  body: unknown;
  replacements: ReadonlyMap<string, { before: string; after: string }>;
  stats: RtkStats;
}

export function compressBody(body: unknown, protocol: RtkProtocol, options: RtkOptions = {}): RtkResult {
  const stats: RtkStats = { requests: 0, compressedResults: 0, inputBytes: 0, outputBytes: 0, fallbacks: 0, elapsedMs: 0 };
  const unchanged = (): RtkResult => ({ body, replacements: new Map(), stats });
  if (options.enabled !== true) return unchanged();
  const work = options.work ?? new RtkWork(options.now, options.signal);
  let release: (() => void) | undefined;
  try {
    stats.requests = 1;
    const checkpoint = () => work.check();
    checkpoint();
    // An explicit breakpoint protects the request's cached prefix, not just its marked leaf.
    const stack: unknown[] = [body];
    const seen = new Set<object>();
    while (stack.length) {
      checkpoint();
      const value = stack.pop();
      if (!value || typeof value !== "object") continue;
      if (seen.has(value)) throw new Error("non_tree_body");
      seen.add(value);
      if (seen.size > 4096 || stack.length > 4096) throw new Error("structure_limit");
      const row = record(value);
      if (row && (Object.hasOwn(row, "cache_control") || (protocol === "native-responses" && Object.hasOwn(row, "prompt_cache_breakpoint")))) return unchanged();
      if (Array.isArray(value)) {
        if (value.length > 4096) throw new Error("structure_limit");
        for (const child of value) if (child && typeof child === "object") stack.push(child);
      } else {
        let fields = 0;
        for (const key in value) {
          if ((fields & 63) === 0) checkpoint();
          if (!Object.hasOwn(value, key)) continue;
          if (++fields > 4096) throw new Error("structure_limit");
          const child = (value as Record<string, unknown>)[key];
          if (child && typeof child === "object") stack.push(child);
        }
      }
    }
    const draft = protocolDraft(body, protocol, checkpoint);
    let bytes = 0;
    for (const candidate of draft.candidates) {
      checkpoint();
      // Check UTF-16 length before allocating/counting UTF-8 bytes.
      if (candidate.text.length > RTK_LIMITS.resultBytes) throw new Error("result_limit");
      const size = Buffer.byteLength(candidate.text);
      bytes += size;
      if (size > RTK_LIMITS.resultBytes || bytes > RTK_LIMITS.requestBytes) throw new Error("byte_limit");
      if (candidate.text.split("\n").length > RTK_LIMITS.lines) throw new Error("line_limit");
    }
    // Strings, line arrays, classification copies and copy-on-write containers fit this bound.
    const workingBytes = bytes * 6 + seen.size * 128;
    if (workingBytes > RTK_LIMITS.memoryBytes) throw new Error("memory_limit");
    release = options.reserve?.(workingBytes);
    const replacements = new Map<string, { before: string; after: string }>();
    for (const candidate of draft.candidates) {
      checkpoint();
      const size = Buffer.byteLength(candidate.text);
      if (size < RTK_LIMITS.minBytes) continue;
      const text = filterOutput(candidate.text, candidate.kind);
      checkpoint();
      const compressed = Buffer.byteLength(text);
      if (compressed >= size || !text.trim()) continue;
      candidate.replace(text);
      replacements.set(candidate.id, { before: candidate.text, after: text });
      stats.compressedResults++;
      stats.inputBytes += size;
      stats.outputBytes += compressed;
    }
    checkpoint();
    release?.(); release = undefined;
    const result = draft.finish();
    checkpoint();
    return { body: result, replacements, stats };
  } catch {
    stats.compressedResults = stats.inputBytes = stats.outputBytes = 0;
    stats.fallbacks = 1;
    return unchanged();
  } finally {
    try { release?.(); } catch { /* Cleanup failure cannot replace the original request. */ }
    stats.elapsedMs = work.elapsed();
  }
}
