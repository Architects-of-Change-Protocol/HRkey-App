-- ============================================================================
-- HRKey Trust Data Model V1
-- Description: Persistent trust ledger, weighted trust score engine, badges,
--              dashboard hydration views, and automation triggers.
-- Date: 2026-04-26
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('candidate', 'referee', 'company', 'admin')),
  verified_status BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referee_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  headline TEXT,
  industries TEXT[] NOT NULL DEFAULT '{}',
  years_experience INTEGER NOT NULL DEFAULT 0,
  current_trust_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  trust_tier TEXT NOT NULL DEFAULT 'unrated' CHECK (trust_tier IN ('unrated', 'bronze', 'silver', 'gold', 'platinum')),
  response_hours_avg NUMERIC(8,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'disputed', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  freshness_score NUMERIC(5,2) NOT NULL DEFAULT 100,
  response_hours NUMERIC(8,2),
  CONSTRAINT references_completed_requires_timestamp CHECK (
    (status <> 'completed') OR (completed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS reference_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reference_id UUID NOT NULL REFERENCES references(id) ON DELETE CASCADE,
  credits_spent NUMERIC(12,2) NOT NULL CHECK (credits_spent >= 0),
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  refunded_at TIMESTAMPTZ,
  UNIQUE (company_id, reference_id, purchased_at)
);

CREATE TABLE IF NOT EXISTS usefulness_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reference_id UUID NOT NULL REFERENCES references(id) ON DELETE CASCADE,
  rating_1_to_5 INTEGER NOT NULL CHECK (rating_1_to_5 BETWEEN 1 AND 5),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, reference_id)
);

CREATE TABLE IF NOT EXISTS trust_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (
    source_type IN (
      'reference_completed',
      'purchase',
      'repeat_buy',
      'review',
      'verification',
      'dispute',
      'stale_decay',
      'profile_completed'
    )
  ),
  delta_score NUMERIC(6,2) NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS disputes_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'closed', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS trust_badges (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  min_score INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS user_trust_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_code TEXT NOT NULL REFERENCES trust_badges(code) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, badge_code, awarded_at)
);

INSERT INTO trust_badges (code, label, min_score, metadata)
VALUES
  ('highly_trusted', 'Highly Trusted', 80, '{"rule":"trust_score_gte_80"}'),
  ('top_manager', 'Top Manager', NULL, '{"rule":"relationship_type_manager"}'),
  ('fast_responder', 'Fast Responder', NULL, '{"rule":"response_hours_avg_lte_24"}'),
  ('repeat_purchased', 'Repeat Purchased', NULL, '{"rule":"repeat_buyers_gte_2"}'),
  ('sales_expert', 'Sales Expert', NULL, '{"rule":"industry_sales"}'),
  ('technical_leader', 'Technical Leader', NULL, '{"rule":"industry_technical"}'),
  ('finance_verified', 'Finance Verified', NULL, '{"rule":"industry_finance_and_verified"}'),
  ('rising_referee', 'Rising Referee', NULL, '{"rule":"refs_30d_gte_2"}')
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  min_score = EXCLUDED.min_score,
  metadata = EXCLUDED.metadata;

