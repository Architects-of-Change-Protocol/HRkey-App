# Sprint 2 — Análisis de Independencia de Capacidades (Capability Independence Analysis)

> **Rol:** Enterprise Architect / Platform Architect / Product Platform Engineering
> **Alcance:** Análisis, no implementación. No se escribe código ni se migra nada.
> **Insumo:** Bounded contexts identificados en Sprint 1 (Core Domain: **Referencias Profesionales Verificables**), verificados contra el código actual del monorepo.
> **Fecha:** 2026-07-13

---

## 0. Resumen ejecutivo

HRKey es hoy un **monolito distribuido de facto** con cuatro stacks superpuestos (backend Express `backend/`, frontend Next.js `HRkey/`, frontend legacy `public/WebDapp/` + `pages/`, y servicios Python `analytics/` + `ml/`) que se integran casi exclusivamente a través de **una única base Supabase/Postgres compartida** usada como bus de integración con service-role key compartida.

Hallazgos estructurales que condicionan cualquier extracción:

1. **La base de datos es el acoplamiento dominante.** Todas las capacidades (Node, Python, serverless, workers cripto, heartbeat) leen/escriben el mismo Postgres, mayoritariamente con `SUPABASE_SERVICE_ROLE_KEY`. La independencia real existe a nivel de código/proceso, pero es débil a nivel de datos.
2. **Hay capacidades ya desacopladas de facto** que pueden independizarse casi sin costo: pipeline ML (handoff por artefacto JSON), motor Proof-of-Correlation (FastAPI propio), capa de anclaje on-chain (`protocol/anchor` con ABI inline), contratos, heartbeat.
3. **Hay capacidades triplicadas** que deben consolidarse *antes* de extraer: Stripe (3 implementaciones: `backend/`, `pages/api/`, `HRkey/api/`), invitación de referencias (Express + route handler Next), clientes Supabase (≥3), correlación (en `ml/` y en `analytics/`), y un split de revenue inconsistente (80/20 backend vs 70/30 frontend vs 60/20/15/5 rail cripto).
4. **El Core Domain (Referencias + Consentimiento + Scoring) no debe extraerse primero**; debe modularizarse in-place (modular monolith) mientras la periferia se independiza. La política open-core ya declarada en `docs/OPEN_VS_CLOSED.md` (OPEN = rieles de protocolo; CLOSED = scoring/pricing/ML) coincide con la partición natural de repos.

---

## 1. Inventario de bounded contexts (verificado en código)

| # | Bounded Context | Evidencia principal |
|---|---|---|
| BC-01 | Identidad y Organizaciones | `backend/middleware/auth.js`, tablas `users`, `companies`, `company_signers`, `HRkey/src/lib/auth/*` |
| BC-02 | Perfiles y Onboarding (CV) | `HRkey/src/lib/profile/*`, `backend/services/cvParse.service.js`, tablas `profiles`, `profile_experiences`, `profile_education`, `candidate_*` |
| BC-03 | **Referencias Verificables (Core Domain)** | `backend/services/references.service.js`, `referenceValidation/Quality/Pack.service.js`, `services/validation/*`, tablas `references`, `reference_invites` |
| BC-04 | Consentimiento y Soberanía de Datos (SDL) | `backend/utils/consentManager.js`, `middleware/referenceAccess.js`, `HRkey/src/lib/sdl/*`, tablas `consents`, `audit_events`, `capability_grants`, `sdl_statements` |
| BC-05 | Grafo de Reputación | `backend/services/reputationGraph/Propagation/TrustWeighting.service.js`, tablas `reputation_graph_nodes/edges` |
| BC-06 | Trust Model v1 (confianza social) | `sql/030-031`, `HRkey/src/lib/v2/trust-dashboard-service.ts`, RPCs `recalculate_trust_score`, `admin_moderate_trust` |
| BC-07 | HRScore / Talent Intelligence (scoring servido) | `backend/services/hrscore/*`, `hrkeyScoreService.js`, `roleFit/performancePrediction/careerTrajectory/candidateBenchmark.service.js` |
| BC-08 | Pipeline de Entrenamiento ML | `ml/` (Python, Ridge; export a `ml/output/hrkey_model_config_global.json`) |
| BC-09 | Proof of Correlation | `analytics/proof_of_correlation/` (FastAPI propio, puerto 8000) |
| BC-10 | Product Analytics (event tracking) | `backend/services/analytics/*`, tabla `analytics_events` + 6 vistas materializadas |
| BC-11 | Billing Fiat (Stripe) | `backend/controllers/billingController.js` + `webhookService.js`; duplicados en `pages/api/` y `HRkey/api/` |
| BC-12 | Motor de Transacciones HRKCR (marketplace de créditos) | `backend/services/hrkeyTransactionEngine.service.js`, `sql/029`, tablas `hrkey_*` |
| BC-13 | Tokenomics Cripto (AOC / RLUSD / Payment Rail / Staking) | `backend/services/aoc*/rlusd*`, `backend/services/payments/*.ts` (workers no cableados), contratos `ReferencePaymentSplitter`, `HRKToken/Staking/Slashing` |
| BC-14 | Capa Protocolo On-chain (Anchor) | `contracts/ReferenceAnchor.sol`, `PeerProofRegistry.sol`, `HRKReferenceProof.sol`, `protocol/anchor/`, `copy-abi.cjs` |
| BC-15 | Wallet y Custodia | `backend/wallet-creation-backend.js`, `Wallet_Creation_Base_SDK.js`, `walletsController.js`, tabla `wallets` |
| BC-16 | LOU Agent (asistente conversacional) | `backend/services/louAgent.service.js`, `/api/lou-agent/*`, `HRkey/src/components/chat/*` |
| BC-17 | Notificaciones / Email | `backend/utils/emailService.js`, Resend en `HRkey`, tabla `notifications` |
| BC-18 | Heartbeat (ops) | `heartbeat/heartbeat.mjs` (package.json propio) |
| BC-19 | Legacy (WebDapp estático, `pages/` stubs, `sql/deprecated/`) | `public/WebDapp/*.html`, `index/app/auth.html`, `pages/index.tsx`, `sql/deprecated/002_*` |

