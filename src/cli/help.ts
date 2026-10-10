import { resolveHelpPath } from "./help-catalog";
import { PRODUCT_NAME } from "../lib/brand";
import type { Capability } from "./capabilities";
import { MODELS_CONTEXT_DETAILS, MODELS_CONTEXT_USAGE } from "./help-models-context";
import { renderRootHelp } from "./help-navigation";
import { formatHelpRecovery } from "./help-recovery";
import { packageVersion as readPackageVersion } from "../lib/package-version";

/**
 * Version of the `ocx` bundle this process is running from.
 *
 * Exported so `status`/`doctor` can compare it against the version the live proxy reports,
 * which is how a stale `ocx` earlier on PATH becomes visible (#2701). Returns `"unknown"`
 * rather than throwing; callers must treat that as "cannot compare", not as a mismatch.
 */
export function packageVersion(): string {
  return readPackageVersion();
}

export function printVersion(): void {
  console.log(`${PRODUCT_NAME} ${packageVersion()}`);
}

export function printUsage(): void {
  console.log(renderRootHelp());
}

export function printFullUsage(): void {
  console.log(`OpenRelay (orl) — Universal provider proxy for Codex

Usage:
  orl setup                   Interactive setup (alias: init)
  orl start [--port <port>] [--socks5 [host:port] | --socks5-off]
                              Start the proxy; SOCKS5 defaults to 127.0.0.1:10808
  orl stop [--json]           Stop the proxy AND restore native Codex (plain codex works again)
  orl restore                 Restore native Codex without stopping (alias: eject)
  orl restore back            Re-point codex at the running proxy (undo restore)
  orl restore --remove-codex-provider-table
                              Also drop [model_providers.opencodex] that a paginated restore kept
  orl recover-history --legacy-openai --yes
                               Force all user-message opencodex rows to OpenAI (legacy recovery)
  orl recover-history --ocx-compaction <thread-id> --yes
                               Back up and make one ocx1-compacted thread replayable by native Codex
  orl uninstall               Remove service/shim/config and restore native Codex (alias: remove)
  orl service [sub]           Run as a background service (default: install if absent, otherwise repair)
  orl codex-shim <sub>        Auto-start proxy when \`codex\` launches (install|status|uninstall|remove)
  orl tray <sub>              Windows status tray (install|start|stop|status|uninstall)
  orl ensure                  Ensure the proxy is running and Codex config/cache are current
  orl connect <url>           Connect this machine to a remote OpenRelay hub (credential via stdin)
  orl remote-workspace <sub>  Pair/run an OCX-only remote execution computer
  orl disconnect              Restore local state and clear the hub connection
  orl sync [--restart-codex]  Fetch models from providers and inject into Codex config
  orl sync-cache [--restart-codex]
                              Refresh Codex's model cache from the active catalog
  orl catalog pull <https-url> Install a validated remote catalog and refresh the Codex cache
  orl status                  Check proxy server status (on a hub: one block with its ports and token source)
  orl doctor                  Diagnose environment/network issues (WSL, proxy, ChatGPT reachability)
  orl doctor --reclaim-response-temps
                              Reclaim abandoned response-state temp files (works without a running proxy)
  orl doctor --recover-zero-byte-coordinator --yes
                              Back up a proven zero-byte Codex coordinator after stopping the proxy
  orl debug <scope>           provider/usage/injection/claude on|off|status|reset
  orl login <provider>        OAuth or API-key provider login (orl login codex for Codex/ChatGPT)
  orl logout <provider>       Remove a stored OAuth login
  orl gui [pair --origin <browser-origin> [--json]]
                              Open the dashboard or create a single-use remote pairing grant
  orl hub invite [--json]     Print a ready-to-run \`orl connect\` line for one more machine
                              (hub only; see \`orl help hub\` for the one-port topology)
  orl link <sub>              Machine links over SSH (port|issue|revoke|status)
  orl update [--tag <tag>]    Update OpenRelay (keeps preview installs on @preview)
  orl restart                  Stop and restart the proxy
  orl v2 <sub>                multi_agent_v2 surface (status|on|off|mode|keep-native-v1|threads|mode-hint)
  orl health [--json]          Check proxy health (exit 0=healthy, 1=not)
  orl capabilities [--json]    List declared capabilities and the API routes they drive
  orl ready [--json] [--wait [--timeout <s>]]  Check post-sync readiness (exit 0 only when ready)
  orl resolve [--json]        Config home, effective port, and liveness (JSON for shells)
  orl provider <sub>          Providers, connectivity, quota, and selected models
  orl account <sub>           Accounts, login/reauth, key pools, and quota controls
  orl models <sub>            Live/custom models, visibility, context, and shadow calls
  orl alias <sub>             Short names for providers and models (list, set, rm, defaults)
  orl combo <sub>             Combo routing strategies and failover
  orl agent <sub>             Subagents, injection, effort caps, and sidecars
  orl message <sub>           Loaded local Codex sessions and queued peer messages (sessions|send)
  orl effort [sub]            Inspect and configure reasoning effort caps and defaults
  orl observe <sub>           Logs, usage, storage, memory, and debug data
  orl inspect <sub>           Effective config, catalog, analytics, pacing, client-config
  orl route <sub>             Routing features (combo, policy)
  orl logs [filters]          Alias of orl observe logs
  orl usage [--range <today|1d|7d|30d|all>] [--provider <name>] [--model <id>]
                              Token and estimated-cost report (alias of orl observe usage)
  orl storage <sub>           Storage report, cleanup, trash, and the cleanup policy
  orl memory [--json]         Alias of orl observe memory
  orl api-key <sub>           Alias of orl access key
  orl access <sub>            External API keys and endpoint information
  orl api <sub>               Protocol paths: vocabulary, request-path preview, and policy
  orl export --client <id>    Print a client config wired to the running proxy (18 clients)
  orl integration client <sub> Enable, disable, inspect or roll back a client integration
  orl grok <sub>              Grok Build model selection and apply
  orl system <sub>            Runtime settings, startup, sync, OpenRelay updates, and Codex CLI inspection
  orl config [sub]            Validated configuration show/get/set/import/export
  orl companion <show|set|reset>  Menu-bar and widget companion usage settings
  orl lab <sub>               Inspect Lab evidence and control local automation
  orl chatgpt <sub>          Experimental app-server shim: launch|restore|status (macOS)
  orl claude [args...]        Launch Claude Code wired to the proxy (model discovery on)
  orl claude desktop [sub]    Manage and apply Claude Desktop's four-family profile
  orl opencode [args...]      Launch opencode wired to the proxy (runtime provider config)
  orl mcode [args...]         Launch MiniMax Code through its managed provider
  orl mmx text <sub> [args]   Launch MiniMax CLI text through the proxy
  orl zcode [sub]             Connect ZCode to the proxy (managed provider)
  orl commandcode [sub]       Connect Command Code CLI to the proxy (managed provider)
  orl cmd [sub]               Alias of orl commandcode
  orl help [command]          Show help
  orl --version | -v          Print version

Examples:
  orl init                    Set up provider and inject into Codex
  orl start                   Start on default port (10100)
  orl start --port 8080       Start on custom port
  orl start --socks5          Outbound via SOCKS5 at 127.0.0.1:10808 (saved)
  orl start --socks5-off      Clear a saved SOCKS5 outbound proxy
  orl help service            Show service command help
  orl help hub                Explain the hub topology, token file, and invites
  orl sync                    Sync available models to Codex`);
}

