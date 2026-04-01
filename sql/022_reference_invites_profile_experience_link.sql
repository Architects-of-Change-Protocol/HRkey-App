-- ============================================================================
-- Reference Invites → Profile Experience Linking
-- ============================================================================
-- Description: Links outbound reference invites to persisted profile experiences
--              for experience-specific reference requests.
-- Date: 2026-04-01
-- ============================================================================

ALTER TABLE reference_invites
  ADD COLUMN IF NOT EXISTS profile_experience_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_reference_invites_profile_experience'
  ) THEN
    ALTER TABLE reference_invites
      ADD CONSTRAINT fk_reference_invites_profile_experience
      FOREIGN KEY (profile_experience_id)
      REFERENCES profile_experiences(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reference_invites_profile_experience_id
  ON reference_invites(profile_experience_id)
  WHERE profile_experience_id IS NOT NULL;

COMMENT ON COLUMN reference_invites.profile_experience_id
  IS 'Optional link to profile_experiences row describing which experience this request is about.';
