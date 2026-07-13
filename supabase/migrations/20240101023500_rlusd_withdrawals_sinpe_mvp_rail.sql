-- ============================================================================
-- HIBERNATION PACKAGE: copied verbatim (no content changes) for restorability.
-- Original source: sql/028_rlusd_withdrawals_sinpe_mvp_rail.sql
-- See supabase/MIGRATION_MANIFEST.md for ordering rationale and known conflicts.
-- ============================================================================

-- ============================================================================
-- PR-16A: RLUSD withdrawals SINPE MVP rail + neutral payout metadata
-- ============================================================================

ALTER TABLE rlusd_withdrawal_requests
  ADD COLUMN IF NOT EXISTS payout_rail TEXT,
  ADD COLUMN IF NOT EXISTS payout_provider TEXT,
  ADD COLUMN IF NOT EXISTS payout_reference TEXT,
  ADD COLUMN IF NOT EXISTS payout_external_id TEXT,
  ADD COLUMN IF NOT EXISTS payout_status TEXT,
  ADD COLUMN IF NOT EXISTS payout_status_detail TEXT,
  ADD COLUMN IF NOT EXISTS payout_processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_operator_note TEXT,
  ADD COLUMN IF NOT EXISTS payout_destination_snapshot JSONB;

CREATE INDEX IF NOT EXISTS idx_rlusd_withdrawal_requests_payout_rail
  ON rlusd_withdrawal_requests(payout_rail);

CREATE INDEX IF NOT EXISTS idx_rlusd_withdrawal_requests_payout_status
  ON rlusd_withdrawal_requests(payout_status);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rlusd_withdrawal_requests_destination_type_check'
  ) THEN
    ALTER TABLE rlusd_withdrawal_requests
      DROP CONSTRAINT rlusd_withdrawal_requests_destination_type_check;
  END IF;
END $$;

ALTER TABLE rlusd_withdrawal_requests
  ADD CONSTRAINT rlusd_withdrawal_requests_destination_type_check
  CHECK (destination_type IN ('wallet', 'bank', 'sinpe', 'sinpe_mobile', 'other'));
