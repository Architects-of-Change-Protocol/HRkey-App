# Auditoría de Deuda Técnica — HRkey-App

**Fecha:** 2026-07-13 · **Alcance:** repo completo (frontend `HRkey/`, backend Express, contratos, ML, docs, config)
**Método:** análisis estático + diff binario de duplicados + `madge` (dependencias circulares) + verificación de claims documentales contra el código.

---

## Contexto arquitectónico que enmarca todo

- El `vercel.json` raíz construye **solo** `HRkey/package.json`. Todo el stack raíz "peerproof" (`pages/`, `components/`, `lib/`, `public/WebDapp/`) **no se despliega**: es residuo de la migración parcial.
- El backend Express (`backend/`, deploy Render) no tiene cableado de producción comprometido con el frontend desplegado (`apiClient.ts` cae a `localhost:3001`).
- No hay dependencias circulares confirmadas (madge: 0 ciclos en 234 archivos backend + 116 frontend). Es la única dimensión limpia.

---

## Lista priorizada de hallazgos

Escalas: 🔴 Alto · 🟠 Medio · 🟢 Bajo. Costo en días-persona aproximados.

| # | Hallazgo | Business Risk | Technical Risk | Valuation Impact | Costo | Beneficio |
|---|----------|:---:|:---:|:---:|:---:|:---:|
| **P0-1** | **Clave `service_role` de Supabase real servida al navegador** (`HRkey/public/promo-register.html:208`, mal etiquetada como anon key) y en texto plano en `SECURITY_REMEDIATION_GUIDE.md:32`. Acceso admin total a la DB saltando RLS para cualquier visitante. | 🔴 | 🔴 | 🔴 (deal-breaker en due diligence) | 0.5 | 🔴 |
| **P0-2** | **62 de 95 test files del backend son invisibles para `npm test`**: `jest.config.cjs` raíz solo matchea `backend/__tests__/`, no `backend/tests/` — donde viven TODOS los tests de auth (3), permisos/IDOR (12), Stripe (2), controllers (9), services (23), integración (10). Solo corren vía un workflow separado. | 🔴 | 🔴 | 🔴 | 0.5 | 🔴 |
| **P0-3** | **Cobertura de pagos ficticia**: `stripe.webhook.test.js` tiene los bloques principales en `test.skip` y 14 asserts `expect(true).toBe(true)` en el proyecto; sus comentarios describen un handler que ya no existe. Sin test directo: `webhookService.js`, `billingController.js`, `payments.controller.ts`, `payment-processor.ts`. | 🔴 | 🔴 | 🔴 | 3–5 | 🔴 |
| **P1-1** | **Código muerto masivo**: landing triplicado (141 archivos byte-idénticos, ~24 MB solo en `deprecated/`), app raíz "peerproof" completa sin desplegar, 13 archivos `.bak/.backup/.old`, 11 archivos vacíos (controllers/middleware stub de 0 bytes), 8 copias de `auth.html`, `HRkey/HRkey/` anidado, 6 scripts de deploy sin referencias, `rebrand-to-hrkey.sh`, dirs `open/`/`closed/` vacíos. | 🟠 (los HTML muertos contienen las claves del P0-1) | 🟠 | 🔴 (primera impresión en cualquier auditoría de código) | 1–2 | 🔴 |
| **P1-2** | **6 configs de hardhat en conflicto** + env vars desalineadas: la config activa lee `DEPLOYER_PRIVATE_KEY`/`BASE_SEPOLIA_RPC_URL` pero `.env.payment-rail.example` documenta `PRIVATE_KEY`/`BASE_SEPOLIA_RPC` → deploys con cuentas vacías en silencio. `hardhat.config-Sofia.js` es un shell script guardado como config. `@nomicfoundation/hardhat-verify` importado pero ausente de `package.json`. | 🟠 | 🔴 | 🟠 | 0.5–1 | 🔴 |
| **P1-3** | **Stripe implementado 3 veces** sin código compartido: `pages/api/` (muerto), `HRkey/api/` (vivo), `backend/` (vivo). Además check de origen débil en `HRkey/api/_lib/stripe.js:19` (`origin.includes('hrkey')` → `hrkey.evil.com` pasa). | 🔴 (dinero) | 🔴 | 🟠 | 3–4 | 🔴 |
| **P1-4** | **Documentación falsa**: ~20 MDs de reporte en la raíz que se contradicen entre sí (`PRODUCTION_READINESS_ANALYSIS.md` afirma "0 tests"; `TEST_EXECUTION_REPORT.md` reporta 518 y cita archivos inexistentes). El README no menciona `HRkey/` — la app real — ni una sola vez, y llama "main entry point" a un re-export de 9 líneas. | 🟠 (engaña a inversores y a nuevos devs por igual) | 🟠 | 🔴 | 1–2 | 🔴 |
| **P1-5** | **`backend/app.js` god-file**: 2.068 líneas, 125 rutas inline, webhook de Stripe con ~122 líneas de lógica de negocio en el bootstrap, helpers de dominio y wiring on-chain mezclados. | 🟠 | 🔴 | 🔴 | 4–6 | 🔴 |
| **P1-6** | **Sin capa de datos**: 68 archivos instancian su propio cliente Supabase con `getSupabaseClient()` copy-pasteado (14 controllers, 40 services, middleware, frontend). | 🟠 | 🔴 | 🟠 | 3–5 | 🟠 |
| **P2-1** | **Funciones enormes**: `createDataAccessRequest` ~263 líneas, `inviteSigner` ~264, y otras 7 funciones >100 líneas concentradas en `dataAccessController.js` (1.032 líneas), `signersController.js`, `referencesController.js`. | 🟢 | 🟠 | 🟠 | 3–4 | 🟠 |
| **P2-2** | **Hardcoding**: dirección de contrato `0xFE79...5DCF` en 8+ archivos, URL del proyecto Supabase como literal/fallback (incluido `onboarding/page.tsx` que cae a credenciales de producción hardcodeadas si falta el env), precios `$9.99` como literales en UI, RPC/chain IDs, `temp_auth_fix.js` con placeholder. Sin validación de env en runtime (todo es `process.env.X \|\| 'placeholder'`). | 🟠 | 🟠 | 🟠 | 1–2 | 🟠 |
| **P2-3** | **Endpoint de top-up mock montado en la app de producción** (`app.js:1337` → `topupWalletMock` acredita el ledger real), protegido solo por un check de `NODE_ENV`. | 🟠 | 🟠 | 🟠 | 0.5 | 🟠 |
| **P2-4** | **Naming inconsistente**: 24 controllers `x.controller.js` vs 16 `xController.js`; `walletController` Y `walletsController`; 4 controllers de "reference"; `hrScore`/`hrscore`/`hrkeyScore`; mezcla TS/JS/CJS/MJS; identificadores español/inglés en ~10+ archivos. | 🟢 | 🟠 | 🟠 | 2–3 | 🟠 |
| **P2-5** | **Tests faltantes en áreas críticas**: ML pipeline (13 archivos, 0 tests — el scoring del producto entero), 5 de 8 contratos sin tests (incluido `ReferencePaymentSplitter.sol`, crítico de pagos), 31 de 40 controllers sin test. | 🟠 | 🟠 | 🟠 | 5–8 | 🟠 |
| **P3-1** | **Módulos decorativos — decisión de producto**: backend Express sin wiring de producción comprometido, `protocol/anchor/` (solo lo usa un script huérfano), `heartbeat/` (solo en CODEOWNERS). Decidir: conectar, extraer o eliminar. | 🟠 | 🟢 | 🟠 | decisión + 1–3 | 🟠 |
| **P3-2** | **Higiene de config**: 2 `vercel.json` (el raíz mezcla `builds` legacy con Next), 3 scopes de tsconfig (el raíz excluye la app real y tiene `strict:false`), `SUPABASE_SERVICE_ROLE_KEY` vs `SUPABASE_SERVICE_KEY` entre `.env.example`s, imports dinámicos `await import()` ocultando el grafo de dependencias en services. | 🟢 | 🟠 | 🟢 | 1–2 | 🟠 |

