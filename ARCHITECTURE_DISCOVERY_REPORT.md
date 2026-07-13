# HRKey — Auditoría Arquitectónica de Descubrimiento (Software Archaeology)

**Fecha:** 2026-07-13
**Alcance:** repositorio completo `Architects-of-Change-Protocol/HRkey-App` (rama `main`, HEAD `4e7d35e`)
**Método:** recorrido exhaustivo del código (sin modificar nada), extracción mecánica de todas las llamadas Supabase (`.from()` / `.rpc()`), reconstrucción de los 38 archivos SQL, análisis de imports/consumidores por módulo, datación por git y por headers de documentos.
**Regla:** ninguna afirmación sin evidencia (archivo, línea o conteo real).

---

## 0. Resumen ejecutivo

HRKey no es una aplicación: es un **yacimiento con 5 generaciones superpuestas** del mismo producto, más un enjambre de módulos experimentales construidos y nunca cableados.

Las 5 generaciones (datadas por documentos, git y artefactos):

| Gen | Época | Nombre / paradigma | Estado | Evidencia |
|---|---|---|---|---|
| G1 | ~Sep–Oct 2025 | **PeerProof** (hackathon OnChainFest, dapp on-chain en Base) | Muerta (restos) | `cache/compile-cache.json` con rutas Windows `C:\Users\sofim\...\OnChainFest\PeerProof`, `contracts/PeerProofRegistry.sol`, `public/WebDapp/temp1.html` (título "PeerProof"), `rebrand-to-hrkey.sh` |
| G2 | Nov 2025 | **Economía token HRK** (Base L2 + Solana, staking, slashing, revenue share) | Deprecada explícitamente | `docs/deprecated/tokenomics/HRK_TOKENOMICS_WHITEPAPER.md` (Nov 2025), `contracts/HRKToken.sol`, `contracts/deprecated/HRKeyRevenueShare.sol`, `public/WebDapp/deprecated/earnings-dashboard.html` |
| G3 | Nov 2025 – Feb 2026 | **WebDapp estático + backend Express + Supabase** (identity, companies, data-access, HRScore ML, analytics) | Parcialmente viva (el backend sobrevive; el frontend estático fue reemplazado) | `public/WebDapp/*.html` (28 archivos, credenciales anon hardcodeadas), `backend/app.js`, informes raíz fechados dic-2025 |
| G4 | Ene–Abr 2026 | **Rieles de dinero**: Stripe ($0.50 → $9.99 lifetime → $9.99/año), "Payment Rail" RLUSD on-chain, economía AOC + ledger RLUSD interno + payout SINPE | Mixto: AOC/RLUSD/SINPE vivo; rail on-chain muerto; 3 Stripes fragmentados | `sql/023–028`, `backend/services/payments/*.ts` (huérfano), `pages/api/*`, `HRkey/api/*` |
| G5 | Abr 2026 (PRs #298–#321) | **HRKey V2**: onboarding candidato, dashboards, marketplace de referencias, Trust Data Model v1, Transaction Engine v1 | Frente activo de desarrollo (parcialmente mock) | `HRkey/src/app/v2/*`, `sql/029–031`, commits del 24–26 abr 2026 |

**Lo que realmente ejecuta en producción hoy:**
- Frontend: la app Next.js anidada **`HRkey/`** en Vercel (`vercel.json` raíz construye `HRkey/package.json`; dominio `hrkey.xyz` según `HRkey/PROJECT_LOG.md`).
- Backend: **`backend/app.js`** (Express monolítico de 2.069 líneas) en Render (`backend/render.yaml`, `https://hrkey-backend.onrender.com`).
- Base de datos: Supabase (proyecto `wrervcydgdrlcndtjboy`, URL hardcodeada como fallback en `backend/app.js:180` y en `public/WebDapp/auth.html`).

**El desajuste 34 tablas reales vs 67 referenciadas se explica así** (ver Fase 3): el código referencia tablas de las 5 generaciones a la vez; ~20 tablas referenciadas solo existen en migraciones nunca aplicadas o en esquemas paralelos en conflicto (4 ubicaciones SQL compiten: `sql/`, `backend/migrations/`, `backend/supabase/`, `database/migrations/`, más `backend/schema.sql` en dialecto MySQL); y varias tablas vivas (`reference_invites`, `candidate_prices`, `user_plans`, la forma base de `users` y `references`) **no tienen CREATE TABLE en ningún sitio del repo** — su esquema real solo existe en Supabase.

---

## FASE 1 — Arquitectura real

### 1.1 Diagrama textual (solo lo que ejecuta)

```
                         ┌──────────────────────────────────────────────┐
                         │  VERCEL  (vercel.json raíz → HRkey/)         │
                         │                                              │
   hrkey.xyz ──────────► │  HRkey/public/landing/*  (marketing estático)│
                         │  HRkey/src/app/*         (Next 15 App Router)│
                         │    ├─ /v2/*        (G5: onboarding, dashboards, trust admin)
                         │    ├─ /company/*, /candidate/*, /recruiter/* (G3/G4)
                         │    ├─ /onboarding, /cv/builder, /u/[slug], /p/[id]
                         │    └─ /onchain-test, /test, /dev/* (sandbox)
                         │  HRkey/api/*  (serverless: Stripe checkout,  │
                         │                webhook-stub, kpi-suggestions)│
                         └──────┬───────────────────────┬───────────────┘
                                │ apiClient.ts (JWT)    │ supabaseClient.js (anon)
                                ▼                       ▼
        ┌───────────────────────────────┐   ┌──────────────────────────────┐
        │  RENDER: backend/server.js    │   │  SUPABASE                    │
        │  → backend/app.js (monolito,  │   │  (wrervcydgdrlcndtjboy)      │
        │    2.069 líneas, TODAS las    │◄──┤  Auth (JWT) + Postgres + RLS │
        │    rutas inline, controllers  │──►│  + Storage (cv-uploads)      │
        │    lazy-loaded vía Proxy)     │   │  ~34 tablas reales           │
        │                               │   └──────────────────────────────┘
        │  Dominios servidos:           │
        │   references / invites / RVL  │        ┌──────────────────────┐
        │   reference-access + AOC auth │        │ Stripe (3 clientes!) │
        │   reputation graph + insights │◄──────►│ pages/api (G4a)      │
        │   HRScore ML + heurístico     │        │ HRkey/api (G4b)      │
        │   AOC credits→RLUSD→SINPE     │        │ backend/app.js (G4c) │
        │   transaction engine v1       │        └──────────────────────┘
        │   companies / signers / audit │
        │   analytics events / admin    │        ┌──────────────────────┐
        │   Lou agent / cv-parse / AI   │◄──────►│ OpenAI (validation,  │
        └──────────────┬────────────────┘        │ Lou, aiRefine)       │
                       │                         │ Resend (emails)      │
                       │ ethers v6               └──────────────────────┘
                       ▼
        ┌───────────────────────────────┐
        │  BASE SEPOLIA (testnet)       │   ⚠ NINGÚN contrato desplegado.
        │  HRKReferenceProof (esperado  │   Endpoints /api/reference-pack/*
        │  vía PROOF_CONTRACT_ADDRESS)  │   fallan cerrado sin la dirección.
        └───────────────────────────────┘
```

### 1.2 Capas presentes en el repo pero FUERA del runtime

| Capa | Ubicación | Estado | Evidencia |
|---|---|---|---|
| Frontend legacy pages-router | `pages/`, `components/`, `lib/` (raíz) | No desplegado (vercel.json apunta a `HRkey/`) | `pages/index.tsx` solo redirige a `/WebDapp/index.html`; `components/ReferralDashboard.tsx` sin ningún importador |
| WebDapp estático | `public/WebDapp/` (28 HTML) + copia en `HRkey/public/deprecated/WebDapp/` | Legacy; excluido por `HRkey/middleware.ts` | Credenciales Supabase anon hardcodeadas en `auth.html`/`app.html`; llama al backend en `hrkey.xyz`/`localhost:3001` |
| Payment Rail on-chain | `backend/services/payments/*.ts`, `backend/controllers/payments.controller.ts`, `staking.controller.ts`, `backend/pricing/pricingEngine.ts` | **Inejecutable**: son TypeScript y el backend arranca con `node server.js` sin build; nunca importados por `app.js`; importan `abis/ReferencePaymentSplitter.json` que **no existe** | grep de imports en `app.js`: cero |
| Contratos / Hardhat | `contracts/` (9 contratos), 6 configs hardhat, `artifacts/` | Solo `PeerProofRegistry` compiló alguna vez; **cero direcciones de despliegue** en todo el repo | `.env.payment-rail.example` con campos vacíos y `0x000…0`; `deployment-*.json` inexistentes; conflicto OZ v4/v5 + HH2/HH3 documentado en `ANCHOR_LAYER_IMPLEMENTATION.md` |
| Protocolo AOC anchor | `protocol/anchor/*.ts` + `contracts/ReferenceAnchor.sol` | CLI-only (`scripts/anchorReference.ts` es el único consumidor) | grep de imports de `protocol/` fuera del script: cero |
| Motor de correlación Python | `analytics/proof_of_correlation/` (FastAPI + sklearn) | Muerto: nadie llama su API, no hay deploy Python en Vercel/Render/CI | único rastro: allowlist CORS dev `localhost:8000` en `backend/app.js:512` |
| ML training | `ml/` | Semi-vivo: **solo** `ml/output/hrkey_model_config_global.json` se consume (`backend/hrkeyScoreService.js:39`); los `.pkl`, CSVs y scripts de correlación no tienen consumidor | R² real del artefacto: 0.268 (el doc `ML_MODEL_TRAINING_SUMMARY.md` dice 0.50 — desactualizado) |
| Heartbeat | `heartbeat/heartbeat.mjs` | Utilidad viva standalone (keep-alive de Supabase free tier) | inserta en tabla `heartbeat` con service-role |

### 1.3 Cifras del repositorio

- LOC por área (código): `backend/` 60.096 · `HRkey/src` 16.215 · `sql/` 5.899 · `ml/` 4.580 · `analytics/` 2.908 · `contracts/` 2.598 · `HRkey/api` 616 · `pages/+components/+lib/` 223 · `protocol/` 244 · `database/` 451.
- 67 nombres de tabla distintos referenciados por código JS/TS (66 reales + 1 artefacto de test `x`).
- 10 RPCs invocadas desde código; 26+ funciones SQL definidas.
- 38 archivos SQL en 6 ubicaciones distintas.
- Historia git visible: 50 commits (2026-03-31 → 2026-05-12); todo lo anterior fue aplastado en el import inicial (los PRs llegan hasta #321 pero solo hay 50 commits).

---

## FASE 2 — Bounded Contexts

Clasificación de todo el proyecto en 17 bounded contexts. Cohesión/acoplamiento evaluados sobre el código real.

### BC-1 · Identity & Access (Identidad y autenticación)
- **Responsabilidad:** autenticación (Supabase Auth JWT), roles, verificación de identidad, autorización por rol.
- **Entidades:** User (con rol candidate/company/superadmin), sesión.
- **Servicios/código:** `backend/middleware/auth.js` (requireAuth/requireSuperadmin/requireCompanySigner/requireSelfOrSuperadmin…), `backend/controllers/identityController.js`, `HRkey/src/lib/auth/auth-service.ts`, `HRkey/src/lib/auth/profile-service.ts`.
- **Tablas:** `users` (52 referencias — la tabla más usada del sistema), `company_signers` (para rol signer).
- **Dependencias:** Supabase Auth; AOC runtime client para pre-checks (`identityController.js`).
- **Cohesión:** alta (middleware bien factorizado). **Acoplamiento:** altísimo hacia fuera — `users` es el hub de todo el sistema (referenciada por 9 áreas distintas del código, incluidos pages/api legacy y WebDapp estático).

### BC-2 · Organizations (Empresas y firmantes)
- **Responsabilidad:** empresas, firmantes autorizados (signers), invitaciones de signers, verificación de empresa.
- **Servicios:** `backend/controllers/companyController.js`, `signersController.js`; rutas `app.js:1685–1710`.
- **Tablas:** `companies` (sql/001), `company_signers` (29 refs, sql/001).
- **Dependencias:** Identity, Audit (`audit_logs`), Analytics (logEvent COMPANY_CREATED/SIGNER_INVITED).
- **Cohesión:** alta. **Acoplamiento:** medio (limpio hacia Identity/Audit).

### BC-3 · Profiles (Perfiles de candidato) — ⚠ CONTEXTO DUPLICADO
Existen **dos familias de esquema en paralelo**, cada una con su propia UI:
- **Familia v2:** tablas `profiles`, `profile_experiences`, `profile_education` (sql/021) — usadas por `HRkey/src/lib/storage/supabase-storage-provider.ts`, onboarding v2 y `/onboarding` legacy.
- **Familia legacy:** columnas en `users` + `candidate_experiences`, `candidate_education`, `candidate_skills`, `candidate_certifications` (sql/011_cv) — usadas por `HRkey/src/app/cv/builder/page.tsx` (688 líneas) y `u/[slug]`.
- **Cohesión:** media. **Acoplamiento:** el split de esquema duplica lógica de persistencia y garantiza divergencia de datos. Es la deuda de dominio más peligrosa del frontend.

### BC-4 · References (Motor de referencias) — **EL NÚCLEO**
- **Responsabilidad:** ciclo de vida completo de la referencia profesional verificada: solicitud → invitación con token → respuesta del referee → validación (RVL) → pack canónico.
- **Servicios:** `backend/services/references.service.js` (23 refs a `references`, el servicio más grande), `refereeIdentity.service.js`, `referencePack.service.js`, `backend/services/validation/*` (RVL: fraude, consistencia, embeddings OpenAI), `HRkey/src/lib/v2/reference-requests-service.ts`.
- **RPCs:** `get_invite_by_token`, `submit_reference_by_token` (endurecidas 3 veces: sql/013→014→015, tras el incidente "split-brain" de `INVITE_SECURITY_REMEDIATION_REPORT.md`).
- **Tablas:** `references` (44 refs — sin CREATE base en el repo; solo ALTERs en sql/007/010/013 y un CREATE tardío en sql/030), `reference_invites` (15 refs — **sin CREATE en ninguna parte**), `referee_identities` (sql/020).
- **Pantallas:** `/v2/candidate/references/*`, `/references/respond/[token]`, `/invites`, `/references`.
- **Cohesión:** alta. **Acoplamiento:** es el centro de gravedad — Scoring, Reputation, Marketplace, Access y Anchoring dependen de él.

### BC-5 · Reference Access & Consent (Acceso, permisos y consentimiento)
- **Responsabilidad:** quién puede ver el pack de referencias de un candidato: grants explícitos, capability tokens, autorización AOC, cobro por acceso (402 PAYMENT_REQUIRED).
- **Servicios:** `backend/middleware/referenceAccess.js` (la pieza más sofisticada del backend: owner → superadmin → capability token → grant → autorización AOC), `referenceAccess.service.js`, `capabilityToken.service.js`, `accessDecisionAudit.service.js`, `aocRuntime.service.js`, `utils/consentManager.js`.
- **Tablas:** `reference_pack_access_grants` (sql/016), `capability_grants` (sql/017), `consents` + `audit_events` (sql/011), `data_access_requests`.
- **Cohesión:** muy alta. **Acoplamiento:** medio y bien dirigido (middleware reutilizado por 8+ endpoints de insights). **Es la capability más original y extraíble del sistema.**

### BC-6 · Reputation & Trust (Reputación, grafo y trust model)
- **Responsabilidad:** grafo de reputación (nodos/aristas extraídos de referencias), propagación de confianza, ponderación, y el nuevo Trust Data Model v1 (score, badges, moderación).
- **Servicios:** `reputationGraph.service.js`, `reputationPropagation.service.js`, `reputationTrustWeighting.service.js`, `graphRelationshipExtraction.service.js` (import dinámico desde references.service), `HRkey/src/lib/v2/trust-dashboard-service.ts`.
- **Tablas:** `reputation_graph_nodes/edges` (sql/018–019); trust v1: `referee_profiles`, `trust_events`, `trust_badges`, `user_trust_badges`, `disputes_flags`, `usefulness_reviews`, `reference_purchases`, `trust_moderation_actions` + vistas `referee_dashboard_metrics_v1`, `company_dashboard_metrics_v1`, `trust_moderation_queue_v1` (sql/030–031, abr 2026).
- **RPCs:** `recalculate_trust_score`, `admin_moderate_trust`, `log_trust_event_and_recalculate` (triggers).
- **Pantallas:** `/v2/referee/dashboard` (híbrida: métricas reales + arrays mock), `/v2/admin/trust` (viva).
- **Cohesión:** alta por subcapa, pero **hay dos modelos de reputación coexistiendo** (grafo 2026-03 vs trust model 2026-04) sin puente entre ellos.

### BC-7 · Scoring (HRScore) — ⚠ TRES IMPLEMENTACIONES
- (a) **ML Ridge:** `backend/hrkeyScoreService.js` lee `ml/output/hrkey_model_config_global.json` (entrenado con datos 100% sintéticos, R²=0.268) sobre `kpi_observations` → endpoints `/api/hrkey-score*`. **Único consumidor: el WebDapp legacy** (`public/WebDapp/app.html:1225`).
- (b) **Heurístico:** `backend/services/hrScore.service.js` (pesos fijos: teamImpact 0.30, reliability 0.25…) vía `scoringPipeline.service.js` → `/api/candidates/:id/evaluation` → **esto es lo que la app Next.js realmente muestra** (`HRkey/src/app/candidate/evaluation/page.tsx:166`).
- (c) **Capa de persistencia:** `backend/services/hrscore/` (snapshots, history, autoTrigger) sobre `hrkey_scores`, `hrscore_snapshots` (con **migración duplicada**: `backend/migrations/20250115_*` vs `20250902_*`).
- **Cohesión:** baja a nivel de contexto — el score "oficial" del producto no es el score ML. **Acoplamiento:** medio.

### BC-8 · Recruiter Intelligence (Insights de candidato)
- **Responsabilidad:** role-fit, predicción de desempeño, trayectoria, benchmark, calidad de referencia, insights de grafo para recruiters.
- **Servicios:** `roleFit.service.js`, `performancePrediction.service.js`, `careerTrajectory.service.js`, `candidateBenchmark.service.js`, `referenceQuality.service.js`, `recruiterGraphInsights.service.js` — todos leen `references` y pasan por `requireReferenceAccessPermission`.
- **Frontend:** `HRkey/src/lib/recruiter-intelligence/useTalentIntelligenceDashboard.ts` (fan-out a 8 endpoints), pantalla `/recruiter/talent-intelligence/[candidateId]`.
- **Cohesión:** alta. **Acoplamiento:** correcto (solo References + Access).

### BC-9 · Marketplace / Monetización de referencias — ⚠ DOS MOTORES
- (a) **Transaction Engine v1 (backend, PRs #316–317):** `hrkeyTransactionEngine.service.js` + sql/029 — créditos HRKCR, split 80/20 referee/HRKey, escrow, refunds, favoritos. Rutas `/api/hrkey/*` cableadas (`app.js:1336–1348`). **Ningún fetch desde `HRkey/src`** — sin integración frontend.
- (b) **Marketplace v2 (frontend):** `HRkey/src/lib/v2/marketplace-engine.ts` — **localStorage puro**, split 70/30 (¡ratio distinto!), 210 créditos por defecto. Usado por dashboards v2 de company y referee.
- (c) **Data-access pay-per-query (G3):** `dataAccessController.js` sobre `data_access_requests`/`data_access_pricing` — vivo, pero su esquema vive en `sql/deprecated/002` (migración marcada DEPRECATED que el código de producción sigue usando).
- **Cohesión:** baja. **Acoplamiento:** el mock localStorage divergente garantiza bugs de conciliación cuando se integre.

### BC-10 · Payments Fiat (Stripe) — ⚠ TRES CLIENTES
- (a) `pages/api/checkout|webhook|portal.ts` — suscripción anual $9.99 + referidos (apiVersion 2023-10-16, escribe `users.subscription_expires_at`).
- (b) `HRkey/api/checkout/session.js` + `stripe/webhook.js` — multi-plan lifetime/pro/annual con promos (apiVersion 2024-06-20); **el webhook es un stub que solo hace console.log** ("TODO: Reemplaza por tu persistencia real").
- (c) `backend/app.js:1510,1541` — PaymentIntents + webhook idempotente (`stripe_events`) que escribe `users.plan` y `revenue_transactions` (tabla definida solo en la migración deprecada 002).
- Más un cuarto Stripe **huérfano**: `backend/controllers/billingController.js` (nunca cableado) sobre `products`/`checkout_sessions`/`user_feature_flags`.
- **Cohesión:** nula como contexto. **Riesgo real:** el flujo de compra de la landing (b) cobra dinero y no persiste nada.

### BC-11 · Wallet & Crypto Economy (AOC / RLUSD / payouts)
- **Responsabilidad:** wallets custodiales, créditos AOC, conversión AOC→RLUSD, ledger interno RLUSD, retiros con rail SINPE Móvil (Costa Rica, manual).
- **Servicios:** creación de wallet custodial inline en `app.js:408–492` (ethers `Wallet.createRandom()` + clave privada AES en DB — **riesgo de custodia**), `aocPayment.service.js`, `aocEconomy.controller.js`, `rlusdConversion/Ledger/Withdrawal.service.js` (con state machine, locking e idempotencia — sql/026–028), `rlusdPayoutExecutor.service.js` + `payoutAdapters/sinpeMobileManual.adapter.js`.
- **Tablas:** `user_wallets`, `user_balances`, `aoc_transactions`, `aoc_conversion_requests`, `rlusd_balances`, `rlusd_transactions`, `rlusd_withdrawal_requests`.
- **Frontend:** `components/aoc-wallet/*` en `/candidate/evaluation`.
- **Duplicado grave:** `backend/Wallet_Creation_Base_SDK.js` (425 líneas) y `backend/wallet-creation-backend.js` (595 líneas) son dos versiones standalone de la misma creación de wallets, ninguna importada por `app.js`.
- **Cohesión:** alta en la subcapa RLUSD (la mejor ingeniería del repo: FSM + locking + idempotencia). **Acoplamiento:** medio.

### BC-12 · Blockchain Anchoring — ⚠ DOS MECANISMOS RIVALES, CERO DESPLIEGUES
- (a) `backend/app.js` → contrato `HRKReferenceProof` (`recordReferencePackProof`) — endpoints `/api/reference-pack/*` cableados pero `PROOF_CONTRACT_ADDRESS` sin definir y el contrato jamás compilado.
- (b) `protocol/anchor/*` + `ReferenceAnchor.sol` (hito de grant "AOC Protocol", `ANCHOR_LAYER_IMPLEMENTATION.md` 2026-02-20) — CLI-only, con tests, build bloqueado por conflicto OZ v4/v5.
- Tabla `reference_anchors` solo referenciada por `protocol/` y `scripts/`.
- **Veredicto:** aspiracional. El único web3 operativo real es: verificación de firmas (`walletsController` → en realidad la versión viva es inline), wallets custodiales, y el botón de prueba `/onchain-test` en Base Sepolia.

### BC-13 · Analytics
- **Responsabilidad:** tracking de eventos server-side (26 tipos, 6 categorías) y métricas agregadas.
- **Servicios:** `backend/services/analytics/*` (eventTracker + candidateMetrics + companyMetrics + conversionFunnel + demandTrends). `logEvent` invocado desde 8 controllers/servicios reales.
- **Tablas:** `analytics_events` (sql/008 — **y una segunda definición en conflicto** en `database/migrations/create_payment_tables.sql`) + 6 vistas.
- **Estado:** recolección viva; consumo solo vía endpoints superadmin; **el dashboard UI nunca se construyó** (el propio `ANALYTICS_IMPLEMENTATION_SUMMARY.md` lo admite). Cero analytics client-side en la app Next.js (solo `gtag` huérfano en HTML deprecado).

### BC-14 · ML / Data Science
- `analytics/proof_of_correlation/` (Python/FastAPI, 6 tablas propias en sql/003) — **muerto**: cero consumidores, cero deploy.
- `ml/` — pipeline de entrenamiento cuyo único artefacto vivo es el JSON de configuración del modelo (§BC-7a). Datos 100% sintéticos.
- Marcados "crown jewels" en `docs/OPEN_VS_CLOSED.md`, lo que confirma intención estratégica, no operación real.

### BC-15 · SDL — "Wallet Soberana de Derechos" (Self-sovereign Data Layer)
- **Responsabilidad:** registro de atributos/pruebas, consentimiento granular cifrado, vault index.
- **Código:** `HRkey/src/lib/sdl/*` (registry, field-matcher, consent, crypto webcrypto), pantalla `/wallet/connect/[schemaId]`, endpoints `POST /api/wallet/consents|views`, esquema propio `backend/supabase/001_create_sdl_tables.sql` (`sdl_statements`, `sdl_consents`, `sdl_audit_log`).
- **Estado:** experimento coherente, autocontenido, con tests — pero de nicho: una sola pantalla lo usa.

### BC-16 · Administration & Audit
- `adminOverview.controller.js` (auth por **admin-key**, no JWT — `app.js:308–354`), `auditController.js`, `audit_logs` (sql/001) + `audit_events` (sql/011 — **dos tablas de auditoría paralelas**), pantalla `/admin/dashboard` y `/v2/admin/trust`.
- **Cohesión:** media. Duplicado: `auditLog.controller.js` nunca cableado.

### BC-17 · AI / Agents
- `louAgent.service.js` (agente conversacional), `cvParse.service.js`, `aiRefine.controller` (refinado de referencias), `backend/services/validation/embeddingService.js` (OpenAI). `components/chat/*` en `/reference-builder`.
- **Estado:** vivo, pequeño, transversal.

### BC-18 · Notifications — MUERTO
- `notificationsController.js` nunca cableado, `notifications.schema.js` sin usar, `components/notifications/NotificationBell.tsx` importado solo por su test. Tabla `notifications` (sql/012) sin consumidor real. Los emails reales salen por Resend directamente (invites, kpi-digest).

---

## FASE 3 — Clasificación de tablas

Leyenda: **CORE** (dominio central vivo) · **SHARED** (capability transversal viva) · **SUPPORT** (soporte vivo) · **EXP** (experimental: código nuevo o sin cablear del todo) · **LEGACY** (generación anterior aún viva o residual) · **DEAD** (sin consumidor runtime).

### 3.1 Tablas referenciadas por código (67)

| Tabla | Refs | Clasificación | Evidencia |
|---|---|---|---|
| `users` | 52 | **CORE/SHARED** | Hub universal; usada por backend, HRkey/src, pages/api, WebDapp. Sin CREATE base en repo (solo ALTERs sql/001 y redefiniciones conflictivas en sql/030 y seed_referrals) |
| `references` | 44 | **CORE** | 23 refs solo en `references.service.js`; ALTERada por 4 migraciones; CREATE base ausente |
| `company_signers` | 29 | **SHARED** (Organizations) | sql/001; usada por auth middleware, controllers, WebDapp |
| `reference_invites` | 15 | **CORE** | **Sin CREATE en ningún SQL del repo**; núcleo del flujo de invitación |
| `data_access_requests` | 15 | **SUPPORT** ⚠ | Viva (`dataAccessController`) pero definida solo en `sql/deprecated/002` — código de producción sobre esquema deprecado |
| `analytics_events` | 12 | **SHARED** (Analytics) | sql/008; doble definición en conflicto con `database/migrations/` |
| `user_wallets` | 11 | **SUPPORT** (Wallet) | Creación custodial inline en app.js; también en los 2 backends wallet huérfanos |
| `profile_experiences` | 11 | **CORE** (Profiles v2) | sql/021; onboarding v2 + references v2 |
| `companies` | 11 | **SHARED** | sql/001 |
| `hrkey_purchases` | 9 | **EXP** | sql/029 (abr 2026); backend cableado, frontend ausente |
| `audit_logs` | 9 | **SHARED** (Audit) | sql/001 |
| `user_balances` | 6 | **SUPPORT** (AOC) | sql/023 |
| `profiles` | 6 | **CORE** (Profiles v2) | usada por auth/profile-service y storage provider |
| `hrk_stakes` | 6 | **DEAD** | Solo en `staking.controller.ts` (TS nunca ejecutable) y `create_payment_tables.sql` huérfano |
| `aoc_conversion_requests` | 6 | **SUPPORT** | sql/024; flujo vivo AOC→RLUSD |
| `rlusd_withdrawal_requests` | 5 | **SUPPORT** | sql/026–028; retiros SINPE vivos |
| `reputation_graph_edges` / `_nodes` | 5/3 | **CORE** (Reputation) | sql/018–019 |
| `payments` | 5 | **DEAD** | Solo rail TS huérfano + `create_payment_tables.sql` |
| `notifications` | 5 | **DEAD** | Solo `notificationsController.js` nunca cableado |
| `kpi_observations` | 5 | **SUPPORT** (Scoring) | sql/004; features del modelo ML |
| `hrkey_scores` | 5 | **SUPPORT** (Scoring) | sql/009 |
| `consents` | 5 | **SHARED** (Consent) | sql/011; `consentManager.js` + tests |
| `wallets` | 4 | **DEAD** | sql/012; solo `walletController(s)` nunca cableados |
| `reference_pack_access_grants` | 4 | **CORE** (Access) | sql/016 |
| `profile_education` | 4 | **CORE** (Profiles v2) | sql/021 |
| `capability_grants` | 4 | **CORE** (Access) | sql/017 |
| `candidate_skills` / `candidate_experiences` / `candidate_education` | 4/3/3 | **LEGACY** (Profiles v1) | sql/011_cv; solo `cv/builder` y `u/[slug]` |
| `audit_events` | 4 | **SHARED** (Audit) | sql/011; decisiones de acceso |
| `aoc_transactions` | 4 | **SUPPORT** | sql/023 |
| `user_plans` | 3 | **LEGACY** | **Sin CREATE**; solo backends wallet huérfanos y app.js legacy |
| `referee_identities` | 3 | **CORE** | sql/020 |
| `hrscore_snapshots` | 3 | **SUPPORT** | migración duplicada (20250115 vs 20250902) |
| `hrkey_refund_disputes` / `hrkey_company_favorites` / `hrkey_wallets` / `hrkey_purchase_access` / `hrkey_credit_ledger` | 3/3/2/2/1 | **EXP** | sql/029; transaction engine sin frontend |
| `failed_payments` / `cross_border_settlements` | 3/3 | **DEAD** | Solo rail TS huérfano |
| `checkout_sessions` / `products` / `user_feature_flags` | 3/1/1 | **DEAD** | sql/012; solo `billingController` nunca cableado |
| `stripe_events` | 2 | **SUPPORT** (Payments) | `backend/migrations/create_stripe_events_table.sql`; idempotencia webhook viva |
| `sdl_statements` / `sdl_consents` / `sdl_audit_log` | 2/2/2 | **EXP** (SDL) | `backend/supabase/001`; una sola pantalla |
| `rlusd_transactions` / `rlusd_balances` | 2/2 | **SUPPORT** | sql/025 |
| `reference_anchors` | 2 | **EXP** | Solo `protocol/` + `scripts/` (CLI) |
| `kpi_suggestions` | 2 | **SUPPORT** | Solo `HRkey/api/kpi-*.ts` (sin CREATE en repo) |
| `hrkey_score_evolution` / `kpi_observations_summary` / `payment_summaries` | 1/1/1 | vistas | matview sql/009 / vista sql/004 / vista del rail muerto |
| `candidate_prices` | 2 | **EXP/fantasma** | **Sin CREATE** (solo ALTER en sql/010); usada por `backend/pricing` (TS inejecutable) — pero `dynamicPricing.service.js` vivo no la usa |
| `user_trust_badges` / `trust_moderation_queue_v1` / `referee_dashboard_metrics_v1` / `company_dashboard_metrics_v1` | 1 c/u | **EXP** (Trust v1) | sql/030–031; consumidas por v2 dashboards/admin |
| `staking_tiers` | 1 | **SUPPORT** | sql/010; `stakingTier.service.js` vivo vía dataAccess |
| `revenue_transactions` | 1 | **LEGACY** ⚠ | Definida solo en `sql/deprecated/002` pero **escrita por el webhook Stripe vivo** (`webhookService.js`) |
| `referrals` | (seed) | **LEGACY** | `seed_hrkey_referrals.sql`; consumida por pages/api no desplegado |
| `queries` | 1 | **fantasma** | Solo `backend/pricing` TS; sin CREATE |
| `heartbeat` | 1 | **SUPPORT** (utilidad) | keep-alive |
| `x` | 1 | artefacto de test | `backend/tests` |

### 3.2 Tablas definidas en SQL pero JAMÁS referenciadas por código JS/TS

Todas **DEAD** (o Python-only):
- Motor de correlación (sql/003): `roles`, `user_kpis`, `cognitive_game_scores`, `job_outcomes`, `correlation_results`, `model_baseline_results` — solo el módulo Python muerto las lee.
- `candidate_certifications` (sql/011_cv) — ni el CV builder la usa.
- Trust v1 sin consumo directo aún: `referee_profiles`, `reference_purchases`, `usefulness_reviews`, `trust_events`, `disputes_flags`, `trust_badges` (solo join), `trust_moderation_actions` — se acceden vía triggers/RPC/vistas, no directamente → **EXP**.
- Rail deprecado (sql/deprecated/002): `revenue_shares`, `user_balance_ledger` — DEAD.
- `payment_splits` (1 ref en rail TS muerto) — DEAD.
- `backend/schema.sql`: `reference_transactions`, `paymaster_balance_log` — DEAD (dialecto MySQL, jamás aplicado).

**Conclusión Fase 3:** de 67 tablas referenciadas, ~35–38 corresponden a flujo vivo, ~12 a módulos experimentales cableados a medias, y ~17–20 a código muerto o inejecutable. Esto cuadra con la auditoría previa (34 tablas reales vs 67 referenciadas): **el schema de Supabase refleja solo lo vivo + trust v1; el código arrastra las 5 generaciones.**

---

## FASE 4 — Mapa de dependencias (tabla → servicio → API → frontend → pantalla)

Cadenas verificadas de los flujos principales (cada eslabón es un archivo real):

**F1 · Solicitud y respuesta de referencia (núcleo):**
```
reference_invites, references, referee_identities, profile_experiences
  ↓ RPC get_invite_by_token / submit_reference_by_token (sql/015)
backend/services/references.service.js (+ validation/* RVL + refereeIdentity.service)
  ↓ POST /api/references/request · /api/references/respond/:token (app.js)
HRkey/src/lib/v2/reference-requests-service.ts (fallback directo a Supabase)
  ↓
/v2/candidate/references/new · /v2/candidate/references/requests
/references/respond/[token] (+ /success) · /invites
```

**F2 · Acceso pagado a pack de referencias (monetización core):**
```
reference_pack_access_grants, capability_grants, user_balances, aoc_transactions, audit_events
  ↓
referenceAccess.service + capabilityToken.service + aocPayment.service + accessDecisionAudit
  ↓ middleware requireReferenceAccessPermission (402 si faltan AOCs)
GET /api/role-fit/:id · /api/performance-prediction/:id · /api/candidate-benchmark/:id ·
GET /api/references/candidate/:id · /api/reference-quality/:refId (app.js)
  ↓ useTalentIntelligenceDashboard.ts (fan-out a 8 endpoints)
/recruiter/talent-intelligence/[candidateId]
```

**F3 · Evaluación de candidato (score visible):**
```
references
  ↓ candidateEvaluation.service → scoringPipeline.service → hrScore.service (heurístico) + dynamicPricing.service
GET /api/candidates/:userId/evaluation
  ↓
/candidate/evaluation (753 líneas; incluye consent modal + aoc-wallet cards)
```

**F4 · Economía AOC → RLUSD → SINPE:**
```
user_balances, aoc_transactions → aoc_conversion_requests → rlusd_balances, rlusd_transactions → rlusd_withdrawal_requests
  ↓ aocPayment / rlusdConversion / rlusdLedger / rlusdWithdrawal (FSM+locking) / rlusdPayoutExecutor → sinpeMobileManual.adapter
/api/aoc/* · /api/aoc/convert/* · /api/rlusd/* · /api/rlusd/withdrawals/* (app.js:1332–1364)
  ↓ components/aoc-wallet/RlusdConversionCard.tsx
/candidate/evaluation
```

**F5 · Trust Model v1 (frente nuevo):**
```
referee_profiles, trust_events, user_trust_badges, trust_moderation_actions (+ triggers sql/030)
  ↓ RPC recalculate_trust_score / admin_moderate_trust · vistas *_metrics_v1, trust_moderation_queue_v1
HRkey/src/lib/v2/trust-dashboard-service.ts  (sin paso por backend Express — Supabase directo)
  ↓
/v2/referee/dashboard (híbrido real+mock) · /v2/company/dashboard · /v2/admin/trust
```

**F6 · Onboarding v2 / Perfiles:**
```
profiles, profile_experiences, profile_education (+ bucket cv-uploads)
  ↓ SupabaseStorageProvider → candidate-profile-service
/v2/onboarding · /v2/onboarding/experience · /v2/onboarding/details · /v2/candidate/dashboard
```

**F7 · Data access B2B (G3, vivo sobre esquema deprecado):**
```
data_access_requests, data_access_pricing, staking_tiers
  ↓ dataAccessController + stakingTier.service + candidateEvaluation.service
/api/data-access/* (app.js)
  ↓ apiClient.ts
/company/data-access/new · /company/data-access/[requestId](/data) · /company/dashboard
```

**Cadenas rotas notables (dependencia declarada que no llega a pantalla):**
- `hrkey_wallets → hrkeyTransactionEngine.service → /api/hrkey/* → ∅` (ninguna pantalla; los dashboards v2 usan localStorage).
- `payments/payment_splits → services/payments/*.ts → ∅` (controllers TS jamás registrados).
- `analytics_events → analyticsController → /api/analytics/* → ∅` (dashboard UI nunca construido).
- `notifications → ∅` (controller nunca cableado).
- `hrkey_scores → hrscoreController → /api/hrscore/* → solo WebDapp legacy`.

---

## FASE 5 — Duplicados

| # | Duplicado | Instancias | Cuál debe sobrevivir |
|---|---|---|---|
| 1 | **Clientes Stripe** | (a) `pages/api/*` 2023-10-16; (b) `HRkey/api/_lib/stripe.js` 2024-06-20; (c) `backend/app.js getStripe()`; (d) `billingController.js` huérfano | **(b) para checkout** (promos, idempotencia, CORS) + **persistencia de (c)** (webhook idempotente con `stripe_events`). Eliminar (a) y (d). El stub de webhook de (b) debe reemplazarse por la lógica de (c) |
| 2 | **Webhooks Stripe** | `pages/api/webhook.ts` (funcional), `HRkey/api/stripe/webhook.js` (stub console.log), `backend/app.js /webhook` (funcional) | El del backend (idempotente). Un solo endpoint de webhook en producción |
| 3 | **Motores de marketplace** | backend `hrkeyTransactionEngine` (80/20) vs frontend `marketplace-engine.ts` (70/30, localStorage) | Backend. El mock frontend debe morir al integrar `/api/hrkey/*`. Resolver el conflicto de ratio ANTES de integrar |
| 4 | **Rails cripto** | Rail on-chain TS (`services/payments/*`, `payments.controller.ts`, `staking.controller.ts`, `pricingEngine.ts`, `create_payment_tables.sql`) vs ledger interno AOC/RLUSD (sql/023–028) | Ledger interno (vivo, endurecido). El rail on-chain es DOA (TS inejecutable + ABI inexistente + contrato sin desplegar) |
| 5 | **Backends de wallet** | inline `WalletCreationService` (app.js:408), `Wallet_Creation_Base_SDK.js` (425 líneas), `wallet-creation-backend.js` (595 líneas) | El inline (único cableado). Los otros dos son iteraciones abandonadas del mismo código |
| 6 | **Esquemas de perfil** | `profiles`/`profile_*` (v2) vs `users`+`candidate_*` (cv-builder, u/[slug]) | Familia `profiles`/`profile_*` (es la del frente activo). Migrar CV builder y perfil público |
| 7 | **Scoring** | `hrkeyScoreService.js` (ML), `hrScore.service.js` (heurístico), `services/hrscore/` (persistencia) | Corto plazo: heurístico (es lo que muestra el producto). El ML (R²=0.268, datos sintéticos) es I+D, no producto |
| 8 | **Anclaje on-chain** | `HRKReferenceProof` inline en app.js vs `protocol/anchor` + `ReferenceAnchor.sol` | `protocol/anchor` es el diseño limpio (canonicalización RFC 8785 + verificación); el inline debería consumirlo como librería. Hoy ninguno funciona |
| 9 | **Controllers** | `referenceController.js` vs `referencesController.js` · `auditController.js` vs `auditLog.controller.js` · `walletController.js` vs `walletsController.js` | Los cableados: `referencesController`, `auditController`, ninguno de wallet (inline) |
| 10 | **Middleware auth** | `auth.js` (cableado) vs `authMiddleware.js` (huérfano) | `auth.js` |
| 11 | **Public profile** | `services/publicProfile.service.js` (raíz, muerto) vs `services/publicProfile/` (carpeta, vivo) | La carpeta |
| 12 | **Migración hrscore_snapshots** | `20250115_*.sql` (con RLS) vs `20250902_*.sql` (sin RLS) | Consolidar en una con RLS |
| 13 | **`analytics_events`** | sql/008 vs `database/migrations/create_payment_tables.sql` | sql/008 (la del rail muerto se elimina con él) |
| 14 | **Tablas de auditoría** | `audit_logs` (sql/001) vs `audit_events` (sql/011) | Unificar bajo una capability de Audit con dos vistas si hace falta |
| 15 | **Configs Hardhat** | 6 variantes (`.ts`, `.js`, `.mjs`, `-Sofia.js`, `.backup`, `.ts.bak`) | `hardhat.config.ts`. Borrar el resto |
| 16 | **Numeración de migraciones** | dos 010, dos 011, dos 013, dos 018 en `sql/` | Renumerar en la consolidación de esquema |
| 17 | **Assets estáticos** | `public/WebDapp/` ≈ `HRkey/public/deprecated/WebDapp/` ≈ `HRkey/HRkey/public/` (triple copia) | Ninguna; archivar fuera del repo |
| 18 | **Lógica base-URL del API** | `apiClient.ts` vs re-implementación inline en `p/[identifier]`, `admin/dashboard`, `wallet/connect/[schemaId]` | `apiClient.ts` |
| 19 | **Raíces de tests backend** | `backend/__tests__/` y `backend/tests/` | Una sola |
| 20 | **package.json** | raíz `peerproof` (React 18) vs `HRkey/` `hrkey` (React 19) + `package.json.backup` | Separación deliberada backend/frontend está bien; el `.backup` y el nombre `peerproof` deben corregirse |

---

## FASE 6 — Código muerto (inventario accionable)

### 6.1 Muerto con certeza (cero consumidores en runtime; borrable tras verificación)
- **Backend controllers nunca cableados:** `aocController.js` (+ `aocVault.service.js` + `services/aoc-protocol/`), `auditLog.controller.js`, `billingController.js`, `notificationsController.js`, `referenceController.js`, `walletController.js`, `walletsController.js`, `payments.controller.ts`, `staking.controller.ts`.
- **Servicios muertos:** `services/payments/{payment-processor,rlusd-listener,xrp-bridge}.ts`, `pricing/pricingEngine.ts`, `referencePackAnchor.service.js`, `publicProfile.service.js` (raíz).
- **Middleware muerto:** `authMiddleware.js`, `validateConsent.js`, `upload.middleware.js`.
- **Schemas Zod sin uso:** `billing.schema.js`, `notifications.schema.js`, `wallets.schema.js`, `validatedReference.schema.js`. **Ruta vacía:** `routes/aiRefine.routes.js` (1 línea).
- **Scripts standalone huérfanos:** `backend/Wallet_Creation_Base_SDK.js`, `backend/wallet-creation-backend.js`, `backend/monitor-paymaster.js`, `observability.patch` (vacío).
- **Frontend raíz no desplegado:** `pages/`, `components/ReferralDashboard.tsx`, `lib/supabaseAdmin.ts` (⚠ decisión de producto: es el único código del modelo suscripción anual + referidos; si ese modelo está vivo en Stripe, hay que migrarlo antes de borrar).
- **Componentes huérfanos en HRkey:** `ReferenceRequestsTable.tsx`, `NotificationBell.tsx`, `WalletSetup.tsx`, `Hero.tsx`, `Features.tsx`, `Testimonial.tsx`, `ReferenceStrikethrough.tsx`.
- **Contratos:** `HRKToken.sol`, `HRKStaking.sol`, `HRKSlashing.sol`, `ReferencePaymentSplitter.sol`, `ReputationRegistry.sol`, `contracts/deprecated/HRKeyRevenueShare.sol` + sus deploy scripts.
- **Python:** `analytics/proof_of_correlation/` completo; `ml/correlation*.py`, `dashboard_kpi_correlations.py`, `ml/models/*.pkl` y outputs no consumidos.
- **SQL muerto:** `backend/schema.sql` (MySQL), `database/migrations/create_payment_tables.sql`, `sql/003_correlation_engine_schema.sql` (si se confirma que las 6 tablas no existen o están vacías en Supabase), tablas `revenue_shares`/`user_balance_ledger` de deprecated/002.
- **Basura de configuración:** `hardhat.config-Sofia.js`, `hardhat.config.js.backup`, `hardhat.config.ts.bak`, `hardhat.config.mjs`, `hardhat.config.js`, `package.json.backup`, `cache/compile-cache.json` (rutas Windows de la era hackathon).
- **Carpetas fantasma:** `HRkey/HRkey/` (3 archivos estáticos duplicados por accidente de script), `public/WebDapp/temp1.html`, `temp2.html`.

### 6.2 Legacy (vivo o semi-vivo, requiere decisión antes de tocar)
- `public/WebDapp/` — aún llama al backend en prod y tiene credenciales anon hardcodeadas; es el único consumidor del endpoint ML `/api/hrkey-score`.
- `HRkey/public/deprecated/WebDapp/` — copia archivada (con `.bak`, `.sed.bak`, `.old`).
- Familia `candidate_*` + `/cv/builder` + `/u/[slug]` — vivos sobre esquema v1.
- `revenue_transactions` + `data_access_*` — esquema deprecado con escrituras de producción.
- `/ref/verify` (shim de redirección), `/dashboard` (redirect), `/about` (casi placeholder).
- Rutas dev: `/test`, `/dev/auth-helper` (auto-protegido), `/onchain-test`, `/api-client-example`, `/ping`.

### 6.3 RPC/funciones SQL sin invocador en código
`get_event_counts`, `get_hourly_event_distribution` (sql/008), `get_latest_hrkey_score`, `get_hrkey_score_history`, `get_score_improvement_percentage` (sql/009 — el backend consulta la tabla directamente), `has_active_consent`, `expire_consents` (sql/011), `calculate_payment_splits` (rail muerto), `check_data_access_expiration` (trigger deprecado), `extend_referrer_one_month` (seed legacy). Nota: las RPC sí invocadas están listadas en Fase 0/1 (10 en total, p.ej. `submit_reference_by_token`, `recalculate_trust_score`, `admin_moderate_trust`, `get_user_payment_stats` ← esta última la llama el rail muerto, revisar).

---

## FASE 7 — Capabilities extraíbles para Shared Ventures

Ordenadas por madurez real (no por ambición):

### C1 · Consent & Capability Authorization ★ la joya
- **Contiene:** `referenceAccess.js` (middleware de resolución en cascada owner→admin→token→grant→AOC), `capabilityToken.service.js`, `referenceAccess.service.js`, `accessDecisionAudit.service.js`, `aocRuntime.service.js`, `consentManager.js`; tablas `capability_grants`, `reference_pack_access_grants`, `consents`, `audit_events`.
- **Desacoplar:** los nombres están casados con "reference pack"; generalizar a `resource_type`. La tarificación AOC (402) debe ser un puerto opcional.
- **Reutilización:** MUY ALTA — cualquier app de Shared Ventures que venda acceso a datos con consentimiento del titular (salud, educación, credenciales) necesita exactamente esto.

### C2 · Audit Trail
- **Contiene:** `audit_logs` + `audit_events` (unificar), `accessDecisionAudit`, `auditController`, patrón "quién accedió a qué y por qué decisión".
- **Desacoplar:** unificar las dos tablas; extraer el logger de decisiones del contexto references.
- **Reutilización:** ALTA y trivial de extraer.

### C3 · Identity & Organizations
- **Contiene:** middleware auth completo sobre Supabase JWT, roles, `companies` + `company_signers` con invitación de firmantes por token, verificación de empresa.
- **Desacoplar:** la carga de rol desde `users` (esquema propio por app); el patrón signer es genérico ("miembros autorizados de una organización con token de invitación").
- **Reutilización:** ALTA — es el B2B onboarding de cualquier vertical.

### C4 · Internal Ledger + Payout Rails (la mejor ingeniería del repo)
- **Contiene:** créditos AOC (`user_balances`, `aoc_transactions`), conversión (`aoc_conversion_requests`), ledger RLUSD (`rlusd_*`), retiro con FSM + locking + idempotencia (sql/026–028), ejecutor de payouts con adaptadores (`rlusdPayoutExecutor` + `sinpeMobileManual.adapter`).
- **Desacoplar:** renombrar AOC/RLUSD a moneda-de-cuenta genérica; el seam de adapters ya existe (`DEFAULT_PROVIDER_BY_RAIL` con extensiones previstas `wallet_transfer`, `bank_transfer`, `global_fiat_provider`).
- **Reutilización:** MUY ALTA — "wallet de créditos + retiro a fiat" es el corazón de cualquier marketplace de Shared Ventures. El transaction engine v1 (sql/029) es la capa marketplace encima de esto.

### C5 · Reference Engine (el producto HRKey mismo)
- **Contiene:** invites tokenizados endurecidos (RPCs sql/015), identidad de referee, validación RVL (fraude/consistencia/embeddings), packs canónicos con hash.
- **Desacoplar:** de Profiles (v1/v2), de scoring. Es extraíble como "Attestation Engine" genérico (pedir → atestiguar → validar → empaquetar) para cualquier vertical de verificación.
- **Reutilización:** MEDIA-ALTA, pero es el core de HRKey — se extrae como producto, no como librería compartida.

### C6 · Analytics Event Tracking
- **Contiene:** `eventTracker.js` (fail-silent, sin PII), taxonomía de 26 eventos, vistas agregadas, funnel.
- **Desacoplar:** taxonomía por app; ya es casi genérico.
- **Reutilización:** ALTA — o se extrae, o se reemplaza por PostHog self-hosted (decisión build-vs-buy honesta: hoy no hay UI que lo consuma).

### C7 · Trust/Reputation Scoring
- **Contiene:** trust model v1 (score con clamp, badges idempotentes, moderación con RLS endurecida — sql/030–031) + grafo de reputación (sql/018–019).
- **Desacoplar:** los triggers acoplan el recálculo a tablas concretas de HRKey; los dos modelos (grafo vs trust v1) deben fusionarse primero.
- **Reutilización:** MEDIA — el patrón (eventos→score→badges→moderación) es genérico; la fórmula es del dominio.

### C8 · SDL (Sovereign Data Layer)
- **Contiene:** registry de atributos con sinónimos, field-matcher (REUSE_OK/REUSE_NEEDS_UPDATE), consents cifrados webcrypto, vault index.
- **Reutilización:** conceptualmente MUY ALTA para Shared Ventures (es literalmente "compartir capacidades de datos entre aplicaciones"), pero es el módulo menos maduro (una pantalla). Tratarlo como semilla de I+D, no como capability lista.

### C9 · AI Services
- `louAgent`, `cvParse`, `aiRefine`, `embeddingService` — extraíbles como microservicios finos sobre OpenAI. Reutilización MEDIA (mucho prompt específico de dominio).

### NO extraer (todavía o nunca)
- **Payments Stripe:** primero unificar (Fase 5 #1-2); extraer después.
- **Blockchain/anchoring:** nada desplegado; congelar hasta que exista una necesidad real con presupuesto de deploy.
- **ML/correlación:** datos sintéticos, R² 0.268, sin consumidores — es I+D.
- **Notifications:** no existe; construirla como capability nueva (Resend ya está en ambos package.json).

---

## FASE 8 — Roadmap de extracción (propuesta, sin ejecutar nada)

Principio: primero verdad, luego limpieza, luego unificación, luego extracción. Cada sprint reduce riesgo antes de añadir reutilización.

**Sprint 1 — Verdad de base de datos (riesgo: nulo)**
Volcar el schema real de Supabase (`pg_dump --schema-only`) al repo como fuente de verdad; diff contra la cadena `sql/001–031`; documentar las tablas sin CREATE (`reference_invites`, `candidate_prices`, `user_plans`, base de `users`/`references`); decidir una sola carpeta de migraciones y renumerar los duplicados (010/011/013/018). Entregable: `db/schema.sql` canónico + tabla de correspondencia.

**Sprint 2 — Recolección de basura (riesgo: bajo, reversible por git)**
Borrar el inventario 6.1 (controllers/servicios/middleware/componentes muertos, rail TS, configs hardhat sobrantes, `HRkey/HRkey/`, backups). Mover `public/WebDapp/` a archivo (previa verificación de tráfico real: tiene credenciales hardcodeadas y es el único cliente del endpoint ML). Decisión explícita sobre `pages/api` (modelo suscripción): migrar o matar. Resultado esperado: −20/25% del repo sin tocar nada vivo.

**Sprint 3 — Un solo Stripe y cierre del hueco de dinero (riesgo: medio, urgencia: ALTA)**
El checkout de la landing (`HRkey/api`) cobra y su webhook no persiste (stub). Unificar: checkout de `HRkey/api` + webhook idempotente del backend; matar `pages/api/*` y `billingController`; sacar `revenue_transactions` del esquema deprecado. Entregable: un flujo de dinero, un webhook, una tabla de eventos.

**Sprint 4 — Un solo esquema de perfil (riesgo: medio)**
Migrar `cv/builder` y `u/[slug]` a `profiles`/`profile_*`; script de migración de datos `candidate_*` → `profile_*`; deprecar familia `candidate_*`. Prerrequisito para extraer Profiles como capability.

**Sprint 5 — Cerrar el marketplace (riesgo: medio)**
Integrar los dashboards v2 con `/api/hrkey/*` (transaction engine real), eliminar `marketplace-engine.ts` (localStorage) y resolver el conflicto 80/20 vs 70/30 como decisión de negocio documentada. Conectar trust model v1 con datos reales (hoy los dashboards mezclan mock).

**Sprint 6 — Modularizar el monolito (riesgo: medio)**
Trocear `backend/app.js` (2.069 líneas) en módulos por bounded context (routers por BC-2/4/5/6/9/11/13/16), consolidar las dos raíces de tests. Sin cambiar comportamiento; es el prerrequisito estructural de toda extracción.

**Sprint 7 — Extraer capabilities transversales (primera ola Shared Ventures)**
En orden: **C2 Audit** (trivial) → **C1 Consent/Capability Authorization** (generalizar resource_type) → **C3 Identity/Organizations**. Publicar como paquetes/servicios internos consumidos por HRKey mismo (dogfooding).

**Sprint 8 — Extraer el ledger (segunda ola)**
**C4 Internal Ledger + Payout Rails** como servicio independiente con moneda-de-cuenta configurable; HRKey lo consume para AOC/RLUSD y el transaction engine. **C6 Analytics**: decisión build-vs-buy; si build, extraer eventTracker.

**Sprint 9 — Plataforma**
Unificar reputación (grafo + trust v1) → **C7**; evaluar **C5 Reference/Attestation Engine** como segundo producto; retomar SDL (C8) como capa de compartición de datos entre apps de Shared Ventures; recién entonces reconsiderar anchoring on-chain (un contrato, un config, un deploy real).

---

## VEREDICTO

**1. ¿Cuál es realmente el Core Domain de HRKey?**
El **ciclo de vida de la referencia profesional verificada y la confianza que se deriva de ella**: solicitud → invitación tokenizada → respuesta del referee → validación antifraude → pack canónico → acceso controlado y monetizado → reputación/trust. La evidencia es unánime: `references` y `reference_invites` concentran el mayor volumen de llamadas (44+15), `references.service.js` es el servicio más denso (23 accesos), las RPCs más endurecidas del sistema son las de invites (3 iteraciones de seguridad), el middleware más sofisticado (`referenceAccess.js`) existe para proteger ese activo, y las 5 generaciones — desde PeerProofRegistry hasta Trust Model v1 — son reintentos del mismo dominio. **No** son el core: el token HRK (muerto), el ML (decorativo: el producto muestra el score heurístico), el blockchain (cero despliegues), ni los pagos (genérico).

**2. ¿Qué porcentaje del proyecto está realmente vivo?**
**~45–50%.** Vivo con certeza: el monolito backend menos sus órganos muertos (~70% de sus 60k LOC), `HRkey/src` menos huérfanos y mocks (~80% de 16k), la cadena SQL 001–028 aplicada, `HRkey/api` (parcial), heartbeat. El cálculo ponderado por LOC de las áreas ejecutables da ~48%.

**3. ¿Qué porcentaje es experimental?**
**~20%.** Trust Model v1 + Transaction Engine v1 (backend cableado sin frontend real), SDL, anchoring AOC (protocol/ + contrato con tests), sandbox on-chain, marketplace localStorage, y la mitad mock de los dashboards v2.

**4. ¿Qué porcentaje puede convertirse en Shared Capabilities?**
**~30–35% del código vivo** tiene forma de capability extraíble: Consent/Capability Authorization, Audit, Identity/Organizations, Ledger+Payouts, Analytics tracking, Trust scoring, AI services. Las cuatro primeras son extraíbles con bajo esfuerzo porque ya están bien factorizadas; el resto requiere las unificaciones de los Sprints 3–5 primero.

**5. ¿Qué porcentaje debería eliminarse?**
**~30–35% del repositorio**: todo el inventario 6.1 (rail on-chain TS, 9 controllers huérfanos, motor de correlación Python, contratos token/staking/slashing, 5 configs hardhat, backends wallet duplicados, componentes huérfanos, `pages/` no desplegado, triple copia del WebDapp, esquemas SQL en conflicto, backups y carpetas fantasma). Nada de eso está en ninguna ruta de ejecución de producción; su único efecto actual es hacer que el mapa mienta — que 67 tablas parezcan dominio cuando el dominio real cabe en ~35.

---

*Todas las rutas de archivo citadas son relativas a la raíz del repositorio. Este documento no modifica código; es el mapa para las fases siguientes.*
