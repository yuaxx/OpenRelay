# Contributing to OpenRelay

OpenRelay is an open-source, universal AI provider proxy for OpenAI Codex and Claude Code, forked from OpenCodex. We welcome thoughtful contributions, bug fixes, and documentation improvements.

## Development workflow

- **Fork and branch**: Create a focused feature or fix branch from the current development branch.
- **Target branch**: Open pull requests against the active development branch. Direct commits to `main` are reserved for maintainer releases.
- **Upstream attribution**: OpenRelay is a fork of OpenCodex. Always preserve original copyright notices, upstream attribution, and references in [`CREDITS.md`](./CREDITS.md) and [`LICENSE`](./LICENSE).

## Prerequisites and Bun versions

Source development requires the `bun` CLI on your `PATH`. The published npm package bundles its own Bun runtime for end users. Package scripts such as `bun run test` and `bun run prepush` may resolve Bun through that bundled dependency.

The suite uses Bun 1.4.0 (`testRunnerBun`) while the shipped runtime is 1.4.2.
Install Bun 1.4.0 locally if you run the full test suite, or set `OCX_TEST_RUNNER_BUN` pointing to your 1.4.0 binary.

## Installation

Install dependencies at repository root and inside the GUI workspace:

```bash
# Root proxy runtime dependencies
bun install

# Web dashboard dependencies
cd gui && bun install && cd ..
```

## Focused validation commands

Before opening a pull request, run focused validation for the areas you touched:

```bash
# TypeScript strict typecheck
bun run typecheck

# Focused CLI & branding test
bun test tests/cli/openrelay-branding.test.ts

# Focused RTK compression tests
bun test tests/responses/rtk-compression.test.ts

# Repository structure & SSOT check
bun run structure:check

# Operating skill surface check
bun run skill:surface:check

# Whitespace and git diff hygiene check
git diff --check
```

## GUI and visual checks

When modifying files under `gui/`:

```bash
# Lint GUI components
bun run lint:gui

# Build GUI bundle
cd gui && bun run build && cd ..
```

Include a screenshot of the UI change in your pull request description. Do not commit screenshot files into your git branch.

## Test expectations and Windows platform notes

- **Focused coverage**: Add focused regression tests near the changed subsystem in `tests/<domain>/`.
- **Full suite exemption**: The complete test suite contains thousands of assertions across multiple platforms. Run focused regression tests for your change rather than running the full suite locally unless specifically needed.
- **Windows EPERM / SID resolution**: On some Windows machines with non-default UAC or restricted PowerShell execution policies, Bun subprocess spawning can encounter an `EPERM` or `EACLIDENTITY` error during effective identity resolution or test queue locking. If you encounter this:
  - Run tests with `OCX_TEST_NO_QUEUE=1` to bypass queue lock contention.
  - Report the limitation in your PR's verification notes.
  - Do not modify system UAC, NTFS ACLs, or certificate validation code to bypass this check.

## Security, credentials, and privacy

- **Zero credential leaks**: Never commit API keys, tokens, session cookies, passwords, or personal identifiers in code, fixtures, examples, or logs.
- **Redaction**: Redact all private values from error reports and PR descriptions.
- **Responsible disclosure**: For authentication bypasses or sensitive security vulnerabilities, consult [`SECURITY.md`](./SECURITY.md) and report privately.
