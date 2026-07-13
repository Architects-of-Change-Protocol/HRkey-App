# HRkey — Informe de Due Diligence Técnica (Buy-Side)

**Tipo de encargo:** Technology Due Diligence — escenario de adquisición por fondo de inversión
**Perspectiva:** CTO / VC Technical Due Diligence Lead / M&A Technology Advisor (independiente)
**Fecha:** 13 de julio de 2026
**Alcance:** Repositorio `Architects-of-Change-Protocol/HRkey-App` (código, esquema de datos, contratos, ML, CI/CD, documentación, gobernanza). No incluye: entrevistas con el equipo, acceso a infraestructura productiva, métricas de uso real, estados financieros.

---

## 1. Resumen ejecutivo

HRkey (nombre de paquete aún `peerproof`, rebrand incompleto) es una plataforma de referencias laborales verificadas con marketplace de reutilización, trust scoring, suscripciones Stripe y capas aspiracionales de ML y blockchain. El repositorio contiene **~950 archivos**, ~465 de código (319 JS, 81 TSX, 63 TS, 23 Python, 43 SQL, 9 Solidity), desarrollados por **un único contribuidor** en **50 commits** entre marzo y mayo de 2026, con autoría mayoritariamente asistida por IA y sin revisión independiente.

**Conclusión general:** el activo es un **MVP funcional con superficie de producto real y velocidad de construcción notable, pero con deuda estructural severa, un incidente de seguridad crítico abierto, y capas de "tecnología diferencial" (ML, blockchain, payment rail Web3) que en inspección resultan decorativas o no desplegadas.** El valor técnico transferible reside en la UX del producto, el modelo de datos reciente (trust model v1) y la suite de tests; no en propiedad intelectual algorítmica ni en efectos de red (todavía sin datos reales).

**Score técnico agregado: 3.3 / 10** — "Early MVP con deuda material; no apto para escala ni enterprise sin remediación significativa".

**Tres hallazgos que condicionan cualquier transacción:**
1. **CRÍTICO (seguridad):** una clave Supabase `service_role` (acceso total a la BD, ignora RLS, expira en 2035) está incrustada en HTML servido al navegador (`HRkey/public/promo-register.html`), y la propia guía de remediación del repo confirma que la rotación de credenciales (Supabase, Stripe, Resend) sigue **PENDIENTE** — además de imprimir las claves reales en markdown versionado.
2. **CRÍTICO (IP):** no existe archivo LICENSE (el README exhibe un badge MIT falso), no hay campo `author`/`license` en los package.json, y el historial git fue reescrito/truncado. La titularidad debe formalizarse contractualmente antes del cierre.
3. **ALTO (veracidad):** patrón sistemático de documentación que declara "PRODUCTION READY" contradicho por admisiones internas ("not executed in this container", "0 tests" vs 815 tests, R²=0.50 anunciado vs 0.268 real). **Ninguna claim de readiness del vendedor debe aceptarse sin verificación.**

---

## 2. Metodología

Revisión estática exhaustiva del repositorio mediante cinco líneas de análisis paralelas: (a) arquitectura y backend, (b) seguridad, (c) base de datos y diseño de API, (d) calidad de build, testing, CI/CD, documentación y gobernanza, (e) ML, blockchain, productización y moat. Cada hallazgo se cita con ruta de archivo. Escala de puntuación: 0–10, donde 5 = estándar aceptable para una startup seed con disciplina de ingeniería, 7+ = grado growth/enterprise.

---

## 3. Scorecard

