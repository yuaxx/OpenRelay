import type { OcxParsedRequest } from "../../types";
import type { ProviderAdapter } from "../../adapters/base";
import type { TranslatorBudget } from "../../lib/translator-budget";
import { compressBody, RtkWork, type RtkResult } from "./compress";
import type { RtkProtocol } from "./protocols";
import { createRtkStats } from "./stats";
import type { RtkStats } from "./stats";
import { record } from "./eligibility";

const sources = new WeakMap<Request, { body: unknown; protocol: RtkProtocol }>();
const totals = createRtkStats();
export const rtkTransportStats = () => totals.snapshot();
export const rtkDashboardStats = () => totals.dashboardSnapshot();
export const recordRtkPreparation = (stats: RtkStats): void => totals.add(stats);
export function registerRtkSource(request: Request, body: unknown, protocol: RtkProtocol): void {
  sources.set(request, { body, protocol });
}

type Projection = { raw: unknown; messages: unknown; copiedRaw: Record<string, unknown>; copiedMessages: OcxParsedRequest["context"]["messages"] };
type Prepared = { result: RtkResult; projection?: Projection };
export function createRtkTransport(enabled: boolean, budget?: TranslatorBudget, requireSource = false,
  options: { now?: () => number; signal?: AbortSignal; native?: boolean } = {}) {
  const prepared = new WeakMap<object, Map<RtkProtocol, Prepared>>();
  const apply = (parsed: OcxParsedRequest, projection?: Projection): OcxParsedRequest => {
    if (!projection || parsed._rawBody !== projection.raw || parsed.context.messages !== projection.messages) return parsed;
    return { ...parsed, _rawBody: projection.copiedRaw,
      context: { ...parsed.context, messages: projection.copiedMessages } };
  };
  const prepare = (body: unknown, protocol: RtkProtocol, parsed?: OcxParsedRequest, signal = options.signal): Prepared => {
    if (!enabled || !body || typeof body !== "object") return { result: compressBody(body, protocol) };
    const cached = prepared.get(body)?.get(protocol);
    if (cached) return options.native && signal?.aborted ? { result: compressBody(body, protocol) } : cached;
    const work = new RtkWork(options.now, signal);
    let result: RtkResult = { body, replacements: new Map(), stats: { requests: 1, compressedResults: 0, inputBytes: 0, outputBytes: 0, fallbacks: 0, elapsedMs: 0 } };
    let projection: Projection | undefined;
    let releaseProjection: (() => void) | undefined;
    let retained = 0;
    try {
      work.check();
      result = compressBody(body, protocol, { enabled: true, work, reserve: budget ? bytes => {
        const lease = budget.reserveTransient(bytes, { kind: "request_copies" });
        return () => lease.release();
      } : undefined });
      if (parsed && result.replacements.size) {
        const raw = record(parsed._rawBody);
        if (!raw || !Array.isArray(raw.input) || raw.input.length > 4096 || parsed.context.messages.length > 4096) throw new Error("projection_shape");
        const lease = budget?.reserveTransient((raw.input.length + parsed.context.messages.length) * 256 + result.replacements.size * 1024, { kind: "request_copies" });
        releaseProjection = lease ? () => lease.release() : undefined;
        const outputs = new Map<string, Record<string, unknown>[]>();
        const messages = new Map<string, typeof parsed.context.messages>();
        for (const value of raw.input) {
          work.check();
          const row = record(value);
          if (row?.type === "function_call_output" && typeof row.call_id === "string") {
            const rows = outputs.get(row.call_id) ?? []; rows.push(row); outputs.set(row.call_id, rows);
          }
        }
        for (const message of parsed.context.messages) {
          work.check();
          if (message.role === "toolResult") {
            const rows = messages.get(message.toolCallId) ?? []; rows.push(message); messages.set(message.toolCallId, rows);
          }
        }
        const allowed = new Map(result.replacements);
        for (const [id, replacement] of allowed) {
          work.check();
          const rows = outputs.get(id), matches = messages.get(id), message = matches?.[0];
          if (rows?.length !== 1 || matches?.length !== 1 || message?.role !== "toolResult" || message.isError || message.containsEncryptedContent
            || text(rows[0].output) !== replacement.before || text(message.content) !== replacement.before) allowed.delete(id);
        }
        const input = raw.input.map(value => {
          work.check();
          const row = record(value);
          const replacement = row?.type === "function_call_output" && typeof row.call_id === "string" ? allowed.get(row.call_id) : undefined;
          return replacement ? { ...row, output: replaceText(row!.output, replacement.after) } : value;
        });
        const copiedMessages = parsed.context.messages.map(message => {
          work.check();
          if (message.role !== "toolResult") return message;
          const replacement = allowed.get(message.toolCallId);
          return replacement ? { ...message, content: replaceText(message.content, replacement.after) as typeof message.content } : message;
        });
        if (allowed.size) projection = { raw: parsed._rawBody, messages: parsed.context.messages, copiedRaw: { ...raw, input }, copiedMessages };
        result = { ...result, replacements: allowed };
      }
      result.stats.compressedResults = result.replacements.size;
      result.stats.inputBytes = result.stats.outputBytes = 0;
      for (const replacement of result.replacements.values()) {
        work.check();
        result.stats.inputBytes += Buffer.byteLength(replacement.before);
        result.stats.outputBytes += Buffer.byteLength(replacement.after);
      }
      if (result.replacements.size && budget) {
        const bytes = result.stats.outputBytes * 2 + result.replacements.size * 1024;
        budget.chargeRetained(bytes, { kind: "request_copies" }); retained = bytes;
      }
      if (parsed) apply(parsed, projection);
      releaseProjection?.(); releaseProjection = undefined;
      work.check();
    } catch {
      try { releaseProjection?.(); } catch { /* Optional cleanup must not refuse inference. */ }
      if (retained) { try { budget?.releaseRetained(retained, { kind: "request_copies" }); } catch {} }
      projection = undefined;
      result = { body, replacements: new Map(), stats: { requests: 1, compressedResults: 0, inputBytes: 0, outputBytes: 0, fallbacks: 1, elapsedMs: 0 } };
    }
    result.stats.elapsedMs = work.elapsed();
    const entry = { result, projection };
    const entries = prepared.get(body) ?? new Map<RtkProtocol, Prepared>();
    entries.set(protocol, entry); prepared.set(body, entries);
    totals.add(result.stats);
    return entry;
  };
  const prepareBody = <T>(body: T, protocol: RtkProtocol): T => prepare(body, protocol).result.body as T;
  const prepareParsed = (parsed: OcxParsedRequest, request?: Request): OcxParsedRequest => {
    if (!enabled || parsed._compactionRequest) return parsed;
    try {
      const source = request ? sources.get(request) : undefined;
      if (requireSource && !source) return parsed;
      const entry = prepare(source?.body ?? parsed._rawBody, source?.protocol ?? (options.native ? "native-responses" : "responses"), parsed, options.signal ?? request?.signal);
      return apply(parsed, entry.projection);
    } catch { return parsed; }
  };
  return { prepareBody, prepareParsed };
}

function text(value: unknown): unknown {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length === 1) {
    const part = record(value[0]);
    if (part?.type === "text" || part?.type === "input_text") return part.text;
  }
}
function replaceText(value: unknown, next: string): unknown {
  return typeof value === "string" ? next : [{ ...record((value as unknown[])[0]), text: next }];
}

/** Per-exchange memo survives credential rebuilds; transport retry reuses its built bytes. */
export function wrapRtkAdapter(adapter: ProviderAdapter, transport: ReturnType<typeof createRtkTransport>, request: Request): ProviderAdapter {
  if (adapter.runTurn) return adapter;
  const build = adapter.buildRequest.bind(adapter);
  adapter.buildRequest = (parsed, incoming) => build(transport.prepareParsed(parsed, request), incoming);
  return adapter;
}
