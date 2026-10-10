import type { AccountQuota } from "../codex-quota-utils";
import type { AccountQuotaReading } from "../components/provider-workspace/types";
import { accountQuotaFromReport, QUOTA_REPORT_MAX_AGE_MS } from "./report";

export type QuotaOverviewState = "ready" | "stale" | "refreshing" | "error" | "unsupported" | "missing";

export interface QuotaOverviewAccount {
  id: string;
  label: string;
  reading: AccountQuotaReading;
}

type CodexRosterRow = { id: string; email: string; alias?: string; isMain: boolean; hasCredential: boolean; quota: AccountQuota | null };

/** The backend always emits an empty main-login row, even before a login exists. */
export function codexQuotaOverviewAccounts(
  accounts: ReadonlyArray<CodexRosterRow>,
  refreshing: boolean,
  refreshFailed: boolean,
): QuotaOverviewAccount[] {
  return accounts
    .filter(account => !(account.isMain && !account.hasCredential && account.email === "Codex App login"))
    .map(account => ({
      id: account.id,
      label: account.alias || account.email || account.id,
      reading: {
        quotaMode: "probe",
        quota: account.quota,
        quotaPending: refreshing,
        quotaUnavailable: refreshFailed,
      },
    }));
}

/** Retain only display evidence for a probed report; this never enters routing or quota cache. */
export function probedQuotaReadTimes(value: unknown): Record<string, number> {
  const rows = Array.isArray(value) ? value : value && typeof value === "object"
    ? Object.entries(value).map(([provider, row]) => ({ ...(row as object), provider })) : [];
  const times: Record<string, number> = {};
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (typeof row.provider === "string" && row.provider.trim() && row.observed !== true
      && typeof row.updatedAt === "number" && Number.isFinite(row.updatedAt) && "quota" in row) {
      times[row.provider] = row.updatedAt;
    }
  }
  return times;
}

/** Keep expired last-read evidence when a later report omits that provider. */
export function nextProbedQuotaReadTimes(
  previous: Record<string, number>,
  response: unknown,
  visibleReports: Record<string, unknown>,
  now: number,
): Record<string, number> {
  const times: Record<string, number> = {};
  for (const [provider, updatedAt] of Object.entries(previous)) {
    if (now - updatedAt >= QUOTA_REPORT_MAX_AGE_MS && !visibleReports[provider]) times[provider] = updatedAt;
  }
  return { ...times, ...probedQuotaReadTimes(response) };
}

/** A display-only reading. Unknown limits never become an inferred zero. */
export function quotaOverviewReading(
  reading: AccountQuotaReading,
  now = Date.now(),
): { state: QuotaOverviewState; quota: AccountQuota | null; updatedAt?: number } {
  const quota = accountQuotaFromReport({ quota: reading.quota });
  const timestamp = reading.quota?.updatedAt;
  const updatedAt = typeof timestamp === "number" && Number.isFinite(new Date(timestamp).getTime())
    ? timestamp : undefined;
  const stale = updatedAt !== undefined && now - updatedAt >= QUOTA_REPORT_MAX_AGE_MS;
  const state: QuotaOverviewState = reading.quotaMode === "unsupported" ? "unsupported"
    : reading.quotaPending ? "refreshing"
    : reading.quotaUnavailable ? "error"
    : stale ? "stale"
    : quota ? "ready" : "missing";
  return { state, quota, ...(updatedAt !== undefined ? { updatedAt } : {}) };
}
