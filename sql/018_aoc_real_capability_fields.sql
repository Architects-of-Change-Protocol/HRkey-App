-- ============================================================================
-- Transitional persistence fields for real AOC capabilities
-- ============================================================================

ALTER TABLE reference_pack_access_grants
  ADD COLUMN IF NOT EXISTS aoc_capability_hash TEXT,
  ADD COLUMN IF NOT EXISTS aoc_parent_consent_hash TEXT,
  ADD COLUMN IF NOT EXISTS aoc_capability JSONB,
  ADD COLUMN IF NOT EXISTS aoc_requested_scope JSONB,
  ADD COLUMN IF NOT EXISTS aoc_requested_permissions TEXT[],
  ADD COLUMN IF NOT EXISTS aoc_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aoc_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_reference_pack_access_aoc_capability_hash
  ON reference_pack_access_grants(aoc_capability_hash)
  WHERE aoc_capability_hash IS NOT NULL;

ALTER TABLE capability_grants
  ADD COLUMN IF NOT EXISTS aoc_capability_hash TEXT,
  ADD COLUMN IF NOT EXISTS aoc_parent_consent_hash TEXT,
  ADD COLUMN IF NOT EXISTS aoc_capability JSONB,
  ADD COLUMN IF NOT EXISTS aoc_requested_scope JSONB,
  ADD COLUMN IF NOT EXISTS aoc_requested_permissions TEXT[],
  ADD COLUMN IF NOT EXISTS aoc_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_capability_grants_aoc_capability_hash
  ON capability_grants(aoc_capability_hash)
  WHERE aoc_capability_hash IS NOT NULL;
