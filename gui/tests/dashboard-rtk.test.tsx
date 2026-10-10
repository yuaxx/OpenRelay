import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DashboardRtk, type RtkSettings } from "../src/pages/dashboard-rtk";
import { LanguageProvider } from "../src/i18n/provider";


let window: Window;
let host: HTMLElement;
let root: Root;
const keys = ["window", "document", "navigator", "IS_REACT_ACT_ENVIRONMENT"] as const;
let previous: PropertyDescriptor[];

beforeEach(() => {
  previous = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key)!);
  window = new Window({ url: "http://localhost/" });
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, writable: true,
    value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : key === "window" ? window : window[key] });
  host = window.document.createElement("div") as unknown as HTMLElement;
  window.document.body.appendChild(host as never);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  await window.happyDOM.close();
  keys.forEach((key, index) => {
    if (previous[index]) Object.defineProperty(globalThis, key, previous[index]);
    else Reflect.deleteProperty(globalThis, key);
  });
});

const settings: RtkSettings = { enabled: false, stats: { checked: 3, compressed: 1, skipped: 1, fallback: 1, bytesBefore: 4096, bytesAfter: 1024, elapsedMs: 2, reasons: { unchanged: 1, preparation_failed: 1 } } };

test("dashboard defaults disabled and saves RTK without a read or polling", async () => {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return Response.json({ ...settings, enabled: true });
  }) as typeof fetch;
  try {
    await act(async () => root.render(<LanguageProvider><DashboardRtk apiBase="" settings={settings} /></LanguageProvider>));
    const toggle = host.querySelector<HTMLButtonElement>('[aria-pressed]')!;
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(host.textContent).toContain("Disabled");
    expect(calls.length).toBe(0);
    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(host.textContent).toContain("Enabled");
    expect(calls).toEqual([{ url: "/api/rtk", body: { enabled: true } }]);
  } finally { globalThis.fetch = original; }
});

test("failed save preserves disabled state and exposes accessible error", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ code: "write_failed" }, { status: 500 })) as typeof fetch;
  try {
    await act(async () => root.render(<LanguageProvider><DashboardRtk apiBase="" settings={settings} /></LanguageProvider>));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-pressed]')!.click());
    expect(host.querySelector('[aria-pressed]')!.getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Could not save');
  } finally { globalThis.fetch = original; }
});
