# HRKey Trust Data Model V1 — Production Readiness Report

_Date: April 26, 2026 (UTC)_

## Scope delivered

This report covers the requested productionization steps for Trust Data Model V1:
1. Safe staging migration runbook.
2. Compile/validation checks for tables, functions, triggers, and views.
3. Seed data for staging.
4. Live trust score recalculation test plan.
5. Referee dashboard hydration verification SQL.
6. Company dashboard hydration verification SQL.
7. RLS policy hardening.
8. Rollback migration.
9. Admin trust moderation panel.
10. Readiness status summary.

## Artifacts added

- `sql/031_trust_data_model_v1_hardening.sql`
  - Adds RLS to trust V1 tables.
  - Adds admin moderation actions table.
  - Adds `admin_moderate_trust(...)` RPC.
  - Adds `trust_moderation_queue_v1` view.
- `sql/031_trust_data_model_v1_hardening_ROLLBACK.sql`
  - Full rollback for the hardening migration.
- `sql/030_trust_data_model_v1_seed.sql`
  - Deterministic sample users/references/purchases/reviews/disputes.
  - Invokes `recalculate_trust_score` for seeded referee.
- `HRkey/src/app/v2/admin/trust/page.tsx`
  - Admin trust moderation UI with queue hydration, recalculate action, and manual score override.
- `HRkey/src/lib/v2/trust-dashboard-service.ts`
  - Adds moderation queue and admin moderation RPC client helpers.
- `HRkey/src/components/v2/V2Shell.tsx`
  - Adds Admin Trust route visibility in V2 shell.

## Safe staging execution sequence

Run in Supabase SQL editor or CI migration runner, in order:

1. `sql/030_trust_data_model_v1.sql`
2. `sql/031_trust_data_model_v1_hardening.sql`
3. `sql/030_trust_data_model_v1_seed.sql` (staging only)

## Validation SQL (staging)

```sql
-- 1) Objects exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'users',
    'referee_profiles',
    'references',
    'reference_purchases',
    'usefulness_reviews',
    'trust_events',
    'disputes_flags',
    'trust_badges',
    'user_trust_badges',
    'trust_moderation_actions'
  )
ORDER BY table_name;

SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'clamp_trust_score',
    'recalculate_trust_score',
    'log_trust_event_and_recalculate',
    'admin_moderate_trust',
    'is_admin_user',
    'trust_actor_role'
  )
ORDER BY routine_name;

SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name LIKE 'trust_%'
ORDER BY event_object_table, trigger_name;

-- 2) Hydration views resolve
SELECT * FROM referee_dashboard_metrics_v1 LIMIT 5;
SELECT * FROM company_dashboard_metrics_v1 LIMIT 5;
SELECT * FROM trust_moderation_queue_v1 LIMIT 5;

-- 3) Trust recalculation live test
SELECT * FROM recalculate_trust_score('00000000-0000-0000-0000-000000000001');

-- 4) Referee dashboard hydration test
SELECT *
FROM referee_dashboard_metrics_v1
WHERE referee_id = '00000000-0000-0000-0000-000000000001';

-- 5) Company dashboard hydration test
SELECT *
FROM company_dashboard_metrics_v1
WHERE company_id = '00000000-0000-0000-0000-000000000003';

-- 6) RLS check (run as authenticated user in Supabase)
SELECT * FROM trust_events LIMIT 1;
SELECT * FROM user_trust_badges LIMIT 1;
```

## Rollback (if needed)

Run:
1. `sql/031_trust_data_model_v1_hardening_ROLLBACK.sql`
2. (Optional) remove seeded records in staging by UUID namespace if required.

## Environment limitations in this run

- Direct Supabase staging execution was **not performed in this container** because Supabase CLI/connection context is not configured.
- SQL and app integration changes are prepared and ready for staging execution.

## Production readiness status

- **Schema completeness:** Ready
- **Function/trigger/view wiring:** Ready (pending staging execution)
- **Seed data:** Ready (staging-only script)
- **RLS policies:** Ready
- **Rollback plan:** Ready
- **Admin moderation panel:** Ready
- **Final status:** **Ready for staged deployment and verification gate**