---

## Orden óptimo de limpieza

El criterio: primero lo que sangra (secrets), después la red de seguridad (tests que corran de verdad), después las eliminaciones baratas que reducen la superficie de todo lo demás, y solo entonces los refactors estructurales — ya protegidos por tests. Naming y cobertura amplia al final, cuando la estructura ya no se mueve.

### Fase 0 — Hemorragia (día 1, no negociable)
1. **Rotar la clave `service_role` en Supabase ahora.** Eliminarla de `promo-register.html` y `SECURITY_REMEDIATION_GUIDE.md`; purgar del historial de git (`git filter-repo`). Mover anon key + URL a `NEXT_PUBLIC_*` y quitar los fallbacks hardcodeados de `onboarding/page.tsx`. *(P0-1, parte de P2-2)*

### Fase 1 — Red de seguridad (días 2–5)
2. Unificar la config de Jest para que `npm test` ejecute los 95 test files del backend (o hacer del config de `backend/` la única fuente y que la raíz delegue). Verificar en CI que auth/permisos/Stripe corren. *(P0-2)*
3. Des-skipear o reescribir los tests del webhook de Stripe contra el handler real (`app.js:1541`); eliminar los asserts `expect(true).toBe(true)`; añadir tests directos a `webhookService.js` y `billingController.js`. *(P0-3)*

