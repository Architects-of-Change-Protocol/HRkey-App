# Migration Manifest — Hibernation Package

This file exists because the project had **no unified Supabase CLI migration
history** before this audit. SQL lived in four uncoordinated places:

- `sql/` — 31 numbered files (with gaps and duplicate numbers), plus `sql/deprecated/` and an ad-hoc seed file
- `backend/supabase/` — 1 file, a separate subsystem ("SDL")
- `backend/migrations/` — 3 files, two of which are duplicate definitions of the same table
- `database/migrations/` — 1 file, which also duplicates a table defined in `sql/`

`supabase/migrations/` now contains **verbatim copies** (no SQL was rewritten,
reordered logic, or "fixed") of every file that plausibly represents live
production schema, renamed with sequential Supabase-CLI-compatible timestamps
so they can be replayed in order with `supabase db push` /
`supabase migration up`. Rollback scripts, the deprecated migration, the
invalid/stale `backend/schema.sql` fragment, and dev-only seed data were
**excluded from the auto-apply chain** and preserved elsewhere (see below) —
nothing was deleted.

## ⚠️ Read this before running the migrations against a fresh project

Because several source files use `CREATE TABLE IF NOT EXISTS` for the *same*
logical table with **different, incompatible column sets**, replaying all
migrations in this best-guess order will silently keep whichever definition
happens to run first and no-op the later ones — exactly the same
silent-override behavior that likely already happened in the live database.
**This means nobody can be 100% certain from these files alone which shape of
`users` / `references` / `analytics_events` / `hrscore_snapshots` is actually
live today.**

**Action required before hibernating (see docs/HIBERNATION_AUDIT.md Phase 6/7):**
Run `supabase db dump --schema-only` (or `pg_dump --schema-only`) against the
**live** project and commit that output as
`supabase/migrations/00000000000000_live_schema_snapshot_reference.sql` (or
similar) — a schema-only baseline dump is the only source of truth that
resolves these conflicts. Until that dump exists, treat `supabase/migrations/`
as a best-effort archive, not a verified restore path.

## Known conflicts (flagged in filenames with `_CONFLICT_`)

| Conflict | Files involved | Notes |
|---|---|---|
| `users` / `references` table shape | `sql/001_identity_and_permissions.sql`, `sql/003/007/020` (extend the same tables), `sql/030_trust_data_model_v1.sql`, `sql/dev-seeds/seed_hrkey_referrals.sql` | Three independent `CREATE TABLE IF NOT EXISTS users` (and two of `references`) with different columns. Whichever ran first in production wins silently. |
| `analytics_events` | `sql/008_analytics_layer.sql` vs `database/migrations/create_payment_tables.sql` | Two unrelated table shapes, same name. |
| `hrscore_snapshots` | `backend/migrations/20250115_create_hrscore_snapshots_table.sql` vs `backend/migrations/20250902_create_hrscore_snapshots_table.sql` | The 2025-09 version has RLS + a CHECK constraint the 2025-01 version lacks; unclear which was actually applied to production, or whether both were (in which case the second is a no-op). |

## Ordering rationale

Files were ordered by: (1) the numeric prefix already used in `sql/` where
present, (2) embedded dates in file headers where available
(`backend/migrations/2025....sql`), (3) best-guess dependency order for
files with no numbering (`backend/supabase/`, `database/migrations/`). This
order is a **reasonable reconstruction, not a verified fact** — see the
warning above.

## Files excluded from `supabase/migrations/` (preserved, not deleted)

| Original file | New location | Why excluded |
|---|---|---|
| `sql/deprecated/002_data_access_and_revenue_sharing.sql` | `supabase/deprecated/002_data_access_and_revenue_sharing.sql` | Already marked deprecated in the source tree; superseded by later migrations. |
| `backend/schema.sql` | `supabase/deprecated/backend_schema_sql_QUARANTINED_invalid_syntax.sql` | Uses invalid PostgreSQL syntax (MySQL-style inline `INDEX` inside `CREATE TABLE`). Does not reconcile with any other migration. Almost certainly stale/never executed against Supabase as-is. Kept for historical reference only. |
| `sql/010_reference_hiding_and_strikethrough_ROLLBACK.sql` | `supabase/rollbacks/` | Rollback script — must never auto-apply. |
| `sql/031_trust_data_model_v1_hardening_ROLLBACK.sql` | `supabase/rollbacks/` | Rollback script — must never auto-apply. |
| `sql/seed_hrkey_referrals.sql` | `supabase/dev-seeds/` | Dev/staging fixture data, not schema. |
| `sql/030_trust_data_model_v1_seed.sql` | `supabase/dev-seeds/` | Dev/staging fixture data, not schema. |

## Files whose "manual, staged execution" comments should be re-read before replay

- `sql/013_harden_invite_tokens.sql` (→ `20240101011000_harden_invite_tokens.sql`): header says "Run up to step 5 first; verify application correctness; then step 6" — i.e. it was designed to be run in two sittings, not as one atomic migration.
- `sql/013_reference_pack_hash.sql` (→ `20240101011500_reference_pack_hash.sql`): contains an explicit "DO NOT execute it here" comment for part of its body.
- `database/migrations/create_payment_tables.sql` (→ `20240101025000_..._CONFLICT_analytics_events.sql`): header says "Run this in Supabase SQL Editor or via migration tool" — was not part of any tracked migration runner.

These are preserved verbatim; a human should re-read the inline comments in
each file before running them against a fresh database.
