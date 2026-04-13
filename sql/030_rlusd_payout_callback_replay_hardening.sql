-- PR-22: callback replay/auth hardening metadata for payout events

ALTER TABLE rlusd_payout_events
  ADD COLUMN IF NOT EXISTS provider_event_id TEXT,
  ADD COLUMN IF NOT EXISTS callback_signature_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS ux_rlusd_payout_events_provider_event
  ON rlusd_payout_events(payout_provider, provider_event_id, event_type)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rlusd_payout_events_first_seen_at
  ON rlusd_payout_events(first_seen_at DESC);
