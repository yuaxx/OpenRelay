import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PRODUCT_NAME, CLI_ALIASES, LOG_PREFIX, startupBanner } from "../../src/lib/brand";
import { printVersion, printSubcommandUsage } from "../../src/cli/help";
import { renderRootHelp } from "../../src/cli/help-navigation";
import { parseCliHead } from "../../src/cli/root";
import { isOcxCommandLine, isOcxStartCommandLine } from "../../src/config/process-state";
import { standaloneExecutableName } from "../../scripts/standalone-targets";
import { repoPath } from "../helpers/repo-root";
import { reportServiceServing } from "../../src/service/health";
import { formatWindowsSchedulerServiceStatus } from "../../src/service/windows-scheduler";
import { buildWindowsServiceScript } from "../../src/service/windows-taskxml";
import { isOpencodexHealthz, validateReadyzBody } from "../../src/server/proxy-liveness";

describe("OpenRelay CLI and service/runtime branding audit", () => {
  test("orl help and version use OpenRelay and primary alias", () => {
    expect(renderRootHelp()).toContain("OpenRelay (orl)");
    expect(renderRootHelp()).toContain("Usage: orl <command>");
    expect(renderRootHelp()).toContain("opencodex and ocx remain supported");
    const lines: string[] = [];
    const original = console.log;
    try { console.log = value => { lines.push(String(value)); }; printVersion(); }
    finally { console.log = original; }
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^OpenRelay \d+\.\d+\.\d+/);
  });

  test("1. orl service install displays OpenRelay branding and orl alias", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    try {
      console.log = (msg: unknown) => { logs.push(String(msg)); };
      await reportServiceServing("installed", {
        probe: async () => true,
        port: 10100,
        hostname: "127.0.0.1",
        timeoutMs: 50,
      });
    } finally {
      console.log = originalLog;
    }
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]).toContain("OpenRelay service installed and serving on port 10100");
    expect(logs[0]).not.toContain("opencodex service");

    const helpLines: string[] = [];
    printSubcommandUsage("service", ["service", "install"], { write: t => helpLines.push(t) });
    expect(helpLines.join("\n")).toContain("orl service");
  });

  test("2. orl service status reports OpenRelay proxy status and clean messages", () => {
    const runningStatus = formatWindowsSchedulerServiceStatus(
      { status: "present" },
      { status: "running", port: 10100 },
    );
    expect(runningStatus).toContain("OpenRelay proxy running on port 10100");
    expect(runningStatus).not.toContain("OpenCodex");
    expect(runningStatus).not.toContain("opencodex");

    const stoppedStatus = formatWindowsSchedulerServiceStatus(
      { status: "present" },
      { status: "not-running" },
    );
    expect(stoppedStatus).toContain("OpenRelay proxy not running");
    expect(stoppedStatus).not.toContain("OpenCodex");
  });

  test("3. /healthz service branding and protocol compatibility", () => {
    const serverSource = readFileSync(repoPath("src/server/index/serve-options.ts"), "utf8");
    expect(serverSource).toContain('service: "openrelay"');
    expect(serverSource).toContain('legacyService: "opencodex"');

    // Consuming both openrelay and legacy opencodex identities without breaking clients
    expect(isOpencodexHealthz({ service: "openrelay", status: "ok", version: "1.0.0", uptime: 10 })).toBe(true);
    expect(isOpencodexHealthz({ service: "opencodex", status: "ok", version: "1.0.0", uptime: 10 })).toBe(true);
    expect(isOpencodexHealthz({ legacyService: "opencodex", status: "ok", version: "1.0.0", uptime: 10 })).toBe(true);
    expect(isOpencodexHealthz({ service: "unrelated-service", status: "ok" })).toBe(false);

    expect(validateReadyzBody({ service: "openrelay", status: "ready", version: "1.0.0", uptime: 10, pid: 123, port: 10100 }, 10100)).not.toBeNull();
    expect(validateReadyzBody({ service: "opencodex", status: "ready", version: "1.0.0", uptime: 10, pid: 123, port: 10100 }, 10100)).not.toBeNull();
  });

  test("4. wrapper log uses openrelay without opencodex in log lines", () => {
    const script = buildWindowsServiceScript({
      bun: "C:\\tools\\bun.exe",
      bunRuntimeSource: "bundled",
      cli: "C:\\tools\\cli.ts",
    });
    expect(script).toContain("openrelay service wrapper start");
    expect(script).not.toContain("opencodex service wrapper start");
    expect(script).toContain('openrelay_home="%OPENCODEX_HOME%"');
    expect(script).not.toContain('opencodex_home="%OPENCODEX_HOME%"');
  });

  test("5. legacy paths, environment variables and configuration contracts are preserved", () => {
    const config = readFileSync(repoPath("src/config/paths.ts"), "utf8");
    expect(config).toContain("OPENCODEX_HOME");
    expect(config).toContain(".opencodex");

    const server = readFileSync(repoPath("src/server/index.ts"), "utf8");
    expect(server).toContain('"/opencodex-session"');

    expect(readFileSync(repoPath("gui/src/api.ts"), "utf8")).toContain("X-OpenCodex-API-Key");
    expect(readFileSync(repoPath("gui/index.html"), "utf8")).toContain("<title>OpenRelay");
    expect(readFileSync(repoPath("gui/src/i18n/en.ts"), "utf8")).toContain('"app.attribution": "Based on OpenCodex"');
  });

  test("all bins dispatch to identical handler and standalone target is orl.exe", () => {
    const pkg = JSON.parse(readFileSync(repoPath("package.json"), "utf8"));
    expect(Object.keys(pkg.bin)[0]).toBe("orl");
    for (const alias of CLI_ALIASES) {
      expect(pkg.bin[alias]).toBe("./bin/ocx.mjs");
      expect(isOcxCommandLine(`C:/tools/${alias}.exe start`)).toBe(true);
      expect(isOcxStartCommandLine(`C:/tools/${alias}.exe start`)).toBe(true);
    }
    expect(standaloneExecutableName("bun-windows-x64")).toBe("orl.exe");
    expect(standaloneExecutableName("bun-linux-x64")).toBe("orl");
  });
});