| # | Dimensión | Score | Veredicto corto |
|---|-----------|:-----:|-----------------|
| 1 | Transferibilidad | **3.5** | Bus factor 1, sin LICENSE, docs contradictorias, rebrand a medias |
| 2 | Escalabilidad | **3.0** | Rate limiter en memoria, sin colas/caché, jobs in-process, listas sin paginar |
| 3 | Vendor Lock-in (independencia) | **3.0** | 233 clientes Supabase sin abstracción; Vercel, Stripe, `aoc/runtime` v0.1.0 externo |
| 4 | Arquitectura | **4.0** | Intención de capas real, pero 3 apps solapadas y router-monolito de 2.068 líneas |
| 5 | Multi-Tenant | **3.5** | Modelo `company_id` existe; el aislamiento depende de checks manuales, no de RLS |
| 6 | Security | **2.5** | service_role key en HTML público; credenciales sin rotar; buenos webhooks/Zod |
| 7 | Governance | **3.0** | CODEOWNERS y tiers OPEN/CLOSED, pero un solo revisor y sin licencia |
| 8 | Documentation | **4.0** | Volumen alto, fiabilidad baja: ~25 informes generados por IA que se contradicen |
| 9 | Ownership (IP) | **4.0** | Sin GPL/AGPL (solo LGPL débil vía sharp); sin LICENSE ni cesión formal |
| 10 | Build Quality | **3.0** | CI verde engañoso (suites disjuntas), único run completo: 62,5% pass; lint no-op |
| 11 | Code Quality | **4.0** | Frontend TS estricto y 815 tests reales vs backend JS sin tipos, archivos muertos |
| 12 | Database | **4.5** | Trust model v1 (029–031) casi productivo; sin migration runner, replay imposible |
| 13 | API Design | **3.5** | ~129 endpoints sin versionado ni OpenAPI; 3 convenciones de respuesta |
| 14 | Productization | **5.0** | Flujos V2 completos (onboarding, dashboards, admin, marketplace), Stripe real |
| 15 | Technical Moat | **2.0** | Todo commodity; el moat teórico (dataset de referencias reales) aún no existe |
| 16 | AI Readiness | **3.0** | 2 llamadas reales a gpt-4.1-mini; "ML" = fórmula lineal sobre datos sintéticos |
| 17 | Enterprise Readiness | **2.0** | Sin SSO/SAML, sin compliance formal (datos RRHH = alto riesgo GDPR), secretos expuestos |
| 18 | Platform Readiness | **3.0** | Sin API pública versionada, sin SDKs ni webhooks salientes; "protocolo" no desplegado |
| 19 | Capability Readiness | **3.0** | Velocidad de ejecución altísima (IA-asistida), pero equipo de 1 y cero revisión externa |
| | **Agregado (media ponderada)** | **3.3** | |

Ponderación: Security, Escalabilidad, Arquitectura, Database y Transferibilidad ×1.5; resto ×1.0. La media simple es 3.4; la ponderada, 3.3.

---

## 4. Análisis por dimensión

### 4.1 Transferibilidad — 3.5/10
**Qué mide:** cuánto costaría a un equipo comprador tomar el control efectivo del activo.

- **Bus factor = 1.** Todo el historial (50 commits, 31-mar → 12-may-2026) pertenece a un autor; los mensajes referencian PRs hasta #321, lo que indica historial reescrito o importado — se pierde trazabilidad de decisiones.
- Tres aplicaciones solapadas (Next.js raíz legacy, `HRkey/` como frontend real, `backend/` Express) sin un mapa canónico; un nuevo equipo no puede saber qué es autoritativo sin arqueología (el `vercel.json` raíz revela que se despliega `HRkey/`).
- Rebrand PeerProof→HRKey incompleto: `package.json` aún se llama `peerproof`, `contracts/PeerProofRegistry.sol`, `scripts/deploy-peerproof.js` y locks residuales.
- **A favor:** ~815 casos de test reales documentan comportamiento esperado; CONTRIBUTING.md define tiers OPEN/CLOSED/REVIEW; runbooks parciales (`backend/docs/RUNBOOK_LAUNCH0.md`).

### 4.2 Escalabilidad — 3.0/10
- **Rate limiting en memoria de proceso** (`backend/middleware/rateLimit.js`, `Map` a nivel de módulo): con N réplicas los límites se multiplican por N — la app no es horizontalmente escalable tal cual.
- **Sin caché** (cero referencias a redis/lru/memcached en backend), **sin cola de trabajos** (no Bull/BullMQ/Agenda): el procesamiento de pagos corre con `setInterval` in-process (`backend/services/payments/payment-processor.ts:404`) y un listener blockchain persistente (`rlusd-listener.ts`) dentro del mismo proceso API — sin garantías de reintento/at-least-once para movimiento de dinero.
- **Sin pool de conexiones compartido:** un solo `pg.Pool` (locking de retiros RLUSD); el resto son 233 clientes Supabase HTTP instanciados a nivel de módulo.
- **Listas sin límite:** solo ~16 de 40 controladores paginan; endpoints como `/api/references/me`, `/api/audit/logs`, `/api/rlusd/transactions` devuelven colecciones no acotadas (riesgo de DoS y degradación con volumen).
- Riesgo N+1 en los servicios de grafo de reputación (fan-out de `.select().in()` sin batching).

