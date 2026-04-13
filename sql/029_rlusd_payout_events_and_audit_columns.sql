-- PR-16B: Global payout rail foundation + reconciliation base

CREATE TABLE IF NOT EXISTS rlusd_payout_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_request_id UUID NOT NULL REFERENCES rlusd_withdrawal_requests(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payout_rail TEXT,
  payout_provider TEXT,
  provider_status TEXT,
  external_id TEXT,
  payout_reference TEXT,
  payload_hash TEXT,
  payload_snapshot JSONB,
  operator_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rlusd_payout_events_request_id ON rlusd_payout_events(payout_request_id);
CREATE INDEX IF NOT EXISTS idx_rlusd_payout_events_event_type ON rlusd_payout_events(event_type);
CREATE INDEX IF NOT EXISTS idx_rlusd_payout_events_provider_external ON rlusd_payout_events(payout_provider, external_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_rlusd_payout_events_payload_hash
  ON rlusd_payout_events(payout_request_id, event_type, payload_hash);

ALTER TABLE rlusd_withdrawal_requests
  ADD COLUMN IF NOT EXISTS processed_by UUID,
  ADD COLUMN IF NOT EXISTS completed_by UUID,
  ADD COLUMN IF NOT EXISTS failed_by UUID,
  ADD COLUMN IF NOT EXISTS last_transition_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_rlusd_withdrawal_requests_last_transition_at
  ON rlusd_withdrawal_requests(last_transition_at DESC);