---

## 2. Análisis por bounded context — las 10 preguntas

Formato: **1)** módulo independiente · **2)** APIs propias · **3)** modelo de datos propio · **4)** reglas de negocio propias · **5)** UI propia · **6)** dependencia del resto · **7)** nivel de acoplamiento · **8)** qué desacoplar · **9)** qué dependencias invertir · **10)** ¿repo propio?

### BC-01 · Identidad y Organizaciones

1. **Sí, pero al final.** Es el backbone: todos los contextos dependen de él vía JWT de Supabase y tabla `users`.
2. **Sí:** `/api/identity/verify`, `/api/company/*`, `/api/signers/*`, `/api/me/public-identifier`, `/api/public/candidates/:id`.
3. **Sí:** `users`, `companies`, `company_signers`, `referee_identities` (sql/001, 020). Pero `users` es leída/escrita por casi todos los demás contextos (Stripe escribe `users.plan`, referrals escriben `subscription_expires_at`) → el modelo es propio pero **no exclusivo**.
4. **Sí:** roles (superadmin auto-asignado por `HRKEY_SUPERADMIN_EMAIL`), verificación de empresa, ciclo de invitación/aceptación de signers con audit log (`docs/identity-and-signers.md`).
5. **Sí:** `HRkey/src/app/v2/auth`, onboarding de empresa; pero delegada en Supabase Auth.
6. **Depende de:** Supabase Auth (proveedor externo), Notificaciones (emails de invitación). Poca dependencia hacia adentro; muchísima hacia afuera (todos dependen de él).
7. **Acoplamiento: ALTO como proveedor, BAJO como consumidor.** El middleware `auth.js` es importado por ~40 controllers.
8. **Desacoplar:** las escrituras foráneas sobre `users` (Stripe/referrals mutando columnas de suscripción) → esas columnas pertenecen a Billing, no a Identidad.
9. **Invertir:** los contextos no deben consultar `users` directamente; deben consumir un contrato (claims del JWT + API de perfil). El enforcement de roles debe quedar como Policy Decision Point invocable, no como middleware copiado.
10. **Sí, a largo plazo** (servicio de identidad). Hoy no: extraerlo primero rompería todo. Se independiza *lógicamente* (módulo con interfaz) antes que *físicamente*.

### BC-02 · Perfiles y Onboarding (CV)

1. **Sí.** Escritura autocontenida vía Supabase + Storage (`cv-uploads`).
2. **Parcial:** `POST /api/cv/parse` (backend); el resto es acceso directo a Supabase desde `candidate-profile-service.ts`.
3. **Sí:** `profiles`, `profile_experiences`, `profile_education` (+ legacy `candidate_*` duplicadas — sql/011 vs 021).
4. **Sí:** validación de CV (tipo/tamaño), % de completitud de perfil, parsing de CV.
5. **Sí:** `v2/onboarding/*`, `cv/builder`, componentes propios.
6. **Depende de:** Identidad (usuario actual), Storage. Referencias lo consume (join con `profile_experiences` para contexto de rol/empresa).
7. **Acoplamiento: MEDIO.** Dos generaciones de tablas (`candidate_*` vs `profile_*`) y acceso dual (API + Supabase directo).
8. **Desacoplar:** consolidar en un solo juego de tablas; eliminar el acceso directo del frontend a tablas que también toca el backend.
9. **Invertir:** Referencias no debe hacer join directo contra `profile_experiences`; debe pedir "contexto laboral del candidato" a una API/vista publicada por Perfiles.
10. **Sí**, viable a medio plazo como servicio de perfil; valor de extracción moderado.

### BC-03 · Referencias Verificables — **CORE DOMAIN**

1. **No como servicio externo; sí como módulo.** Es el corazón del producto: debe modularizarse in-place, no extraerse.
2. **Sí, la superficie más rica:** `/api/reference/request`, `/api/references/{me,pending,respond/:token,candidate/:id}`, `/api/reference-pack/*`, `/api/reference-quality/:id`.
3. **Sí:** `references`, `reference_invites`, `reference_purchases`, `reference_pack_*` + hardening de tokens (sql/013-016).
4. **Sí, las más valiosas:** ciclo de vida pending→opened→started→completed→expired, validación anti-fraude (`services/validation/`: fraudDetector, consistencyChecker, embeddings), calidad de referencia, empaquetado (packs) y anclaje on-chain.
5. **Sí:** `references/respond/[token]`, `reference-builder`, dashboards de referee/candidate.
6. **Depende de:** Identidad, Perfiles (contexto laboral), Consentimiento (gate de acceso), Notificaciones (emails), Anchor Layer (opcional, no bloqueante), Monetización (unlock por compra).
7. **Acoplamiento: ALTO** — y además **duplicado**: la creación de invitaciones existe en Express (`references.service.js`) y en Next (`HRkey/src/app/api/invite/route.ts`) con generación/hash de token independientes; el frontend usa dual-path (API + fallback Supabase directo).
8. **Desacoplar:** (a) eliminar una de las dos rutas de invitación; (b) eliminar el fallback Supabase directo del frontend; (c) sacar el gate de pago/consent del flujo interno y consumirlo como policy externa.
9. **Invertir:** Referencias no debe conocer Stripe/HRKCR ni el anchor: debe emitir eventos de dominio (`reference.completed`, `pack.committed`) que Monetización y Anchor consuman. Hoy la dependencia apunta hacia afuera (el servicio llama anclaje y verifica compra).
10. **No a corto plazo.** Es el último candidato a repo propio; primero es el módulo núcleo del modular monolith.

### BC-04 · Consentimiento y Soberanía de Datos (SDL)