### 4.3 Vendor Lock-in — 3.0/10 (score = independencia; el lock-in es alto)
- **Supabase, profundo y sin capa de abstracción:** 233 sitios de `createClient` en 139 archivos backend; cambiar de proveedor Postgres u ORM tocaría >100 archivos. Es el mayor lock-in individual.
- **Vercel** (deploy vía `@vercel/next`), **Stripe** (fragmentado en 3 integraciones), **Sentry** (bajo, un punto), **Resend** (email).
- **Dependencia externa de riesgo singular:** `aoc/runtime ^0.1.0` — paquete de terceros v0.x del que dependen capability tokens y el payment rail (`backend/services/aocRuntimeClient.js`); además el spec está malformado en `backend/package.json` (falta la `@`), lo que puede romper `npm ci`.
- Blockchain (Base/ethers/Hardhat) añade superficie de mantenimiento, aunque al no estar desplegado su lock-in efectivo es bajo.

### 4.4 Arquitectura — 4.0/10
- **Positivo:** el backend tiene capas discernibles (≈40 controllers, ≈50 services con subdominios `payments/`, `hrscore/`, `analytics/`), los controllers delegan en services, y el frontend real (`HRkey/`) es App Router moderno con TS estricto.
- **Negativo:** router-monolito `backend/app.js` de **2.068 líneas con 125 rutas inline** (el directorio `routes/` contiene un único archivo de 0 bytes); tres raíces de aplicación solapadas más un anidamiento accidental `HRkey/HRkey/`; **6 variantes de hardhat.config**; 13 archivos backup versionados; parche vacío `observability.patch`; servicios de 17–26 KB sin descomponer.
- Dos webhooks de Stripe con modelos mentales distintos (suscripciones en `pages/api/webhook.ts`, payment intents en Express) mutando las mismas tablas desde codebases distintas.

### 4.5 Multi-Tenant — 3.5/10
- Existe frontera de tenant B2B: `company_id` aparece 162 veces; `companyController.js` scopea consultas por compañía. No hay `organization_id`/`tenant_id` genérico.
- **El aislamiento NO lo garantiza la base de datos:** el backend opera con la service-role key (bypassa RLS), de modo que la separación entre tenants depende de checks `.eq('company_id', …)` y guards (`requireSelfOrSuperadmin`) repartidos en ~40 controladores. La auditoría interna (`docs/PERMISSION_AUDIT_REPORT.md`) admite "potential bypass risks" por autorización delegada a controllers y al menos un endpoint público (`GET /api/wallet/:userId`).
- Las ~84 políticas RLS existentes solo protegen el acceso directo cliente→Supabase, y quedan anuladas mientras la service_role key esté expuesta (ver 4.6).

### 4.6 Security — 2.5/10
**Crítico (abierto):**
- `HRkey/public/promo-register.html:207-210` incrusta una clave JWT cuyo payload decodifica a `"role":"service_role"` (mal etiquetada como ANON) y la entrega a cualquier visitante: **acceso total de lectura/escritura a la base de datos, RLS anulada**, expiración 2035.
- `SECURITY_REMEDIATION_GUIDE.md` y `PRODUCTION_READINESS_ANALYSIS.md` imprimen las claves reales (anon + service_role) y su propio checklist marca la rotación de Supabase/Stripe/Resend como **PENDIENTE**. Deben asumirse comprometidas.
- Sprawl de claves anon de producción en ≥8 archivos HTML/TSX cliente, incluyendo una clave anon antigua distinta (rotación histórica incompleta).

