## Summary

### Motivation
- Explain the problem this change solves or the capability it introduces.

### Scope
- Explain what was changed, why, and what was intentionally kept unchanged.

### Details
- Concrete summary of the implementation and user-visible or maintainer-facing effects.

## Verification

### Test checklist
- [ ] Focused regression tests run:
  - Commands: `bun test tests/...`
  - Results documented in PR description
- [ ] TypeScript strict typecheck passed (`bun run typecheck`)
- [ ] SSOT structure check passed (`bun run structure:check`)
- [ ] Operating skill surface check passed (`bun run skill:surface:check`)
- [ ] Git diff whitespace check passed (`git diff --check`)

### GUI / visual checklist (if applicable)
- [ ] GUI lint passed (`bun run lint:gui`)
- [ ] GUI build passed (`cd gui && bun run build`)
- [ ] Screenshot of the UI change included in PR description (do not commit screenshot images to branch)

## Checklist

- [ ] Scope stays focused and avoids unrelated cleanup or reformatting
- [ ] Compatibility verified: legacy CLI aliases (`orl`, `opencodex`, `ocx`), existing configs, `.opencodex` paths, and API headers work unchanged
- [ ] Security and privacy verified: no API keys, tokens, session cookies, passwords, or personal account identifiers in code, fixtures, or logs
- [ ] Upstream attribution preserved: OpenRelay is a fork of OpenCodex; licenses, notices, and attribution remain intact
- [ ] No unrelated generated artifacts, caches, or binaries included
- [ ] Docs and release notes updated when needed
