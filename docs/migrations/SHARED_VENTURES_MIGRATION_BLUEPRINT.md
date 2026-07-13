# Shared Ventures — Migration Blueprint

**Rol:** Principal Migration Architect
**Estado:** DISEÑO — no ejecutar todavía. Este documento es el blueprint; no contiene código.
**Alcance:** Migración de HRkey-App (monolito single-venture) a la arquitectura **Shared Ventures**: un core compartido del protocolo AoC (identidad, permisos, pagos, reputación, analytics) sobre el cual HRkey pasa a ser el **primer venture** (`venture_id = 'hrkey'`), y nuevos ventures se montan sin duplicar plataforma.

---

## 0. Contexto y supuestos de partida

Lo ya acordado en fases previas (dominio, capabilities, arquitectura objetivo) se asume como dado. Supuestos operativos que este blueprint fija explícitamente:

| # | Supuesto | Implicación |
|---|----------|-------------|
| S1 | Un solo proyecto Supabase compartido, multi-tenant por `venture_id` (no un proyecto por venture). | La migración es *in-place* con expand/contract; no hay migración de datos entre clusters. |
| S2 | HRkey es el venture fundacional: todo dato existente se adscribe a `venture_id = 'hrkey'`. | Los backfills son deterministas (valor constante), lo que reduce riesgo. |
| S3 | El backend Express (Render) se conserva como runtime; se re-estructura en `platform/` (core) + `ventures/hrkey/` (dominio). | No hay re-plataforma de runtime simultánea a la migración de datos. Regla de oro: **una dimensión de riesgo por fase**. |
| S4 | Frontend Next.js (Vercel, `HRkey/`) se conserva; se introduce `packages/shared-ui` y `packages/shared-sdk` de forma incremental. | |
| S5 | Contratos (Hardhat/Base) quedan fuera del critical path de esta migración; solo se versionan interfaces en `open/`. | |
| S6 | Estado actual verificado en repo: migraciones SQL dispersas en 4 directorios (`sql/`, `backend/migrations/`, `backend/supabase/`, `database/migrations/`), CI en 3 workflows (`backend-ci`, `contracts-ci`, `test`), storage vía `HRkey/src/lib/storage/supabase-storage-provider.ts`, cliente privilegiado en `lib/supabaseAdmin.ts`. | La Fase 0 consolida esto antes de tocar nada. |

**Principio rector:** cada fase debe ser **individualmente desplegable, individualmente reversible y compatible con el código de la fase anterior** (N y N-1 conviven siempre).

---

## 1. Orden de migraciones (fases)

```
F0 Consolidación        → F1 Expand schema      → F2 Backfill + dual-write
F3 Core services        → F4 RLS por venture    → F5 Auth/Storage/Functions
F6 Read-switch + canary → F7 Contract (cleanup) → F8 Segundo venture (prueba real)
```

### F0 — Consolidación de base (pre-migración, sin cambio funcional)
1. Unificar las 4 fuentes de migraciones SQL en **un solo árbol** `supabase/migrations/` con numeración timestamp y ledger (`schema_migrations`). Las migraciones históricas se congelan como "baseline 000".
2. Capturar **snapshot de schema canónico** (dump) firmado y archivado — es la referencia de rollback estructural.
3. Inventario de superficies: tablas, policies RLS existentes, buckets, edge functions/servicios, endpoints REST, secretos por entorno.
4. Congelar cambios de schema fuera del nuevo árbol (guardrail en CI, ver §9).

### F1 — Expand del schema (aditivo, cero impacto)
1. Crear tablas de plataforma: `ventures`, `venture_members`, `venture_domains`, `venture_settings`, `capability_grants` (extendida), `platform_audit_events`.
2. Añadir columna `venture_id` **nullable + default 'hrkey'** a toda tabla de dominio (perfiles, referencias, invites, scores, pagos, ledger, reputación, consents, KPI, analytics).
3. Índices compuestos nuevos (`(venture_id, …)` sobre las claves de acceso actuales) creados `CONCURRENTLY`.
4. Ninguna policy, constraint NOT NULL, ni FK obligatoria todavía. **Nada del código existente cambia de comportamiento.**

