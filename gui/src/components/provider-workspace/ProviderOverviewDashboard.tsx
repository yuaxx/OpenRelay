/**
 * ProviderOverviewDashboard — aggregate overview when no provider is selected.
 * Shows summary cards, attention list, per-provider rate limits (QuotaBars stacked),
 * recently-used ranking, and Edit JSON entry.
 */
import { useMemo, useState } from "react";
import { useT, useI18n, type TFn } from "../../i18n/shared";
import { IconAlert, IconChevron, IconRefresh } from "../../icons";
import type { WorkspaceSections, WorkspaceItem } from "../../provider-workspace/catalog";
import {
  accountQuotaFromReport,
  QUOTA_REPORT_MAX_AGE_MS,
  type ProviderQuotaReportView,
} from "../../provider-workspace/report";
import {
  attentionReasonKey,
  buildAttentionItems,
  buildMostUsedProviders,
  formatRequestCount,
  type ProviderUsageTotals,
} from "../../provider-workspace/usage";
import { maxQuotaUtilisation } from "../QuotaBars";
import { ProviderIcon } from "./ProviderRail";
import { formatProviderDisplayName } from "../../provider-icons";
import QuotaBars from "../QuotaBars";
import { ProviderCapacityQuota } from "./ProviderCapacityQuota";
import { quotaOverviewReading, type QuotaOverviewAccount, type QuotaOverviewState } from "../../provider-workspace/quota-overview";
import { AccountDetails, Badge, Button, Card } from "../ui/controls";

function quotaStateLabel(state: QuotaOverviewState, t: TFn): string {
  switch (state) {
    case "stale": return t("startup.stale");
    case "refreshing": return t("codexAuth.refreshingQuota");
    case "error": return t("pws.accountQuotaUnavailable");
    case "unsupported": return t("pws.quotaUnsupported");
    case "missing": return t("pws.dashboard.noQuota");
    case "ready": return "";
  }
}