**Positivo (acreditable):**
- El equipo ejecutó auditorías internas reales y **corrigió** los hallazgos de código: IDOR de verificación de identidad, endpoints ML/KPI públicos, ruta debug, CORS permisivo (ahora rechaza orígenes desconocidos en producción y hay allow-list), helmet, tres niveles de rate limiting.
- Webhook Stripe del backend: firma verificada + idempotencia vía `stripe_events`. SQL parametrizado en todo uso de `pg`; validación Zod (parcial, ~12 puntos de 125 rutas).
- El bypass de auth para tests (`ALLOW_TEST_AUTH_BYPASS`) está triplemente condicionado (NODE_ENV=test + flag + headers) y cubierto por un test que verifica que no funciona fuera de test — bien resuelto.
- Sin claves privadas blockchain hardcodeadas (todas vía env).

**El score refleja que la postura de código mejoró, pero la higiene de secretos —lo más determinante— sigue rota.**

### 4.7 Governance — 3.0/10
- Existen CODEOWNERS (todo bajo un único owner), plantillas de issue/PR, SECURITY.md mínimo, y un CONTRIBUTING.md breve pero sustantivo (tiers OPEN/CLOSED, prohibición de commitear datasets/fórmulas/pricing, certificación de derechos de IP).
- **Sin LICENSE**, sin política de branch protection verificable, y toda autoridad de revisión concentrada en una persona: el proceso de gobernanza es nominal, no operativo.

### 4.8 Documentation — 4.0/10
- ~25 markdown en raíz + ~18 en backend + docs/: volumen muy superior a la media seed, pero son mayormente **informes de estado generados por IA**, no runbooks mantenidos. Tres quickstarts y dos guías de deployment solapadas.
- **Se contradicen frontalmente:** `PRODUCTION_READINESS_ANALYSIS.md` afirma "0 tests en todo el proyecto"; `TEST_EXECUTION_REPORT.md` documenta 518 tests y señala explícitamente la contradicción. Mezcla ES/EN sin criterio.
- Sin documentación de API (cero OpenAPI para ~129 endpoints).
- Valor real: los informes de remediación de seguridad y auditoría de permisos son honestos y útiles como mapa de riesgos.

### 4.9 Ownership (IP) — 4.0/10
- **Limpio de copyleft fuerte:** sin GPL/AGPL; solo LGPL-3.0 vía `@img/sharp-libvips` (transitiva, enlace dinámico, riesgo bajo).
- **Sin LICENSE, badge MIT falso en README, sin campos author/license**, sin headers de copyright. La cadena de titularidad es verosímil (un solo autor identificable) pero **no está formalizada**; con autoría mayormente generada por IA, el comprador debe exigir cesión de IP por escrito y warranty de no-infracción como condición de cierre.
- Dependencia de `aoc/runtime` (paquete externo v0.1.0) introduce IP de terceros en el corazón del payment rail.

### 4.10 Build Quality — 3.0/10
- **El verde de CI no es fiable:** el jest raíz solo ejecuta `backend/__tests__/**` (no la suite grande `backend/tests/**`); el jest del backend solo ejecuta `.js` (excluye silenciosamente los tests `.ts` de auth-bypass y wallets). Ningún pipeline ejecuta la suite completa.
- **El único run completo documentado (TEST_EXECUTION_REPORT.md): 323 pass / 177 fail / 62,5%**, sin evidencia posterior de remediación.
- Lint: job de CI "no-op" documentado ("No lint script configured. Skipping."); el ESLint del frontend se auto-desactiva bajo `CI`/`VERCEL` y `ignoreDuringBuilds: true`. Sin job de typecheck. El build del frontend nunca se ejercita en CI. Sin workflow de deploy (Vercel externo).
- Defectos puntuales: import corrupto `from '/globals'` en `backend/__tests__/unit/auth-bypass.test.ts:1`; dependencia malformada `"aoc/runtime"`; artefactos de build (`artifacts/`, `cache/`) commiteados.

