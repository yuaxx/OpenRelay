/**
 * The Provider Overview's refresh-all-quotas control.
 *
 * The aggregate view stacks every provider's rate-limit bars and labels each with its
 * age ("checked 2 minutes ago"), so it tells the operator the numbers are stale and,
 * until this control existed, offered nothing to do about it. Per-provider refresh
 * lived one drill-down away in the Usage and Accounts tabs.
 *
 * What actually needs proving is the honesty of the result, not the presence of a
 * button: `fetchProviderQuotas(true)` is a synchronous state bump, so a control that
 * resolved on its own click would report success while the old numbers were still on
 * screen. The truthful answer arrives later, from the settled promise the shell owns.
 * That is a runtime property, so these are DOM tests rather than source assertions.
 */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import type { Root } from "react-dom/client";
import ProviderOverviewDashboard from "../src/components/provider-workspace/ProviderOverviewDashboard";
import { LanguageProvider } from "../src/i18n/provider";
import type { WorkspaceSections } from "../src/provider-workspace/catalog";
import { codexQuotaOverviewAccounts, nextProbedQuotaReadTimes, probedQuotaReadTimes, quotaOverviewReading, type QuotaOverviewAccount } from "../src/provider-workspace/quota-overview";
import type { ProviderQuotaReportView } from "../src/provider-workspace/report";

const domGlobals = ["document", "window", "navigator", "IS_REACT_ACT_ENVIRONMENT"] as const;
let previousDomGlobals: Record<(typeof domGlobals)[number], unknown>;
let testWindow: Window;
let mountedRoots: Root[];

async function flush(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => testWindow.setTimeout(resolve, 0));
  await Promise.resolve();
}

const SECTIONS: WorkspaceSections = {
  ready: [{ name: "anthropic", adapter: "anthropic", baseUrl: "https://api.anthropic.com", authMode: "oauth" }],
  needsSetup: [],
  disabled: [],
};

async function mountOverview(
  onRefreshAllQuotas?: () => Promise<boolean>,
  accountRows?: Record<string, QuotaOverviewAccount[]>,
  sections = SECTIONS,
  lastQuotaReadTimes?: Record<string, number>,
  quotaReports: Record<string, ProviderQuotaReportView> = {},
  accountReadFailed?: Record<string, boolean>,
): Promise<HTMLElement> {
  const host = testWindow.document.createElement("div");
  testWindow.document.body.appendChild(host as never);
  const { createRoot } = await import("react-dom/client");
  await act(async () => {
    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <LanguageProvider>
        <ProviderOverviewDashboard
          sections={sections}
          quotaReports={quotaReports}
          lastQuotaReadTimes={lastQuotaReadTimes}
          accountRows={accountRows}
          accountReadFailed={accountReadFailed}
          usageTotals={{}}
          onSelectProvider={() => {}}
          {...(onRefreshAllQuotas ? { onRefreshAllQuotas } : {})}
        />
      </LanguageProvider>,
    );
  });
  await act(async () => { await flush(); });
  return host as unknown as HTMLElement;
}

function headerButtons(host: ParentNode): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>(".pws-dashboard-header-actions button")];
}

function refreshButton(host: ParentNode): HTMLButtonElement {
  const found = headerButtons(host).find(b => (b.textContent ?? "").toLowerCase().includes("refresh"));
  if (!found) throw new Error("refresh control missing from the overview header");
  return found;
}

beforeEach(() => {
  previousDomGlobals = Object.fromEntries(
    domGlobals.map((key) => [key, Reflect.get(globalThis, key)]),
  ) as typeof previousDomGlobals;
  testWindow = new Window({ url: "http://localhost/" });
  Object.defineProperty(testWindow.navigator, "language", { configurable: true, value: "en-US" });
  Object.defineProperties(globalThis, {
    document: { configurable: true, value: testWindow.document },
    window: { configurable: true, value: testWindow },
    navigator: { configurable: true, value: testWindow.navigator },
  });
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mountedRoots = [];
});

