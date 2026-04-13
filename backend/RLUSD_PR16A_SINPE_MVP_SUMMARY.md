# PR16A - SINPE Móvil MVP rail (Costa Rica) sobre arquitectura neutral

## Qué se implementó
- Se agregó soporte de payout rail/provider neutral en `rlusd_withdrawal_requests`.
- Se modeló `sinpe_mobile` como primer rail real del MVP con provider `manual_sinpe_cr`.
- El flujo de `process` ahora ejecuta adapter de rail y deja el payout en `pending_manual_execution`.
- `complete` y `fail` siguen siendo acciones operativas explícitas (no auto-complete).

## Alcance MVP CR
- Costa Rica / SINPE Móvil es el **primer rail operativo** por facilidad del MVP.
- El diseño queda preparado para rails globales adicionales sin renombrar toda la arquitectura.

## Pendiente para PR16B/PR17
- Rail global / proveedores fiat internacionales.
- Wallet payouts automáticos.
- Webhooks y callbacks de proveedores.
- Reconciliación externa avanzada y automatizada.