### 4.11 Code Quality — 4.0/10
- **A favor:** `HRkey/` es TypeScript estricto; los tests de permisos/IDOR son genuinos; separación controller/service consistente; el código de dinero (payments) es de lo poco tipado del backend.
- **En contra:** backend 136 JS vs 6 TS (sin tipos justo donde vive la lógica de negocio); archivos muertos de 0 bytes (`referenceController.js`, `walletController.js`, `authMiddleware.js`) y pares singular/plural de refactors abandonados; 167 `console.*` conviviendo con winston; 13 backups versionados; graveyard `deprecated/` en tres ubicaciones.

### 4.12 Database — 4.5/10 (la dimensión técnica más sólida)
- **Lo bueno:** la capa reciente (`sql/029–031`, trust data model v1) es casi grado producción: UUIDs, TIMESTAMPTZ, 189 índices, CHECKs cruzados, ledger append-only de trust events, RLS por operación con helpers `auth.uid()`, políticas idempotentes, triggers de recálculo. 38 tablas con RLS, ~84 políticas.
- **Lo malo:** no hay migration runner (SQL manual en 4 ubicaciones); **colisiones de ordinales** (dos `010`, dos `011`, dos `013`, dos `018`); `001` hace `ALTER TABLE users` antes de que ninguna migración cree `users` → **el esquema no es replayable desde cero**; `users.role` definido dos veces con dominios incompatibles (`user/admin/superadmin` vs `candidate/referee/company/admin`) mientras el helper RLS keyea sobre `role='admin'`; `backend/schema.sql` es dialecto MySQL inválido en Postgres; solo 2 rollbacks de ~34 migraciones; **~6 sistemas de ledger/moneda paralelos sin consolidar** (Stripe×2, payments genérico, AOC, RLUSD, créditos HRKey, on-chain) con conceptos de "compra/acceso" cuadruplicados.

### 4.13 API Design — 3.5/10
- ~129 endpoints (125 en Express, 3+1 en los dos Next). **Sin versionado** (el "V2" es solo UI), **sin OpenAPI**, tres convenciones de envelope (`{ok}`, `{success}`, `{error}` desnudo), REST mezclado con RPC-en-path (`/withdrawals/:id/complete|fail|cancel`).
- El webhook Stripe del app Next raíz **no tiene guard de idempotencia** (reprocesa redeliveries; riesgo de doble aplicación de eventos de suscripción) y contiene un branch muerto (`.update({})` vacío). Códigos de estado razonables pero con 500 como código más frecuente (paths de error sin mapear).
- Rate limiting por niveles: correcto.

### 4.14 Productization — 5.0/10 (la dimensión más alta)
- **Producto real y navegable:** flujos V2 completos de onboarding (candidato/empresa/referee), dashboards, reference builder, panel admin con moderación de trust, wallet, marketplace de reutilización de referencias, perfiles públicos por slug. Dos meses de construcción UI intensiva verificable en el log.
- Stripe Checkout suscripciones ($9.99/año PRO) + loop de referidos funcional; email transaccional Resend; instrumentación de analytics propia.
- **Faltan:** i18n (grave: codebase bilingüe ES/EN y foco de payouts en Costa Rica sin framework de localización), feature flags de runtime, app móvil (solo responsive), y verificación de que los "PRODUCTION READY" declarados se ejecutaron realmente (el informe del trust model admite que las migraciones nunca se corrieron contra staging).

### 4.15 Technical Moat — 2.0/10
- El núcleo funcional es CRUD sobre Supabase + integraciones estándar; un equipo competente lo reconstruiría en semanas/pocos meses.
- Las capas "diferenciales" colapsan bajo inspección: ML = 6 coeficientes; trust score = suma ponderada SQL legible; blockchain = no desplegada; "AI validation" = heurísticas y un stub de embeddings con la llamada real comentada.
- **El moat plausible es el que aún no existe:** el marketplace de referencias reutilizables y el grafo de referencias codifican un efecto de red de dos lados en el esquema — pero sin un solo dato real, es una opción, no un foso. Todo el training data es sintético con correlaciones auto-diseñadas (admitido en `DATASET_HARDENING_SUMMARY.md`).