### F2 — Backfill + dual-write
1. Backfill batched (lotes pequeños, idempotentes, con tabla de progreso `migration_backfill_progress`) poniendo `venture_id='hrkey'` donde sea NULL.
2. Activar **dual-write** en la capa de acceso a datos: todo INSERT/UPDATE escribe `venture_id` explícito (detrás de flag `sv_dual_write`, ver §14).
3. Job de verificación continua: contador de filas con `venture_id IS NULL` debe converger a 0 y mantenerse.
4. Solo cuando NULL-count = 0 durante ≥72 h: `SET NOT NULL` + FK a `ventures` (con `NOT VALID` → `VALIDATE CONSTRAINT` para no bloquear).

### F3 — Extracción de core services (código, sin tocar datos)
Orden de extracción a `platform/` (del menos acoplado al más acoplado):
1. `logger`, `observability`, `config` → `platform/telemetry`, `platform/config`
2. `supabaseAdmin`, middleware auth, permisos/capabilities → `platform/data-access`, `platform/auth`
3. Pagos (Stripe, RLUSD, payout adapters) → `platform/payments`
4. Reputación/graph, consents/audit → `platform/reputation`, `platform/consent`
5. Lo que queda (HRScore, referencias, invites, onboarding, marketplace) → `ventures/hrkey/` — los crown-jewels de `docs/OPEN_VS_CLOSED.md` se mueven **conservando su clasificación CLOSED**.

Cada servicio de plataforma recibe `ventureContext` como parámetro obligatorio (nunca implícito).

### F4 — RLS por venture (detalle en §5)
### F5 — Auth, Storage, Functions (detalle en §6–§8)
### F6 — Read-switch: las lecturas pasan a filtrar por venture (flag `sv_scoped_reads`), con canary y shadow (§15–§16)
### F7 — Contract: eliminar rutas legacy, defaults `'hrkey'`, policies antiguas, código de compatibilidad
### F8 — Onboarding del segundo venture en staging: **es el test de aceptación real de toda la arquitectura**

**Regla de secuencia:** nunca se ejecutan dos fases con riesgo de datos (F1/F2/F4) en la misma ventana. Mínimo 1 ciclo completo de despliegue estable entre ellas.

---

## 2. Cambios de schemas

| Cambio | Tipo | Fase | Reversible |
|---|---|---|---|
| Tablas `ventures`, `venture_members`, `venture_domains`, `venture_settings` | Aditivo | F1 | DROP simple |
| `venture_id UUID/TEXT` en ~todas las tablas de dominio (nullable, default `'hrkey'`) | Aditivo | F1 | DROP COLUMN |
| Índices `(venture_id, <clave_actual>)` CONCURRENTLY | Aditivo | F1 | DROP INDEX |
| Backfill `venture_id='hrkey'` | Datos | F2 | No necesario (valor constante, sin pérdida) |
| `NOT NULL` + FK `venture_id → ventures.id` (`NOT VALID`→`VALIDATE`) | Restrictivo | F2-fin | `DROP CONSTRAINT` / `DROP NOT NULL` |
| Únicos re-scoped: claves únicas que hoy son globales (p. ej. slug de perfil público, email de invite) pasan a únicas **por venture** `(venture_id, x)` | Restrictivo | F4 | Restaurar índice único global |
| Vistas de compatibilidad `hrkey_*` (proyección filtrada por venture) para consumidores legacy | Aditivo | F4 | DROP VIEW |
| Renombres/movimientos de tablas a schema `platform` vs `venture` (opcional) | **Diferido a post-F8** | — | — |

**Prohibido durante toda la migración:** renombrar columnas existentes, cambiar tipos, borrar tablas. Todo renombre se hace vía vista/columna nueva + deprecación (expand/contract puro).

---

## 3. Cambios de imports

1. **Mapa de módulos objetivo** (workspaces npm):
   - `@aoc/platform-auth`, `@aoc/platform-data`, `@aoc/platform-payments`, `@aoc/platform-telemetry`, `@aoc/shared-sdk` (cliente TS para frontend), `@aoc/shared-ui`
   - `@ventures/hrkey-*` para dominio HRkey.
2. **Estrategia de transición sin big-bang:** en F3 se crean los paquetes nuevos que **re-exportan** desde las rutas viejas (shim). Los imports se migran módulo a módulo; la ruta vieja emite `deprecation warning` en dev/CI.
3. **Codemod planificado** (no manual): reescritura de `require('../services/X')` → `@aoc/...` con verificación de igualdad de exports en tests.
4. `lib/supabaseAdmin.ts` (raíz) y sus duplicados en backend se colapsan en **un único** `@aoc/platform-data/adminClient` con factory que exige `ventureContext`.
5. **Regla de dirección de dependencias (verificada en CI):** `ventures/*` puede importar `platform/*`; `platform/*` **jamás** importa `ventures/*`. Import lint como gate.
6. Frontend `HRkey/`: los accesos directos a Supabase se canalizan por `@aoc/shared-sdk` (mismo patrón shim → codemod).

