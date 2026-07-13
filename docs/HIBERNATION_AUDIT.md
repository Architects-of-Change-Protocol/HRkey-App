# Supabase Hibernation Audit — HRKey App

**Role of this document:** a full inventory of everything the HRKey
Supabase project depends on, so the project can be paused or deleted with
confidence that it can be rebuilt later from this repository alone. No
business logic, architecture, or functionality was changed to produce this
audit — this is a documentation and restorability exercise only.

**Date of audit:** 2026-07-13
**Scope:** entire monorepo (`sql/`, `backend/`, `HRkey/`, `lib/`, `database/`,
`protocol/`, `.github/workflows/`, deployment configs).

Companion artifacts produced alongside this document (see Phase 3):
- `supabase/config.toml`
- `supabase/migrations/` (37 files, consolidated from 4 scattered locations)
- `supabase/MIGRATION_MANIFEST.md` (ordering rationale + known conflicts)
- `supabase/rollbacks/`, `supabase/deprecated/`, `supabase/dev-seeds/`
- `supabase/functions/README.md`
- `supabase/seed.sql`
- `supabase/README_RESTORE.md`
- `.env.example` (updated with ~90 previously-undocumented variable names)

---

## Phase 1 — Audit Summary

- **Supabase project**: single project, referenced via `SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_URL`. No project ref or org is hardcoded anywhere in
  the repo (good — no migration risk from that).
- **Postgres version**: not pinned anywhere in the repo. `supabase/config.toml`
  (new) declares `major_version = 15` as a reasonable default — **verify
  against the live project's actual Postgres version** before restoring.
- **No prior `supabase/` CLI project existed.** All schema lived as loose
  `.sql` files in four different directories, and all Dashboard-only config
  (Auth providers, Storage buckets/policies, URL allow-lists) existed only
  in the live project with zero record in git.

---

## Phase 2 — Inventory

### Database

**Tables** are defined across `sql/001`–`sql/031` (with gaps at 002/005/006
and duplicate numbers at 010, 011, 013, 018), `backend/supabase/001_create_sdl_tables.sql`,
`backend/migrations/` (2 files), and `database/migrations/create_payment_tables.sql`.
Full list and per-file breakdown: see `supabase/MIGRATION_MANIFEST.md` and the
file headers preserved in `supabase/migrations/*.sql`.

**Critical finding:** three files independently declare the core `users`
and/or `references` tables with `CREATE TABLE IF NOT EXISTS` and mutually
incompatible column sets:
- `sql/001_identity_and_permissions.sql` (+ extended by 003/007/020)
- `sql/030_trust_data_model_v1.sql` (redeclares `users` with only
  `id, role, verified_status`; redeclares `references` with
  `referee_id, candidate_id, relationship_type`)
- `sql/seed_hrkey_referrals.sql` (redeclares `public.users` a third way:
  `email, referral_code, referred_by, stripe_customer_id`)

Because of `IF NOT EXISTS`, whichever ran first in the live database wins
silently — **this repo alone cannot tell you which shape is actually live.**
Same issue, smaller blast radius, for `analytics_events` (`sql/008` vs
`database/migrations/create_payment_tables.sql`) and `hrscore_snapshots`
(two files in `backend/migrations/`, dated 2025-01 and 2025-09).

Other unresolved external dependencies found: `sql/021_profile_import_persistence.sql`
has a foreign key to a `profiles(id)` table that is **never created** in any
file in this repo; `sql/010_pricing_and_staking_cache.sql` conditionally
alters a `candidate_prices` table that is likewise never created here.

- **Views / materialized views**: found in `sql/002`(deprecated), `007`,
  `008` (6 analytics views), `009` (2 materialized views), `010`
  (reference-hiding), `011` (CV), `029`, `030`/`031`, and
  `database/migrations/create_payment_tables.sql`. Full list in the
  research notes embedded in `supabase/MIGRATION_MANIFEST.md`.
- **Indexes**: nearly every migration creates its own, mostly
  `IF NOT EXISTS`; notable GIN indexes (`007`, payment tables) and unique
  idempotency indexes (`013`, `015`, `017`, `027`).
- **Constraints / FKs**: business-rule CHECK constraints throughout
  (immutability via deny-all DELETE in `010`, self-consistency guards in
  `016`/`017`, status/timestamp coupling in `030`, percentage-sums-to-100 in
  `002`/`029`). Unresolved FKs: `profiles`, `candidate_prices` (see above).
