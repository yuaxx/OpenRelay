# OpenRelay

OpenRelay is a transparent multi-provider AI proxy based on the OpenCodex architecture, extended with selected OmniRoute-inspired features for quota visibility, account management, routing and terminal output optimization.

OpenRelay is an independent fork. It keeps the simple OpenCodex workflow, where users can launch Codex or Claude clients without manually selecting a provider model, while adding selected functionality inspired by OmniRoute. Upstream attribution and licenses are preserved.

## Why OpenRelay

Coding with AI often involves multiple accounts, rate limits and providers. Switching between different client configs, managing credentials across tools, or manually alternating models when a limit is reached interrupts the developer workflow.

OpenRelay addresses this by acting as a single local relay:
- Run Codex or Claude tools through one local proxy endpoint.
- Connect multiple providers and accounts through a single configuration surface.
- Avoid manually switching model identifiers for everyday requests.
- Keep the original client workflow and default tools unchanged.
- Manage providers, accounts, quotas and routing from one dashboard.

## Features

The current implementation includes:
- **OpenAI Responses and Chat Completions proxy**: Translates incoming client requests to upstream formats with bidirectional streaming, tool calling and reasoning token handling.
- **Anthropic Messages compatibility**: Inbound support for Claude Code and Anthropic-compatible developer tools.
- **Transparent provider routing**: Routes model calls across configured providers without requiring client patches.
- **Fallback handling**: Automatically tries alternative configured providers or accounts when requests fail or limits are hit.
- **Codex and Claude client integration**: Direct compatibility with Codex CLI, Codex App, Claude Code and desktop client workflows.
- **Unified Quota Dashboard**: Consolidated view of provider limits, account quotas and reset schedules.
- **Per-provider and per-account quota visibility**: Distinguishes healthy, pending, stale, unsupported and failed quota readings rather than assuming limits or reporting unknown values as zero percent.
- **Google Antigravity account support**: Multi-account Google integration with per-account limit groups and reset tracking.
- **Custom OpenAI-compatible endpoints**: Connect self-hosted or third-party providers using standard endpoint schemas.
- **Account management through the dashboard**: Add, inspect, reorder and remove accounts directly through the web UI.
- **OpenRelay black graphical dashboard**: Modern web dashboard with dark graphite surfaces, clean typography, keyboard accessibility and system theme detection.
- **RTK terminal output compression**: Conservative, opt-in compression for terminal outputs (git status, build logs, test runner output) to prevent context window bloat while preserving error details, warnings, exit codes and metadata.
- **Native Codex terminal result support for RTK**: RTK compression integrated for native Codex terminal tool execution paths.
- **Backward-compatible CLI aliases**: Primary command is `orl`, while `ocx` and `opencodex` remain supported as compatibility aliases.

### RTK output compression notes

Terminal output compression via RTK is:
- Disabled by default: it must be explicitly enabled in the dashboard or configuration.
- Conservative and opt-in: only recognized command schemas are processed.
- Safe by design: error outputs, non-zero exit codes, warnings, diagnostics and unrecognized formats are always returned unmodified.
- Monitored via estimates: token counts and savings in the dashboard are heuristic estimates, not provider billing data.
- Bounded: some realtime and internal paths remain unsupported to guarantee payload integrity.

## Architecture

OpenRelay runs as a local background or foreground service on loopback:

```text
Client (Codex CLI, Codex App, Claude Code)
  │
  ▼
OpenRelay Local Proxy (http://127.0.0.1:10100)
  │
  ├─► Protocol Ingress (/v1/responses, /v1/chat/completions, /v1/messages)
  ├─► Routing and Fallback Engine
  ├─► Optional RTK Terminal Output Compressor (opt-in)
  │
  ▼
Provider Adapters
  │
  ├─► OpenAI (Responses API / Chat API)
  ├─► Anthropic (Messages API)
  ├─► Google Antigravity (Multi-Account API)
  └─► Custom OpenAI-compatible / Local Endpoints
```

Adapters preserve protocol-specific request and response shapes rather than forcing all backends into an identical internal abstraction.

## Quick start on Windows

OpenRelay runs on Windows using Bun.

### 1. Prerequisites

Install Bun (version 1.4 or newer):
```powershell
irm bun.sh/install.ps1 | iex
```

### 2. Clone and install

```powershell
git clone https://github.com/lidge-jun/opencodex.git openrelay
cd openrelay
bun install
cd gui
bun install
cd ..
```

### 3. Start OpenRelay

```powershell
bun run orl start
```