---

## 4. Cambios de APIs

1. **Versionado por prefijo:** superficie actual se congela como legacy; nueva superficie `/v2/ventures/:ventureId/...` (o venture resuelto por dominio/host — ver `venture_domains`). Ambas conviven de F4 a F7.
2. **Resolución de venture** (middleware de plataforma, orden de precedencia):
   1. Host/dominio (`venture_domains`) → 2. Header `X-Venture-Id` (solo service-to-service) → 3. Claim de sesión (§6) → 4. Fallback `'hrkey'` **solo mientras exista legacy** (se elimina en F7).
3. **Contratos de respuesta:** sin cambios de shape en legacy; `v2` añade `venture` en el envelope. Errores nuevos: `403 VENTURE_MISMATCH`, `404 VENTURE_NOT_FOUND`.
4. **Webhooks entrantes** (Stripe, Resend, on-chain listeners): un solo endpoint de plataforma que enruta al venture por metadata (`venture_id` en el objeto Stripe/metadata del evento). Los webhooks existentes de HRkey siguen funcionando vía fallback hasta F7.
5. **Idempotencia:** claves de idempotencia de pagos pasan a estar namespaced por venture (`{venture_id}:{key}`) — obligatorio antes de habilitar el segundo venture.
6. **Deprecación:** legacy responde con header `Deprecation` + `Sunset` desde F6; cierre en F7 tras 2 ciclos sin tráfico (medido, no asumido).

---

## 5. Cambios de RLS

Estado actual: policies por usuario/rol (candidate/referee/admin) sin dimensión de tenant. Cambio de modelo:

1. **Funciones helper de plataforma** (SECURITY DEFINER, `STABLE`):
   - `platform.current_venture_id()` — lee el claim `venture_id` del JWT (§6).
   - `platform.is_venture_member(vid)` / `platform.has_capability(vid, cap)` — resuelven contra `venture_members` + `capability_grants`.
2. **Patrón de policy compuesto:** toda policy de dominio se convierte en `(<predicado actual de usuario/rol>) AND venture_id = platform.current_venture_id()`.
3. **Rollout en dos tiempos para no romper sesiones vivas:**
   - F4a: se añaden las policies nuevas **en paralelo** a las existentes (OR efectivo — permisivo, sin regresión).
   - F4b (tras verificar en shadow que el predicado venture nunca deniega tráfico legítimo hrkey): se eliminan las policies antiguas → el predicado venture pasa a ser obligatorio.
4. **Service role:** el backend con `service_role` bypasea RLS — por eso el scoping por venture se impone **también en la capa `@aoc/platform-data`** (defensa en profundidad: RLS para clientes directos, guard de aplicación para service role). Ninguna query de servicio sin `venture_id` explícito pasa el linter de data-access.
5. **Tablas de plataforma** (`ventures`, `venture_members`): RLS propio — un miembro solo ve sus ventures; administración solo vía capability `platform:admin`.
6. **Auditoría:** test suite de RLS por tabla × rol × venture (matriz, ver §12) es gate de CI desde F4.

---

## 6. Cambios de Auth

1. **Supabase Auth se mantiene** como IdP único de la plataforma. Una identidad = un `auth.users`; la pertenencia a ventures vive en `venture_members` (una persona puede pertenecer a N ventures con roles distintos por venture).
2. **Claims:** Custom Access Token Hook añade al JWT: `venture_id` activo, `venture_roles` (mapa venture→rol), `capabilities` resumidas. Cambio de venture activo = re-mint de token (endpoint `POST /v2/session/venture`), no re-login.
3. **Migración de usuarios existentes:** backfill en F2 crea `venture_members(user, 'hrkey', rol_actual)` a partir de los roles actuales (candidate/referee/admin/superadmin). El superadmin actual (`HRKEY_SUPERADMIN_EMAIL`) se convierte en `platform:admin` + `hrkey:admin`.
4. **Compatibilidad:** mientras exista legacy, el hook emite también los claims con el shape antiguo. Los tokens vivos (hasta expiración, TTL corto) siguen siendo válidos: las policies F4a los aceptan.
5. **Invites/onboarding:** los tokens de invite (ya endurecidos en migraciones 013–015) ganan `venture_id` en su payload firmado; validación rechaza cross-venture.
6. **Redirect URLs / email templates:** pasan a plantillas parametrizadas por venture (branding, dominio de retorno) en `venture_settings`.
7. **Riesgo específico:** el bypass de test `ALLOW_TEST_AUTH_BYPASS` debe recibir venture-scoping también, o los tests darán falsos verdes (ver §18-R7).

