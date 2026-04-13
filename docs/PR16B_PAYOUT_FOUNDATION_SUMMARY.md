# PR16B – Global payout rail foundation + reconciliation base

## Provider abstraction
- `backend/services/rlusdPayoutExecutor.service.js` now resolves adapters by `(payout_rail, payout_provider)` using a registry map.
- Existing SINPE MVP route (`sinpe_mobile:manual_sinpe_cr`) is unchanged.
- Added mock global adapter (`bank:mock_global_fiat`) to simulate async provider behavior and webhook completion/failure callbacks.
- Provider execution responses are normalized by `backend/services/payoutAdapters/normalizePayoutResponse.js` so service logic can handle providers consistently.

## Payout event model
- Added migration `sql/029_rlusd_payout_events_and_audit_columns.sql`.
- New `rlusd_payout_events` table stores:
  - `payout_request_id`
  - `event_type`
  - `payout_rail`
  - `payout_provider`
  - `provider_status`
  - `external_id`
  - `payout_reference`
  - `payload_hash`
  - `payload_snapshot`
  - `operator_id`
  - `created_at`
- Added withdrawal audit columns:
  - `processed_by`
  - `completed_by`
  - `failed_by`
  - `last_transition_at`

## Webhook-ready flow
- Added callback endpoint: `POST /api/internal/rlusd/withdrawals/provider-callback`.
- Endpoint supports identifying request by `withdrawalRequestId` or by (`payoutProvider`, `externalId`).
- Callback processing performs strict transition guards and terminal-state dedupe.
- Duplicate callbacks after terminal status are no-op (no second ledger consume/release), while still writing reconciliation events.

## Residual risks before PR17
- Callback endpoint is internal-only by route convention but still needs stronger auth/signature hardening for production-grade providers.
- Provider status mapping is intentionally conservative and should be expanded per real provider semantics.
- Outbound callback retry orchestration is not implemented (mock provider only).
- PR17 will bind payout execution and callbacks to Trust Layer identity metadata. This PR intentionally does **not** store identity/KYC payloads.
