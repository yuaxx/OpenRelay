import { Trans } from "../i18n/provider";
import type { TFn } from "../i18n/shared";
import { EmptyState } from "../ui";
import { formatProviderDisplayName } from "../provider-icons";
import type { ProviderInfo } from "./dashboard-shared";
import { Badge, Card } from "../components/ui/controls";
import { ProviderIcon } from "../components/provider-workspace/ProviderRail";

export function DashboardProvidersSection({
  t,
  providers,
}: {
  t: TFn;
  providers: ProviderInfo[];
}) {
  return (
    <>
      <div className="h-section">{t("dash.activeProviders")} <span className="count">{providers.length}</span></div>
      {providers.length === 0 ? (
        <EmptyState title={<Trans k="dash.noProviders" cmd="ocx init" />} />
      ) : (
        <div className="or:grid or:grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] or:gap-4">
          {providers.map(p => <Card key={p.name} className="or-provider-card or:p-5">
            <div className="or:flex or:items-center or:gap-3">
              <ProviderIcon name={p.name} adapter={p.adapter} baseUrl={p.baseUrl} cls="pws-dashboard-row-icon" />
              <h3>{formatProviderDisplayName(p.name, t)}</h3>
              <Badge className="or:ml-auto">{p.adapter}</Badge>
            </div>
            <dl className="or-provider-facts or:grid or:gap-3">
              <div><dt>{t("dash.col.baseUrl")}</dt><dd><code>{p.baseUrl}</code></dd></div>
              <div><dt>{t("dash.col.model")}</dt><dd><code>{p.defaultModel ?? "—"}</code></dd></div>
            </dl>
          </Card>)}
        </div>
      )}
    </>
  );
}