1. **Sí — es el contexto más limpio del sistema.** `HRkey/src/lib/sdl/*` ya es una librería con cliente inyectado, registry de campos, matcher, vault y tests propios (`src/__tests__/sdl`).
2. **Sí:** `/api/data-access/*`, `/api/reference-access/{grants,capabilities,status,history}`, `/api/wallet/consents`.
3. **Sí:** `consents`, `audit_events` (sql/011), `capability_grants` (017), `reference_pack_access_grants` (016), `sdl_statements`.
4. **Sí:** fail-closed, consent con scope/purpose/expiración/revocación, decisiones REUSE_OK / NEW_REQUIRED / PROOF_REQUIRED, audit trail de accesos permitidos y denegados.
5. **Sí:** `company/data-access/*`, modales de consentimiento.
6. **Depende de:** Identidad (quién otorga/recibe). Nada más.
7. **Acoplamiento: BAJO en diseño, MEDIO en realidad** — la capacidad está implementada **tres veces**: `consentManager.js` + `validateConsent` middleware (backend), `lib/sdl/*` (TS), y tablas SDL separadas (`backend/supabase/001_create_sdl_tables.sql`).
8. **Desacoplar:** unificar las tres implementaciones en una sola librería/servicio con un único modelo (`consents` + `capability_grants`); el middleware backend debe consumirla, no reimplementarla.
9. **Invertir:** los endpoints protegidos no deben conocer las tablas de consent; deben preguntar a un PDP (`can(actor, action, resource)?`). El PDP es la abstracción; los contextos dependen de la interfaz, no del esquema.
10. **Sí — candidato #1 a plataforma reutilizable.** Consent/authorization con audit es genérico y además está declarado OPEN en la política open-core.

### BC-05 · Grafo de Reputación

1. **Sí.** Servicios cohesivos con tablas propias.
2. **Sí:** `/api/reputation-graph/*`, `/api/reputation-propagation/*`, `/api/reputation-trust-weighting/*`, `/api/recruiter-graph-insights/*`.
3. **Sí:** `reputation_graph_nodes`, `reputation_graph_edges` (sql/018-019).
4. **Sí:** propagación de reputación, ponderación de confianza, extracción de relaciones desde referencias.
5. **Parcial:** `CandidateRelationshipNetwork.tsx`, `candidate/network` — visualización, consumida dentro de Talent Intelligence.
6. **Depende de:** Referencias (fuente de aristas), Identidad (nodos). Consumido por HRScore/Talent Intelligence.
7. **Acoplamiento: MEDIO.** Lee tablas de Referencias directamente para construir el grafo.
8. **Desacoplar:** la ingesta — el grafo debe alimentarse de eventos de Referencias, no leer sus tablas.
9. **Invertir:** `graphRelationshipExtraction` pasa de "pull sobre tablas ajenas" a "consumer de `reference.completed`".
10. **Sí, a medio plazo** — un servicio de grafo de confianza es reutilizable (marketplace, red social profesional), pero su valor depende del volumen de datos del core.

### BC-06 · Trust Model v1 (badges, disputas, moderación)

