-- ============================================================================
-- HIBERNATION PACKAGE: copied verbatim (no content changes) for restorability.
-- Original source: sql/025_rlusd_internal_ledger.sql
-- See supabase/MIGRATION_MANIFEST.md for ordering rationale and known conflicts.
-- ============================================================================

-- ============================================================================
-- PR-14: RLUSD internal ledger + conversion completion lifecycle
-- ============================================================================

CREATE TABLE IF NOT EXISTS rlusd_balances (
  user_id TEXT PRIMARY KEY,
  rlusd_balance NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (rlusd_balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rlusd_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  amount NUMERIC(12,6) NOT NULL CHECK (amount > 0),
  direction TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
  type TEXT NOT NULL CHECK (type IN ('conversion_credit', 'withdrawal_hold', 'withdrawal_release', 'withdrawal_complete', 'adjustment')),
  reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rlusd_transactions_user_id
  ON rlusd_transactions(user_id);

CREATE INDEX IF NOT EXISTS idx_rlusd_transactions_type
  ON rlusd_transactions(type);

CREATE INDEX IF NOT EXISTS idx_rlusd_transactions_created_at
  ON rlusd_transactions(created_at DESC);

ALTER TABLE aoc_transactions
  DROP CONSTRAINT IF EXISTS aoc_transactions_type_check;

ALTER TABLE aoc_transactions
  ADD CONSTRAINT aoc_transactions_type_check
  CHECK (type IN ('access_payment', 'conversion_out', 'conversion_refund'));
