-- ============================================================================
-- HIBERNATION PACKAGE: copied verbatim (no content changes) for restorability.
-- Original source: sql/024_aoc_rlusd_conversion_requests.sql
-- See supabase/MIGRATION_MANIFEST.md for ordering rationale and known conflicts.
-- ============================================================================

-- ============================================================================
-- PR-13: AOC -> RLUSD conversion architecture (simulated)
-- ============================================================================

CREATE TABLE IF NOT EXISTS aoc_conversion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  source_currency TEXT NOT NULL DEFAULT 'AOC' CHECK (source_currency = 'AOC'),
  target_currency TEXT NOT NULL DEFAULT 'RLUSD' CHECK (target_currency = 'RLUSD'),
  source_amount NUMERIC(12,2) NOT NULL CHECK (source_amount > 0),
  quoted_rate NUMERIC(18,8) NOT NULL CHECK (quoted_rate > 0),
  quoted_target_amount NUMERIC(12,6) NOT NULL CHECK (quoted_target_amount > 0),
  platform_fee_amount NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (platform_fee_amount >= 0),
  net_target_amount NUMERIC(12,6) NOT NULL CHECK (net_target_amount >= 0),
  status TEXT NOT NULL CHECK (status IN ('quoted', 'pending', 'processing', 'completed', 'failed', 'cancelled')),
  reference_note TEXT,
  quote_expires_at TIMESTAMPTZ,
  wallet_destination TEXT,
  completed_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aoc_conversion_requests_user_id
  ON aoc_conversion_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_aoc_conversion_requests_status
  ON aoc_conversion_requests(status);
CREATE INDEX IF NOT EXISTS idx_aoc_conversion_requests_created_at
  ON aoc_conversion_requests(created_at DESC);

-- Expand transaction type enum/check to support conversion debits.
ALTER TABLE aoc_transactions
  DROP CONSTRAINT IF EXISTS aoc_transactions_type_check;

ALTER TABLE aoc_transactions
  ADD CONSTRAINT aoc_transactions_type_check
  CHECK (type IN ('access_payment', 'conversion_out'));
