import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n/shared";
import { Card, Badge, Toggle } from "../components/ui/controls";

export type RtkSettings = { enabled: boolean; stats: {
  checked: number; compressed: number; skipped: number; fallback: number;
  bytesBefore: number; bytesAfter: number; elapsedMs: number; reasons: Record<string, number>;
} };

export function DashboardRtk({ apiBase, settings }: { apiBase: string; settings?: RtkSettings }) {
  const t = useT();
  const [saved, setSaved] = useState<{ source: boolean; enabled: boolean } | null>(null);
  const enabled = saved && saved.source === settings?.enabled ? saved.enabled : settings?.enabled === true;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const saving = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, []);
  async function toggle() {
    if (saving.current || !settings) return;
    const controller = lifetime.current;
    saving.current = true; setBusy(true); setError(false);
    try {
      const response = await fetch(`${apiBase}/api/rtk`, { method: "PUT", headers: { "Content-Type": "application/json" }, signal: controller?.signal, body: JSON.stringify({ enabled: !enabled }) });
      if (!response.ok) throw new Error("save_failed");
      const result = await response.json() as RtkSettings;
      if (typeof result.enabled !== "boolean") throw new Error("invalid_response");
      if (!controller?.signal.aborted) setSaved({ source: settings.enabled, enabled: result.enabled });
    } catch { if (!controller?.signal.aborted) setError(true); }
    finally { saving.current = false; if (!controller?.signal.aborted) setBusy(false); }
  }
  const stats = settings?.stats;
  const metrics = ["checked", "compressed", "skipped", "fallback", "bytesBefore", "bytesAfter", "elapsedMs"] as const;
  return <Card className="or:p-5 or:flex or:flex-col or:gap-4">
    <div className="or:flex or:items-center or:justify-between or:gap-4">
      <h3>{t("rtk.title")}</h3>
      <div className="or:flex or:items-center or:gap-3">
        <Badge>{t(enabled ? "rtk.enabled" : "rtk.disabled")}</Badge>
        <Toggle on={enabled} onClick={() => void toggle()} disabled={busy || !settings} label={t("rtk.title")} />
      </div>
    </div>
    <p className="page-sub">{t("rtk.scope")}</p>
    <p className="page-sub">{t("rtk.warning")}</p>
    {error && <p role="alert">{t("rtk.saveError")}</p>}
    <p className="page-sub">{t("rtk.statistics")}</p>
    <dl className="or:grid or:grid-cols-2 or:gap-4 or:md:grid-cols-4">
      {metrics.map(key => <div key={key}><dt className="page-sub">{t(`rtk.${key}`)}</dt>
        <dd>{stats ? (key === "elapsedMs" ? Math.round(stats[key]) : stats[key]).toLocaleString() : "—"}</dd></div>)}
    </dl>
  </Card>;
}