### 4.16 AI Readiness — 3.0/10
- **Real:** dos integraciones OpenAI `gpt-4.1-mini` en producción (refinado de referencias `POST /api/ai/reference/refine`; parsing de CV). Commodity pero funcionales.
- **No real:** el "modelo ML" en runtime es un producto punto de 6 coeficientes (`backend/hrkeyScoreService.js:194-206`) exportados de un Ridge entrenado con datos 100% sintéticos y circulares; el `ridge_global.pkl` nunca se carga; el R² anunciado (0.50 "PRODUCTION READY") es en realidad 0.268 en el artefacto commiteado, y sobre datos falsos no mide nada. `embeddingService.js` devuelve mock embeddings por hash ("STUB"); `fraudDetector.js` es reglas. Existe un segundo stack Python/FastAPI (proof_of_correlation) desconectado del producto y sin datos que consumir.
- No hay pipeline de retraining, feature store, evaluación, ni gobernanza de modelos. Cualquier prima de valoración por "IA propietaria" carece de soporte en el código.

### 4.17 Enterprise Readiness — 2.0/10
- Sin SSO/SAML/SCIM, sin roles enterprise, sin audit trail certificable, sin SOC2/ISO ni artefactos de compliance. Trata **datos de empleo y desempeño de personas** (categoría de alto riesgo GDPR/privacidad) sin DPA, sin política de retención/borrado (no existe soft-delete), y con un incidente de exposición de credenciales sin cerrar.
- Sin SLAs, sin DR/backup documentado (delegado implícitamente a Supabase), observabilidad parcial (Sentry + winston, pero 167 console.log y un patch de observabilidad vacío).

### 4.18 Platform Readiness — 3.0/10
- No hay API pública versionada, ni OpenAPI, ni SDKs, ni webhooks salientes, ni sandbox de partners: hoy no es una plataforma, es una app.
- La narrativa de "protocolo" (contratos HRK token/staking/slashing/anchor, ~2.100 LoC Solidity) está **sin desplegar, sin auditar y sin compilar** (la propia doc admite compilación y tests BLOCKED por conflictos Hardhat 2/3, OZ 4/5); el anchor on-chain solo es invocable por CLI y ningún código de producto lo llama. Eliminarlo no afectaría al producto — es milestone de grant, no infraestructura.

### 4.19 Capability Readiness — 3.0/10
- **Velocidad demostrada excepcional:** un solo operador con herramientas de IA construyó en ~10 semanas una superficie que a un equipo tradicional le llevaría 3–4× más. Esa capacidad de ejecución es un activo real si la persona acompaña la transacción.
- **Pero:** organización de una persona, cero revisión por pares, proceso de calidad no operativo (CI engañoso, lint no-op), y un patrón documentado de declarar completitud sin verificación. La capacidad actual no es institucional: se va con el fundador.

---

## 5. Fortalezas acreditables

