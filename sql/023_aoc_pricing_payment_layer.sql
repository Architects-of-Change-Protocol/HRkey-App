-- ============================================================================
-- PR-11: Pricing + Payment Layer (AOC simulated economy)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_balances (
  user_id TEXT PRIMARY KEY,
  aoc_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_balances_updated_at ON user_balances(updated_at DESC);

CREATE TABLE IF NOT EXISTS aoc_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  type TEXT NOT NULL CHECK (type IN ('access_payment')),
  reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aoc_transactions_from_user_id ON aoc_transactions(from_user_id);
CREATE INDEX IF NOT EXISTS idx_aoc_transactions_to_user_id ON aoc_transactions(to_user_id);
CREATE INDEX IF NOT EXISTS idx_aoc_transactions_reference_id ON aoc_transactions(reference_id);
CREATE INDEX IF NOT EXISTS idx_aoc_transactions_created_at ON aoc_transactions(created_at DESC);

-- Seed recruiter balances with 100 AOCs for active company signers.
INSERT INTO user_balances (user_id, aoc_balance, updated_at)
SELECT DISTINCT cs.user_id::text, 100, NOW()
FROM company_signers cs
WHERE cs.is_active = true
ON CONFLICT (user_id) DO NOTHING;

-- Ensure everyone else starts at 0 once they appear.
INSERT INTO user_balances (user_id, aoc_balance, updated_at)
SELECT u.id::text, 0, NOW()
FROM users u
ON CONFLICT (user_id) DO NOTHING;

-- Seed platform treasury wallet.
INSERT INTO user_balances (user_id, aoc_balance, updated_at)
VALUES ('hrkey_platform', 0, NOW())
ON CONFLICT (user_id) DO NOTHING;
