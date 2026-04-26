-- ============================================================================
-- Rollback for 031_trust_data_model_v1_hardening.sql
-- Date: 2026-04-26
-- ============================================================================

DROP VIEW IF EXISTS trust_moderation_queue_v1;

REVOKE EXECUTE ON FUNCTION admin_moderate_trust(UUID, TEXT, TEXT, JSONB) FROM authenticated;
DROP FUNCTION IF EXISTS admin_moderate_trust(UUID, TEXT, TEXT, JSONB);

DROP TABLE IF EXISTS trust_moderation_actions;

DROP POLICY IF EXISTS "trust_moderation_admin_only" ON trust_moderation_actions;
DROP POLICY IF EXISTS "users_self_or_admin_select" ON users;
DROP POLICY IF EXISTS "users_self_update_profile_only" ON users;
DROP POLICY IF EXISTS "referee_profiles_self_or_admin" ON referee_profiles;
DROP POLICY IF EXISTS "references_ref_parties_or_admin" ON references;
DROP POLICY IF EXISTS "references_candidate_create" ON references;
DROP POLICY IF EXISTS "references_referee_or_admin_update" ON references;
DROP POLICY IF EXISTS "reference_purchases_company_or_admin" ON reference_purchases;
DROP POLICY IF EXISTS "usefulness_reviews_company_or_admin" ON usefulness_reviews;
DROP POLICY IF EXISTS "trust_events_owner_or_admin" ON trust_events;
DROP POLICY IF EXISTS "disputes_owner_or_admin" ON disputes_flags;
DROP POLICY IF EXISTS "trust_badges_public_read" ON trust_badges;
DROP POLICY IF EXISTS "trust_badges_admin_write" ON trust_badges;
DROP POLICY IF EXISTS "user_trust_badges_owner_or_admin_read" ON user_trust_badges;
DROP POLICY IF EXISTS "user_trust_badges_admin_write" ON user_trust_badges;
DROP POLICY IF EXISTS "user_trust_badges_admin_update" ON user_trust_badges;

ALTER TABLE IF EXISTS users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS referee_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS references DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS reference_purchases DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS usefulness_reviews DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS trust_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS disputes_flags DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS trust_badges DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_trust_badges DISABLE ROW LEVEL SECURITY;

DROP FUNCTION IF EXISTS trust_actor_role(UUID);
DROP FUNCTION IF EXISTS is_admin_user(UUID);