export function hasHelpFlag(values: string[]): boolean {
  return values.some(value => value === "--help" || value === "-h" || value === "help");
}

function printCapabilityDetails(capability: Capability, write: (text: string) => void, shown: readonly string[] = []): void {
  if (capability.flags.length) {
    write("\nDeclared flags:");
    for (const flag of capability.flags) {
      write(`  ${flag.name}${flag.value && flag.value !== "boolean" ? ` <${flag.value}>` : ""}${flag.required ? " (required)" : ""}  ${flag.summary}`);
    }
  }
  const details = capability.details?.filter(detail => !shown.includes(detail));
  if (details?.length) write(`\n${details.join("\n")}`);
}

export function printSubcommandUsage(
  name: string | undefined,
  path?: readonly string[],
  options: { fallbackToParent?: boolean; write?: (text: string) => void } = {},
): void {
  const write = options.write ?? console.log;
  const result = resolveHelpPath(path ?? (name ? [name] : []));
  if (result.kind === "unavailable") {
    // Appended flags may follow runtime operands. An explicit `help <path>`
    // requests that exact detail instead, so only the CLI head enables fallback.
    if (options.fallbackToParent && result.parent) {
      printSubcommandUsage(result.parent[0], result.parent, { write });
      return;
    }
    console.error(formatHelpRecovery(result.path));
    process.exit(1);
  }
  if (result.kind === "entry") {
    write(`Usage: ${result.entry.usage}\n\n${result.entry.summary}`);
    if (result.entry.details?.length) write(`\n${result.entry.details.join("\n")}`);
    if (result.capability) printCapabilityDetails(result.capability, write, result.entry.details);
    if (result.children.length) {
      write("\nDeclared commands (incomplete):");
      for (const child of result.children) write(`  orl help ${child.command.join(" ")}  ${child.summary}`);
    }
    if (result.canonicalName === "models") write("\nContext cap help: orl help models context");
    if (result.entry.name !== result.canonicalName) write(`\nCanonical help: orl help ${result.canonicalName}`);
    return;
  }
  if (result.kind === "models-context") {
    write(`Usage:\n${MODELS_CONTEXT_USAGE}\n\n${MODELS_CONTEXT_DETAILS.join("\n")}`);
  } else if (result.kind === "capability") {
    const { capability } = result;
    const heading = capability.usage !== undefined ? `Usage: ${capability.usage}` : `Command: orl ${result.path.join(" ")}`;
    write(`${heading}\n\n${capability.summary}`);
    printCapabilityDetails(capability, write);
    if (result.children.length) {
      write("\nDeclared commands (incomplete):");
      for (const child of result.children) write(`  orl help ${child.command.join(" ")}  ${child.summary}`);
    }
    if (capability.usage === undefined) {
      write("\nCapability metadata is incomplete; this is not the full operand grammar.");
    }
  } else {
    write(`Command group: orl ${result.path.join(" ")}\n\nDeclared commands (incomplete):`);
    for (const child of result.children) write(`  orl ${child.command.join(" ")}  ${child.summary}`);
  }
  write(`\nParent help: orl help ${result.path.slice(0, -1).join(" ")}`);
}