1. **Sí como módulo; prematuro como servicio.** Recién productizado (PRs #318-319).
2. **Parcial:** opera vía RPCs de Supabase (`recalculate_trust_score`, `admin_moderate_trust`) y vistas (`referee_dashboard_metrics_v1`, `trust_moderation_queue_v1`) — API "de base de datos", no HTTP.
3. **Sí:** `trust_events`, `disputes_flags`, `usefulness_reviews`, `trust_badges`, `user_trust_badges`, `trust_moderation_actions` (sql/030-031, con RLS).
4. **Sí:** scoring de confianza, asignación de badges, flujo de disputas y moderación admin.
5. **Sí:** `v2/admin/trust`, dashboards v2 de referee/company.
6. **Depende de:** Referencias (eventos de confianza), Identidad. Lógica dentro de Postgres (RPC/vistas) — autocontenida pero atada al motor de BD.
7. **Acoplamiento: BAJO-MEDIO.** Único módulo que usa `supabase.rpc()`; limpio pero con la lógica en SQL.
8. **Desacoplar:** poco; si algún día se extrae, la lógica en RPCs debe subir a una capa de servicio.
9. **Invertir:** nada urgente; alimentar `trust_events` por eventos en lugar de triggers implícitos.
10. **Todavía no** — demasiado joven; consolidar semántica frente a BC-05 (dos nociones de "trust" coexisten).

### BC-07 · HRScore / Talent Intelligence (scoring servido)

1. **Sí — candidato natural a producto.** Es el diferenciador ("crown jewel", CLOSED en open-core).
2. **Sí, amplia:** `POST /api/hrscore/calculate`, `/api/hrscore/user/:id/*`, `/api/hrkey-score/*`, `/api/role-fit/:id`, `/api/performance-prediction/:id`, `/api/career-trajectory/:id`, `/api/candidate-benchmark/:id`.
3. **Sí:** `hrkey_scores` (sql/009), snapshots (`backend/migrations/*hrscore_snapshots*` — duplicada 2×), lee `kpi_observations` (sql/004).
4. **Sí:** cálculo del score (coeficientes Ridge evaluados en JS puro desde `ml/output/hrkey_model_config_global.json`), bandas, confianza por nº de observaciones, benchmark, role-fit.
5. **Sí:** `recruiter/talent-intelligence/[candidateId]`, `TalentIntelligenceDashboard.tsx`, gated por saldo AOC (paywall).
6. **Depende de:** Pipeline ML (artefacto JSON por ruta relativa `../ml/output/…`), tabla `kpi_observations`, Grafo de Reputación, Referencias (calidad), Monetización (gate AOC).
7. **Acoplamiento: MEDIO.** La costura con ML ya es limpia (artefacto); lo sucio es la triplicación interna (`hrkeyScoreService.js` vs `hrScore.service.js` vs `services/hrscore/*`) y el path relativo al monorepo.
8. **Desacoplar:** (a) consolidar los tres servicios de score en uno; (b) el artefacto ML debe llegar por registry/URL versionada, no por ruta relativa; (c) el paywall AOC sale del dashboard y se vuelve policy de acceso.
9. **Invertir:** el scoring no debe leer `kpi_observations` de otra base compartida — debe poseer su propio store alimentado por eventos KPI, o exponer contrato de ingesta.
10. **Sí — es el "Standalone Product" del portafolio** (Talent Intelligence API vendible por sí sola). Extracción a repo cerrado alineada con `OPEN_VS_CLOSED.md`.

### BC-08 · Pipeline de Entrenamiento ML

1. **Sí — ya es independiente de facto.** Python offline, cero imports cruzados; handoff por archivos (CSV in, JSON out).
2. **No (por diseño):** produce artefactos, no expone API. Correcto para un pipeline batch.
3. **Propio y aislado:** CSVs sintéticos/realistas en `ml/data/`, artefactos en `ml/models/` y `ml/output/`.
4. **Sí:** entrenamiento Ridge, export de coeficientes, análisis de correlación KPI (duplicado con BC-09).
5. **No.** No aplica.
6. **Depende de:** datos exportados de Supabase (offline). El backend depende de su *output*, no al revés.
7. **Acoplamiento: MÍNIMO.** La única costura es el archivo `hrkey_model_config_global.json`.
8. **Desacoplar:** nada del pipeline; formalizar el contrato del artefacto (schema + versión + firma).
9. **Invertir:** el consumidor (BC-07) debe resolver el artefacto vía un model-registry (aunque sea un bucket versionado), no vía path del monorepo.
10. **Sí — extracción inmediata y barata** a repo privado (CLOSED: pesos, features, datos de entrenamiento son crown jewels).

### BC-09 · Proof of Correlation

1. **Sí — ya es un servicio separado.** FastAPI + uvicorn propio (puerto 8000), pipeline batch propio (`run.py`).
2. **Sí:** `GET /api/correlation-summary`, `/api/model-summary`, `/api/correlation-details`, `/api/feature-importance`.
3. **Parcial:** escribe tablas propias (`correlation_results`, `model_baseline_results`) pero **lee 6 tablas ajenas** (`users`, `roles`, `references`, `user_kpis`, `cognitive_game_scores`, `job_outcomes`) por psycopg2 directo.
4. **Sí:** Pearson/Spearman, baselines LogReg/RandomForest — la "prueba estadística" del pitch.
5. **No propia:** dashboards Next.js lo consumen por HTTP.
6. **Depende de:** el esquema completo de la BD compartida (frágil ante cambios de schema del core).
7. **Acoplamiento: BAJO en código, ALTO en datos.**
8. **Desacoplar:** la lectura directa de tablas ajenas → dataset exportado/vista publicada con contrato.
9. **Invertir:** de "psycopg2 contra producción" a "consume snapshots publicados por el core" (data contract).
10. **Sí**, junto con BC-08 (mismo repo analítico privado tendría sentido: comparten dominio y duplican la lógica de correlación — consolidar).

### BC-10 · Product Analytics (event tracking)

1. **Todavía no.** Es una librería interna del backend, no un servicio.
2. **Sí:** `/api/analytics/{dashboard,funnel,demand-trends,…}` (superadmin-only).
3. **Sí:** `analytics_events` (JSONB) + 6 vistas materializadas (sql/008).
4. **Débiles:** taxonomía de 23 tipos de evento, funnels, métricas — reglas de reporting, no de dominio.
5. **Parcial:** `admin/dashboard`.
6. **Depende de:** todo el backend — `eventTracker` es **importado directamente** por `dataAccessController`, `companyController`, `signersController`, `server.js`.
7. **Acoplamiento: ALTO** (imports directos en múltiples controllers).
8. **Desacoplar:** los controllers no deben importar el tracker; deben emitir a una interfaz (`track(event)`) con implementación intercambiable (tabla hoy, cola/colector mañana).
9. **Invertir:** exactamente esa: dependencia de controllers → interfaz de eventos, con el tracker como plugin.
10. **A medio plazo** — o mejor: sustituible por una herramienta estándar (PostHog/Amplitude) detrás de la misma interfaz. No construir plataforma propia aquí.

### BC-11 · Billing Fiat (Stripe)

1. **Sí, pero solo después de consolidar.** Hoy hay **tres implementaciones paralelas**: backend Express (payment-intents + feature flags + `stripe_events` idempotente), `pages/api/` (suscripción $9.99 + referral loop), `HRkey/api/` (checkout serverless con webhook **stub sin persistencia**).
2. **Sí (×3):** `/api/billing/create-checkout-session` + `POST /webhook` (backend); `checkout/portal/webhook.ts` (pages); `HRkey/api/checkout/session.js` + `stripe/webhook.js`.
3. **Sí:** `products`, `checkout_sessions`, `user_feature_flags`, `revenue_transactions`, `stripe_events` — pero **escribe en `users`** (plan, `subscription_expires_at`, `stripe_customer_id`), invadiendo BC-01.
4. **Sí:** planes, promos, trials dinámicos por referidos, idempotencia de webhooks, feature flags.
5. **Sí:** pricing pages, portal de billing.
6. **Depende de:** Stripe (externo), Identidad (tabla `users`), Notificaciones.
7. **Acoplamiento: ALTO por fragmentación**, no por diseño.
8. **Desacoplar:** elegir UNA implementación (la del backend es la más completa: idempotencia + tests), retirar las otras dos; mover las columnas de suscripción de `users` a una tabla de entitlements propia de Billing.
9. **Invertir:** el resto del sistema no pregunta a Stripe ni a `users.plan`; pregunta a Billing por *entitlements* (`hasFeature(user, X)`).
10. **Sí — Shared Service clásico** una vez consolidado; extracción de dificultad media.

### BC-12 · Motor de Transacciones HRKCR (marketplace de créditos)

1. **Sí como módulo.** Servicio + controller + schema cohesivos (517 líneas, sql/029).
2. **Sí:** `/api/hrkey/{wallet,purchases,refunds,favorites,analytics/dashboard}` con access/download/refund/repeat-buy.
3. **Sí:** `hrkey_wallets`, `hrkey_purchases`, `hrkey_credit_ledger` (doble partida), `hrkey_purchase_access`, `hrkey_refund_disputes`, `hrkey_company_favorites`.
4. **Sí:** revenue split (⚠️ 80/20 en backend vs **70/30 hardcodeado en el gemelo frontend** `marketplace-engine.ts`, que además usa un ledger localStorage no persistido — bug de negocio latente), reembolsos con reversa de ledger, payouts a referees.
5. **Sí:** dashboards v2 de company/referee.
6. **Depende de:** Identidad, Referencias (qué se compra), Consentimiento (qué se desbloquea).
7. **Acoplamiento: MEDIO-ALTO** + el gemelo divergente en frontend.
8. **Desacoplar:** eliminar `marketplace-engine.ts` (localStorage) o reducirlo a caché del API; unificar el split en configuración única del backend.
9. **Invertir:** el unlock de contenido no debe estar en Referencias; Referencias emite "purchasable", HRKCR emite `purchase.settled`, y el acceso lo decide el PDP de BC-04.
10. **A medio plazo** — es el sistema de monetización activo; extraer tras estabilizar el split y matar al gemelo.

### BC-13 · Tokenomics Cripto (AOC / RLUSD / Payment Rail / Staking)

1. **Parcialmente.** Dos realidades: (a) AOC/RLUSD **cableado** en el backend (`/api/aoc/*`, `/api/rlusd/*`, withdrawal con state machine, locking e idempotencia — maduro); (b) el **Payment Rail on-chain** (`payment-processor.ts`, `rlusd-listener.ts`, `xrp-bridge.ts`, splitter 60/20/15/5, staking/slashing) **construido pero NO montado en el server** — workers standalone aspiracionales.
2. **Sí (parte a):** `/api/aoc/{balance,topup,transactions,convert}`, `/api/rlusd/{balance,transactions,withdrawals/*}`. **(parte b): no expuesta.**
3. **Sí:** `user_balances`, `aoc_transactions`, `aoc_conversion_requests`, `rlusd_*` (sql/023-028); rail: `payments`, `payment_splits`, `hrk_stakes`, `cross_border_settlements` (en `database/migrations/`, fuera de la numeración canónica).
4. **Sí:** conversión, retiros con máquina de estados, payout SINPE manual; rail: split 60/20/15/5, staking por tiers, slashing con apelaciones.
5. **Sí:** `aoc-wallet/*` components, `RlusdConversionCard`.
6. **Depende de:** Identidad, Base/RLUSD (externo), HRScore (es su paywall — dependencia entrante).
7. **Acoplamiento: parte a MEDIO; parte b AISLADO** (cero integración = cero acoplamiento, pero también cero uso).
8. **Desacoplar:** decidir el destino del rail no cableado (activar o archivar); consolidar los tres conceptos de "revenue" (`revenue_transactions` Stripe vs `hrkey_credit_ledger` vs `payments/payment_splits`).
9. **Invertir:** el paywall AOC en Talent Intelligence → policy/entitlement, igual que Billing.
10. **Sí para el rail (parte b): ya vive aparte de facto** — repo propio con contratos + workers. La parte a se extrae junto con la consolidación de monetización.

### BC-14 · Capa Protocolo On-chain (Anchor / Contratos)

1. **Sí — extracción casi gratuita.** `protocol/anchor/` usa ABI inline (no depende de artefactos compilados); el único acoplamiento build-time con la app es `copy-abi.cjs` copiando **un** JSON (`PeerProofRegistry.json`) al frontend.
2. **Sí (on-chain):** `anchorReference(bytes32)`, `createReference/suppress/revoke`, `recordReferencePackProof` + SDK TS (`AnchorService`, `getReferenceProof`).
3. **Mínimo y propio:** tabla `reference_anchors` (mapping hash→tx); on-chain solo hashes, nunca PII.
4. **Sí:** canonicalización RFC 8785 + Keccak256, verificación de receipts/eventos.
5. **No** (botón `CreateRefButton.jsx` y página about en el frontend, marginal).
6. **Depende de:** RPC de Base + claves de firma por env (`ANCHOR_PRIVATE_KEY`, etc.). La app puede correr sin él (fail-safe: el insert Supabase es no bloqueante).
7. **Acoplamiento: BAJO.** Direcciones por env, ABIs inline. Deuda propia: 6 variantes de `hardhat.config.*` y build roto (HH2/3 + OZ4/5, según `ANCHOR_LAYER_IMPLEMENTATION.md`).
8. **Desacoplar:** publicar el ABI de `PeerProofRegistry` como paquete versionado en lugar de `copy-abi.cjs`; limpiar los configs de Hardhat.
9. **Invertir:** el backend no llama al anchor inline; consume `AnchorService` como cliente de un servicio/worker que reacciona a `pack.committed`.
10. **Sí — candidato #2 a repo propio inmediato** (`hrkey-protocol`): contratos + SDK + deploy scripts. Además es exactamente lo que `OPEN_VS_CLOSED.md` declara OPEN.

### BC-15 · Wallet y Custodia

1. **Sí.** Creación de wallets custodiales (Coinbase Smart Wallet SDK) razonablemente aislada.
2. **Sí:** `POST /api/wallet/create`, `GET /api/wallet/:userId`.
3. **Sí:** `wallets` (sql/012).
4. **Moderadas:** provisioning custodial, vinculación usuario-wallet (`requireWalletLinked`).
5. **Sí:** `WalletSetup.tsx`, `wallet/connect/[schemaId]`.
6. **Depende de:** Identidad, Coinbase SDK (externo).
7. **Acoplamiento: BAJO-MEDIO.**
8. **Desacoplar:** poco; separar custodia (server-side) de conexión de wallet del usuario (browser, wagmi) — hoy conviven conceptos distintos bajo "wallet".
9. **Invertir:** nada crítico.
10. **Sí, a medio plazo**, probablemente junto al repo de protocolo o al de tokenomics.

### BC-16 · LOU Agent

1. **Sí.** Superficie mínima.
2. **Sí:** `/api/lou-agent/{start,message}`.
3. **Escaso/embebido.**
4. **Sí (conversacionales).** 5. **Sí:** `components/chat/*`.
6. **Depende de:** LLM externo, contexto del usuario.
7. **Acoplamiento: BAJO.** 8. Poco. 9. Nada crítico.
10. **Prematuro** — clasificar y observar; no invertir en extracción.

### BC-17 · Notificaciones / Email

1. **Sí.** `emailService.js` + Resend + tabla `notifications`.
2. **Parcial:** consumido como util interno, no como API.
3. **Sí:** `notifications` (sql/012).
4. **Débiles:** plantillas, envío.
5. **Parcial:** `NotificationBell.tsx`.
6. **Consumido por:** Identidad (invitaciones), Referencias (requests), Billing.
7. **Acoplamiento: MEDIO** (import directo desde múltiples servicios).
8. **Desacoplar:** import directo → interfaz `notify(event)`.
9. **Invertir:** los dominios emiten eventos; Notificaciones se suscribe — no al revés.
10. **Sí, fácil** — Shared Service pequeño; o sustituir por proveedor (Knock/Courier) tras la interfaz.

### BC-18 · Heartbeat

Trivial: script standalone con `package.json` propio, solo comparte credencial service-role y una tabla. **1)** Sí. **2-5)** No aplica. **6)** Solo Supabase. **7)** Nulo. **8-9)** Nada (idealmente credencial propia con permiso mínimo). **10)** **Sí — extracción de 10 minutos**; valor de negocio nulo, valor de higiene alto.

