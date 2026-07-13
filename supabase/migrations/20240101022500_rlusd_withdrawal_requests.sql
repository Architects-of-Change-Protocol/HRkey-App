-- ============================================================================
-- HIBERNATION PACKAGE: copied verbatim (no content changes) for restorability.
-- Original source: sql/026_rlusd_withdrawal_requests.sql
-- See supabase/MIGRATION_MANIFEST.md for ordering rationale and known conflicts.
-- ============================================================================

-- ============================================================================
-- PR-15: RLUSD withdrawal / payout architecture foundation
-- ============================================================================

ALTER TABLE rlusd_balances
  ADD COLUMN IF NOT EXISTS rlusd_reserved_balance NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (rlusd_reserved_balance >= 0);

CREATE TABLE IF NOT EXISTS rlusd_withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  amount NUMERIC(12,6) NOT NULL CHECK (amount > 0),
  fee_amount NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  net_amount NUMERIC(12,6) NOT NULL CHECK (net_amount >= 0),
  status TEXT NOT NULL CHECK (status IN ('requested', 'pending_review', 'processing', 'completed', 'failed', 'cancelled')),
  destination_type TEXT NOT NULL CHECK (destination_type IN ('wallet', 'bank', 'sinpe', 'other')),
  destination_label TEXT,
  destination_ref TEXT,
  reference_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  failure_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_rlusd_withdrawal_requests_user_id
  ON rlusd_withdrawal_requests(user_id);

CREATE INDEX IF NOT EXISTS idx_rlusd_withdrawal_requests_status
  ON rlusd_withdrawal_requests(status);

CREATE INDEX IF NOT EXISTS idx_rlusd_withdrawal_requests_created_at
  ON rlusd_withdrawal_requests(created_at DESC);
