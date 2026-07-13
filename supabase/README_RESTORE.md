# HRKey — Supabase Restore Guide

Step-by-step procedure to rebuild the Supabase project for HRKey from this
repository alone, after the original project has been paused or deleted.

Read `docs/HIBERNATION_AUDIT.md` first — it lists everything that is **not**
captured by these steps and must be re-entered manually (OAuth secrets,
exact live shape of a few core tables, etc).

**Live-verification update (2026-07-13):** several items below were
confirmed directly against the production project (see
`docs/HIBERNATION_AUDIT.md` Phase 2.5) — Storage turned out to have zero
buckets/policies, and the real Auth configuration (providers, Site URL,
Redirect URLs) is now fully known. The schema-shape ambiguity for
`users`/`references`/`analytics_events`/`hrscore_snapshots` is still open —
see Phase 6/7 of the audit.

## 0. Prerequisites

- Supabase CLI installed (`npm install -g supabase` or via your package manager)
- Access to a Supabase organization to create the new project in
- The real values for every variable listed in `.env.example` and
  `.env.payment-rail.example` (get these from your password manager / the
  team that ran the original project — they are never in git)

## 1. Create a new Supabase project

1. `supabase login`
2. Create the project via the Dashboard (https://supabase.com/dashboard) or
   `supabase projects create`. Note the new project's Project Ref, DB
   password, API URL, anon key, and service role key.

## 2. Connect the CLI

```bash
cd /path/to/HRkey-App
supabase link --project-ref <new-project-ref>
```

## 3. Apply migrations

```bash
supabase db push
```

This replays every file in `supabase/migrations/` in order. **Before you
run this against a project you intend to use for real data**, read
`supabase/MIGRATION_MANIFEST.md` — several migrations redeclare the same
table (`users`, `references`, `analytics_events`, `hrscore_snapshots`) with
different shapes using `CREATE TABLE IF NOT EXISTS`, so replay order
matters and may not match what was actually live in production. If you have
access to the original (soon-to-be-hibernated) project, run this FIRST and
commit the result before deleting anything:

```bash
supabase db dump --schema-only -f supabase/migrations/00000000000000_live_schema_snapshot_reference.sql
```

Rollback scripts (for two specific migrations only) live in
`supabase/rollbacks/` and are never auto-applied — run them manually with
`psql` only if you need to undo those specific changes.

**Live-verified status of two previously-unresolved dependencies**
(`docs/HIBERNATION_AUDIT.md` Phase 2.5):
- `candidate_prices` — confirmed **not to exist** in production. The
  conditional `ALTER TABLE candidate_prices ...` in
  `sql/010_pricing_and_staking_cache.sql` (migration
  `20240101004500_pricing_and_staking_cache.sql`) is a safe no-op; no
  action needed.
- `profiles` — confirmed to **exist** in production, but no migration in
  this repo creates it, so `supabase db push` will still fail at
  `20240101020000_profile_import_persistence.sql`'s foreign key unless you
  add a migration for `profiles` first (its real structure must come from
  a schema dump of the live project — not yet available in this repo).

## 4. Restore Storage buckets

**Confirmed against the live project: zero buckets and zero Storage
policies exist in production.** There is nothing to restore for this step —
skip it entirely.

Note: the application code (`HRkey/src/lib/storage/supabase-storage-provider.ts`)
references a `cv-uploads` bucket via `getPublicUrl()`, but that bucket does
not actually exist live. If the CV-upload feature needs to work, creating
the bucket (and deciding public vs. private, and any Storage RLS policy) is
a product/application decision to make fresh — not something this
hibernation package needs to reproduce, since there was nothing there to
begin with.

## 5. Deploy Edge Functions

Not applicable — this project has zero Supabase Edge Functions (confirmed
by repo-wide search, see `supabase/functions/README.md`). Skip this step.

## 6. Configure Secrets

Set every variable from `.env.example` and `.env.payment-rail.example` in:

- **Render** (backend): Dashboard → hrkey-backend service → Environment
  (see `backend/render.yaml` for the vars Render already knows to prompt
  for — note it does NOT list every var actually used in code; use the
  full `.env.example` as the source of truth instead)
- **Vercel** (frontend): Dashboard → Project → Settings → Environment
  Variables (in particular every `NEXT_PUBLIC_*` var, `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_CDP_API_KEY`,
  `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`)

Set the Supabase secret under **all three names** the code reads it by:
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_ROLE`, `SUPABASE_SERVICE_KEY`
(same value, see `docs/HIBERNATION_AUDIT.md`).

## 7. Configure Auth

Confirmed live configuration (see `docs/HIBERNATION_AUDIT.md` Phase 2.5) —
reproduce exactly this in Dashboard → Authentication → Providers:

| Setting | Value to set |
|---|---|
| Email provider | Enabled |
| Google OAuth provider | Enabled |
| Web3 Wallet provider | Enabled |
| Email confirmations | Enabled |
| Anonymous sign-in | Disabled |
| Manual linking | Disabled |
| Other/custom providers | None |

1. Enable **Email**, **Google**, and **Web3 Wallet** providers; leave
   Anonymous sign-in and Manual linking **disabled**; leave email
   confirmations **enabled**.
2. **Google OAuth Client ID/Secret**: not stored anywhere in this repo (by
   design — Supabase never exposes them via its API either) — pull from
   Google Cloud Console (or wherever the original credentials were
   provisioned) and re-enter them.
3. **Web3 Wallet provider**: confirmed enabled live, but this audit's
   code search did not conclusively identify which application code path
   drives it (likely the existing Coinbase OnchainKit / wallet integration
   already documented in `docs/HIBERNATION_AUDIT.md`'s External Services
   table) — double-check with the app team before assuming default config
   is sufficient.
4. Dashboard → Authentication → Sessions/JWT: defaults unless the original
   project changed them (not independently re-verified in this pass —
   check before hibernating if in doubt).

## 8. Configure Redirect URLs

Dashboard → Authentication → URL Configuration — set exactly this (captured
directly from the live project):

- **Site URL**: `https://www.hrkey.xyz/landing/auth.html`
- **Redirect URLs** (full allow-list):
  - `https://hrkey.xyz/auth`
  - `https://hrkey.xyz/auth.html`
  - `https://www.hrkey.xyz`
  - `https://www.hrkey.xyz/WebDapp/app.html`
  - `https://hrkey.xyz/WebDapp/app.html`
  - `https://www.www.hrkey.xyz/landing/auth.html` *(note: this looks like a
    pre-existing typo — double `www.` — reproduced here for fidelity, not
    corrected; confirm with the app team whether to keep or fix it on the
    new project)*
  - `https://www.hrkey.xyz/landing/auth.html?next=/landing/app.html`
  - `https://www.hrkey.xyz/landing/app.html`
  - `https://hrkey.xyz/landing/auth.html`
  - `https://hrkey.xyz/landing/auth.html?next=/landing/app.html`
  - `https://hrkey.xyz/landing/app.html`

Add local dev URLs (`http://localhost:3000/...`) and any Vercel
preview-deployment wildcard your team uses, as needed for local
development — those were not part of the captured production list.

## 9. Execute Seed (optional, dev/staging only)

`supabase/seed.sql` is intentionally empty of data. For local development
fixtures only:

```bash
psql "$SUPABASE_DB_URL" -f supabase/dev-seeds/seed_hrkey_referrals.sql
psql "$SUPABASE_DB_URL" -f supabase/dev-seeds/030_trust_data_model_v1_seed.sql
```

Never run these against a production/restored project.

## 10. Smoke Tests

1. `cd backend && npm run smoke:staging` (see `backend/QUICK_SMOKE_TEST.md`
   for how to obtain a `TEST_USER_JWT`).
2. `npm run test:ci` from repo root (unit + integration + frontend Jest
   suites) — note these use mocked Supabase clients, so passing tests do
   NOT confirm the real database/auth/storage config is correct; they only
   confirm application logic didn't regress.
3. Manually walk the golden path in a browser: sign up (email + Google),
   submit a reference, confirm a Stripe test-mode checkout webhook updates
   `stripe_events` / `revenue_transactions`. (CV upload via `cv-uploads` is
   not testable as a "does the restore match production" check — the
   bucket doesn't exist in production either; see Step 4.)
4. Confirm `backend/monitor-paymaster.js`'s hourly cron (runs inside the
   Render process via `node-cron`, not inside Supabase) is running after
   redeploying the backend service.

See `docs/HIBERNATION_AUDIT.md` Phase 5 (Validation) and Phase 6 (Risks) for
the full checklist of what to double-check before considering the restore
complete.
