-- ============================================================================
-- HIBERNATION PACKAGE: copied verbatim (no content changes) for restorability.
-- Original source: sql/027_rlusd_withdrawal_idempotency_hardening.sql
-- See supabase/MIGRATION_MANIFEST.md for ordering rationale and known conflicts.
-- ============================================================================

-- ==========================================================================
-- PR-15 hardening: idempotency + payload fingerprint for withdrawal creates
-- ==========================================================================

ALTER TABLE rlusd_withdrawal_requests
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS payload_fingerprint TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_rlusd_withdrawal_requests_user_idempotency
  ON rlusd_withdrawal_requests(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rlusd_withdrawal_requests_payload_fingerprint
  ON rlusd_withdrawal_requests(payload_fingerprint)
  WHERE payload_fingerprint IS NOT NULL;