### BC-19 · Legacy (WebDapp, `pages/` stubs, `sql/deprecated/`)

**No se extrae: se retira.** `index/app/auth.html` son stubs de redirección; `pages/` redirige a WebDapp; `public/WebDapp/*.html` es la UI original; copias adicionales en `HRkey/public/deprecated/`. ⚠️ **Riesgo activo:** `data_access_requests` está en `sql/deprecated/` pero sigue consultada en vivo por `backend/app.js` (`hasApprovedReferenceAccess`) y `dataAccessController` — el "deprecated" es aspiracional. Desacoplar = completar la migración de datos-acceso a `capability_grants` y borrar.

---

## 3. Clasificación de capacidades

| Capability | Clasificación | Justificación |
|---|---|---|
| BC-04 SDL / Consentimiento | **Reusable Platform Capability** | Genérico (consent + audit + PDP), ya librería con tests, declarado OPEN |
| BC-14 Protocolo On-chain (Anchor) | **Reusable Platform Capability** | Anclaje de hashes genérico, acoplamiento mínimo, OPEN por política |
| BC-08 Pipeline ML | **Reusable Platform Capability** (interna/CLOSED) | Pipeline batch reutilizable para cualquier modelo futuro; costura por artefacto |
| BC-01 Identidad y Organizaciones | **Shared Service** | Backbone consumido por todos; extraíble solo al final |
| BC-11 Billing Fiat (Stripe) | **Shared Service** | Clásico; requiere consolidación previa de las 3 implementaciones |
| BC-17 Notificaciones / Email | **Shared Service** | Pequeño, transversal, fácil de invertir a pub/sub |
| BC-15 Wallet y Custodia | **Shared Service** | Provisioning custodial transversal |
| BC-02 Perfiles y Onboarding | **Shared Service** | Datos maestros de candidato consumidos por varios contextos |
| BC-07 HRScore / Talent Intelligence | **Standalone Product** | El diferenciador vendible por API; crown jewel CLOSED |
| BC-09 Proof of Correlation | **Standalone Product** (candidato) / hoy Experimental-plus | Evidencia estadística monetizable; servicio ya separado |
| BC-03 Referencias Verificables | **Application Feature (CORE)** | Core domain: se modulariza, no se extrae |
| BC-06 Trust Model v1 | **Application Feature** | Recién nacido; consolidar semántica vs BC-05 |
| BC-12 Motor HRKCR | **Application Feature** → futuro Shared Service | Monetización activa acoplada al core |
| BC-10 Product Analytics | **Application Feature** → sustituible por herramienta | No construir plataforma propia |
| BC-05 Grafo de Reputación | **Application Feature** → futuro Platform Capability | Valioso pero dependiente del volumen del core |
| BC-13b Payment Rail cripto / Staking / Slashing | **Experimental** | Construido, no cableado, sin tráfico |
| BC-16 LOU Agent | **Experimental** | Superficie mínima, valor no probado |
| BC-18 Heartbeat | **Shared Service (utility)** | Trivial |
| BC-19 WebDapp + pages/ + sql/deprecated | **Legacy** | Retirar, no extraer |

