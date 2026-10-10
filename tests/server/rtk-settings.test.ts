import { expect, test } from "bun:test";
import { handleManagementAPI } from "../../src/server/management-api";
import { configSchema } from "../../src/config/schema/config-schema";
import { createRtkTransport, rtkDashboardStats } from "../../src/compression/rtk/transport";
import type { OcxConfig } from "../../src/types";

const fixture = () => ({ port: 10100, defaultProvider: "fixture", providers: { fixture: { adapter: "openai-chat", baseUrl: "https://fixture.invalid/v1" } } } as OcxConfig);
async function call(config: OcxConfig, method = "GET", body?: unknown, principal: "admin-token" | "gui-session" | undefined = "gui-session", save = (_: OcxConfig) => {}) {
  const url = new URL("http://127.0.0.1:10100/api/rtk");
  const req = new Request(url, { method, headers: { host: url.host, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return (await handleManagementAPI(req, url, config, { saveConfigPreservingClaudeCode: save }, principal))!;
}

test("RTK defaults off and authenticated setting writes touch only RTK", async () => {
  const config = fixture();
  expect(configSchema.parse(config).rtk?.enabled === true).toBe(false);
  expect((await (await call(config)).json()).enabled).toBe(false);
  const providers = config.providers;
  let saved: OcxConfig | undefined;
  expect((await call(config, "PUT", { enabled: true }, "gui-session", value => { saved = structuredClone(value); })).status).toBe(200);
  expect(saved?.rtk).toEqual({ enabled: true });
  expect(config.providers).toBe(providers);
  expect((await (await call(config, "GET", undefined, "admin-token")).json()).enabled).toBe(true);
  await call(config, "PUT", { enabled: false });
  expect(config.rtk?.enabled).toBe(false);
  expect(Object.keys(config).sort()).toEqual(["defaultProvider", "port", "providers", "rtk"]);
});

test("management authentication is required for RTK reads and writes", async () => {
  const config = fixture();
  // Omit the principal explicitly: authentication is normally supplied by ingress.
  for (const method of ["GET", "PUT"]) {
    const url = new URL("http://127.0.0.1:10100/api/rtk");
    const response = await handleManagementAPI(new Request(url, { method, headers: { host: url.host }, ...(method === "PUT" ? { body: '{"enabled":true}' } : {}) }), url, config);
    expect(response?.status).toBe(401);
  }
  expect(config.rtk).toBeUndefined();
});

test("invalid settings and failed persistence leave the live configuration unchanged", async () => {
  const config = fixture();
  for (const body of [{ enabled: "true" }, { enabled: true, providers: {} }, {}, null]) {
    expect((await call(config, "PUT", body)).status).toBe(400);
  }
  expect((await call(config, "PUT", { enabled: true }, "admin-token", () => { throw new Error("fixture secret must not appear"); })).status).toBe(500);
  expect(config.rtk).toBeUndefined();
});

test("dashboard statistics whitelist aggregates and remain unchanged while RTK is off", async () => {
  const text = "(pass) fixture [1ms]\n".repeat(200) + "200 pass\n0 fail\n";
  const body = { input: [{ type: "function_call", call_id: "private-id", name: "exec_command", arguments: '{"cmd":"bun test"}' }, { type: "function_call_output", call_id: "private-id", output: text }] };
  const before = rtkDashboardStats();
  expect(createRtkTransport(false).prepareBody(body, "responses")).toBe(body);
  expect(rtkDashboardStats()).toEqual(before);
  createRtkTransport(true).prepareBody(body, "responses");
  const after = rtkDashboardStats();
  expect(after.checked - before.checked).toBe(1);
  expect(after.compressed - before.compressed).toBe(1);
  expect(after.checked).toBe(after.compressed + after.skipped + after.fallback);
  expect(Object.keys(after).sort()).toEqual(["bytesAfter", "bytesBefore", "checked", "compressed", "elapsedMs", "fallback", "reasons", "skipped"]);
  const raw = JSON.stringify(after);
  for (const forbidden of ["private-id", "exec_command", "bun test", "(pass)", "credential", "metadata"]) expect(raw).not.toContain(forbidden);
});
