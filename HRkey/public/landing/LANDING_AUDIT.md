# Landing Audit Summary (Phase 1)

Scope reviewed:
- `HRkey/public/landing/index.html`
- `HRkey/public/landing/hrk-menu.js`
- Inline scripts inside `HRkey/public/landing/index.html`

Findings:
- No authentication bootstrap logic found in `index.html`.
- No session/profile/onboarding inspection found in `index.html` or `hrk-menu.js`.
- No auto-redirect behavior based on user state found in `index.html`.
- CTA targets were inconsistent:
  - Most primary CTAs pointed to `/landing/auth.html`.
  - The pricing card CTA for companies pointed to `mailto:vicvalch@onchainfest.xyz`.

Refactor decision:
- Keep `/landing/auth.html` as the single canonical application entry point.
- Normalize primary CTA targets in landing to `/landing/auth.html`.
- Remove old app-surface references from landing (`/WebDapp/index.html` -> `/landing/index.html`).