test("overview keeps multiple account readings separate and never draws an unknown quota as zero", async () => {
  const now = Date.now();
  const host = await mountOverview(undefined, { anthropic: [
    { id: "first", label: "First account", reading: { quotaMode: "probe", quota: { fiveHourPercent: 42, fiveHourResetAt: now + 3_600_000, updatedAt: now } } },
    { id: "second", label: "Second account", reading: { quotaMode: "probe", quota: { weeklyPercent: 67, customWindows: [{ label: "Gemini group", percent: 17 }], updatedAt: now } } },
    { id: "third", label: "No reading", reading: { quotaMode: "probe", quota: null } },
  ] });
  const rows = host.querySelectorAll(".pws-dashboard-account");
  expect(rows).toHaveLength(3);
  expect(rows[0]?.textContent).toContain("First account");
  expect(rows[0]?.textContent).toContain("42");
  expect(rows[0]?.textContent?.toLowerCase()).toContain("resets in");
  expect(rows[1]?.textContent).toContain("67");
  expect(rows[1]?.textContent).toContain("Gemini group");
  expect(rows[2]?.getAttribute("data-quota-state")).toBe("missing");
  expect(rows[2]?.querySelector(".quota-bar")).toBeNull();
});

test("a configured API-key provider with unsupported quota shows that status", async () => {
  const sections: WorkspaceSections = { ready: [
    { name: "api.navy", adapter: "openai", baseUrl: "https://api.navy", authMode: "key" },
  ], needsSetup: [], disabled: [] };
  const host = await mountOverview(undefined, { "api.navy": [
    { id: "key-1", label: "Key one", reading: { quotaMode: "unsupported", quota: null } },
  ] }, sections);
  expect(host.querySelectorAll('[data-quota-state="unsupported"]')).toHaveLength(1);
  expect(host.textContent).toContain("not supported");
});

test("account reading distinguishes stale, unsupported, refresh and error states", () => {
  const now = Date.now();
  const quota = { fiveHourPercent: 24, updatedAt: now - 31 * 60_000 };
  expect(quotaOverviewReading({ quotaMode: "probe", quota }, now).state).toBe("stale");
  expect(quotaOverviewReading({ quotaMode: "unsupported", quota: null }, now).state).toBe("unsupported");
  expect(quotaOverviewReading({ quotaMode: "probe", quotaPending: true, quota: null }, now).state).toBe("refreshing");
  expect(quotaOverviewReading({ quotaMode: "probe", quotaUnavailable: true, quota }, now).state).toBe("error");
  expect(quotaOverviewReading({ quotaMode: "probe", quota: null }, now).quota).toBeNull();
  expect(quotaOverviewReading({ quotaMode: "probe", quota: { fiveHourPercent: 24 } }, now).updatedAt).toBeUndefined();
});

test("Codex roster keeps a configured account without email or credential and drops only the empty main placeholder", () => {
  const accounts = [
    { id: "__main__", email: "Codex App login", isMain: true, hasCredential: false, quota: null },
    { id: "configured", email: "", isMain: false, hasCredential: false, quota: null },
  ];
  expect(codexQuotaOverviewAccounts(accounts, false, false).map(row => row.id)).toEqual(["configured"]);
  expect(codexQuotaOverviewAccounts([{ ...accounts[0], hasCredential: true }], false, false)).toHaveLength(1);
});

test("Codex failed refresh keeps account quota and marks the error after pending settles", async () => {
  const now = Date.now();
  const account = { id: "codex-1", email: "one@example.test", isMain: false, hasCredential: true,
    quota: { shortPercent: 28, shortResetAt: now + 3_600_000, updatedAt: now } };
  expect(quotaOverviewReading(codexQuotaOverviewAccounts([account], true, true)[0]!.reading, now).state).toBe("refreshing");
  const rows = codexQuotaOverviewAccounts([account], false, true);
  expect(quotaOverviewReading(rows[0]!.reading, now).state).toBe("error");
  const sections: WorkspaceSections = { ready: [
    { name: "openai", adapter: "openai", baseUrl: "https://api.openai.com", authMode: "oauth" },
  ], needsSetup: [], disabled: [] };
  const host = await mountOverview(undefined, { openai: rows }, sections);
  const rendered = host.querySelector('[data-quota-state="error"]');
  expect(rendered?.textContent).toContain("28% used");
  expect(rendered?.textContent).toContain("Resets in");
  expect(rendered?.textContent).toContain("Last successful reading");
  expect(rendered?.textContent).toContain("temporarily unavailable");
});