CREATE INDEX IF NOT EXISTS idx_references_referee_status ON references(referee_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reference_purchases_ref ON reference_purchases(reference_id, purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_usefulness_reviews_ref ON usefulness_reviews(reference_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trust_events_user_created ON trust_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disputes_flags_user_status ON disputes_flags(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_trust_badges_user ON user_trust_badges(user_id, awarded_at DESC);

CREATE OR REPLACE FUNCTION clamp_trust_score(raw_score NUMERIC)
RETURNS NUMERIC
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT LEAST(100, GREATEST(0, COALESCE(raw_score, 0)));
$$;

CREATE OR REPLACE FUNCTION issue_badge_if_missing(p_user_id UUID, p_badge_code TEXT, p_context JSONB DEFAULT '{}'::jsonb)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM user_trust_badges
    WHERE user_id = p_user_id
      AND badge_code = p_badge_code
      AND revoked_at IS NULL
  ) THEN
    INSERT INTO user_trust_badges (user_id, badge_code, context)
    VALUES (p_user_id, p_badge_code, p_context);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION recalculate_trust_score(p_user_id UUID)
RETURNS TABLE (user_id UUID, trust_score NUMERIC, trust_tier TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_completed_references INTEGER := 0;
  v_avg_rating NUMERIC := 0;
  v_repeat_purchases INTEGER := 0;
  v_verified BOOLEAN := FALSE;
  v_profile_completeness NUMERIC := 0;
  v_fast_response_bonus NUMERIC := 0;
  v_stale_penalty NUMERIC := 0;
  v_dispute_penalty NUMERIC := 0;
  v_refund_penalty NUMERIC := 0;
  v_poor_rating_penalty NUMERIC := 0;
  v_score NUMERIC := 0;
  v_tier TEXT := 'unrated';
BEGIN
  SELECT COUNT(*) INTO v_completed_references
  FROM references r
  WHERE r.referee_id = p_user_id
    AND r.status = 'completed';

  SELECT COALESCE(AVG(ur.rating_1_to_5), 0) INTO v_avg_rating
  FROM usefulness_reviews ur
  JOIN references r ON r.id = ur.reference_id
  WHERE r.referee_id = p_user_id;

  SELECT COUNT(*) INTO v_repeat_purchases
  FROM (
    SELECT rp.company_id
    FROM reference_purchases rp
    JOIN references r ON r.id = rp.reference_id
    WHERE r.referee_id = p_user_id
      AND rp.refunded_at IS NULL
    GROUP BY rp.company_id
    HAVING COUNT(*) >= 2
  ) repeat_buyers;

  SELECT verified_status INTO v_verified
  FROM users
  WHERE id = p_user_id;

  SELECT (
    (CASE WHEN rp.headline IS NOT NULL AND length(trim(rp.headline)) > 0 THEN 1 ELSE 0 END) +
    (CASE WHEN COALESCE(array_length(rp.industries, 1), 0) > 0 THEN 1 ELSE 0 END) +
    (CASE WHEN rp.years_experience > 0 THEN 1 ELSE 0 END)
  ) / 3.0 INTO v_profile_completeness
  FROM referee_profiles rp
  WHERE rp.user_id = p_user_id;

  SELECT CASE
    WHEN rp.response_hours_avg IS NULL THEN 0
    WHEN rp.response_hours_avg <= 24 THEN 8
    WHEN rp.response_hours_avg <= 48 THEN 4
    ELSE 0
  END INTO v_fast_response_bonus
  FROM referee_profiles rp
  WHERE rp.user_id = p_user_id;

  SELECT COALESCE(SUM(CASE
    WHEN r.completed_at IS NOT NULL AND r.completed_at < NOW() - INTERVAL '180 days' THEN 3
    WHEN r.completed_at IS NOT NULL AND r.completed_at < NOW() - INTERVAL '90 days' THEN 1
    ELSE 0
  END), 0) INTO v_stale_penalty
  FROM references r
  WHERE r.referee_id = p_user_id
    AND r.status = 'completed';

  SELECT COUNT(*) * 6 INTO v_dispute_penalty
  FROM disputes_flags d
  WHERE d.user_id = p_user_id
    AND d.status IN ('open', 'under_review');

  SELECT COUNT(*) * 4 INTO v_refund_penalty
  FROM reference_purchases rp
  JOIN references r ON r.id = rp.reference_id
  WHERE r.referee_id = p_user_id
    AND rp.refunded_at IS NOT NULL;

  SELECT COUNT(*) * 3 INTO v_poor_rating_penalty
  FROM usefulness_reviews ur
  JOIN references r ON r.id = ur.reference_id
  WHERE r.referee_id = p_user_id
    AND ur.rating_1_to_5 <= 2;

  v_score :=
      (v_completed_references * 4)
    + (v_avg_rating * 8)
    + (v_repeat_purchases * 6)
    + (CASE WHEN v_verified THEN 10 ELSE 0 END)
    + (v_profile_completeness * 8)
    + v_fast_response_bonus
    - v_stale_penalty
    - v_dispute_penalty
    - v_refund_penalty
    - v_poor_rating_penalty;

  v_score := clamp_trust_score(v_score);

  v_tier := CASE
    WHEN v_score >= 90 THEN 'platinum'
    WHEN v_score >= 75 THEN 'gold'
    WHEN v_score >= 60 THEN 'silver'
    WHEN v_score >= 40 THEN 'bronze'
    ELSE 'unrated'
  END;

  INSERT INTO referee_profiles (user_id, current_trust_score, trust_tier)
  VALUES (p_user_id, v_score, v_tier)
  ON CONFLICT (user_id) DO UPDATE
    SET current_trust_score = EXCLUDED.current_trust_score,
        trust_tier = EXCLUDED.trust_tier,
        updated_at = NOW();

  INSERT INTO trust_events (user_id, source_type, delta_score, metadata_json)
  VALUES (
    p_user_id,
    'stale_decay',
    -1 * (v_stale_penalty + v_dispute_penalty + v_refund_penalty + v_poor_rating_penalty),
    jsonb_build_object(
      'completed_references', v_completed_references,
      'avg_rating', v_avg_rating,
      'repeat_purchases', v_repeat_purchases,
      'verified', v_verified,
      'profile_completeness', v_profile_completeness,
      'fast_response_bonus', v_fast_response_bonus,
      'stale_penalty', v_stale_penalty,
      'dispute_penalty', v_dispute_penalty,
      'refund_penalty', v_refund_penalty,
      'poor_rating_penalty', v_poor_rating_penalty,
      'resulting_score', v_score
    )
  );

  IF v_score >= 80 THEN
    PERFORM issue_badge_if_missing(p_user_id, 'highly_trusted', jsonb_build_object('score', v_score));
  END IF;

  IF v_fast_response_bonus >= 8 THEN
    PERFORM issue_badge_if_missing(p_user_id, 'fast_responder');
  END IF;

  IF v_repeat_purchases >= 2 THEN
    PERFORM issue_badge_if_missing(p_user_id, 'repeat_purchased', jsonb_build_object('repeat_buyers', v_repeat_purchases));
  END IF;

  IF EXISTS (SELECT 1 FROM references WHERE referee_id = p_user_id AND relationship_type ILIKE '%manager%') THEN
    PERFORM issue_badge_if_missing(p_user_id, 'top_manager');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM referee_profiles rp
    WHERE rp.user_id = p_user_id
      AND EXISTS (SELECT 1 FROM unnest(rp.industries) industry WHERE industry ILIKE '%sales%')
  ) THEN
    PERFORM issue_badge_if_missing(p_user_id, 'sales_expert');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM referee_profiles rp
    WHERE rp.user_id = p_user_id
      AND EXISTS (
        SELECT 1
        FROM unnest(rp.industries) industry
        WHERE industry ILIKE ANY (ARRAY['%engineering%', '%technical%', '%software%'])
      )
  ) THEN
    PERFORM issue_badge_if_missing(p_user_id, 'technical_leader');
  END IF;

  IF v_verified AND EXISTS (
    SELECT 1
    FROM referee_profiles rp
    WHERE rp.user_id = p_user_id
      AND EXISTS (SELECT 1 FROM unnest(rp.industries) industry WHERE industry ILIKE '%finance%')
  ) THEN
    PERFORM issue_badge_if_missing(p_user_id, 'finance_verified');
  END IF;

  IF (
    SELECT COUNT(*)
    FROM references r
    WHERE r.referee_id = p_user_id
      AND r.status = 'completed'
      AND r.completed_at >= NOW() - INTERVAL '30 days'
  ) >= 2 THEN
    PERFORM issue_badge_if_missing(p_user_id, 'rising_referee');
  END IF;

  RETURN QUERY SELECT p_user_id, v_score, v_tier;
END;
$$;

CREATE OR REPLACE FUNCTION log_trust_event_and_recalculate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_referee_id UUID;
  v_delta NUMERIC := 0;
BEGIN
  IF TG_TABLE_NAME = 'references' THEN
    v_referee_id := COALESCE(NEW.referee_id, OLD.referee_id);
    IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
      v_delta := 8;
      INSERT INTO trust_events (user_id, source_type, delta_score, metadata_json)
      VALUES (v_referee_id, 'reference_completed', v_delta, jsonb_build_object('reference_id', NEW.id));
    END IF;

  ELSIF TG_TABLE_NAME = 'usefulness_reviews' THEN
    SELECT r.referee_id INTO v_referee_id FROM references r WHERE r.id = NEW.reference_id;
    v_delta := (NEW.rating_1_to_5 - 3);
    INSERT INTO trust_events (user_id, source_type, delta_score, metadata_json)
    VALUES (v_referee_id, 'review', v_delta, jsonb_build_object('review_id', NEW.id, 'rating', NEW.rating_1_to_5));

  ELSIF TG_TABLE_NAME = 'reference_purchases' THEN
    SELECT r.referee_id INTO v_referee_id FROM references r WHERE r.id = NEW.reference_id;
    v_delta := 3;
    INSERT INTO trust_events (user_id, source_type, delta_score, metadata_json)
    VALUES (v_referee_id, 'purchase', v_delta, jsonb_build_object('purchase_id', NEW.id, 'credits_spent', NEW.credits_spent));

    IF (
      SELECT COUNT(*)
      FROM reference_purchases rp
      WHERE rp.company_id = NEW.company_id
        AND rp.refunded_at IS NULL
        AND rp.reference_id IN (SELECT id FROM references WHERE referee_id = v_referee_id)
    ) >= 2 THEN
      INSERT INTO trust_events (user_id, source_type, delta_score, metadata_json)
      VALUES (v_referee_id, 'repeat_buy', 4, jsonb_build_object('company_id', NEW.company_id));
    END IF;

  ELSIF TG_TABLE_NAME = 'users' THEN
    v_referee_id := NEW.id;
    IF NEW.verified_status = TRUE AND (OLD.verified_status IS DISTINCT FROM NEW.verified_status) THEN
      INSERT INTO trust_events (user_id, source_type, delta_score, metadata_json)
      VALUES (v_referee_id, 'verification', 10, '{}'::jsonb);
    END IF;

  ELSIF TG_TABLE_NAME = 'disputes_flags' THEN
    v_referee_id := COALESCE(NEW.user_id, OLD.user_id);
    IF NEW.status IN ('open', 'under_review') THEN
      INSERT INTO trust_events (user_id, source_type, delta_score, metadata_json)
      VALUES (v_referee_id, 'dispute', -6, jsonb_build_object('dispute_id', NEW.id, 'reason', NEW.reason));
    END IF;

  ELSIF TG_TABLE_NAME = 'referee_profiles' THEN
    v_referee_id := NEW.user_id;
    IF NEW.headline IS NOT NULL AND COALESCE(array_length(NEW.industries, 1), 0) > 0 AND NEW.years_experience > 0 THEN
      INSERT INTO trust_events (user_id, source_type, delta_score, metadata_json)
      VALUES (v_referee_id, 'profile_completed', 5, '{}'::jsonb);
    END IF;
  END IF;

  IF v_referee_id IS NOT NULL THEN
    PERFORM recalculate_trust_score(v_referee_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trust_references_after_write ON references;
CREATE TRIGGER trust_references_after_write
AFTER INSERT OR UPDATE OF status, freshness_score, completed_at ON references
FOR EACH ROW
EXECUTE FUNCTION log_trust_event_and_recalculate();

DROP TRIGGER IF EXISTS trust_reviews_after_insert ON usefulness_reviews;
CREATE TRIGGER trust_reviews_after_insert
AFTER INSERT ON usefulness_reviews
FOR EACH ROW
EXECUTE FUNCTION log_trust_event_and_recalculate();

DROP TRIGGER IF EXISTS trust_purchases_after_insert ON reference_purchases;
CREATE TRIGGER trust_purchases_after_insert
AFTER INSERT ON reference_purchases
FOR EACH ROW
EXECUTE FUNCTION log_trust_event_and_recalculate();

DROP TRIGGER IF EXISTS trust_users_after_verify ON users;
CREATE TRIGGER trust_users_after_verify
AFTER UPDATE OF verified_status ON users
FOR EACH ROW
EXECUTE FUNCTION log_trust_event_and_recalculate();

DROP TRIGGER IF EXISTS trust_disputes_after_write ON disputes_flags;
CREATE TRIGGER trust_disputes_after_write
AFTER INSERT OR UPDATE OF status ON disputes_flags
FOR EACH ROW
EXECUTE FUNCTION log_trust_event_and_recalculate();

DROP TRIGGER IF EXISTS trust_profile_after_write ON referee_profiles;
CREATE TRIGGER trust_profile_after_write
AFTER INSERT OR UPDATE OF headline, industries, years_experience, response_hours_avg ON referee_profiles
FOR EACH ROW
EXECUTE FUNCTION log_trust_event_and_recalculate();

CREATE OR REPLACE VIEW referee_dashboard_metrics_v1 AS
SELECT
  rp.user_id AS referee_id,
  rp.current_trust_score AS trust_score,
  rp.trust_tier,
  COALESCE(SUM(rpurch.credits_spent * 0.7), 0)::NUMERIC(12,2) AS earnings,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'completed') AS references_completed,
  COUNT(rpurch.id) AS purchases_generated,
  COUNT(DISTINCT rpurch.company_id) FILTER (
    WHERE rpurch.company_id IN (
      SELECT company_id
      FROM reference_purchases rp2
      JOIN references r2 ON r2.id = rp2.reference_id
      WHERE r2.referee_id = rp.user_id
      GROUP BY company_id
      HAVING COUNT(*) >= 2
    )
  ) AS repeat_buyers,
  COALESCE(
    SUM(CASE WHEN te.created_at >= NOW() - INTERVAL '30 days' THEN te.delta_score ELSE 0 END),
    0
  ) AS growth_last_30d
FROM referee_profiles rp
LEFT JOIN references r ON r.referee_id = rp.user_id
LEFT JOIN reference_purchases rpurch ON rpurch.reference_id = r.id AND rpurch.refunded_at IS NULL
LEFT JOIN trust_events te ON te.user_id = rp.user_id
GROUP BY rp.user_id, rp.current_trust_score, rp.trust_tier;

CREATE OR REPLACE VIEW company_dashboard_metrics_v1 AS
SELECT
  u.id AS company_id,
  COUNT(DISTINCT rp.id) AS purchases_made,
  COALESCE(
    ROUND(
      100.0 * SUM(CASE WHEN ur.rating_1_to_5 >= 4 THEN 1 ELSE 0 END) / NULLIF(COUNT(ur.id), 0),
      2
    ),
    0
  ) AS useful_references_pct,
  COUNT(DISTINCT cf.referee_user_id) AS saved_referees,
  COALESCE(w.balance, 0) AS credits_balance
FROM users u
LEFT JOIN reference_purchases rp ON rp.company_id = u.id
LEFT JOIN usefulness_reviews ur ON ur.company_id = u.id
LEFT JOIN hrkey_company_favorites cf ON cf.company_id = u.id::text
LEFT JOIN hrkey_wallets w ON w.user_id = u.id::text
WHERE u.role = 'company'
GROUP BY u.id, w.balance;