- **Enums**: **none** — no `CREATE TYPE ... AS ENUM` anywhere. The codebase
  consistently uses `TEXT` + `CHECK` constraints as pseudo-enums instead.
- **Triggers**: shared `update_updated_at_column()` reused broadly;
  `update_consents_updated_at()`, `check_data_access_expiration()`,
  `auto_flag_high_risk_references()`, `validate_reference_hiding()`; the
  trust engine's six triggers all funnel into
  `log_trust_event_and_recalculate()`; the referral seed's
  `trg_extend_on_confirm` → `extend_referrer_one_month()`.
- **Functions**: timestamp helper, consent lifecycle
  (`has_active_consent`, `expire_consents`), invite/reference RPCs
  (redefined across `013`→`014`→`015`, with `015` being the final/current
  version), analytics helpers, HRScore helpers, trust engine core
  (`clamp_trust_score`, `recalculate_trust_score`,
  `log_trust_event_and_recalculate`), moderation RPCs (`is_admin_user`,
  `admin_moderate_trust`, `SECURITY DEFINER`), payment helpers
  (`calculate_payment_splits`, `get_user_payment_stats`).
- **Extensions**: `pgcrypto` (`013`, `015`, one backend migration —
  redundant `CREATE EXTENSION IF NOT EXISTS`, safe) and `uuid-ossp`
  (`database/migrations/create_payment_tables.sql`). **No `pg_cron` or
  `pgjwt` extension is ever provisioned** — no scheduled jobs run inside
  Postgres itself.
- **RLS policies**: present and consistent through `sql/001`–`022`.
  **Significant gap: `sql/023`–`029` — the entire AOC/RLUSD real-money
  ledger (`user_balances`, `aoc_transactions`, `aoc_conversion_requests`,
  `rlusd_balances`, `rlusd_transactions`, `rlusd_withdrawal_requests`,
  `hrkey_wallets`/`purchases`/`ledger`) have no RLS enabled in any migration
  file.** `sql/030` has no RLS until `031` adds it (and `031`'s ROLLBACK
  fully reverses that).
- **Roles / grants**: `sql/031` and `database/migrations/create_payment_tables.sql`
  contain `GRANT EXECUTE`/`SELECT` to the `authenticated` role. No
  `CREATE ROLE` statements anywhere — all roles used (`authenticated`,
  `anon`, `service_role`) are Supabase's own built-in roles.
- **Rollback coverage**: only 2 of ~37 migrations have a rollback script
  (`010_reference_hiding_and_strikethrough_ROLLBACK.sql`,
  `031_trust_data_model_v1_hardening_ROLLBACK.sql`). Everything else is a
  one-way migration history.
- **`backend/schema.sql`**: NOT a consolidated schema dump. A 19-line file
  defining 2 unrelated tables using invalid PostgreSQL syntax (MySQL-style
  inline `INDEX` clauses). Quarantined, not treated as source of truth (see
  `supabase/MIGRATION_MANIFEST.md`).

### Security

- **RLS**: see Database section above — comprehensive for `001`–`022`,
  **missing entirely on the financial ledger tables (`023`–`029`)**. This is
  the single most important security/restorability gap found in this audit.
- **Policies**: defined per-table across the migrations listed above; there
  is no separate policy-only file — policies live inline with the table
  that owns them.
- **Roles**: only Supabase's built-in `anon` / `authenticated` /
  `service_role`. No custom Postgres roles.
- **Grants**: `authenticated` granted `EXECUTE` on specific SECURITY DEFINER
  RPCs and `SELECT` on specific views (see `sql/031`,
  `database/migrations/create_payment_tables.sql`).
- **No custom JWT verification code** exists anywhere in the app — it relies
  entirely on Supabase's own session/JWT issuance and verification
  client-side and via `supabase.auth.admin.getUserById()` server-side.

### Storage

| Bucket | Used by | Access pattern | Restorable via IaC? |
|---|---|---|---|
| `cv-uploads` | `HRkey/src/lib/storage/supabase-storage-provider.ts` (`uploadCandidateCV()`) | Writes to `{userId}/{timestamp}-{filename}`, then calls `getPublicUrl()` — implies **public** bucket, no signed-URL download path found in code | **No** — created and policy-configured only in the live Dashboard; no migration touches `storage.buckets` or `storage.objects` anywhere in this repo |