The proxy starts by default on port 10100. Open the web dashboard in your browser:
**http://127.0.0.1:10100**

### 4. Basic CLI commands

When running from source or using standalone builds, the primary command is `orl`:
- `orl --help`: view available commands and arguments.
- `orl status`: inspect proxy status, PID and active port.
- `orl logs`: view live request logs and token accounting.
- `orl stop`: stop the running proxy and cleanly restore native client configuration.

Standalone compiled packages also expose `ocx` and `opencodex` alongside `orl`. The command `orl` is preferred, and the other two are compatibility aliases.

## Dashboard

OpenRelay includes a web interface served directly by the proxy at `http://127.0.0.1:10100`:
- **Provider overview**: list configured providers, latency and connection status.
- **Quota windows and reset times**: view rolling usage windows (5-hour, daily, weekly, monthly) and time until next quota reset.
- **Account status**: review individual accounts and authentication states.
- **Provider and account management**: add, configure, reorder or remove provider credentials.
- **RTK settings and process statistics**: toggle terminal compression on or off, view checked/compressed counts, and inspect estimated byte savings.

Quota windows are only displayed when supported by the provider integration. Providers without quota APIs are identified as unsupported rather than showing inaccurate data.

## Configuration and compatibility

Existing OpenCodex profiles continue to work without modification:
- Stored configurations in `.opencodex` (`~/.opencodex/config.json` or `$OPENCODEX_HOME/config.json`) continue to load without conversion.
- Environment variables such as `OPENCODEX_*` (including `OPENCODEX_HOME` and `OPENCODEX_ADMIN_AUTH_TOKEN`) and `OCX_*` are fully recognized.
- Client configuration entries referencing `[model_providers.opencodex]` remain functional.
- Management API compatibility headers and session endpoints continue to work.

These identifiers are retained for compatibility and are not the preferred visible branding.

## Development

Source development requires the `bun` CLI on your `PATH`. The published npm package bundles its own Bun runtime for installed `ocx` commands; package scripts may also resolve Bun through that bundled dependency.

Development commands from `package.json`:
```bash
# Install root and GUI dependencies
bun install
cd gui && bun install && cd ..

# Strict TypeScript typecheck
bun run typecheck

# Focused branding and compatibility tests
bun test tests/cli/openrelay-branding.test.ts

# Focused RTK compression tests
bun test tests/responses/rtk-compression.test.ts

# Lint GUI source code
bun run lint:gui

# Build GUI distribution bundle
cd gui && bun run build && cd ..

# Structure SSOT check
bun run structure:check

# CLI skill surface check
bun run skill:surface:check

# Build standalone binary distribution
bun run build:standalone
```

## Testing and platform notes

- Bun 1.4.0 is required by the test runner (`testRunnerBun`), while the runtime pin is 1.4.2.
- Focused tests are preferred during everyday development over executing the entire multi-platform test suite.
- On some Windows systems, non-elevated permissions or PowerShell security policies can cause `EPERM` errors when Bun spawns child processes for test queue locks. Use `OCX_TEST_NO_QUEUE=1` to bypass lock contention during test runs.
- Claude Code certificate interception requires local CA configuration. On Windows systems where UAC is disabled or ACLs are restricted, manual security adjustments may be needed.
- Full suite status should not be described as green unless it actually passed.

## Known limitations

- **RTK remains conservative and opt-in**: output compression runs only on recognized command schemas and is disabled by default.
- **Unsupported realtime and internal paths**: opaque, binary, internal and speculative realtime WebSocket streams remain unchanged.
- **Windows CA and ACL handling**: Claude interception can fail on Windows systems with incompatible ACL or UAC settings.
- **npm distribution**: npm publishing is not currently enabled. Run from source checkout or standalone binary releases.
- **Quota reporting**: quota availability depends on the provider and account integration. Providers without usage APIs report an unsupported state.

## Origin and attribution

- OpenRelay is based on OpenCodex.
- Selected RTK and quota-management ideas were adapted or inspired by OmniRoute.
- The exact license and attribution requirements from both projects are preserved.
- Upstream repositories:
  - OpenCodex: https://github.com/lidge-jun/opencodex
  - OmniRoute: https://github.com/diegosouzapw/OmniRoute
- Detailed attribution and third-party notices are documented in [`src/compression/rtk/NOTICE.md`](./src/compression/rtk/NOTICE.md) and repository license files.
- OpenRelay is an independent project and is not endorsed by or affiliated with OpenCodex or OmniRoute.

## License

This project is licensed under the MIT License. See [`LICENSE`](./LICENSE) and upstream NOTICE files for details.
