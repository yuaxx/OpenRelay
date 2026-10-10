export interface RtkStats {
  requests: number;
  compressedResults: number;
  inputBytes: number;
  outputBytes: number;
  fallbacks: number;
  elapsedMs: number;
}
/** Process-local aggregates only: never retains result text, call ids or commands. */
export function createRtkStats() {
  const totals: RtkStats = { requests: 0, compressedResults: 0, inputBytes: 0, outputBytes: 0, fallbacks: 0, elapsedMs: 0 };
  let compressed = 0;
  return {
    add(delta: RtkStats) { if (delta.compressedResults > 0) compressed += delta.requests; for (const key of Object.keys(totals) as Array<keyof RtkStats>) totals[key] += delta[key]; },
    snapshot(): Readonly<RtkStats> { return { ...totals }; },
    dashboardSnapshot() {
      const skipped = Math.max(0, totals.requests - compressed - totals.fallbacks);
      return { checked: totals.requests, compressed, skipped, fallback: totals.fallbacks,
        bytesBefore: totals.inputBytes, bytesAfter: totals.outputBytes, elapsedMs: totals.elapsedMs,
        reasons: { unchanged: skipped, preparation_failed: totals.fallbacks } };
    },
  };
}