This is the only bucket referenced anywhere in the codebase (verified by
repo-wide search for `.storage.from(`, `createBucket`, `getBucket`,
`listBuckets`). No Storage RLS policies were found in any SQL file — if any
exist on the live project, they are Dashboard-only and must be captured
before hibernating (see Phase 6).

### Edge Functions

**None.** Confirmed by repo-wide search: no `supabase/functions/` directory
existed prior to this audit, no `Deno.serve`, no `functions.invoke(...)`
calls anywhere in the app. All server-side logic runs in the Node/Express
backend (`backend/`, deployed to Render) and Next.js API routes
(`pages/api/`, `HRkey/api/`).

### Auth

- **Methods enabled**: Email/password (`signUp` / `signInWithPassword`) and
  **Google OAuth only** (`signInWithOAuth({ provider: "google" })`), both in
  `HRkey/src/lib/auth/auth-service.ts`.
- **OAuth providers**: Google only. **Client ID/secret are not stored
  anywhere in this repo** — Dashboard/Google-Cloud-Console-only
  configuration, must be re-entered manually on restore.
- **Redirect URLs**: app code hardcodes `${window.location.origin}/v2/auth`
  as the OAuth callback target. The Dashboard's actual Site URL / allow-listed
  Redirect URL list is **not captured anywhere in the repo** and must be
  reconfigured manually to match `FRONTEND_URL` + `/v2/auth`.
- **JWT configuration**: no custom JWT settings found in code; assume
  Supabase defaults unless verified otherwise against the live project
  before hibernating.
- Server-side admin operations (`supabase.auth.admin.getUserById()`) appear
  in `backend/services/references.service.js`,
  `backend/Wallet_Creation_Base_SDK.js`, `backend/wallet-creation-backend.js`,
  using the service-role key.

### Environment Variables

Full categorized list (names only, no values) now lives in `.env.example`
(updated by this audit) and `.env.payment-rail.example`. Highlights:

- **Required for the app to run at all**: `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (also read as
  `SUPABASE_SERVICE_ROLE` and `SUPABASE_SERVICE_KEY` in different modules —
  **set all three names to the same value**), `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Required for payments**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- **Required for email**: `RESEND_API_KEY`.
- **Required for AI features**: `OPENAI_API_KEY`, `OPENAI_MODEL`.
- **~90 additional variables** were found in active code
  (`process.env.X`) but were **completely undocumented** in any
  `.env*.example` file before this audit — covering the AOC/RLUSD
  monetization layer, rate limiting, Sentry, contract addresses, Coinbase
  OnchainKit, and more. These have now been added to `.env.example` with
  blank/placeholder defaults and a note on where each is used. **None of
  their actual production values were ever in git** (correctly) — someone
  with access to the live Render/Vercel dashboards must supply them.

### External Services

| Service | Depended on by | Purpose |
|---|---|---|
| Stripe | `pages/api/webhook.ts`, `HRkey/api/stripe/webhook.js`, `backend/services/webhookService.js`, `backend/controllers/billingController.js` | Payments, subscriptions, webhook-driven plan updates |
| Resend | `backend/utils/emailService.js`, `backend/controllers/signersController.js`, `backend/services/references.service.js`, `HRkey/src/app/api/invite/route.ts`, `HRkey/api/kpi-digest.ts` | Transactional email (invites, digests) |
| OpenAI | `backend/controllers/cv.controller.js`, `backend/controllers/aiRefine.controller.js`, `backend/services/validation/embeddingService.js`, `backend/services/cvParse.service.js` | CV parsing, AI refinement, text embeddings |
| Coinbase (OnchainKit / CDP + Smart Wallet) | `HRkey/src/app/providers.tsx`, `HRkey/src/components/wallet/WalletSetup.tsx`, `backend/schemas/wallets.schema.js` | Wallet onramp / smart-wallet creation |
| Sentry | `backend/app.js`, root `package.json` | Error monitoring |
| Base (blockchain RPC, public endpoints — no Alchemy/Infura) | `hardhat.config.*`, `backend/services/payments/rlusd-listener.ts` | On-chain contract interaction |
| XRPL (Ripple) | payment-rail config (`.env.payment-rail.example`) | RLUSD bridge wallet |
| WalletConnect | `HRkey/package.json` (`wagmi`) | Wallet connection UX |
| Vercel | `vercel.json` | Frontend hosting/deploy |
| Render | `backend/render.yaml` | Backend hosting/deploy |
| Internal `aoc/runtime` package (`backend/package.json`, `^0.1.0`) | `backend/services/aocRuntime.service.js` | Trust/monetization runtime — appears to be a private/internal package, not on public npm; **verify it resolves at rebuild time**, or it will break `npm install` in the backend from scratch |

