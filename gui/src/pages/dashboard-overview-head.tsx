import { IconAlert, IconInfo } from "../icons";
import { type TKey, useT } from "../i18n/shared";
import { formatTokens } from "../format-tokens";
import { formatUptime } from "../formatUptime";
import { navigateHash } from "../hash-routing";
import type { useDashboardData } from "./use-dashboard-data";
import { UsageIncompleteNotice } from "../components/usage-incomplete-notice";
import { Metric } from "../components/ui/Metric";

type Dash = ReturnType<typeof useDashboardData>;

export function DashboardOverviewHead({
  locale,
  health,
  providers,
  usage30d,
  usageLoading,
  healthLoading,
  startupHealth,
  projectConfigWarnings,
  maMode,
  maBusy,
  maHelpTriggerRef,
 maHelpOpen,
 setMaHelpOpen,
 switchMaMode,
  maError,
}: Pick<Dash, "locale" | "health" | "providers" | "usage30d" | "usageLoading" | "healthLoading" | "startupHealth" | "projectConfigWarnings" | "maMode" | "maBusy" | "maHelpTriggerRef" | "maHelpOpen" | "setMaHelpOpen" | "switchMaMode" | "maError">) {
 const t = useT();
  const online = health?.status === "ok";

  return (
    <>
      <div className="dash-overview-head">
        <div className="or-metrics or:grid or:grid-cols-2 or:gap-3 or:xl:grid-cols-5">
          <Metric label={t("dash.status")} busy={healthLoading} tone={!health ? "neutral" : online ? "ok" : "error"}
            value={!health && healthLoading ? t("common.loading") : <><span className={`dot ${online ? "dot-green" : "dot-red"}`} aria-hidden="true" />{t(online ? "dash.online" : "dash.offline")}</>} />
          <Metric label={t("dash.version")} busy={healthLoading} value={<span title={health?.version}>{health?.version ?? "—"}</span>} />
          <Metric label={t("dash.uptime")} busy={healthLoading} value={health ? formatUptime(health.uptime, locale) : "—"} />
          <Metric label={t("dash.providers")} busy={healthLoading} value={providers.length} />
          <Metric label={t("dash.tokens30d")} busy={usageLoading}
            value={usage30d && usage30d.summary.requests > 0 ? formatTokens(usage30d.summary.totalTokens, locale) : "—"}
            detail={usage30d && usage30d.summary.requests > 0
              ? t("dash.coverage").replace("{pct}", `${Math.round(usage30d.summary.coverageRatio * 100)}%`) : undefined} />
        </div>

        <div className="or-runtime-controls">
          <div className="stat">
            <div className="label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {t("dash.multiAgent")}
              <button
                ref={maHelpTriggerRef}
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ width: 24, height: 24, minWidth: 24, flex: "0 0 24px", padding: 0, borderRadius: "var(--radius-pill)", color: "var(--muted)" }}
                onClick={() => setMaHelpOpen(true)}
                aria-label={t("dash.multiAgent")}
                aria-haspopup="dialog"
                aria-controls="multi-agent-help-dialog"
                aria-expanded={maHelpOpen}
              >
                <IconInfo width={14} height={14} aria-hidden="true" />
              </button>
            </div>
            <div className="value" style={{ display: "flex", alignItems: "center" }}>
              <div className="dash-ma-switch" role="radiogroup" aria-label={t("dash.multiAgent")} style={{ display: "inline-flex", borderRadius: "var(--radius-pill)", background: "var(--surface-soft, var(--raised))", padding: 3, gap: 2 }}>
                {(["v1", "default", "v2"] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={maMode === mode}
                    className={`btn btn-sm text-caption dash-ma-option${maMode === mode ? " btn-primary" : " btn-ghost"}`}
                    style={{ borderRadius: "var(--radius-pill)", border: "none", background: maMode === mode ? undefined : "transparent", color: maMode === mode ? undefined : "var(--muted)" }}
                    disabled={maBusy}
                    onClick={() => void switchMaMode(mode)}
                  >{t(`models.v2Mode_${mode}` as TKey)}</button>
                ))}
             </div>
           </div>
            {maError && (
              <div role="alert" className="text-caption" style={{ color: "var(--red)", marginTop: 4, textAlign: "center", maxWidth: 280, wordBreak: "break-word" }}>
                {maError}
              </div>
            )}
         </div>
        </div>

        <div className="startup-health-slot" aria-live="polite">
          {startupHealth ? (
            <button type="button" className="startup-health-bar" onClick={() => navigateHash("startup")}>
              <span className={`dot ${startupHealth === "error" ? "dot-red" : startupHealth === "at-risk" ? "dot-amber" : "dot-green"}`} aria-hidden="true" />
              <span className="startup-health-bar__summary">
                {t(startupHealth === "error"
                  ? "startup.error"
                  : startupHealth === "at-risk"
                    ? "startup.summary.atRisk"
                    : startupHealth === "protected"
                      ? "startup.summary.protected"
                      : "startup.summary.native")}
              </span>
            </button>
          ) : (
            <div className="startup-health-bar startup-health-bar--pending" aria-hidden="true">
              <span className="dot dot-amber" />
              <span className="startup-health-bar__summary">&nbsp;</span>
            </div>
          )}
        </div>
      </div>

      <UsageIncompleteNotice data={usage30d} />
      {projectConfigWarnings.length > 0 && (
        <div className="notice notice-err maintenance-notice" role="alert">
          <IconAlert />
          <div>
            <div className="font-semibold">{t("dash.projectConfigTitle")}</div>
            <div className="muted text-control" style={{ marginTop: 4 }}>{t("dash.projectConfigHint")}</div>
            <ul className="text-control" style={{ margin: "10px 0 0", paddingLeft: 18 }}>
              {projectConfigWarnings.map(g => (
                <li key={g.path} style={{ marginBottom: 8 }}>
                  <code>{g.path}</code> — {g.issues.join(", ")}
                  <div className="muted" style={{ marginTop: 2 }}>{g.bypass}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
