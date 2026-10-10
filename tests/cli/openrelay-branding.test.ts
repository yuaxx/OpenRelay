import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PRODUCT_NAME, CLI_ALIASES, LOG_PREFIX, startupBanner } from "../../src/lib/brand";
import { printVersion, printSubcommandUsage } from "../../src/cli/help";
import { renderRootHelp } from "../../src/cli/help-navigation";
import { parseCliHead } from "../../src/cli/root";
import { isOcxCommandLine, isOcxStartCommandLine } from "../../src/config/process-state";
import { standaloneExecutableName } from "../../scripts/standalone-targets";
import { repoPath } from "../helpers/repo-root";

describe("OpenRelay CLI compatibility", () => {
  test("orl help and version use the product name and primary command", () => {
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

  test("all bins share the same dispatcher and start/stop/status help", () => {
    const pkg = JSON.parse(readFileSync(repoPath("package.json"), "utf8"));
    expect(Object.keys(pkg.bin)[0]).toBe("orl");
    for (const alias of CLI_ALIASES) {
      expect(pkg.bin[alias]).toBe("./bin/ocx.mjs");
      expect(isOcxCommandLine(`C:/tools/${alias}.exe start`)).toBe(true);
      expect(isOcxStartCommandLine(`C:/tools/${alias}.exe start`)).toBe(true);
      for (const command of ["start", "stop", "status"]) {
        expect(parseCliHead([command]).command).toBe(command);
        const lines: string[] = [];
        printSubcommandUsage(command, undefined, { write: text => { lines.push(text); } });
        expect(lines.join("\n")).toContain(`Usage: orl ${command}`);
      }
    }
    expect(isOcxCommandLine("C:/tools/orl-foreign.exe start")).toBe(false);
  });

  test("banner contains only display name and port; Windows standalone exposes orl", () => {
    expect(PRODUCT_NAME).toBe("OpenRelay");
    expect(LOG_PREFIX).toBe("[openrelay]");
    expect(startupBanner(10100)).toBe("[openrelay] OpenRelay proxy running on http://localhost:10100");
    expect(standaloneExecutableName("bun-windows-x64")).toBe("orl.exe");
    expect(standaloneExecutableName("bun-linux-x64")).toBe("orl");
    const build = readFileSync(repoPath("scripts/build-standalone.ts"), "utf8");
    expect(build).toContain('["ocx.exe", "opencodex.exe"]');
    expect(build).toContain("cpSync(executable, join(output, name))");
  });

  test("legacy storage and API identifiers remain intact", () => {
    const config = readFileSync(repoPath("src/config/paths.ts"), "utf8");
    expect(config).toContain("OPENCODEX_HOME");
    expect(config).toContain(".opencodex");
    const server = readFileSync(repoPath("src/server/index.ts"), "utf8");
    expect(server).toContain('"/opencodex-session"');
    expect(readFileSync(repoPath("gui/src/api.ts"), "utf8")).toContain("X-OpenCodex-API-Key");
    expect(readFileSync(repoPath("gui/index.html"), "utf8")).toContain("<title>OpenRelay");
    expect(readFileSync(repoPath("gui/src/i18n/en.ts"), "utf8")).toContain('"app.attribution": "Based on OpenCodex"');
  });
});
