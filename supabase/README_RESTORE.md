# HRKey — Supabase Restore Guide

Step-by-step procedure to rebuild the Supabase project for HRKey from this
repository alone, after the original project has been paused or deleted.

Read `docs/HIBERNATION_AUDIT.md` first — it lists everything that is **not**
captured by these steps and must be re-entered manually (OAuth secrets,
Storage policies, exact live schema shape, etc).

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

## 4. Restore Storage buckets

No bucket-creation migration exists in this repo (bucket creation happened
only in the Dashboard originally). Recreate manually:

1. Dashboard → Storage → New bucket → name it **`cv-uploads`**
2. Set Public/Private according to what the live project actually used —
   the code (`HRkey/src/lib/storage/supabase-storage-provider.ts`) calls
   `getPublicUrl()`, which strongly implies **public**, but this must be
   confirmed against the live project before it's hibernated (see
   `docs/HIBERNATION_AUDIT.md` risk "Storage bucket policies").
3. Recreate any Storage RLS policies that existed on `storage.objects` for
   this bucket — none were found in any migration file, so these were
   Dashboard-only and are NOT captured anywhere in this repo. Capture them
   with `supabase inspect db` or the Dashboard's policy editor **before**
   hibernating the live project.

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

1. Dashboard → Authentication → Providers → enable **Email** and **Google**.
2. Google OAuth Client ID/Secret: not stored anywhere in this repo — pull
   from Google Cloud Console (or wherever the original credentials were
   provisioned) and re-enter them.
3. Dashboard → Authentication → Sessions/JWT: defaults unless the original
   project changed them (verify before hibernating — this repo has no
   record of any non-default JWT/session settings).

## 8. Configure Redirect URLs

Dashboard → Authentication → URL Configuration:
- **Site URL**: your production `FRONTEND_URL`
- **Redirect URLs**: `<FRONTEND_URL>/v2/auth` (the only redirect path found
  in code, in `HRkey/src/lib/auth/auth-service.ts`) plus any local dev URLs
  (`http://localhost:3000/v2/auth`) and any preview-deployment wildcard your
  team used on Vercel.

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
   upload a CV, verify it lands in `cv-uploads` and is retrievable, submit
   a reference, confirm a Stripe test-mode checkout webhook updates
   `stripe_events` / `revenue_transactions`.
4. Confirm `backend/monitor-paymaster.js`'s hourly cron (runs inside the
   Render process via `node-cron`, not inside Supabase) is running after
   redeploying the backend service.

See `docs/HIBERNATION_AUDIT.md` Phase 5 (Validation) and Phase 6 (Risks) for
the full checklist of what to double-check before considering the restore
complete.