---

## 4. Matriz de capacidades

Escalas: Difficulty 1(fácil)–5(muy difícil) de extraer · Business Value 1–5 · **Reuse Score** = potencial de reutilización fuera del producto actual · **Technical Extraction Score** = qué tan extraíble es HOY (100 = se extrae ya).

| Capability | Owner (equipo lógico) | Consumers | Database | API | Frontend | Dependencies | Diff. | Biz Value | Reuse (0-100) | Extract (0-100) |
|---|---|---|---|---|---|---|---|---|---|---|
| BC-18 Heartbeat | Platform/Ops | — (ops) | `heartbeat` | No | No | Supabase cred | 1 | 1 | 20 | **98** |
| BC-08 Pipeline ML | Data/ML | HRScore (artefacto JSON) | Archivos (CSV/pkl/JSON) | No (batch) | No | Export de datos offline | 1 | 4 | 70 | **95** |
| BC-14 Protocolo On-chain | Protocol | Referencias (anchor), Frontend (1 ABI) | `reference_anchors` + on-chain | SDK TS + contratos | Marginal | RPC Base, claves env, `copy-abi.cjs` | 2 | 3 | 85 | **90** |
| BC-09 Proof of Correlation | Data/ML | Dashboards Next | Propia: 2 tablas; lee 6 ajenas | FastAPI propia | No | psycopg2 a BD compartida | 2 | 4 | 60 | **80** |
| BC-13b Payment Rail cripto | Protocol | — (sin tráfico) | 4 tablas (aisladas) | Workers (no montados) | No | Contratos, RPC | 2 | 2 | 55 | **85** |
| BC-04 SDL / Consent | Platform | Referencias, Data-Access, todos los endpoints protegidos | `consents`, `audit_events`, `capability_grants`, `sdl_statements` | Sí | Modales/pages | Identidad | 3 | 5 | **90** | 70 |
| BC-17 Notificaciones | Platform | Identidad, Referencias, Billing | `notifications` | Interna | Bell | Resend | 2 | 2 | 75 | 75 |
| BC-15 Wallet/Custodia | Protocol | Identidad, Tokenomics | `wallets` | Sí | Setup UI | Coinbase SDK | 2 | 3 | 60 | 75 |
| BC-11 Billing Stripe | Monetization | Identidad (entitlements), UI pricing | 6 tablas + invade `users` | Sí (×3 → 1) | Pricing/portal | Stripe, webhooks | 3 | 4 | 70 | 55 |
| BC-02 Perfiles/CV | Core App | Referencias, Scoring, UI | `profiles`, `profile_*` (+ dupes) | Parcial | Onboarding/CV | Identidad, Storage | 3 | 3 | 50 | 60 |
| BC-09→ BC-10 Product Analytics | Growth | Superadmin | `analytics_events` + 6 MV | Sí (admin) | Admin dash | Imports en 4+ controllers | 3 | 2 | 30 | 45 |
| BC-05 Grafo Reputación | Intelligence | Talent Intelligence, UI red | `reputation_graph_*` | Sí | Network viz | Referencias (tablas), Identidad | 3 | 4 | 65 | 55 |
| BC-12 Motor HRKCR | Monetization | Company/Referee dashboards | 6 tablas `hrkey_*` | Sí | Dashboards v2 | Identidad, Referencias, gemelo localStorage | 4 | 5 | 40 | 50 |
| BC-13a AOC/RLUSD | Monetization | Talent Intelligence (paywall), wallet UI | 6+ tablas | Sí | aoc-wallet | Identidad, Base | 4 | 3 | 45 | 50 |
| BC-07 HRScore/Talent Intel | Intelligence (CLOSED) | Recruiters (UI), futuro API externo | `hrkey_scores`, snapshots; lee `kpi_observations` | Sí (rica) | Dashboard TI | ML artifact, Grafo, Referencias, paywall | 4 | **5** | 80 | 45 |
| BC-06 Trust Model v1 | Core App | Dashboards, Admin | 6 tablas + RPCs/vistas | RPC/vistas | Admin trust | Referencias, lógica en SQL | 3 | 3 | 40 | 40 |
| BC-01 Identidad/Orgs | Platform | **TODOS** | `users`, `companies`, `company_signers` | Sí | Auth/onboarding | Supabase Auth; invadida por Billing | **5** | 5 | 70 | 25 |
| BC-03 Referencias (CORE) | Core App | Scoring, Grafo, HRKCR, Trust, Anchor | `references`, `reference_invites`, packs | Sí (la más rica) | Flujos completos | Identidad, Perfiles, Consent, Monetización, Anchor | **5** | **5** | 30 | 20 |
| BC-16 LOU Agent | Core App | UI chat | Mínima | Sí (2 rutas) | Chat | LLM externo | 2 | 2 | 35 | 70 |
| BC-19 Legacy | — | — | `sql/deprecated` (¡aún en uso!) | Stubs | WebDapp HTML | — | 2 (retiro) | 0 | 0 | n/a (retirar) |