---

## 7. Cambios de Storage

1. **Convención de paths:** todo objeto pasa a `{bucket}/{venture_id}/{...path_actual}`. Buckets se mantienen (evita mover objetos entre buckets); el namespacing es por prefijo.
2. **Policies de storage:** espejo del patrón RLS — `(storage.foldername(name))[1] = platform.current_venture_id()::text` AND predicado de usuario actual.
3. **Migración de objetos existentes:** copy-then-switch (no move destructivo):
   - F5a: job idempotente copia objetos a prefijo `hrkey/` manteniendo el original.
   - F5b: `supabase-storage-provider.ts` lee con **fallback en cascada** (nuevo path → path legacy) detrás de flag.
   - F7: verificación de que el 100 % resuelve por path nuevo → borrado de originales (con manifiesto y período de gracia de 30 días).
4. **URLs firmadas** ya emitidas (en emails, PDFs, packs de referencia anclados): siguen apuntando al path legacy — por eso el borrado se difiere y se registra qué artefactos externos contienen URLs (reference packs con hash anclado on-chain **no se re-firman**: el hash cubre contenido, no path, verificar en F0).
5. **Cuotas/límites por venture:** `venture_settings.storage_quota` con enforcement en la capa de plataforma (no bloqueante para esta migración; diseño listo).

---

## 8. Cambios de Functions (edge/servicios/jobs)

1. Inventario F0 clasifica cada function/job/cron en: **plataforma** (pagos, webhooks, telemetría, identity) vs **venture** (scoring HRkey, correlation, referencias).
2. **Contrato de invocación:** toda function recibe `venture_id` explícito en payload o lo deriva del recurso; ninguna function "asume hrkey" después de F7.
3. **Jobs programados** (snapshots HRScore, KPI observations, reputación): pasan a iterar `for venture in ventures where enabled(capability)` — con presupuesto/timeouts por venture para que un venture no agote el presupuesto del job de otro (aislamiento de blast radius).
4. **Webhook handlers** (Stripe events table, RLUSD listeners): enrutado por metadata como en §4.4; la tabla `stripe_events` gana `venture_id`.
5. **Colas/locking** (`rlusdWithdrawal.locking`): claves de lock namespaced por venture.
6. Despliegue: functions de plataforma y de venture se despliegan desde pipelines separados (§9) para que un venture no pueda romper el deploy de plataforma.

---

## 9. Cambios de CI/CD

Workflows actuales: `backend-ci.yml`, `contracts-ci.yml`, `test.yml`, `refresh-lockfile.yml`.

1. **Path-filtered pipelines:** `platform-ci` (packages `@aoc/*`), `venture-hrkey-ci`, `contracts-ci` (sin cambios), `migrations-ci` (nuevo).
2. **`migrations-ci` (nuevo, gate obligatorio):**
   - Lint de migraciones (solo aditivas salvo etiqueta `contract-phase` aprobada por CODEOWNERS).
   - Apply completo contra Postgres efímero + **apply del rollback** correspondiente (toda migración PR incluye su down o justificación de irreversibilidad).
   - Suite RLS matrix (§12) contra el schema resultante.
   - Diff de schema contra snapshot canónico → artefacto de revisión.
3. **Guardrails:** CI falla si aparece un `.sql` fuera de `supabase/migrations/` (cierra la dispersión actual de 4 directorios); import-lint de dirección de dependencias (§3.5); linter "query sin venture_id" en `platform-data`.
4. **Entornos:** `preview` (Vercel PR) → `staging` (proyecto Supabase de staging con seed multi-venture: hrkey + venture sintético `demo`) → `prod`. **Staging corre SIEMPRE con 2 ventures** — es la única forma de detectar fugas cross-tenant antes de prod.
5. **Despliegue coordinado:** las migraciones de datos se aplican **antes** del deploy de código que las usa (expand), y el contract solo después de confirmar que ningún deploy activo referencia lo eliminado. Orden codificado en el pipeline, no en la memoria del operador.
6. **CODEOWNERS:** rutas CLOSED/crown-jewel conservan su protección al moverse (actualizar paths en la misma PR del movimiento).