1. **Superficie de producto completa y coherente** (onboarding V2, dashboards, admin, marketplace) — el activo más valioso del repo.
2. **Trust data model v1** (sql/029–031): modelado, constraints y RLS de calidad casi productiva.
3. **~815 casos de test reales**, incluyendo tests de permisos/IDOR y del bypass de auth — infrecuente en esta etapa.
4. **Respuesta a auditorías internas:** los hallazgos de código (IDOR, endpoints públicos, CORS, debug route) fueron efectivamente corregidos.
5. **Higiene de pagos en el path principal:** firma de webhook + idempotencia + SQL parametrizado + Zod.
6. **IP limpio de copyleft fuerte** (sin GPL/AGPL).
7. **Velocidad de iteración** demostrable (PRs #298–#321 en semanas).

## 6. Red flags consolidadas

| Severidad | Hallazgo |
|---|---|
| Crítica | service_role key en HTML público + credenciales (Supabase/Stripe/Resend) sin rotar e impresas en markdown versionado |
| Crítica | Sin LICENSE / badge MIT falso / titularidad de IP no formalizada / historial git reescrito |
| Alta | Patrón sistemático de sobredeclaración ("PRODUCTION READY" vs admisiones de no-ejecución; R² inflado; "0 tests" vs 815) |
| Alta | Aislamiento multi-tenant solo en código de aplicación (service key bypassa RLS) con bypass risks admitidos |
| Alta | No escalable horizontalmente (rate limit en memoria, jobs in-process sobre dinero, sin colas/caché) |
| Alta | CI/test theater: suites disjuntas, único run completo al 62,5%, lint/typecheck inexistentes |
| Alta | Esquema no replayable (colisiones de ordinales, ALTER antes de CREATE, enum de roles contradictorio) + 6 ledgers de dinero paralelos |
| Media | Webhook Stripe (Next) sin idempotencia — riesgo de doble procesamiento |
| Media | Lock-in Supabase sin capa de abstracción (233 call sites) + dependencia `aoc/runtime` v0.1.0 externa y malformada |
| Media | Capas ML/blockchain/payment-rail decorativas que inflan la narrativa del activo |
| Media | Bus factor 1 con autoría IA sin revisión — riesgo de continuidad y de calidad latente |

---

## 7. Valoración técnica relativa

**Marco:** valor técnico ≈ (coste de reposición del núcleo útil) − (deuda de remediación) − (descuento de riesgo), expresado como % del coste de reposición. No es una valoración de la empresa (que dependería de tracción, ingresos y equipo), sino del **activo tecnológico aislado**.

**Coste de reposición del núcleo útil** (producto V2 + backend de dominio + trust model + tests, excluyendo capas decorativas): estimado en **9–12 meses-ingeniero senior** ≈ **USD 220k–350k** a tarifas de mercado (o materialmente menos con el mismo enfoque IA-asistido, lo que en sí comprime el valor de reposición de cualquier codebase pre-tracción).

**Deuda de remediación para llegar a "escalable y vendible"** (rotación de secretos y limpieza de historial, consolidación a una app+un backend, migration runner y replay del esquema, unificación de ledgers, colas/caché/rate-limit distribuido, CI real, OpenAPI+versionado, i18n, hardening multi-tenant): **6–9 meses-ingeniero** ≈ **USD 150k–250k**.

**Descuentos de riesgo:** incidente de seguridad abierto sobre datos de RRHH (posible deber de notificación si hubo acceso), IP no formalizada, bus factor 1, cero datos reales (el "moat" vale 0 hoy), claims del vendedor no fiables.

**Conclusión de valoración:**

> **Valor técnico relativo: 20–30% del coste de reposición → rango indicativo USD 60k–110k como activo de software puro**, condicionado a (i) rotación completa de credenciales verificada, (ii) cesión de IP y licencia formalizadas, y (iii) un periodo de transición del fundador. Con score agregado 3.3/10, el activo se sitúa en el cuartil "acqui-hire / asset deal", no en el de "premium tecnológico".
>
> Dicho de otro modo: **un comprador está pagando por la superficie de producto, el modelo de datos de trust y la opcionalidad del marketplace de referencias — no por IP algorítmica, no por infraestructura escalable, y no por datos.** Si la transacción se justifica, será por tracción comercial, equipo o estrategia, no por la tecnología per se.

---

## 8. Qué aumentaría el valor (value drivers)

Ordenado por impacto en múltiplo técnico:

1. **Datos reales.** El primer millar de referencias verificadas genuinas convierte el marketplace de esquema-sin-datos en un activo con efecto de red — es el único candidato a moat. Impacto: el mayor de toda la lista, con diferencia.
2. **Cerrar el incidente de secretos y demostrarlo** (rotación + purga de historial + escaneo): elimina el descuento de pasivo contingente y desbloquea cualquier conversación enterprise.
3. **Formalizar el IP:** LICENSE, cesión de derechos, inventario de dependencias — barato, y sin ello el activo es difícil de comprar en absoluto.
4. **Suite de tests verde y unificada + CI honesto** (una config, typecheck, lint real): convierte los 815 tests de pasivo reputacional en activo verificable.
5. **Consolidación arquitectónica:** una sola app frontend, un backend, un solo sistema de ledger de dinero con tabla de equivalencias y migración de los 5 restantes. Reduce el coste de integración post-adquisición ~40%.
6. **Migration runner + esquema replayable** (resolver colisiones y el enum de roles): prerequisito de cualquier entorno nuevo (staging, on-prem, DR).
7. **Escalabilidad mínima creíble:** rate limit distribuido, cola de jobs para pagos, paginación universal — pasa la historia de "demo" a "servicio".
8. **API versionada + OpenAPI:** habilita integraciones ATS/HRIS, que es donde vive el valor B2B de este dominio.
9. **Compliance de datos RRHH** (DPA, retención/borrado, RLS como defensa en profundidad): en este vertical, es condición de acceso al mercado enterprise, no un nice-to-have.
10. **Un segundo ingeniero con ownership real** (bus factor 2+): reduce el descuento de continuidad.

## 9. Qué lo disminuye (value detractors)

1. **La clave service_role expuesta en cliente + credenciales sin rotar** — pasivo contingente activo; en el peor caso, obligaciones de notificación de brecha sobre datos laborales.
2. **Ausencia de LICENSE y de cadena de titularidad formal** — sin esto no hay activo transferible, hay un repositorio.
3. **La brecha sistemática documentación-realidad** — obliga al comprador a re-verificar todo, encareciendo la diligencia y erosionando la confianza en cualquier claim futura del vendedor.
4. **Cero datos reales y ML sintético-circular** — cualquier narrativa de "IA propietaria" o "modelo predictivo validado" resta credibilidad en vez de sumar valor.
5. **Blockchain no desplegada mantenida en el repo** — coste de mantenimiento y ruido de diligencia sin retorno; hoy es narrativa de grant, no producto.
6. **Seis sistemas de dinero paralelos** — riesgo de contabilidad incoherente y coste de consolidación que el comprador descontará al 100%.
7. **No escalabilidad horizontal** — cualquier plan de crecimiento exige re-plataformar los fundamentos de runtime primero.
8. **Bus factor 1 + autoría IA sin revisión** — la velocidad no es institucional; el conocimiento tácito se va con una persona.
9. **Suite de tests en rojo (62,5%) con CI que lo oculta** — invierte el signo del activo "tests".
10. **Lock-in Supabase sin abstracción + dependencia `aoc/runtime` v0.1.0** — reduce opciones estratégicas del comprador (self-host, multi-cloud, enterprise on-prem).

---

## 10. Plan de remediación recomendado (post-cierre, 30/60/90)

**Días 0–30 (contención):** rotar todas las credenciales y verificar; purgar secretos de código, docs e historial; retirar `promo-register.html` y todo HTML legacy con claves; auditar logs de Supabase por accesos anómalos; añadir LICENSE y formalizar cesión de IP; congelar las capas blockchain/RLUSD.

**Días 31–60 (fiabilidad):** unificar configuración de tests y llevar la suite a verde; CI con typecheck+lint+build reales; migration runner (p.ej. dbmate/Flyway) con replay verificado y resolución del enum de roles; idempotencia en el webhook de suscripciones; paginación universal.

**Días 61–90 (escala y consolidación):** eliminar la app Next raíz y `HRkey/HRkey/`; extraer jobs de pago a una cola; rate limiting distribuido; descomponer `app.js` en routers; capa de acceso a datos sobre Supabase; OpenAPI v1; decidir formalmente el destino de AOC/RLUSD/créditos (consolidar a 1–2 ledgers).

Presupuesto estimado del plan completo: **USD 150k–250k / 6–9 meses-ingeniero**, ya descontado en la valoración de §7.

## 11. Condiciones precedentes sugeridas para la transacción

1. Evidencia de rotación de credenciales y de auditoría de accesos de Supabase (o representación y garantía específica sobre ausencia de brecha, con indemnidad).
2. Cesión de IP por escrito del autor único; declaración sobre herramientas/licencias usadas en la generación del código.
3. Escrow/earn-out ligado a un periodo de transición del fundador (mínimo 6 meses) dada la concentración de conocimiento.
4. Re-verificación independiente de cualquier claim de "production readiness" incluida en el data room.
5. Exclusión explícita (o valoración a cero) de las capas token/staking/slashing y payment rail Web3, salvo que el comprador tenga tesis regulatoria propia.

---

*Este informe se basa exclusivamente en el análisis estático del repositorio a fecha 2026-07-13 (HEAD `4e7d35e`). Las claves y secretos citados se referencian por ubicación, nunca por valor. La valoración de §7 es indicativa del activo tecnológico aislado y no constituye una valoración de empresa ni asesoramiento de inversión.*