---

## 5. Dependencias a invertir (top 8, en orden de impacto)

1. **BD-como-bus → contratos de datos/eventos.** Regla objetivo: cada tabla tiene UN contexto escritor; los demás consumen API o eventos. Es la inversión madre de todas las demás.
2. **Controllers → `eventTracker` (BC-10):** los dominios emiten a una interfaz de tracking; el tracker es un plugin, no un import.
3. **Referencias → Anchor/Monetización (BC-03):** Referencias emite `reference.completed` / `pack.committed`; Anchor y HRKCR se suscriben. El core deja de conocer blockchain y pagos.
4. **Endpoints → tablas de consent (BC-04):** todo acceso pasa por un PDP (`can(actor, action, resource)`); nadie más lee `consents`/`capability_grants`.
5. **HRScore → `ml/output/*.json` por path relativo (BC-07/08):** artefacto vía registry versionado (bucket + manifest), no filesystem del monorepo.
6. **Stripe/HRKCR → columnas de `users` (BC-11/01):** entitlements propios de Billing consultados por API; `users` deja de ser el cajón de suscripciones.
7. **Proof-of-Correlation → psycopg2 sobre 6 tablas ajenas (BC-09):** snapshots/datasets publicados con schema versionado.
8. **Frontend dual-path (apiClient + fallback Supabase directo) → un solo camino:** el frontend consume API; el acceso directo a tablas compartidas se elimina (excepto los contextos cuyo dueño es el propio frontend, p.ej. SDL con cliente inyectado).

---

## 6. Orden óptimo de extracción

