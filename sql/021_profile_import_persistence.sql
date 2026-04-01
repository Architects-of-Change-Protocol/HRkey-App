-- ============================================================================
-- Profile Import Persistence Layer
-- ============================================================================
-- Description: Persists structured onboarding CV imports (experience + education)
-- Author: HRKey Development Team
-- Date: 2026-04-01
-- ============================================================================

CREATE TABLE IF NOT EXISTS profile_experiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  company TEXT,
  start_date TEXT,
  end_date TEXT,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  summary TEXT,
  source TEXT NOT NULL DEFAULT 'cv_import',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profile_education (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  institution TEXT,
  degree TEXT,
  field_of_study TEXT,
  start_date TEXT,
  end_date TEXT,
  source TEXT NOT NULL DEFAULT 'cv_import',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_experiences_profile_id
  ON profile_experiences(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_experiences_profile_sort
  ON profile_experiences(profile_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_profile_education_profile_id
  ON profile_education(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_education_profile_sort
  ON profile_education(profile_id, sort_order);

ALTER TABLE profile_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_education ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile experiences" ON profile_experiences;
DROP POLICY IF EXISTS "Users can insert own profile experiences" ON profile_experiences;
DROP POLICY IF EXISTS "Users can update own profile experiences" ON profile_experiences;
DROP POLICY IF EXISTS "Users can delete own profile experiences" ON profile_experiences;

CREATE POLICY "Users can view own profile experiences"
  ON profile_experiences FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "Users can insert own profile experiences"
  ON profile_experiences FOR INSERT
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can update own profile experiences"
  ON profile_experiences FOR UPDATE
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can delete own profile experiences"
  ON profile_experiences FOR DELETE
  USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own profile education" ON profile_education;
DROP POLICY IF EXISTS "Users can insert own profile education" ON profile_education;
DROP POLICY IF EXISTS "Users can update own profile education" ON profile_education;
DROP POLICY IF EXISTS "Users can delete own profile education" ON profile_education;

CREATE POLICY "Users can view own profile education"
  ON profile_education FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "Users can insert own profile education"
  ON profile_education FOR INSERT
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can update own profile education"
  ON profile_education FOR UPDATE
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can delete own profile education"
  ON profile_education FOR DELETE
  USING (profile_id = auth.uid());

COMMENT ON TABLE profile_experiences IS 'Structured onboarding experience rows accepted from CV import.';
COMMENT ON TABLE profile_education IS 'Structured onboarding education rows accepted from CV import.';