---

## 10. Estrategia Zero Downtime

**Patrón maestro: expand → dual-write → backfill → shadow-read → read-switch (canary) → contract.** Ninguna fase requiere ventana de mantenimiento porque:

- Todos los cambios de schema F1 son aditivos con default; `CONCURRENTLY` para índices; `NOT VALID` para FKs → sin locks largos.
- El código N siempre funciona contra el schema N+1 (compat hacia atrás garantizada por contrato de fase).
- RLS se endurece en dos tiempos (permisivo→estricto) para no invalidar sesiones vivas.
- Storage usa copy-then-switch con fallback de lectura.
- API legacy y v2 conviven hasta que el tráfico legacy medido sea 0.

**Downtime esperado: 0 minutos de indisponibilidad planificada.** Ver §17 para el análisis de degradación residual.

---

## 11. Feature Flags

Fuente de verdad: `venture_settings` + config de plataforma (evaluación server-side en middleware; el frontend recibe flags resueltos, nunca evalúa).

| Flag | Controla | Fase on | Fase remove |
|---|---|---|---|
| `sv_dual_write` | Escritura de `venture_id` explícito | F2 | F7 |
| `sv_scoped_reads` | Lecturas filtradas por venture (por % de tráfico, ver canary) | F6 | F7 |
| `sv_rls_strict` | Retirada de policies legacy (F4b) | F4b | F7 |
| `sv_auth_claims_v2` | Hook de claims nuevo | F5 | F7 |
| `sv_storage_paths_v2` | Path nuevo con fallback | F5 | F7 |
| `sv_api_v2` | Exposición de rutas `/v2` | F4 | permanente→config |
| `sv_shadow_compare` | Shadow read + diff logging | F6 | F7 |
| `venture:{id}:enabled` | Kill-switch por venture | F8 | permanente |

Reglas: cada flag tiene owner, criterio de retiro y **fecha de expiración**; flag vencido = warning en CI. Todo flag es kill-switch instantáneo (rollback de comportamiento sin redeploy).

---

## 12. Validaciones

1. **Integridad de datos (F2):** conteos por tabla `total = count(venture_id='hrkey')`; checksums muestrales por lote de backfill; job continuo NULL-count=0.
2. **Matriz RLS (F4, gate permanente):** para cada tabla sensible × {anon, candidate, referee, admin de hrkey, usuario de venture `demo`, service} → aserción de filas visibles/escribibles. El caso crítico: **usuario de `demo` ve 0 filas de hrkey en todas las tablas.**
3. **Equivalencia funcional (F6):** shadow compare (§16) con umbral de divergencia 0 en endpoints de lectura core antes del read-switch.
4. **Paridad de imports (F3):** tests de igualdad de superficie exportada shim vs paquete nuevo; suite completa verde con ambos paths de import.
5. **Storage (F5):** manifiesto origen/destino con conteo + hash por objeto; verificación de que packs anclados on-chain conservan hash válido.
6. **Auth (F5):** token viejo y token nuevo válidos simultáneamente contra staging; matrix de roles legacy → membership.
7. **Rendimiento:** p95 de los 10 endpoints top no degrada >10 % tras añadir predicado venture (los índices compuestos F1.3 existen precisamente para esto; verificar con `EXPLAIN` en migrations-ci).

---

## 13. Smoke Tests (post-deploy de cada fase, automatizados)

Suite `smoke:shared-ventures` (~5 min, corre contra el entorno recién desplegado):

1. Health checks backend (`/health`) + DB + Supabase reachability.
2. Login candidate + login referee → JWT contiene claims esperados (shape legacy y/o v2 según fase).
3. Flujo crítico 1 — referencia: crear invite → aceptar → submit referencia → visible para el candidate correcto, con `venture_id='hrkey'`.
4. Flujo crítico 2 — HRScore: solicitar score → snapshot persiste scoped.
5. Flujo crítico 3 — pago: checkout Stripe test-mode → webhook procesado → evento en `stripe_events` con venture correcto.
6. Storage: subir avatar → leer por URL firmada (path v2 con fallback según fase).
7. **Negative smoke:** usuario del venture `demo` (staging) intenta leer un recurso hrkey por ID directo → 403/404, y viceversa.
8. Legacy API responde idéntico a baseline grabado (contract snapshot) hasta F7.

