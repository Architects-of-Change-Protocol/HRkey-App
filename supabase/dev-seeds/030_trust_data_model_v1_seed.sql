-- ============================================================================
-- HIBERNATION PACKAGE: copied verbatim (no content changes) for restorability.
-- Original source: sql/030_trust_data_model_v1_seed.sql
-- NOT part of the auto-apply migration chain — see supabase/MIGRATION_MANIFEST.md
-- ============================================================================

-- ============================================================================
-- HRKey Trust Data Model V1 Seed (staging/dev only)
-- Date: 2026-04-26
-- ============================================================================

BEGIN;

INSERT INTO users (id, role, verified_status)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'referee', TRUE),
  ('00000000-0000-0000-0000-000000000002', 'candidate', TRUE),
  ('00000000-0000-0000-0000-000000000003', 'company', TRUE),
  ('00000000-0000-0000-0000-000000000004', 'company', TRUE),
  ('00000000-0000-0000-0000-000000000005', 'admin', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO referee_profiles (user_id, headline, industries, years_experience, response_hours_avg)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'VP Engineering at scale-up SaaS', ARRAY['software', 'engineering', 'finance'], 11, 16)
ON CONFLICT (user_id) DO UPDATE
SET headline = EXCLUDED.headline,
    industries = EXCLUDED.industries,
    years_experience = EXCLUDED.years_experience,
    response_hours_avg = EXCLUDED.response_hours_avg,
    updated_at = NOW();

INSERT INTO references (id, referee_id, candidate_id, relationship_type, status, completed_at, response_hours)
VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Engineering manager', 'completed', NOW() - INTERVAL '5 days', 12),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Direct manager', 'completed', NOW() - INTERVAL '40 days', 18),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Cross-functional partner', 'completed', NOW() - INTERVAL '130 days', 20)
ON CONFLICT (id) DO NOTHING;

INSERT INTO reference_purchases (id, company_id, reference_id, credits_spent)
VALUES
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 24),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 24),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003', 19)
ON CONFLICT (id) DO NOTHING;

INSERT INTO usefulness_reviews (id, company_id, reference_id, rating_1_to_5, note)
VALUES
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 5, 'High signal and specific delivery examples.'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003', 4, 'Useful depth on stakeholder communication.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO disputes_flags (id, user_id, reason, status)
VALUES
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Historical quality review opened for QA', 'closed')
ON CONFLICT (id) DO NOTHING;

SELECT * FROM recalculate_trust_score('00000000-0000-0000-0000-000000000001');

COMMIT;