test("Codex account read failure is visible even when no roster was loaded", async () => {
  const sections: WorkspaceSections = { ready: [
    { name: "openai", adapter: "openai", baseUrl: "https://api.openai.com", authMode: "oauth" },
  ], needsSetup: [], disabled: [] };
  const host = await mountOverview(undefined, { openai: [] }, sections, undefined, {}, { openai: true });
  expect(host.querySelector(".pws-dashboard-account-list[role=status]")?.textContent).toContain("temporarily unavailable");
});

test("expired provider report retains its last reading time as stale display evidence", async () => {
  const updatedAt = Date.now() - 31 * 60_000;
  const times = probedQuotaReadTimes([{ provider: "anthropic", updatedAt, quota: { fiveHourPercent: 19 } }]);
  expect(times.anthropic).toBe(updatedAt);
  expect(nextProbedQuotaReadTimes(times, [], {}, Date.now()).anthropic).toBe(updatedAt);
  expect(nextProbedQuotaReadTimes({ anthropic: Date.now() - 60_000 }, [], {}, Date.now())).toEqual({});
  expect(probedQuotaReadTimes([{ provider: "anthropic", updatedAt, observed: true, quota: {} }])).toEqual({});
  const host = await mountOverview(undefined, undefined, SECTIONS, times);
  expect(host.textContent).toContain("Last successful reading");
  expect(host.textContent?.match(/Stale/g)).toHaveLength(1);
  expect(host.querySelector(".pws-dashboard-row-bars")?.textContent).not.toContain("Stale");
  expect(host.textContent).not.toContain("19% used");
});

test("refresh control names provider scope and points account reads to their own views", async () => {
  const host = await mountOverview(() => Promise.resolve(true));
  expect(refreshButton(host).textContent).toContain("Refresh provider quotas");
  expect(host.textContent).toContain("Refresh account quotas in Accounts / API Keys");
});

afterEach(async () => {
  for (const root of mountedRoots) {
    await act(async () => { root.unmount(); });
  }
  mountedRoots = [];
  for (const key of domGlobals) {
    Object.defineProperty(globalThis, key, { configurable: true, value: previousDomGlobals[key] });
  }
  await testWindow.happyDOM?.close?.();
});

test("the control is absent when the page cannot drive a refresh", async () => {
  const host = await mountOverview();
  expect(headerButtons(host).some(b => (b.textContent ?? "").toLowerCase().includes("refresh"))).toBe(false);
});

test("the control stays disabled until the read settles, then reports success", async () => {
  let release!: (ok: boolean) => void;
  const settled = new Promise<boolean>(resolve => { release = resolve; });
  let calls = 0;
  const host = await mountOverview(() => { calls += 1; return settled; });

  const button = refreshButton(host);
  await act(async () => { button.click(); await flush(); });

  // Still in flight: a control that reported here would be lying about stale bars.
  expect(calls).toBe(1);
  expect(refreshButton(host).disabled).toBe(true);
  expect(host.querySelector('[role="status"]')).toBeNull();

  // A second click while disabled must not issue a second forced read: a re-run
  // cancels the first effect, and a cancelled read never settles its waiters.
  await act(async () => { refreshButton(host).click(); await flush(); });
  expect(calls).toBe(1);

  await act(async () => { release(true); await flush(); });

  expect(refreshButton(host).disabled).toBe(false);
  const status = host.querySelector('[role="status"]');
  expect(status?.className).toContain("pws-status-ok");
  // Deliberately "complete", not "refreshed": the server answers 200 even when one
  // upstream probe failed and its provider kept a last-good row, so claiming every
  // number is fresh would overstate what the read actually proved.
  expect(status?.textContent ?? "").toContain("complete");
  expect(status?.textContent ?? "").not.toContain("refreshed");
});

test("a failed read is reported as a failure, not silence", async () => {
  const host = await mountOverview(() => Promise.resolve(false));
  await act(async () => { refreshButton(host).click(); await flush(); });

  const status = host.querySelector('[role="status"]');
  expect(status?.className).toContain("pws-status-warn");
  expect(refreshButton(host).disabled).toBe(false);
});

test("a thrown refresh is reported as a failure too", async () => {
  const host = await mountOverview(() => Promise.reject(new Error("network down")));
  await act(async () => { refreshButton(host).click(); await flush(); });

  expect(host.querySelector('[role="status"]')?.className).toContain("pws-status-warn");
  expect(refreshButton(host).disabled).toBe(false);
});
