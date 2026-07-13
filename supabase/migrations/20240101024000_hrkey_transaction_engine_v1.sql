-- ============================================================================
-- HIBERNATION PACKAGE: copied verbatim (no content changes) for restorability.
-- Original source: sql/029_hrkey_transaction_engine_v1.sql
-- See supabase/MIGRATION_MANIFEST.md for ordering rationale and known conflicts.
-- ============================================================================

-- HRKey Transaction Engine V1
-- Covers: credits ledger, wallet top-up mock, purchase history,
-- revenue split, access delivery, refund/dispute, favorites, repeat buy, analytics.

CREATE TABLE IF NOT EXISTS hrkey_wallets (
  user_id TEXT PRIMARY KEY,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'HRKCR',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hrkey_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_user_id TEXT NOT NULL,
  company_id TEXT,
  referee_user_id TEXT NOT NULL,
  product_code TEXT NOT NULL DEFAULT 'reference_pack',
  amount_total NUMERIC(14,2) NOT NULL,
  referee_share_amount NUMERIC(14,2) NOT NULL,
  hrkey_share_amount NUMERIC(14,2) NOT NULL,
  referee_share_ratio NUMERIC(8,6) NOT NULL DEFAULT 0.8,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hrkey_credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  entry_type TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
  purchase_id UUID REFERENCES hrkey_purchases(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hrkey_purchase_access (
  purchase_id UUID PRIMARY KEY REFERENCES hrkey_purchases(id) ON DELETE CASCADE,
  company_id TEXT,
  referee_user_id TEXT NOT NULL,
  reference_package_url TEXT,
  unlock_status TEXT NOT NULL DEFAULT 'unlocked',
  unlocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hrkey_refund_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES hrkey_purchases(id) ON DELETE CASCADE,
  requester_user_id TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  resolved_by_user_id TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hrkey_company_favorites (
  company_id TEXT NOT NULL,
  referee_user_id TEXT NOT NULL,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, referee_user_id)
);

CREATE INDEX IF NOT EXISTS idx_hrkey_purchases_buyer_created
  ON hrkey_purchases (buyer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hrkey_purchases_company_created
  ON hrkey_purchases (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hrkey_ledger_user_created
  ON hrkey_credit_ledger (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hrkey_refund_disputes_status_created
  ON hrkey_refund_disputes (status, created_at DESC);

CREATE OR REPLACE VIEW hrkey_marketplace_dashboard_v1 AS
SELECT
  DATE_TRUNC('day', p.created_at) AS day,
  COUNT(*) AS purchase_count,
  SUM(p.amount_total) AS gross_revenue,
  SUM(p.referee_share_amount) AS referee_payout,
  SUM(p.hrkey_share_amount) AS hrkey_revenue,
  SUM(CASE WHEN p.status = 'refunded' THEN 1 ELSE 0 END) AS refund_count
FROM hrkey_purchases p
GROUP BY 1
ORDER BY 1 DESC;