Fallo de smoke = rollback automático del deploy (código) o activación de kill-switch (flag), según la fase.

---

## 14. Acceptance Criteria (definición de "migración completa")

- [ ] AC1: 0 filas con `venture_id IS NULL` en todas las tablas de dominio; constraints NOT NULL + FK validadas.
- [ ] AC2: 100 % de policies RLS incluyen predicado de venture; matriz RLS verde en CI; 0 policies legacy activas.
- [ ] AC3: 0 tráfico en rutas legacy durante 2 ciclos de release; rutas retiradas.
- [ ] AC4: `platform/*` sin ningún import desde `ventures/*` (lint verde); shims eliminados.
- [ ] AC5: Storage 100 % resuelto por path v2; originales purgados tras gracia; packs anclados verifican hash.
- [ ] AC6: Claims v2 en el 100 % de sesiones nuevas; hook legacy retirado.
- [ ] AC7: **Un segundo venture (`demo`) se aprovisiona end-to-end en staging solo con datos/config — cero cambios de código de plataforma — y sus usuarios no pueden tocar datos de hrkey ni viceversa (verificado por suite adversarial).**
- [ ] AC8: p95 de endpoints core dentro de +10 % del baseline pre-migración.
- [ ] AC9: Todos los flags `sv_*` de transición retirados del código.
- [ ] AC10: Runbook de onboarding de venture documentado y ejecutado una vez (F8).

**AC7 es el criterio soberano:** si exige tocar código de plataforma, la arquitectura no está compartida de verdad.

---

## 15. Canary

- **Ámbito:** el read-switch (F6) y el endurecimiento RLS (F4b) — los dos cambios con riesgo de denegar tráfico legítimo.
- **Mecánica:** `sv_scoped_reads` se activa por cohortes: 1 % (usuarios internos) → 5 % → 25 % → 100 %, con asignación estable por hash de user-id (una sesión nunca oscila entre modos).
- **Métricas guardián por cohorte (auto-halt si se cruzan):** tasa de 403/404 vs baseline (+0,5 pp), tasa de respuestas vacías anómalas en listados, error rate 5xx, p95.
- **Duración mínima por escalón:** 24 h con tráfico representativo (incluye jobs nocturnos).
- **Halt = flag off automático** + evento de auditoría; no requiere redeploy.

## 16. Shadow Deploy

- **Fase F6, antes del canary:** con `sv_shadow_compare` on, cada lectura core ejecuta **ambas** rutas (legacy sin filtro venture, nueva con filtro), sirve la legacy y **compara resultados en background**, logeando divergencias (id de query, diff de conteos, nunca payload sensible).
- Presupuesto: solo endpoints GET idempotentes; muestreo 10 % para no duplicar carga de DB; excluir endpoints con side-effects.
- **Criterio de salida:** 0 divergencias en 7 días → autoriza canary. Cualquier divergencia es, por construcción, o un bug de scoping o un dato mal backfilleado — ambos deben resolverse antes de avanzar.
- Shadow también se usa para el hook de claims (emitir claims v2 en paralelo y validarlos sin consumirlos).

## 17. Blue/Green

- **Backend (Render):** deploy green = servicio paralelo con la nueva revisión apuntando a la **misma** DB (el schema es compatible N/N-1 por diseño, así que blue y green conviven). Switch por DNS/routing del propio Render; blue queda caliente 24 h como target de rollback instantáneo.
- **Frontend (Vercel):** blue/green nativo vía promoción de deployment + rollback instantáneo a deployment anterior.
- **Base de datos: NO hay blue/green de datos** (una sola Supabase). El equivalente lo dan expand/contract + flags: el "switch" de datos es un flag, no un deploy. Esto es deliberado — duplicar la DB introduciría un problema de sincronización mayor que el que resuelve.
- **Functions/jobs:** versión green corre con jobs deshabilitados hasta el switch (evitar doble ejecución de crons durante la convivencia).

---

## 18. Rollback (por fase)

