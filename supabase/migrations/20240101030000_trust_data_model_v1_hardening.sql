-- ============================================================================
-- HIBERNATION PACKAGE: copied verbatim (no content changes) for restorability.
-- Original source: sql/031_trust_data_model_v1_hardening.sql
-- See supabase/MIGRATION_MANIFEST.md for ordering rationale and known conflicts.
-- ============================================================================

-- ============================================================================
-- HRKey Trust Data Model V1 Hardening
-- Description: RLS, moderation workflow, admin-safe RPCs, and dashboard helpers.
-- Date: 2026-04-26
-- Depends on: sql/030_trust_data_model_v1.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION is_admin_user(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM users u
    WHERE u.id = p_user_id
      AND u.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION trust_actor_role(p_user_id UUID DEFAULT auth.uid())
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT u.role FROM users u WHERE u.id = p_user_id;
$$;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE referee_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE references ENABLE ROW LEVEL SECURITY;
ALTER TABLE reference_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE usefulness_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_trust_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_self_or_admin_select" ON users;
CREATE POLICY "users_self_or_admin_select"
  ON users FOR SELECT
  USING (id = auth.uid() OR is_admin_user());

DROP POLICY IF EXISTS "users_self_update_profile_only" ON users;
CREATE POLICY "users_self_update_profile_only"
  ON users FOR UPDATE
  USING (id = auth.uid() OR is_admin_user())
  WITH CHECK (id = auth.uid() OR is_admin_user());

DROP POLICY IF EXISTS "referee_profiles_self_or_admin" ON referee_profiles;
CREATE POLICY "referee_profiles_self_or_admin"
  ON referee_profiles FOR ALL
  USING (user_id = auth.uid() OR is_admin_user())
  WITH CHECK (user_id = auth.uid() OR is_admin_user());

DROP POLICY IF EXISTS "references_ref_parties_or_admin" ON references;
CREATE POLICY "references_ref_parties_or_admin"
  ON references FOR SELECT
  USING (
    referee_id = auth.uid()
    OR candidate_id = auth.uid()
    OR is_admin_user()
  );

DROP POLICY IF EXISTS "references_candidate_create" ON references;
CREATE POLICY "references_candidate_create"
  ON references FOR INSERT
  WITH CHECK (candidate_id = auth.uid() OR is_admin_user());

DROP POLICY IF EXISTS "references_referee_or_admin_update" ON references;
CREATE POLICY "references_referee_or_admin_update"
  ON references FOR UPDATE
  USING (referee_id = auth.uid() OR is_admin_user())
  WITH CHECK (referee_id = auth.uid() OR is_admin_user());

DROP POLICY IF EXISTS "reference_purchases_company_or_admin" ON reference_purchases;
CREATE POLICY "reference_purchases_company_or_admin"
  ON reference_purchases FOR ALL
  USING (company_id = auth.uid() OR is_admin_user())
  WITH CHECK (company_id = auth.uid() OR is_admin_user());

DROP POLICY IF EXISTS "usefulness_reviews_company_or_admin" ON usefulness_reviews;
CREATE POLICY "usefulness_reviews_company_or_admin"
  ON usefulness_reviews FOR ALL
  USING (company_id = auth.uid() OR is_admin_user())
  WITH CHECK (company_id = auth.uid() OR is_admin_user());

DROP POLICY IF EXISTS "trust_events_owner_or_admin" ON trust_events;
CREATE POLICY "trust_events_owner_or_admin"
  ON trust_events FOR SELECT
  USING (user_id = auth.uid() OR is_admin_user());

DROP POLICY IF EXISTS "disputes_owner_or_admin" ON disputes_flags;
CREATE POLICY "disputes_owner_or_admin"
  ON disputes_flags FOR ALL
  USING (user_id = auth.uid() OR is_admin_user())
  WITH CHECK (user_id = auth.uid() OR is_admin_user());

DROP POLICY IF EXISTS "trust_badges_public_read" ON trust_badges;
CREATE POLICY "trust_badges_public_read"
  ON trust_badges FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "trust_badges_admin_write" ON trust_badges;
CREATE POLICY "trust_badges_admin_write"
  ON trust_badges FOR ALL
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "user_trust_badges_owner_or_admin_read" ON user_trust_badges;
CREATE POLICY "user_trust_badges_owner_or_admin_read"
  ON user_trust_badges FOR SELECT
  USING (user_id = auth.uid() OR is_admin_user());

DROP POLICY IF EXISTS "user_trust_badges_admin_write" ON user_trust_badges;
CREATE POLICY "user_trust_badges_admin_write"
  ON user_trust_badges FOR INSERT
  WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "user_trust_badges_admin_update" ON user_trust_badges;
CREATE POLICY "user_trust_badges_admin_update"
  ON user_trust_badges FOR UPDATE
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

CREATE TABLE IF NOT EXISTS trust_moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('override_score', 'award_badge', 'revoke_badge', 'open_dispute', 'dismiss_dispute')),
  reason TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trust_moderation_actions_referee ON trust_moderation_actions(referee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trust_moderation_actions_created_by ON trust_moderation_actions(created_by, created_at DESC);

ALTER TABLE trust_moderation_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trust_moderation_admin_only" ON trust_moderation_actions;
CREATE POLICY "trust_moderation_admin_only"
  ON trust_moderation_actions FOR ALL
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

CREATE OR REPLACE FUNCTION admin_moderate_trust(
  p_referee_id UUID,
  p_action_type TEXT,
  p_reason TEXT,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_new_score NUMERIC;
  v_new_tier TEXT;
  v_badge TEXT;
  v_dispute_reason TEXT;
BEGIN
  IF NOT is_admin_user(v_actor) THEN
    RAISE EXCEPTION 'admin privileges required';
  END IF;

  INSERT INTO trust_moderation_actions(referee_id, action_type, reason, payload, created_by)
  VALUES (p_referee_id, p_action_type, p_reason, COALESCE(p_payload, '{}'::jsonb), v_actor);

  IF p_action_type = 'override_score' THEN
    v_new_score := clamp_trust_score((p_payload->>'score')::NUMERIC);
    v_new_tier := CASE
      WHEN v_new_score >= 90 THEN 'platinum'
      WHEN v_new_score >= 75 THEN 'gold'
      WHEN v_new_score >= 60 THEN 'silver'
      WHEN v_new_score >= 40 THEN 'bronze'
      ELSE 'unrated'
    END;

    INSERT INTO referee_profiles (user_id, current_trust_score, trust_tier)
    VALUES (p_referee_id, v_new_score, v_new_tier)
    ON CONFLICT (user_id) DO UPDATE
      SET current_trust_score = EXCLUDED.current_trust_score,
          trust_tier = EXCLUDED.trust_tier,
          updated_at = NOW();

    INSERT INTO trust_events(user_id, source_type, delta_score, metadata_json)
    VALUES (
      p_referee_id,
      'profile_completed',
      0,
      jsonb_build_object('admin_override', TRUE, 'score', v_new_score, 'tier', v_new_tier, 'reason', p_reason)
    );

  ELSIF p_action_type = 'award_badge' THEN
    v_badge := p_payload->>'badge_code';
    IF v_badge IS NULL OR v_badge = '' THEN
      RAISE EXCEPTION 'badge_code payload field is required';
    END IF;
    PERFORM issue_badge_if_missing(p_referee_id, v_badge, jsonb_build_object('admin_award', TRUE, 'reason', p_reason));

  ELSIF p_action_type = 'revoke_badge' THEN
    v_badge := p_payload->>'badge_code';
    IF v_badge IS NULL OR v_badge = '' THEN
      RAISE EXCEPTION 'badge_code payload field is required';
    END IF;
    UPDATE user_trust_badges
    SET revoked_at = NOW(),
        context = context || jsonb_build_object('admin_revocation_reason', p_reason)
    WHERE user_id = p_referee_id
      AND badge_code = v_badge
      AND revoked_at IS NULL;

  ELSIF p_action_type = 'open_dispute' THEN
    v_dispute_reason := COALESCE(NULLIF(p_payload->>'reason', ''), p_reason);
    INSERT INTO disputes_flags(user_id, reason, status)
    VALUES (p_referee_id, v_dispute_reason, 'open');

  ELSIF p_action_type = 'dismiss_dispute' THEN
    UPDATE disputes_flags
    SET status = 'dismissed',
        resolved_at = NOW()
    WHERE id = (p_payload->>'dispute_id')::UUID
      AND user_id = p_referee_id;
  ELSE
    RAISE EXCEPTION 'unsupported action_type %', p_action_type;
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'action_type', p_action_type, 'referee_id', p_referee_id);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_moderate_trust(UUID, TEXT, TEXT, JSONB) TO authenticated;

CREATE OR REPLACE VIEW trust_moderation_queue_v1 AS
SELECT
  rp.user_id AS referee_id,
  rp.current_trust_score,
  rp.trust_tier,
  COALESCE(open_disputes.open_count, 0) AS open_disputes,
  COALESCE(refunds.refund_count, 0) AS refunds,
  COALESCE(low_reviews.low_rating_count, 0) AS low_reviews,
  COALESCE(last_event.last_event_at, rp.updated_at) AS last_signal_at
FROM referee_profiles rp
LEFT JOIN (
  SELECT user_id, COUNT(*) AS open_count
  FROM disputes_flags
  WHERE status IN ('open', 'under_review')
  GROUP BY user_id
) open_disputes ON open_disputes.user_id = rp.user_id
LEFT JOIN (
  SELECT r.referee_id, COUNT(*) AS refund_count
  FROM reference_purchases rp
  JOIN references r ON r.id = rp.reference_id
  WHERE rp.refunded_at IS NOT NULL
  GROUP BY r.referee_id
) refunds ON refunds.referee_id = rp.user_id
LEFT JOIN (
  SELECT r.referee_id, COUNT(*) AS low_rating_count
  FROM usefulness_reviews ur
  JOIN references r ON r.id = ur.reference_id
  WHERE ur.rating_1_to_5 <= 2
  GROUP BY r.referee_id
) low_reviews ON low_reviews.referee_id = rp.user_id
LEFT JOIN (
  SELECT te.user_id, MAX(te.created_at) AS last_event_at
  FROM trust_events te
  GROUP BY te.user_id
) last_event ON last_event.user_id = rp.user_id;

GRANT SELECT ON trust_moderation_queue_v1 TO authenticated;