No Auth0/Clerk/Firebase — Supabase Auth is the only auth provider.

---

## Phase 3 — Restoration Artifacts

| Artifact | Status before audit | Action taken |
|---|---|---|
| `supabase/config.toml` | Did not exist | Created — declares Auth (email + Google), the one Storage bucket, disables nothing incorrectly; annotated everywhere a value can't be confirmed from code alone |
| `supabase/migrations/` | Did not exist (SQL scattered across 4 directories) | Created — 37 files, verbatim copies of every schema-bearing SQL file, sequentially timestamped; **content unchanged**, only reorganized. See `supabase/MIGRATION_MANIFEST.md` |
| `supabase/seed.sql` | Did not exist | Created — intentionally empty; points to `supabase/dev-seeds/` for the two dev-only fixture files found in `sql/` |
| `supabase/functions/` | Did not exist | Created — empty, with a README confirming zero Edge Functions exist |
| `supabase/README_RESTORE.md` | Did not exist | Created — step-by-step guide, Phase 4 below |
| `.env.example` | Existed, incomplete (~14 vars) | Updated in place — added ~90 previously-undocumented variable names (blank values, no secrets), left all existing content untouched |
| `.env.payment-rail.example` | Existed, reasonably complete for blockchain/XRPL config | Reviewed, no gaps significant enough to warrant changes |

Nothing was overwritten or deleted; all original files under `sql/`,
`backend/`, `database/` remain exactly as they were.

---

## Phase 4 — Restore Procedure

See **`supabase/README_RESTORE.md`** for the full step-by-step guide
(create project → link CLI → apply migrations → restore buckets → deploy
Edge Functions [none] → configure secrets → configure Auth → configure
redirect URLs → seed → smoke test).

---

## Phase 5 — Validation Checklist

| Check | Status |
|---|---|
| All tables have a migration | ⚠️ Mostly — but 3 tables (`users`, `references`, and their conflicting variants) have **competing** migrations whose true live shape is unconfirmed; `profiles` and `candidate_prices` are referenced by FK but never created anywhere in this repo |
| All policies documented | ✅ For `sql/001`–`022`; ❌ Storage bucket policies (Dashboard-only, undocumented); ⚠️ RLS entirely missing on `023`–`029` (not a documentation gap — a real gap in the live schema itself, now documented as such) |
| All functions documented | ✅ Inventoried above and in `supabase/MIGRATION_MANIFEST.md` |
| All buckets inventoried | ✅ One bucket (`cv-uploads`), fully documented, but **not restorable via IaC** — must be recreated manually |
| All Edge Functions documented | ✅ Zero exist — confirmed and documented |
| All environment variables documented | ✅ Updated `.env.example` now lists every variable found in code |
| A complete restore procedure exists | ✅ `supabase/README_RESTORE.md` |

---

## Phase 6 — Risks (cannot be auto-recovered)

### ALTO (High)

1. **Unresolved schema ambiguity for `users` / `references` / `analytics_events` / `hrscore_snapshots`.**
   Multiple migrations redeclare these with `IF NOT EXISTS` and incompatible
   shapes. Nobody can determine from the repo alone which shape is actually
   live. **Mitigation before hibernating: run `supabase db dump --schema-only`
   (or `pg_dump --schema-only`) against the live project and commit it.**
   This is the single highest-priority action in this entire audit.
2. **Storage bucket (`cv-uploads`) creation and its RLS policies are
   Dashboard-only.** No migration creates the bucket or any
   `storage.objects` policy. If the live bucket is actually private, or has
   custom per-user access policies, that configuration will be **lost**
   unless captured manually before the project is paused/deleted.
3. **RLS is missing entirely on the AOC/RLUSD real-money ledger tables**
   (`sql/023`–`029`): `user_balances`, `aoc_transactions`,
   `aoc_conversion_requests`, `rlusd_balances`, `rlusd_transactions`,
   `rlusd_withdrawal_requests`, `hrkey_wallets`/`purchases`/`ledger`. This
   is a live gap, not a doc gap — restoring these tables verbatim
   reproduces the same exposure.
