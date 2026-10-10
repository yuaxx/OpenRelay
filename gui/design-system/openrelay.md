# OpenRelay visual contract

The shell, Dashboard and Providers use Tailwind CSS 4 through the official Vite plugin. Only theme and utility imports are enabled; Preflight is excluded. Utility classes and theme variables use the `or:` prefix. Utilities are unlayered to coexist with legacy unlayered styles; imported legacy styles precede them. Explicit, scoped component rules resolve remaining specificity conflicts without a global important flag or a global reset.

## Foundations

`src/styles/openrelay-theme.css` follows `styles.css` and owns the current semantic color overrides. These values supersede the original color table in foundations.md. Components consume the existing semantic variables; Light/Dark/System still uses `color-scheme`, `light-dark()` and the existing persisted theme choice.

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | #f4f6fa | #090909 |
| Sidebar | #edf1f7 | #0d0d0d |
| Surface | #ffffff | #141414 |
| Raised | #edf1f7 | #1c1c1c |
| Text | #182131 | #f5f5f5 |
| Muted | #526177 | #a3a3a3 |
| Accent | #345ec5 | #f5f5f5 |
| Success | #107453 | #6bd6aa |
| Warning / stale | #8f4d08 | #f2c46d |
| Error | #b22a3f | #ff93a2 |

UI typography uses Segoe UI Variable/Segoe UI on Windows, system sans elsewhere and the existing locale fallbacks. Data uses tabular numbers. Existing 4px spacing tokens remain authoritative. Migrated controls have 8px corners; cards use the existing 12px radius. Labels and state text accompany colors.

Input and secondary-button boundaries use the separate control-border pair (#8391a5 / #666666), with at least 3:1 contrast on the surface. Dark surfaces and accents are neutral graphite/white; ordinary card borders use white at 8% opacity (12% for standard borders) and are decorative. Status and provider-icon colors remain separate. Focus uses the solid accent-ring token.

Glass is limited to the sidebar and top chrome: 12px backdrop blur with restrained transparency. Opaque rail backgrounds are defined before the feature query and remain in browsers without backdrop-filter. Content cards have slight transparency without backdrop blur. Menus and dialogs keep opaque surfaces. Reduced motion suppresses animation and transitions; coarse pointers have 44px controls.

## Components and composition

`src/components/ui/controls.tsx` provides Button, Card, Badge, Input, Tabs/Tab, Toggle and AccountDetails. Button defaults to type=button. Tab callers retain their existing keyboard and panel relationships. Toggle delegates to the existing controlled Switch, preserving its accessible name and state. These components have no fetch effects, polling or configuration writes.

Dashboard separates five existing runtime/usage metrics from the multi-agent controls and settings panels. Metric displays supplied backend values and loading state; it never manufactures statistics. Providers uses a bounded account/provider rail, status summary, a responsive quota-card grid and a separate recent-usage disclosure. Each quota card keeps its own provider navigation. Native account disclosures preserve all configured accounts and their per-account reading/reset information; expanding them does not fetch. Degraded account states are visible in the closed disclosure summary and individually when open.

The `or-redesign` scope limits component restyling to migrated screens. Shared shell styling uses `openrelay-app`, preserves collapsed/mobile navigation and excludes the edge-to-edge Combos container from content-padding changes. Other screens keep their CSS and behavior. The shell names the fork OpenRelay and links to OpenCodex attribution; LICENSE and contributor notices remain intact.

## Verification

Focused DOM tests cover shared controls, tabs, account disclosure and metrics, alongside existing quota, navigation and theme regressions. Typecheck, GUI lint/i18n, production build, structure checks and diff whitespace checks are required. Browser checks must distinguish built-CSS fixture geometry from inspection of the actual backend application. Test fixture results are not proof of connected accounts or live provider quota.