export default function ProviderOverviewDashboard({
  sections,
  quotaReports,
  lastQuotaReadTimes = {},
  accountRows = {},
  accountReadFailed = {},
  usageTotals,
  usageLoading = false,
  quotasLoading = false,
  onSelectProvider,
  onEditConfig,
  onRefreshAllQuotas,
}: {
  sections: WorkspaceSections;
  quotaReports: Record<string, ProviderQuotaReportView>;
  lastQuotaReadTimes?: Record<string, number>;
  accountRows?: Record<string, QuotaOverviewAccount[]>;
  accountReadFailed?: Record<string, boolean>;
  usageTotals: Record<string, ProviderUsageTotals>;
  usageLoading?: boolean;
  quotasLoading?: boolean;
  onSelectProvider: (name: string) => void;
  onEditConfig?: () => void;
  /** Force a fresh read of every provider's quota; omitted when the page cannot drive one. */
  onRefreshAllQuotas?: () => Promise<boolean>;
}) {
  const t = useT();
  const { locale } = useI18n();
  const checkedAt = (timestamp: number | undefined) => timestamp !== undefined && Number.isFinite(new Date(timestamp).getTime())
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(timestamp)
    : null;
  const [refreshingQuotas, setRefreshingQuotas] = useState(false);
  const [quotaNow, setQuotaNow] = useState(Date.now);
  const [refreshResult, setRefreshResult] = useState<{ ok: boolean; text: string } | null>(null);

  /*
   * Same contract as the per-provider control in ProviderUsage: the reported result
   * comes from the settled promise, not from the click. `fetchProviderQuotas(true)` is a
   * synchronous state bump, so a button that resolved on its own would claim success
   * while the stale numbers were still on screen. The disabled guard is not cosmetic
   * either: a second forced read cancels the first effect, and a cancelled read never
   * settles its waiters.
   */
  const refreshAllQuotas = async () => {
    if (!onRefreshAllQuotas || refreshingQuotas) return;
    setRefreshingQuotas(true);
    // Cleared on click so a previous "refreshed" cannot sit under a later failure.
    setRefreshResult(null);
    try {
      const ok = await onRefreshAllQuotas();
      /*
       * "Quota check complete", not "Quotas refreshed". The boolean reports whether the
       * READ succeeded, and the server answers 200 even when an individual upstream probe
       * failed: fetchProviderQuotaReports keeps that provider's last-good row rather than
       * dropping it. Claiming every number is fresh would be exactly the lie this control
       * was built to avoid. Each row carries its own age, which is where per-provider
       * staleness is already visible.
       */
      setRefreshResult({ ok, text: t(ok ? "pws.quotaRefreshDone" : "codexAuth.quotaRefreshFailed") });
    } catch {
      setRefreshResult({ ok: false, text: t("codexAuth.quotaRefreshFailed") });
    } finally {
      setRefreshingQuotas(false);
      setQuotaNow(Date.now());
    }
  };

  const allItems = useMemo(
    () => [...sections.ready, ...sections.needsSetup, ...sections.disabled],
    [sections],
  );
  const knownNames = useMemo(() => new Set(allItems.map(p => p.name)), [allItems]);

  const attention = useMemo(() => buildAttentionItems(sections, {}), [sections]);
  const attentionCount = attention.length;
  const readyReauthCount = useMemo(
    () => sections.ready.filter(p => p.activeNeedsReauth).length,
    [sections],
  );
  const readyCount = sections.ready.length - readyReauthCount;
  const needsAttentionCount = sections.needsSetup.length + readyReauthCount;

  /* Rate-limit rows: urgency first (highest utilisation), then name */
  const quotaProviders = useMemo(() => {
    const result: Array<{ item: WorkspaceItem; report?: ProviderQuotaReportView; urgency: number }> = [];
    for (const item of allItems) {
      const report = quotaReports[item.name];
      const quota = report ? accountQuotaFromReport(report) : null;
      result.push({ item, report, urgency: quota ? maxQuotaUtilisation(quota) : -1 });
    }
    return result.sort((a, b) => b.urgency - a.urgency || a.item.name.localeCompare(b.item.name));
  }, [allItems, quotaReports]);

  /* Recently-used: filter to known provider names and cap at 4 (PR #139 parity) */
  const mostUsed = useMemo(() => {
    const filtered: Record<string, ProviderUsageTotals> = {};
    for (const [name, totals] of Object.entries(usageTotals)) {
      if (knownNames.has(name)) filtered[name] = totals;
    }
    return buildMostUsedProviders(filtered).slice(0, 4);
  }, [usageTotals, knownNames]);

  const localizeAttentionReason = (reason: string) => {
    const key = attentionReasonKey(reason);
    if (key === "reauth") return t("pws.attention.reauth");
    if (key === "missing") return t("pws.attention.missingCredentials");
    return reason;
  };

  return (
    <div className="pws-dashboard or:flex or:flex-col or:gap-6">
      <div className="pws-dashboard-header">
        <div className="pws-dashboard-header-text">
          <h2 className="pws-dashboard-title">{t("pws.dashboard.title")}</h2>
          {onRefreshAllQuotas && <p className="pws-dashboard-subtitle muted">{t("pws.refreshProviderHint")}</p>}
        </div>
        <div className="pws-dashboard-header-actions">
          {refreshResult && (
            <span role="status" className={refreshResult.ok ? "pws-status-ok" : "pws-status-warn"}>
              {refreshResult.text}
            </span>
          )}
          {onRefreshAllQuotas && (
            <Button
              size="sm"
              disabled={refreshingQuotas}
              onClick={() => { void refreshAllQuotas(); }}
            >
              <IconRefresh width={14} height={14} aria-hidden="true" />
              {" "}
              {refreshingQuotas ? t("codexAuth.refreshingQuota") : t("pws.refreshAllQuotas")}
            </Button>
          )}
          {onEditConfig && (
            <Button size="sm" variant="ghost" onClick={onEditConfig}>
              {t("prov.editJson")}
            </Button>
          )}
        </div>
      </div>

      <div className="pws-dashboard-summary or:grid or:grid-cols-3 or:gap-3">
        <SummaryCard count={readyCount} label={t("pws.status.ready")} tone="ok" />
        <SummaryCard
          count={needsAttentionCount}
          label={readyReauthCount > 0 ? t("pws.status.needsAttention") : t("pws.status.needsSetup")}
          tone="warn"
        />
        <SummaryCard count={sections.disabled.length} label={t("prov.disabledBadge")} tone="muted" />
      </div>

      {attentionCount > 0 && (
        <section className="pws-dashboard-section pws-dashboard-attention" aria-label={t("pws.attentionTitle")}>
          <h3 className="pws-dashboard-section-title">
            <IconAlert style={{ width: 14, height: 14 }} aria-hidden="true" />
            {t("pws.attentionTitle")}
          </h3>
          <div className="pws-dashboard-rows">
            {attention.map(item => (
              <button
                key={`${item.name}:${item.reason}`}
                type="button"
                className="pws-dashboard-row pws-dashboard-row--attention"
                onClick={() => onSelectProvider(item.name)}
              >
                <ProviderIcon name={item.name} adapter="" baseUrl="" cls="pws-dashboard-row-icon" />
                <div className="pws-dashboard-row-info">
                  <span className="pws-dashboard-row-name">{formatProviderDisplayName(item.name, t)}</span>
                  <span className="pws-dashboard-row-meta muted">{localizeAttentionReason(item.reason)}</span>
                </div>
                <IconChevron className="pws-dashboard-row-chevron" aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="pws-dashboard-columns">
        <section
          className="pws-dashboard-section pws-dashboard-section--rate-limits"
          aria-label={t("pws.dashboard.rateLimits")}
          aria-busy={quotasLoading || undefined}
        >
          <h3 className="pws-dashboard-section-title">{t("pws.dashboard.rateLimits")}</h3>
          {quotaProviders.length > 0 ? (
            <div className="pws-dashboard-rows or:grid or:grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] or:items-start or:gap-3">
              {quotaProviders.map(({ item, report }) => (
                <Card key={item.name} className="pws-dashboard-quota-group">
                <button type="button" className="pws-dashboard-row" onClick={() => onSelectProvider(item.name)}>
                  <ProviderIcon name={item.name} adapter={item.adapter} baseUrl={item.baseUrl} cls="pws-dashboard-row-icon" />
                  <div className="pws-dashboard-row-info">
                    <span className="pws-dashboard-row-name">{formatProviderDisplayName(item.name, t)}</span>
                    <span className="pws-dashboard-row-meta muted">{(report?.updatedAt ?? lastQuotaReadTimes[item.name]) !== undefined
                      ? t("pws.lastSuccessfulReading", { date: checkedAt(report?.updatedAt ?? lastQuotaReadTimes[item.name]) ?? "" })
                      : t("pws.dashboard.noQuota")}</span>
                    {!refreshingQuotas && report?.observed !== true && (report?.updatedAt ?? lastQuotaReadTimes[item.name]) !== undefined
                      && quotaNow - (report?.updatedAt ?? lastQuotaReadTimes[item.name]) >= QUOTA_REPORT_MAX_AGE_MS
                      && <span className="pws-dashboard-row-meta muted">{t("startup.stale")}</span>}
                    {refreshingQuotas && <span className="pws-dashboard-row-meta muted">{t("codexAuth.refreshingQuota")}</span>}
                  </div>
                  <IconChevron className="pws-dashboard-row-chevron" aria-hidden="true" />
                  <div className="pws-dashboard-row-bars">
                    {report && (report.observed === true || report.updatedAt === undefined
                      || quotaNow - report.updatedAt < QUOTA_REPORT_MAX_AGE_MS)
                      ? <ProviderCapacityQuota report={report} pending={quotasLoading && !report.quota} />
                      : <span className="muted">{quotasLoading ? t("codexAuth.refreshingQuota")
                        : (report?.updatedAt ?? lastQuotaReadTimes[item.name]) !== undefined
                          && quotaNow - (report?.updatedAt ?? lastQuotaReadTimes[item.name]) >= QUOTA_REPORT_MAX_AGE_MS
                          ? null
                        : accountRows[item.name]?.length && accountRows[item.name].every(row => row.reading.quotaMode === "unsupported")
                          ? t("pws.quotaUnsupported") : t("pws.quotaUnavailable")}</span>}
                  </div>
                </button>
                {accountRows[item.name]?.length > 0 && <AccountDetails
                  label={t("usage.companion.sectionAccounts")}
                  count={accountRows[item.name].length}
                  status={[...new Set(accountRows[item.name].map(account => quotaOverviewReading(account.reading).state))]
                    .filter(state => state !== "ready")
                    .map(state => <Badge key={state} tone={state === "error" ? "error" : state === "stale" ? "warn" : "neutral"}>{quotaStateLabel(state, t)}</Badge>)}
                >
                  {accountRows[item.name].map(account => {
                    const reading = quotaOverviewReading(account.reading);
                    return <div className="pws-dashboard-account" key={account.id} data-quota-state={reading.state}>
                      <span className="pws-dashboard-row-name">{account.label}</span>
                      <span className="pws-dashboard-row-meta muted">{reading.updatedAt
                        ? t("pws.lastSuccessfulReading", { date: checkedAt(reading.updatedAt) ?? "" }) : null}</span>
                      {reading.state !== "ready" && <Badge tone={reading.state === "error" ? "error" : reading.state === "stale" ? "warn" : "neutral"}>{quotaStateLabel(reading.state, t)}</Badge>}
                      {reading.quota && <QuotaBars quota={reading.quota} threshold={80} t={t} layout="stacked" />}
                    </div>;
                  })}
                </AccountDetails>}
                {accountReadFailed[item.name] && !accountRows[item.name]?.length && (
                  <p className="pws-dashboard-account-list muted" role="status">{t("pws.accountQuotaUnavailable")}</p>
                )}
                </Card>
              ))}
            </div>
          ) : quotasLoading ? (
            <div className="pws-dashboard-rows pws-dashboard-rows--pending" aria-hidden="true">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="pws-dashboard-row pws-dashboard-row--skeleton">
                  <span className="pws-dashboard-row-icon pws-skel" />
                  <div className="pws-dashboard-row-info">
                    <span className="pws-skel pws-skel--name" />
                    <span className="pws-skel pws-skel--meta" />
                  </div>
                  <div className="pws-dashboard-row-bars">
                    <QuotaBars quota={null} threshold={80} t={t} layout="stacked" pending />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted pws-dashboard-empty">{t("pws.dashboard.noRateLimits")}</p>
          )}
        </section>

        <section
          className="pws-dashboard-section pws-dashboard-section--recent"
          aria-label={t("pws.dashboard.recentlyUsed")}
          aria-busy={usageLoading || undefined}
        >
        <details className="pws-dashboard-recent-details">
          <summary className="pws-dashboard-section-title">{t("pws.dashboard.recentlyUsed")}</summary>
          {mostUsed.length > 0 ? (
            <div className="pws-dashboard-rows">
              {mostUsed.map(provider => (
                <button
                  key={provider.name}
                  type="button"
                  className="pws-dashboard-row"
                  onClick={() => onSelectProvider(provider.name)}
                >
                  <ProviderIcon name={provider.name} adapter="" baseUrl="" cls="pws-dashboard-row-icon" />
                  <span className="pws-dashboard-row-name">{formatProviderDisplayName(provider.name, t)}</span>
                  <span className="pws-dashboard-row-count muted">
                    {t("pws.dashboard.requests", { count: formatRequestCount(provider.requests, locale) })}
                  </span>
                  <IconChevron className="pws-dashboard-row-chevron" aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : usageLoading ? (
            <div className="pws-dashboard-rows pws-dashboard-rows--pending" aria-hidden="true">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="pws-dashboard-row pws-dashboard-row--skeleton">
                  <span className="pws-dashboard-row-icon pws-skel" />
                  <span className="pws-skel pws-skel--name" />
                  <span className="pws-skel pws-skel--count" />
                </div>
              ))}
            </div>
          ) : (
            <p className="muted pws-dashboard-empty">{t("pws.dashboard.noUsage")}</p>
          )}
        </details>
        </section>
      </div>
    </div>
  );
}

function SummaryCard({ count, label, tone }: { count: number; label: string; tone: "ok" | "warn" | "muted" }) {
  return (
    <Card className={`pws-dashboard-card pws-dashboard-card--${tone}`}>
      <span className="pws-dashboard-card-count">{count}</span>
      <span className="pws-dashboard-card-label">{label}</span>
    </Card>
  );
}
