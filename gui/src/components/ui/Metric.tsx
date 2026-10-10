import type { ReactNode } from "react";
import { Card } from "./controls";

export function Metric({ label, value, detail, busy, tone = "neutral" }: {
  label: string; value: ReactNode; detail?: ReactNode; busy?: boolean; tone?: "neutral" | "ok" | "error";
}) {
  return <Card className="or-metric or:flex or:flex-col or:gap-3 or:p-5" aria-busy={busy || undefined} data-tone={tone}>
    <span className="or-metric-label">{label}</span>
    <div className="or-metric-value or:flex or:items-center or:gap-2">{value}</div>
    {detail && <span className="or-metric-detail">{detail}</span>}
  </Card>;
}