Principio: **primero higiene (consolidar duplicados), luego lo ya-desacoplado (wins baratos), luego plataforma, luego servicios compartidos; el core se modulariza al final y se extrae nunca-o-último.** Ninguna ola requiere reescrituras del core; cada ola reduce el riesgo de la siguiente.

### Ola 0 — Higiene y consolidación (pre-requisito, sin extracción)
1. Retirar **BC-19 Legacy**: WebDapp, `pages/` stubs, copias en `HRkey/public/deprecated/`; completar la migración de `data_access_requests` (deprecated pero viva) a `capability_grants`.
2. Consolidar **Stripe a 1 implementación** (la del backend: idempotencia + tests); borrar `pages/api/*` y el webhook stub de `HRkey/api/`.
3. Matar el **gemelo localStorage** (`marketplace-engine.ts`) y unificar el revenue split (80/20 vs 70/30) en configuración única — es un bug de negocio, no solo deuda.
4. Consolidar los **3 servicios de HRScore** y las **2 migraciones duplicadas** de snapshots; unificar clientes Supabase.
5. Limpiar `hardhat.config.*` (6 variantes) y desbloquear el build de contratos.

### Ola 1 — Extracciones gratuitas (ya desacopladas de facto)
6. **BC-18 Heartbeat** → repo/ops propio (o cron gestionado). Extract 98.
7. **BC-08 Pipeline ML** → repo privado `hrkey-ml` (CLOSED). Formalizar el contrato del artefacto JSON. Extract 95.
8. **BC-14 Protocolo On-chain** → repo `hrkey-protocol` (OPEN): contratos + `protocol/anchor` + deploy scripts + ABI publicado como paquete (sustituye `copy-abi.cjs`). Extract 90.
9. **BC-13b Payment Rail cripto** → decisión de producto: si no se activa en 1-2 quarters, archivarlo dentro de `hrkey-protocol`; no dejar código muerto en el repo de la app. Extract 85.
10. **BC-09 Proof of Correlation** → mismo repo que `hrkey-ml` (consolidando la lógica de correlación duplicada); su lectura de BD se cambia a datasets publicados. Extract 80.

### Ola 2 — Capacidades de plataforma
11. **BC-04 SDL/Consent** → librería/servicio único (unificar las 3 implementaciones) con PDP como interfaz. Es la capacidad de mayor Reuse Score (90) y gatea a Referencias, Data-Access y Marketplace: extraerla primero simplifica todas las olas siguientes.
12. **BC-17 Notificaciones** → interfaz `notify(event)` + servicio pequeño (o proveedor SaaS detrás de la interfaz).

### Ola 3 — Servicios compartidos
13. **BC-11 Billing Stripe** (ya consolidado en Ola 0) → servicio con entitlements propios; desinvade `users`.
14. **BC-15 Wallet/Custodia** → junto a `hrkey-protocol` o como servicio propio.
15. **BC-10 Product Analytics** → invertir a interfaz de eventos y evaluar sustitución por herramienta estándar antes de extraer nada.

### Ola 4 — Inteligencia (el producto plataforma)
16. **BC-05 Grafo de Reputación** → ingesta por eventos (`reference.completed`), luego servicio propio.
17. **BC-07 HRScore/Talent Intelligence** → repo privado CLOSED como **Standalone Product** (API vendible), consumiendo: artefacto ML del registry (Ola 1), grafo (16), eventos KPI. El paywall AOC se convierte en entitlement (Ola 3).

### Ola 5 — Núcleo (modularizar, no extraer)
18. **BC-12 Motor HRKCR** y **BC-13a AOC/RLUSD** → consolidar los tres conceptos de revenue en un modelo único de monetización; extraíble como Shared Service solo después.
19. **BC-06 Trust Model v1** → fusionar semántica con BC-05 o mantener como feature del core.
20. **BC-03 Referencias** y **BC-01 Identidad** → módulos del modular monolith con interfaces explícitas. Identidad es lo último extraíble (Extract 25); Referencias probablemente nunca — es la razón de ser de la aplicación.

### Criterio de secuenciación (por qué este orden)
- **Ola 1 antes que todo lo demás:** máximo Technical Extraction Score con riesgo ~0; genera los repos `hrkey-ml` y `hrkey-protocol` que materializan la política OPEN/CLOSED ya escrita.
- **SDL antes que Billing/Marketplace:** el PDP es la dependencia que Referencias, Data-Access y HRKCR necesitan tener invertida para poder moverse después.
- **Billing antes que HRScore:** el paywall de Talent Intelligence debe apoyarse en entitlements para que HRScore pueda salir sin arrastrar la monetización.
- **Grafo antes que HRScore:** HRScore consume el grafo; extraer el consumidor antes que el proveedor duplicaría el acoplamiento a la BD compartida.
- **Identidad al final:** invertir primero todas las dependencias entrantes (entitlements, PDP, eventos) reduce su blast radius de "todo el sistema" a "verificación de JWT + perfil".

---

## 7. Riesgos y decisiones abiertas para Sprint 3

| Riesgo / decisión | Contexto | Acción sugerida |
|---|---|---|
| Split 80/20 vs 70/30 vs 60/20/15/5 | BC-12/13 | Decisión de negocio inmediata; una sola fuente de verdad |
| `data_access_requests` deprecated pero en producción | BC-19/04 | Completar migración antes de tocar consent |
| Webhook Stripe de `HRkey/api` sin persistencia | BC-11 | Confirmar que no recibe tráfico real; retirar |
| Tres nociones de "trust/reputation" (BC-05, BC-06, trust weighting) | BC-05/06 | Definir un ubiquitous language único |
| Service-role key compartida por todos los procesos | Transversal | Credenciales por servicio con permisos mínimos al extraer |
| Build de contratos roto (HH2/3, OZ4/5) | BC-14 | Resolver en la creación de `hrkey-protocol` |
| Auth no aplicada en middleware Next (no-op) | BC-01 | Auditar que la RLS + backend cubren todos los caminos |