| Fase | Mecanismo de rollback | Tiempo | Pérdida |
|---|---|---|---|
| F0 | Revert de PR | min | 0 |
| F1 (expand) | DROP de tablas/columnas/índices nuevos (down-migrations preparadas y probadas en CI) | min | 0 (nada los usa aún) |
| F2 (backfill/dual-write) | Flag `sv_dual_write` off; el backfill no necesita deshacerse (columna ignorada por legacy). NOT NULL/FK: `DROP CONSTRAINT`. | seg (flag) | 0 |
| F3 (código) | Revert de PR / redeploy blue; shims garantizan que la ruta vieja sigue existiendo | min | 0 |
| F4a | DROP de policies nuevas | min | 0 |
| F4b | **Re-CREATE de policies legacy desde snapshot F0** (guardadas como artefacto versionado, no reconstruidas de memoria) + `sv_rls_strict` off | min | 0 |
| F5 auth | `sv_auth_claims_v2` off → hook emite shape legacy; tokens v2 vivos siguen válidos (claims extra son ignorados por legacy) | seg | 0 |
| F5 storage | `sv_storage_paths_v2` off → lecturas vuelven a path legacy (originales intactos hasta F7) | seg | 0 |
| F6 | Flag off (auto-halt de canary) | seg | 0 |
| F7 (contract) | **Punto de no retorno relativo.** Solo se ejecuta con: tráfico legacy = 0 medido, backup completo + PITR verificado, artefactos de re-creación (rutas, policies, objetos) archivados 30 días | horas si hiciera falta | potencialmente >0 → por eso los gates |
| F8 | `venture:demo:enabled` off | seg | 0 |

**Reglas transversales:** (1) toda migración lleva su down probada en CI o una justificación explícita de irreversibilidad aprobada; (2) PITR de Supabase verificado con restore de ensayo en F0 (un backup no probado no es un backup); (3) rollback de código y de datos son independientes — nunca un revert de código puede exigir un rollback de datos.

---

## 19. Riesgos

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | **Fuga cross-tenant** (bug de RLS o query de service-role sin scope) | Media | Crítico | Defensa en profundidad (§5.4), matriz RLS en CI, staging siempre 2-ventures, suite adversarial AC7, negative smoke §13.7 |
| R2 | Denegación de tráfico legítimo al endurecer RLS/claims | Media | Alto | Rollout permisivo→estricto, shadow compare, canary con auto-halt |
| R3 | Degradación de rendimiento por predicado venture en cada query | Media | Medio | Índices compuestos previos al switch, EXPLAIN en CI, guardián p95 en canary |
| R4 | Backfill incompleto → filas invisibles tras read-switch | Baja | Alto | NULL-count gate 72 h, shadow compare detecta exactamente esto antes del switch |
| R5 | Divergencia entre las 4 fuentes históricas de SQL → schema real ≠ schema asumido | **Alta** | Alto | F0 obligatoria: snapshot desde la DB real (no desde los archivos), y baseline desde ese snapshot |
| R6 | Doble ejecución de jobs/crons durante blue-green o refactor F3 | Media | Medio | Jobs deshabilitados en green, locks namespaced (§8.5) |
| R7 | Bypass de test (`ALLOW_TEST_AUTH_BYPASS`) sin venture-scoping → falsos verdes | Media | Medio | Actualizar bypass en F3 antes de escribir los tests de F4 |
| R8 | URLs firmadas/artefactos externos rotos al purgar storage legacy | Baja | Medio | Copy-then-switch, gracia 30 días, manifiesto de artefactos externos (§7.4) |
| R9 | Claves de idempotencia de pagos colisionan entre ventures | Baja | Crítico | Namespacing obligatorio antes de F8 (§4.5) |
| R10 | Fatiga de flags: transición eterna, código de compat nunca retirado | Alta | Medio | Fecha de expiración por flag + warning CI (§11), AC9 |
| R11 | Crown-jewels (CLOSED) pierden protección al moverse de path | Media | Alto | CODEOWNERS actualizado en la misma PR del movimiento (§9.6) |
| R12 | Contratos on-chain / hashes anclados invalidados por cambios de storage | Baja | Alto | Verificación en F0 de que el hash cubre contenido, no path; packs nunca se re-firman (§7.4) |

---

## 20. Downtime — análisis por componente

