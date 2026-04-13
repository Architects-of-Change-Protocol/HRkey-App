# PR22 – Payout hardening (multi-provider + callback safety)

## Riesgos cerrados
- Bloqueo fail-closed de adapters no productivos en runtime productivo.
- Validación de autenticidad de callbacks (provider, HMAC, timestamp).
- Protección de replay exacto/conflictivo usando `provider_event_id` + hash canónico.
- Endurecimiento de transición con compare-and-set para evitar carreras de estado.
- Rate limit básico para endpoint interno de callback.

## Env guard de adapters
- Helper central: `backend/services/payoutAdapters/adapterRuntimeGuard.js`.
- Regla:
  - `NODE_ENV=production`: solo adapters con `environmentClass=production`.
  - Entornos no productivos: adapters `mock/sandbox/test` requieren opt-in explícito.
- Variable:
  - `PAYOUT_ALLOW_NON_PROD_ADAPTERS=false` (default seguro).

## Validación de callback (firma/timestamp/replay)
- Helper central: `backend/services/payoutCallbacks.security.js`.
- Headers requeridos:
  - `x-payout-provider`
  - `x-payout-event-id`
  - `x-payout-timestamp`
  - `x-payout-signature` (si el provider lo exige)
- Reglas:
  - provider conocido
  - secret configurado por provider cuando aplica
  - timestamp dentro de ventana (`PAYOUT_CALLBACK_MAX_SKEW_SECONDS`, default 300)
  - firma HMAC SHA-256 válida con comparación constant-time
- Replay:
  - exacto: idempotente seguro (no side effects duplicados)
  - conflictivo: rechazo 409

## Canonical payload hashing
- Helper central: `backend/utils/canonicalPayload.js`.
- Objetos: orden estable recursivo de keys.
- Arrays: preservan orden original (no reordenamiento).
- Se usa para:
  - `payload_hash` de eventos payout
  - verificación de replay de callbacks
  - base canónica para firma

## Doble transición / doble side effect
- `markWithdrawalProcessing` usa compare-and-set por `status` esperado.
- Si hay carrera concurrente, retorna conflicto limpio (`WITHDRAWAL_CONCURRENT_TRANSITION`) o estado refrescado.
- `complete/fail` mantienen lock de balance existente para evitar doble consumo/liberación de ledger.
- Callback duplicate/replay no vuelve a consumir/liberar fondos.

## Variables nuevas
- `PAYOUT_ALLOW_NON_PROD_ADAPTERS=false`
- `PAYOUT_CALLBACK_MAX_SKEW_SECONDS=300`
- `PAYOUT_CALLBACK_SECRET_MOCK_GLOBAL_FIAT=...`
- `PAYOUT_CALLBACK_RATE_LIMIT_WINDOW_MS=60000`
- `PAYOUT_CALLBACK_RATE_LIMIT_MAX=60`
- `PAYOUT_CALLBACK_RATE_LIMIT_ENABLED=true`

## Límites / próximos pasos
- El rate limit es in-memory (no distribuido).
- Faltaría rotación de secrets y versionado de firma por provider real.
- Faltaría canal dedicado para dead-letter/retry orchestration de callbacks externos.