4. **Google OAuth Client ID/Secret** are configured only in the Supabase
   Dashboard (and Google Cloud Console) — zero record in this repo. Without
   them, Google sign-in cannot be restored.
5. **`profiles` and `candidate_prices` tables** are referenced by foreign
   key (`sql/021`, `sql/010_pricing_and_staking_cache.sql`) but never
   created by any migration in this repo — they must exist already in the
   live database from a source not captured here (manual Dashboard SQL
   Editor run, or a migration that was never committed).

### MEDIO (Medium)

6. **~90 environment variables were undocumented before this audit** —
   business-rule config (fee ratios, rate limits, feature flags) with no
   recorded defaults anywhere. Now documented with blank placeholders, but
   the *values* used in production still only exist in Render/Vercel
   dashboards.
7. **Supabase service-role secret is read under 3 different names**
   (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_ROLE`,
   `SUPABASE_SERVICE_KEY`) across different modules — easy to
   misconfigure on restore and get silent auth failures in some code paths
   only.
8. **Internal `aoc/runtime` npm package** (`backend/package.json`,
   `"aoc/runtime": "^0.1.0"`) does not look like a public npm package —
   unclear if it will resolve on a fresh `npm install` outside the original
   environment.
9. **Two ad-hoc "manual multi-step" migrations** (`sql/013_harden_invite_tokens.sql`,
   `sql/013_reference_pack_hash.sql`) contain explicit "run this part later /
   don't run this part yet" instructions in comments — a naive full replay
   could apply a step that was deliberately deferred in production.
10. **JWT/session settings**: not found anywhere in code; if the live
    project changed any Supabase Auth defaults (token expiry, refresh
    rotation), that configuration is Dashboard-only and undocumented.

### BAJO (Low)

11. Only 2 of ~37 migrations have rollback scripts — acceptable for a
    forward-only migration history, but worth knowing before attempting to
    revert anything post-restore.
12. `backend/schema.sql` is a stale, syntactically-invalid fragment that
    could confuse a future engineer into thinking it's authoritative — now
    quarantined and labeled in `supabase/deprecated/`.
13. Render/Vercel deploy configs (`render.yaml`, `vercel.json`) don't list
    every env var actually needed (e.g. omit OpenAI/Sentry/AOC vars) — not
    a functional risk since `.env.example` is now the complete source of
    truth, but the Render blueprint itself should ideally be updated too
    (out of scope for this audit — no business/deploy config was changed).

---

## Phase 7 — Veredicto

# **NO** — el proyecto NO está listo para ser hibernado todavía.

La mayoría del conocimiento requerido ya está documentado y empaquetado en
`supabase/` tras esta auditoría, pero existen **riesgos ALTOS que dependen
del proyecto Supabase LIVE** y que no pueden resolverse leyendo únicamente
el repositorio. Antes de pausar o eliminar el proyecto, hay que completar
esto:

1. **Ejecutar un `pg_dump --schema-only` / `supabase db dump --schema-only`
   contra el proyecto en vivo** y commitear el resultado — es la única
   forma de resolver con certeza el conflicto de definiciones incompatibles
   de `users`, `references`, `analytics_events` y `hrscore_snapshots`.
2. **Documentar manualmente la configuración real del bucket `cv-uploads`**
   (público/privado, políticas RLS de `storage.objects`) inspeccionando el
   Dashboard antes de apagar el proyecto.
3. **Exportar las credenciales OAuth de Google** (Client ID/Secret) desde
   Google Cloud Console / Supabase Dashboard y guardarlas en un gestor de
   secretos accesible para quien restaure el proyecto.
4. **Confirmar el origen de las tablas `profiles` y `candidate_prices`**
   (referenciadas por FK pero nunca creadas en este repo) — deben
   localizarse y añadirse como migración antes de que el proyecto original
   deje de estar disponible para inspeccionar.
5. **Decidir conscientemente** si el hueco de RLS en las tablas
   `023`–`029` (ledger AOC/RLUSD) es intencional o un descuido — si es un
   descuido, corregirlo es una decisión de negocio/seguridad fuera del
   alcance de esta auditoría, pero debe quedar registrada la decisión antes
   de restaurar el mismo esquema en un proyecto nuevo.

Una vez completados estos 5 puntos (especialmente el dump de esquema en
vivo), el paquete de hibernación en `supabase/` + `docs/HIBERNATION_AUDIT.md`
sería suficiente para reconstruir el proyecto completo sin depender del
Dashboard de Supabase original.