| Componente | Downtime planificado | Degradación residual posible |
|---|---|---|
| API backend | 0 (blue/green) | Segundos de p95 elevado en el switch |
| Frontend | 0 (promoción Vercel) | — |
| DB | 0 (aditivo + CONCURRENTLY + NOT VALID) | Backfill compite por IO → lotes pequeños en horas valle |
| Auth | 0 (hook dual-shape) | — |
| Storage | 0 (copy-then-switch) | Duplicación temporal de espacio (~2× durante F5–F7) |
| Webhooks | 0 (endpoint estable, enrutado interno) | Reintentos de Stripe cubren cualquier blip |
| Jobs | 0 | Un ciclo de job puede saltarse en el switch (aceptable; son reconstruibles) |

---

## 21. Checklist maestro de ejecución

### Pre-vuelo (F0)
- [ ] Snapshot de schema desde la DB real de prod, archivado y firmado
- [ ] Dump de todas las policies RLS actuales (artefacto de rollback F4b)
- [ ] PITR/backup verificado con restore de ensayo
- [ ] Inventario: tablas, buckets, functions, crons, endpoints, secretos, webhooks
- [ ] Árbol único `supabase/migrations/` + guardrail CI anti-dispersión
- [ ] `migrations-ci` operativo (lint, apply, rollback-apply, RLS matrix, EXPLAIN)
- [ ] Staging con seed 2-ventures funcionando
- [ ] Baseline de contrato API grabado (snapshots de respuestas legacy)
- [ ] Baseline de rendimiento p95 endpoints top-10
- [ ] Verificación R12: hashes anclados cubren contenido, no paths

### Expand + datos (F1–F2)
- [ ] Tablas de plataforma creadas; `ventures` seeded con `hrkey`
- [ ] `venture_id` en todas las tablas de dominio (nullable, default)
- [ ] Índices compuestos CONCURRENTLY creados
- [ ] `sv_dual_write` on; escrituras nuevas llevan venture explícito
- [ ] Backfill completado; NULL-count = 0 sostenido 72 h
- [ ] NOT NULL + FK (NOT VALID → VALIDATE) aplicadas
- [ ] `venture_members` backfilled desde roles actuales

### Código (F3)
- [ ] Paquetes `@aoc/*` creados con shims; deprecation warnings activos
- [ ] Codemod de imports ejecutado por módulo; suite verde en cada paso
- [ ] Import-lint de dirección de dependencias como gate
- [ ] `supabaseAdmin` unificado con `ventureContext` obligatorio
- [ ] CODEOWNERS actualizado para paths CLOSED movidos
- [ ] `ALLOW_TEST_AUTH_BYPASS` con venture-scoping

### RLS + Auth + Storage + Functions (F4–F5)
- [ ] Helpers `platform.current_venture_id()` etc. desplegados
- [ ] Policies nuevas en paralelo (F4a); matriz RLS verde
- [ ] Hook de claims v2 en shadow; validado; `sv_auth_claims_v2` on
- [ ] Invites con venture en payload firmado
- [ ] Copy de storage a prefijo `hrkey/` completada + manifiesto verificado
- [ ] Lectura storage con fallback (`sv_storage_paths_v2` on)
- [ ] Functions/jobs con `venture_id` explícito; locks namespaced
- [ ] `stripe_events` + idempotency keys namespaced
- [ ] Policies legacy retiradas (`sv_rls_strict` on) tras shadow limpio

### Switch (F6)
- [ ] `sv_shadow_compare` on; 7 días con 0 divergencias
- [ ] Canary 1 %→5 %→25 %→100 % con métricas guardián verdes (24 h/escalón)
- [ ] Negative smoke cross-venture verde en cada escalón
- [ ] Headers Deprecation/Sunset en legacy

### Contract (F7)
- [ ] Tráfico legacy = 0 medido durante 2 ciclos
- [ ] Backup completo inmediatamente antes
- [ ] Rutas legacy, policies antiguas, shims, defaults `'hrkey'`, código de compat eliminados
- [ ] Storage legacy purgado tras gracia de 30 días (manifiesto conservado)
- [ ] Flags de transición retirados (AC9)

### Prueba soberana (F8)
- [ ] Venture `demo` aprovisionado solo con datos/config (AC7)
- [ ] Suite adversarial cross-tenant verde en ambas direcciones
- [ ] Runbook "Onboarding de un venture" documentado y validado
- [ ] Retro de migración + cierre de riesgos residuales

---

*Siguiente paso propuesto tras aprobación de este blueprint: PR de F0 (consolidación de migraciones + snapshot + migrations-ci). Ninguna fase posterior arranca sin F0 verde.*
