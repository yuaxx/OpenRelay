# Security Policy

## Supported Versions

OpenRelay accepts security fixes on a best-effort basis for these lines:

| Version | Supported |
| --- | --- |
| `main` | ✅ |
| `dev` (active development line) | ✅ |
| Latest standalone releases | ✅ |
| Older releases | ❌ |

If you report an issue against an older release, maintainers may ask you to reproduce it on `main` or the latest source head before triage continues.

## Responsible Disclosure Guidance

Please **do not open public GitHub issues or discussions for credential leaks, authentication bypasses, or undisclosed vulnerabilities**.

Report privately through GitHub private vulnerability reporting:

**<https://github.com/lidge-jun/opencodex/security/advisories/new>**

Use GitHub Security Advisories or a private vulnerability report through the repository security page. Do not disclose vulnerabilities in public issues.

### Providing Reproducible Reports Without Secrets

- **Never paste live credentials, API keys, OAuth session tokens, admin tokens, cookies, or account identifiers** into issue reports or communication channels.
- Demonstrate the vulnerability with synthetic placeholders (e.g. `sk-ant-api03-sample-placeholder`, `test-account-id`).
- Include exact affected version or commit SHA, minimal configuration shape, and reproduction steps.

## Credential Rotation Guidance

If an API key, OAuth token, or admin token was accidentally logged, shared, or exposed:

1. **Immediate Revocation**:
   - Provider keys (OpenAI, Anthropic, Google, etc.): revoke and regenerate immediately in the provider's developer console.
   - OpenRelay admin token: delete `~/.opencodex/admin-api-token` (or `$OPENCODEX_HOME/admin-api-token`) or restart OpenRelay with an updated `OPENCODEX_ADMIN_AUTH_TOKEN`.
   - Remote machine links: revoke compromised pairing grants via `orl link revoke <id>`.
2. **Session Reset**:
   - Stop any active proxy instances (`orl stop`).
   - Verify running processes and check recent request logs (`orl logs`).

## Operational Notes

- OpenRelay binds to loopback (`127.0.0.1`) by default. Binding to non-loopback addresses (`0.0.0.0`) requires an explicit `OPENCODEX_API_AUTH_TOKEN` bearer token.
- Management endpoints require loopback session authentication or the admin token.
- RTK compression and provider adapters enforce hard bounds on output size, execution deadlines, and memory buffers to prevent denial of service from malformed upstreams.
