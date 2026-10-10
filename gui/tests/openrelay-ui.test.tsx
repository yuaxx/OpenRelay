import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AccountDetails, Button, Input, Tab, Tabs, Toggle } from "../src/components/ui/controls";
import { Metric } from "../src/components/ui/Metric";

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

test("shared buttons do not submit forms implicitly and retain disabled semantics", async () => {
  let clicks = 0;
  await act(async () => root.render(<form><Button onClick={() => clicks++}>Refresh</Button><Button disabled onClick={() => clicks++}>Delete</Button></form>));
  const buttons = host.querySelectorAll("button");
  expect(buttons[0].type).toBe("button");
  await act(async () => { buttons[0].click(); buttons[1].click(); });
  expect(clicks).toBe(1);
  expect(buttons[1].disabled).toBe(true);
});

test("tabs preserve panel relationships and the caller's keyboard handling", async () => {
  let keysHandled = 0;
  await act(async () => root.render(<Tabs aria-label="Sections">
    <Tab active id="first" aria-controls="first-panel" onKeyDown={() => keysHandled++}>First</Tab>
    <Tab active={false} id="second" aria-controls="second-panel">Second</Tab>
  </Tabs>));
  const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  expect(tabs[0].tabIndex).toBe(0);
  expect(tabs[1].tabIndex).toBe(-1);
  expect(tabs[0].getAttribute("aria-controls")).toBe("first-panel");
  tabs[0].dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }) as unknown as Event);
  expect(keysHandled).toBe(1);
});

test("inputs and toggles retain accessible names, validation and controlled state", async () => {
  let changes = 0;
  await act(async () => root.render(<>
    <Input aria-label="Search providers" aria-invalid="true" aria-describedby="validation" value="query" readOnly />
    <Toggle label="Enable provider" on={false} onClick={() => changes++} />
  </>));
  const input = host.querySelector("input")!;
  expect(input.value).toBe("query");
  expect(input.getAttribute("aria-describedby")).toBe("validation");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  const toggle = host.querySelector("button")!;
  expect(toggle.getAttribute("aria-label")).toBe("Enable provider");
  expect(toggle.getAttribute("aria-pressed")).toBe("false");
  await act(async () => toggle.click());
  expect(changes).toBe(1);
});

test("account disclosure retains readings and resets while only changing presentation", async () => {
  await act(async () => root.render(<AccountDetails label="Accounts" count={3}>
    <div data-account="first">42% — reset in 1 hour</div>
    <div data-account="second">67% — reset tomorrow</div>
    <div data-account="third">No data</div>
  </AccountDetails>));
  const details = host.querySelector("details")!;
  const summary = details.querySelector("summary")!;
  expect(details.open).toBe(false);
  const content = host.querySelector(`[id="${summary.getAttribute("aria-controls")}"]`)!;
  const original = content.innerHTML;
  details.open = true;
  details.dispatchEvent(new window.Event("toggle") as unknown as Event);
  expect(content.innerHTML).toBe(original);
  expect(content.querySelectorAll("[data-account]").length).toBe(3);
  expect(content.querySelector('[data-account="second"]')?.textContent).toContain("reset tomorrow");
});

test("metrics render supplied backend values and explicit loading instead of invented zeroes", async () => {
  await act(async () => root.render(<Metric label="Tokens" value="—" busy />));
  expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
  expect(host.textContent).toBe("Tokens—");
  await act(async () => root.render(<Metric label="Tokens" value="12.4k" detail="80% coverage" />));
  expect(host.textContent).toBe("Tokens12.4k80% coverage");
  expect(host.querySelector("[aria-busy]")).toBeNull();
});