### Fase 2 — Demolición (días 5–8; barata, alto impacto de valuation)
4. Borrar: `HRkey/public/deprecated/`, `public/WebDapp/` raíz, app raíz peerproof (`pages/`, `components/`, `lib/`, shims HTML raíz), todos los `.bak/.backup/.old`, archivos vacíos, `HRkey/HRkey/`, scripts huérfanos, `rebrand-to-hrkey.sh`, `open/`/`closed/`. Esto además elimina la mayoría de las copias de claves anon y una de las tres implementaciones de Stripe gratis. *(P1-1, reduce P1-3)*
5. Archivar los ~20 MDs de reporte en `docs/archive/` con nota de "snapshot histórico"; reescribir el README para describir `HRkey/` como app real y `backend/app.js` como entry point. *(P1-4)*

### Fase 3 — Una sola verdad en config (días 8–10)
6. Un solo `hardhat.config.ts`; borrar las otras 5 variantes; reconciliar nombres de env vars con los `.env.example`; añadir `@nomicfoundation/hardhat-verify` a deps; unificar `SUPABASE_SERVICE_ROLE_KEY` vs `SUPABASE_SERVICE_KEY`. *(P1-2, P3-2)*
7. Introducir validación de env en runtime (zod/envalid) que falle al boot; centralizar dirección de contrato, chain IDs y precios en un módulo de config. Arreglar el check de origen de `stripe.js`. Sacar `topup-mock` del build de producción. *(P2-2, P2-3, parte de P1-3)*

### Fase 4 — Refactor estructural (días 10–20; ya con tests corriendo)
8. Descomponer `backend/app.js`: routers por dominio, webhook a su controller/service, wiring on-chain a un módulo. *(P1-5)*
9. Capa de datos: un módulo cliente Supabase único + repositorios; migrar los 68 call-sites gradualmente (controllers primero). *(P1-6)*
10. Consolidar Stripe en una sola implementación compartida entre `HRkey/api/` y `backend/`. *(resto de P1-3)*
11. Partir las funciones >100 líneas de `dataAccessController`, `signersController`, `referencesController` — natural al migrarlas a la capa de datos. *(P2-1)*

### Fase 5 — Pulido y cobertura (días 20+, paralelizable)
12. Normalizar naming (una convención de controllers, fusionar `wallet`/`wallets` y los 4 controllers de reference, un solo casing para hrscore, migrar los JS sueltos del frontend a TS). *(P2-4)*
13. Cobertura nueva: `ReferencePaymentSplitter.sol` y demás contratos, ML pipeline, controllers críticos. *(P2-5)*
14. Decisión de producto sobre backend Express / `protocol/anchor` / `heartbeat`: conectar o eliminar — un módulo decorativo resta valuation, no suma. *(P3-1)*

---

## Resumen ejecutivo para valuation

- **Riesgo existencial hoy:** una clave admin de DB pública (P0-1) y la ilusión de cobertura de pagos (P0-2/P0-3). Cualquier due diligence técnica seria los encuentra en horas.
- **La ganancia más barata:** las Fases 0–2 cuestan ~8 días y transforman la primera impresión del repo (de "migración abandonada a medias" a "codebase curado"), eliminando ~30 MB de duplicados, ~5.700 líneas muertas y 20 documentos que se contradicen.
- **La ganancia más profunda:** Fases 3–4 convierten el backend de un monolito de 2.068 líneas con 68 conexiones ad-hoc a DB en algo mantenible y auditable — eso es lo que un comprador técnico paga.
