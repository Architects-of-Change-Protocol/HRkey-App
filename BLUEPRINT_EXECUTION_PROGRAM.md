# HRKey — Programa de Ejecución del Blueprint

> **Documento de planificación. No contiene código.**
> Convierte el blueprint completo de HRKey (distribuido en los documentos de arquitectura, auditoría y readiness del repositorio) en un programa de ejecución de 12 semanas con Epics, Capabilities, Stories, Tasks y Subtasks, roadmap, milestones, criterios de promoción, validaciones automáticas y auditorías posteriores.

**Rol:** Technical Program Manager
**Fecha de emisión:** 2026-07-13
**Horizonte:** 12 semanas (S1–S12)
**Estado de partida:** post-auditoría Launch 0

---

## 1. Resumen ejecutivo

HRKey es una plataforma de identidad profesional y reputación con: referencias verificables (con filosofía *"hidden ≠ erased"*), observaciones KPI, un HRScore predictivo (ML), acceso a datos pagado con revenue sharing, rail de pagos Web3 (RLUSD/XRP/HRK sobre Base) y capa de anclaje on-chain.

La auditoría Launch 0 concluye que la funcionalidad es sólida (RBAC completo, 42 suites de tests, seguridad HTTP endurecida, modelo de datos de confianza V1 listo), pero existen **bloqueadores estructurales** que este programa resuelve:

1. **Seguridad residual:** credenciales expuestas pendientes de revocación; historial git sin purgar; ruta `/debug-sentry` en producción; cifrado de claves de wallet con salt débil.
2. **Sin CI/CD ni gobernanza de despliegue:** no hay pipelines, ni branch protection, ni trazabilidad de migraciones aplicadas (riesgo de drift de esquema, migraciones duplicadas).
3. **HRScore sin credibilidad:** modelo entrenado únicamente con datos sintéticos; cero observaciones KPI reales en producción. Es el bloqueador más repetido en todas las auditorías.
4. **Monetización incompleta:** payout automatizado sin implementar; dos modelos de revenue split contradictorios (40/40/20 vs 60/20/15/5); sin test E2E pago→acceso→payout.
5. **Contratos sin auditar ni desplegar:** solo HRKeyRegistry está en Base mainnet; toolchain de contratos bloqueado por conflictos de dependencias; sin multisig/timelock/pause.
6. **Cumplimiento inexistente:** sin GDPR (export, borrado, retención), sin políticas legales, sin documentación de API ni plan de DR.

**Objetivo del programa:** llegar a la semana 12 con un **Go/No-Go de Launch 0** respaldado por evidencia: plataforma segura, con CI/CD, modelo validado con datos reales, monetización E2E verificada, contratos auditados en testnet (mainnet condicionado a auditoría) y cumplimiento mínimo viable.

---

## 2. Fuentes del blueprint

| Documento | Aporte al programa |
|---|---|
| `LAUNCH0_PRODUCTION_AUDIT.md` | Gate de lanzamiento, bloqueadores priorizados |
| `PRODUCTION_READINESS_ANALYSIS.md` | Fases 0–3 de readiness, gaps de infra/compliance |
| `PHASE1_PROGRESS.md` | Estado de validación Zod, seguridad HTTP |
| `TRUST_DATA_MODEL_V1_PRODUCTION_READINESS_REPORT.md` | Rollout staged de migraciones 030/031 |
| `IMPLEMENTATION_SUMMARY.md` | Strikethrough/CV, fases 2–5 de reputación |
| `ANALYTICS_IMPLEMENTATION_SUMMARY.md` | Capa de analytics, fase 2 (dashboard, retención) |
| `ANCHOR_LAYER_IMPLEMENTATION.md` | Capa de anclaje, bloqueo de toolchain |
| `ML_MODEL_TRAINING_SUMMARY.md`, `DATASET_HARDENING_SUMMARY.md` | Estado del modelo, necesidad de datos reales |
| `PAYMENT_RAIL_README.md` | Rail Web3, checklist pre-mainnet |
| `INVITE_SECURITY_REMEDIATION_REPORT.md`, `SECURITY_REMEDIATION_GUIDE.md` | Remediaciones cerradas y pendientes |
| `docs/OPEN_VS_CLOSED.md`, `docs/identity-and-signers.md` | Límites de IP, fase 2 de identidad |
| `E2E_TESTING_CHECKLIST.md` | Cobertura E2E objetivo |

---

## 3. Estructura y convenciones del programa

### 3.1 Jerarquía

```
EPIC (E#)                → objetivo estratégico, dura todo el programa o varias semanas
 └─ CAPABILITY (C#.#)    → capacidad entregable con criterios de promoción propios
     └─ STORY (S#.#.#)   → valor observable para un usuario/operador
         └─ TASK (T#.#.#) → unidad de trabajo con los 10 atributos obligatorios
             └─ SUBTASKS  → pasos verificables dentro de la task
```

### 3.2 Owners sugeridos (roles)

| Código | Rol |
|---|---|
| **TPM** | Technical Program Manager (gobierno del programa) |
| **BE** | Backend Lead (Node/Express/Supabase) |
| **FE** | Frontend Lead (Next.js/React) |
| **ML** | ML Engineer (Python/scikit-learn) |
| **SC** | Smart Contract Engineer (Solidity/Hardhat) |
| **SRE** | DevOps/SRE (CI/CD, Render/Vercel/Supabase, observabilidad) |
| **SEC** | Security Engineer |
| **QA** | QA Lead |
| **PM** | Product Manager (decisiones de producto/negocio) |
| **DATA** | Data Engineer / Data Ops |
| **LEGAL** | Legal & Compliance |

### 3.3 Unidades y escalas

- **Estimación:** dev-días (dd) de esfuerzo neto, más semana(s) objetivo del roadmap.
- **Riesgo:** `ALTO` (puede bloquear un milestone), `MEDIO` (puede desplazar una capability), `BAJO` (absorbible en el sprint).
- **Definition of Ready (DoR) global** (aplica a toda task, además de la específica): dependencias resueltas o planificadas, owner asignado, criterio de aceptación escrito, acceso a entornos/credenciales necesario disponible.
- **Definition of Done (DoD) global**: criterio de aceptación verificado con evidencia, validaciones automáticas correspondientes en verde, documentación actualizada, sin regresiones en CI, revisado por un segundo par de ojos (o por el gate correspondiente de `docs/OPEN_VS_CLOSED.md` si toca rutas CLOSED/REVIEW).

### 3.4 Restricción de IP (OPEN vs CLOSED)

Toda task que toque rutas **CLOSED** (`ml/`, `analytics/proof_of_correlation/`, `backend/services/hrscore/`, `scoringPipeline.service.js`, `backend/pricing/`, SQL 003/009/010) requiere aprobación explícita del PM antes de pasar a "In Progress". Las tasks E3 y parte de E8 están afectadas; se marca en su DoR.

---

## 4. Epics, Capabilities, Stories, Tasks y Subtasks

---

## EPIC E1 — Seguridad y Secretos

**Objetivo estratégico:** eliminar todo riesgo residual de credenciales comprometidas y endurecer la superficie de ataque antes de cualquier otra inversión. Es prerequisito de los demás epics.
**Ventana principal:** S1–S2 (con re-cifrado de wallets en S9).
**Milestone asociado:** M0, M1.

### Capability C1.1 — Gestión de secretos y credenciales

> Ninguna credencial históricamente expuesta sigue siendo válida; existe un proceso permanente que impide reincidencia.

#### Story S1.1.1 — Como operador de plataforma, quiero que las credenciales expuestas en git queden inservibles para que un atacante con acceso al historial no pueda comprometer producción.

**Task T1.1.1 — Revocar y rotar todas las credenciales expuestas**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Invalidar las claves comprometidas (Supabase ANON + SERVICE_ROLE, Stripe secret + webhook secret, Resend API key) y dejar producción operando con claves nuevas. |
| **Entradas** | Checklist de `SECURITY_REMEDIATION_GUIDE.md`; acceso admin a Supabase, Stripe, Resend, Render y Vercel. |
| **Salidas** | Claves antiguas revocadas y verificadas como inválidas; claves nuevas en los gestores de entorno de Render/Vercel; registro de rotación firmado (fecha, quién, qué). |
| **Dependencias** | Ninguna. **Es la primera task del programa.** |
| **Estimación** | 1 dd — S1. |
| **Riesgo** | ALTO. Riesgo operativo: una rotación mal secuenciada tumba producción (webhooks Stripe, auth Supabase). Mitigación: rotar por servicio, con smoke test entre cada uno. |
| **Rollback** | Cada proveedor permite mantener la clave anterior activa unos minutos durante la transición; si un servicio falla tras rotar, restaurar temporalmente la variable anterior en Render/Vercel, diagnosticar y reintentar. Nunca dejar la clave antigua activa más de la ventana de rotación. |
| **DoR** | Inventario escrito de todas las claves a rotar y de todos los lugares donde se consumen (Render, Vercel, GitHub secrets si existieran, `ml/.env`). |
| **DoD** | Las claves antiguas devuelven error de autenticación al probarlas; `/health/deep` en verde con las nuevas; webhook Stripe de prueba procesado correctamente; registro de rotación archivado. |
| **Owner** | SEC (ejecuta), SRE (entornos), TPM (verifica evidencia). |

Subtasks:
1. Inventariar claves expuestas y sus puntos de consumo.
2. Rotar Supabase (ANON y SERVICE_ROLE) y actualizar Render/Vercel/`ml`.
3. Rotar Stripe (secret + webhook secret) y re-registrar el endpoint de webhook.
4. Rotar Resend y verificar envío de email de invitación.
5. Smoke test completo (`/health/deep`, login, invitación, pago de prueba).
6. Verificar que las claves antiguas ya no autentican; archivar evidencia.

**Task T1.1.2 — Purgar el historial de git de secretos**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Eliminar del historial del repositorio los archivos `.env` y cualquier secreto embebido, para que clonar el repo no exponga credenciales (aunque ya estén revocadas). |
| **Entradas** | Repositorio; herramienta de purga (git filter-repo o BFG); lista de rutas/patrones a purgar. |
| **Salidas** | Historial reescrito y forzado en `origin`; verificación de que ningún commit contiene secretos; comunicación a colaboradores para re-clonar. |
| **Dependencias** | T1.1.1 (nunca purgar antes de revocar: la purga no des-expone lo ya filtrado). |
| **Estimación** | 1 dd — S1. |
| **Riesgo** | MEDIO. Reescribir historial rompe clones y PRs abiertos. Mitigación: ejecutar en ventana coordinada, con PRs mergeados o notificados. |
| **Rollback** | Backup completo del repo (mirror clone) antes de purgar; si la reescritura corrompe algo, restaurar desde el mirror. |
| **DoR** | T1.1.1 cerrada; backup mirror creado; ventana coordinada con todos los colaboradores; PRs abiertos inventariados. |
| **DoD** | Escaneo de secretos sobre todo el historial (todas las ramas y tags) sin hallazgos; colaboradores confirmaron re-clone; branch protection reactivada. |
| **Owner** | SEC (ejecuta), TPM (coordinación de ventana). |

Subtasks:
1. Crear mirror-backup del repositorio.
2. Coordinar ventana con colaboradores y congelar merges.
3. Ejecutar purga de rutas/patrones sensibles en todas las ramas.
4. Escanear historial completo post-purga.
5. Force-push coordinado y comunicación de re-clone.

**Task T1.1.3 — Proceso permanente de gestión de secretos**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Impedir estructuralmente que un secreto vuelva a entrar al repositorio y establecer rotación periódica. |
| **Entradas** | Pipeline CI (T2.1.1); política de rotación de `PAYMENT_RAIL_README.md` (90 días). |
| **Salidas** | Escaneo de secretos como check obligatorio en CI y como hook pre-commit; SOP de rotación trimestral documentado con calendario y responsables; variable `INVITE_IP_SALT` establecida en producción. |
| **Dependencias** | T2.1.1 (existencia del pipeline CI). |
| **Estimación** | 2 dd — S2. |
| **Riesgo** | BAJO. Falsos positivos del escáner pueden frenar PRs legítimos; mantener baseline de exclusiones revisada por SEC. |
| **Rollback** | El check puede pasarse a modo advertencia (no bloqueante) temporalmente si genera falsos positivos masivos; nunca eliminarlo. |
| **DoR** | CI base operativo; lista de patrones de secretos acordada. |
| **DoD** | Un PR de prueba con un secreto simulado es bloqueado por CI; SOP publicado en `docs/`; primer ciclo de rotación agendado; `INVITE_IP_SALT` verificado en producción. |
| **Owner** | SEC, SRE. |

Subtasks:
1. Integrar escáner de secretos en CI (bloqueante).
2. Configurar hook pre-commit local documentado en CONTRIBUTING.
3. Redactar SOP de rotación (90 días) con matriz de responsables.
4. Establecer y verificar `INVITE_IP_SALT` en producción.

### Capability C1.2 — Endurecimiento de superficie de ataque

> La superficie pública de producción no expone rutas de depuración, no filtra información por logging y los tokens tienen garantías a nivel de base de datos.

#### Story S1.2.1 — Como responsable de seguridad, quiero que producción no exponga rutas ni comportamientos de depuración para reducir la superficie explotable.

**Task T1.2.1 — Retirar o blindar la ruta `/debug-sentry`**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Que la ruta de prueba de Sentry no sea invocable en producción (retirada, o restringida por entorno + allowlist de IP). |
| **Entradas** | Hallazgo MEDIO de `LAUNCH0_PRODUCTION_AUDIT.md`; inventario de rutas del backend. |
| **Salidas** | Producción responde 404/403 a la ruta; decisión documentada (retirar vs blindar); test automatizado que verifica el comportamiento por entorno. |
| **Dependencias** | Ninguna. |
| **Estimación** | 0,5 dd — S1. |
| **Riesgo** | BAJO. |
| **Rollback** | Reversión del commit; la ruta no es funcionalidad de usuario. |
| **DoR** | Confirmado con SRE que no hay monitores externos dependiendo de la ruta. |
| **DoD** | Verificación en producción desplegada (respuesta 404/403); test en CI que falla si la ruta reaparece sin guarda. |
| **Owner** | BE. |

Subtasks:
1. Decidir retirar vs blindar (con SEC).
2. Aplicar el cambio y añadir test de regresión.
3. Verificar en staging y producción.

**Task T1.2.2 — Endurecer logging de violaciones CORS**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Responder 403 inmediato a orígenes no permitidos sin registrar detalle que facilite enumeración de la allowlist. |
| **Entradas** | Hallazgo BAJO de Launch 0; configuración CORS actual. |
| **Salidas** | Comportamiento CORS ajustado; criterio de logging documentado (contadores agregados sí, orígenes detallados no). |
| **Dependencias** | Ninguna. |
| **Estimación** | 0,5 dd — S2. |
| **Riesgo** | BAJO. Riesgo de perder señal de diagnóstico; mitigar con métrica agregada de rechazos. |
| **Rollback** | Reversión del commit de configuración. |
| **DoR** | Allowlist CORS vigente confirmada con FE (dominios prod/staging). |
| **DoD** | Petición desde origen no listado recibe 403 sin log detallado; orígenes legítimos siguen funcionando (smoke desde `www.hrkey.xyz` y staging). |
| **Owner** | BE. |

**Task T1.2.3 — Garantías de expiración de tokens a nivel de base de datos**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Añadir la restricción de base de datos sobre `expires_at` de invitaciones que la remediación de invites dejó pendiente, de modo que ningún camino de código pueda crear invitaciones sin expiración válida. |
| **Entradas** | `INVITE_SECURITY_REMEDIATION_REPORT.md`; esquema vigente de la tabla de invitaciones. |
| **Salidas** | Migración con la restricción; verificación de que los datos existentes cumplen (o plan de saneamiento previo); script de rollback de la migración. |
| **Dependencias** | C2.2 (gobernanza de migraciones) para aplicarla con trazabilidad; puede diseñarse antes. |
| **Estimación** | 1 dd — S3. |
| **Riesgo** | BAJO. Datos legacy que violen la restricción bloquearían la migración; sanear antes. |
| **Rollback** | Script de reversión que elimina la restricción (sin pérdida de datos). |
| **DoR** | Auditoría de datos existentes ejecutada; resultado sin violaciones o con plan de saneamiento aprobado. |
| **DoD** | Restricción activa en staging y producción; test de integración que intenta crear invitación inválida y falla a nivel de DB. |
| **Owner** | BE, DATA. |

### Capability C1.3 — Cifrado robusto de claves de wallet

> Las claves privadas custodiadas no son recuperables aunque se filtre el identificador de usuario.

#### Story S1.3.1 — Como usuario con wallet custodial, quiero que mi clave privada esté cifrada con material único e independiente de mi userId para que una filtración de identificadores no comprometa mis fondos.

**Task T1.3.1 — Diseño del esquema de re-cifrado con salt por wallet**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Especificar el nuevo esquema (salt aleatorio por wallet almacenado por separado, derivación robusta) y el plan de migración de wallets existentes sin pérdida de acceso. |
| **Entradas** | Hallazgo MEDIO de Launch 0 (salt global fijo + userId); inventario de wallets existentes. |
| **Salidas** | Documento de diseño aprobado por SEC: formato de almacenamiento, procedimiento de re-cifrado, estrategia de doble-lectura durante la transición, plan de verificación. |
| **Dependencias** | Ninguna para el diseño. |
| **Estimación** | 2 dd — S3. |
| **Riesgo** | MEDIO. Un diseño incorrecto puede dejar wallets inaccesibles; por eso diseño y ejecución se separan. |
| **Rollback** | N/A (solo diseño). |
| **DoR** | Recuento de wallets activas y su uso real (¿custodian fondos hoy?) documentado. |
| **DoD** | Diseño revisado y aprobado por SEC y BE; plan de ventana de mantenimiento agendado. |
| **Owner** | SEC (diseño), BE (revisión). |

**Task T1.3.2 — Ejecución del re-cifrado de wallets en ventana de mantenimiento**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Re-cifrar todas las claves privadas existentes al nuevo esquema y retirar el esquema antiguo. |
| **Entradas** | Diseño aprobado (T1.3.1); backup verificado de la tabla de wallets; ventana de mantenimiento comunicada. |
| **Salidas** | 100% de wallets bajo el nuevo esquema; esquema antiguo eliminado del código; informe de verificación (cada wallet descifrable con el nuevo esquema). |
| **Dependencias** | T1.3.1; T2.4.2 (backups verificados); CI operativo. |
| **Estimación** | 3 dd — S9 (post-auditoría de contratos, en ventana tranquila). |
| **Riesgo** | ALTO en impacto (pérdida de acceso a wallets) aunque mitigado: doble-lectura transitoria + verificación wallet a wallet antes de retirar el esquema viejo. |
| **Rollback** | Mientras exista la doble-lectura, revertir es desactivar el nuevo camino; el punto de no retorno (borrar material antiguo) solo se cruza tras verificación del 100%. Backup previo como última línea. |
| **DoR** | Backup restaurable probado; ventana comunicada; script de verificación listo. |
| **DoD** | Verificación 100% en verde; esquema antiguo retirado; test de regresión de creación/uso de wallet en CI; hallazgo cerrado en el registro de riesgos. |
| **Owner** | BE (ejecuta), SEC (verifica). |

---

## EPIC E2 — Infraestructura, CI/CD y Operaciones

**Objetivo estratégico:** que todo cambio pase por un pipeline automatizado y que el estado de base de datos, entornos y backups sea conocido, reproducible y recuperable.
**Ventana principal:** S1–S4 (operación continua después).
**Milestone asociado:** M1, M2.

### Capability C2.1 — CI/CD con quality gates

> Ningún cambio llega a `main` sin pasar validaciones automáticas; staging se despliega automáticamente.

#### Story S2.1.1 — Como equipo de desarrollo, quiero que cada PR ejecute automáticamente lint, tests y escaneos para que los defectos se detecten antes del merge.

**Task T2.1.1 — Pipeline de integración continua**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Pipeline en GitHub Actions que ejecute en cada PR: instalación, lint, typecheck (frontend), suite de tests de backend con umbral de cobertura ≥40%, y escaneo de secretos. |
| **Entradas** | Las 42 suites de tests existentes; configuración de Jest; mocks de Supabase/Stripe/email ya construidos. |
| **Salidas** | Workflow(s) de CI versionados; badge de estado; primer run completo en verde documentado (hoy los tests no se han verificado como pasando: hallazgo MEDIO de Launch 0). |
| **Dependencias** | Ninguna técnica; T1.1.1 si el CI necesitara secretos (usar mocks: el CI no debe requerir credenciales reales). |
| **Estimación** | 3 dd — S1–S2. |
| **Riesgo** | MEDIO. Riesgo conocido: la suite nunca se ha ejecutado completa en limpio; pueden aflorar tests rotos que exijan reparación (buffer incluido en estimación de C2.1). |
| **Rollback** | El pipeline es aditivo; desactivar un job defectuoso no afecta al producto. |
| **DoR** | Decisión sobre versión de Node del CI (alineada con producción); inventario de tests que requieren servicios externos. |
| **DoD** | CI en verde sobre `main`; cobertura publicada; tests que dependían de servicios reales aislados con mocks o marcados y planificados. |
| **Owner** | SRE (pipeline), BE (reparación de tests), QA (triage). |

Subtasks:
1. Ejecutar la suite completa en local limpio y triar fallos.
2. Reparar o cuarentenar (con ticket) los tests rotos.
3. Crear workflow de CI con jobs: lint, typecheck, test+coverage, secret-scan.
4. Publicar cobertura y fijar umbral bloqueante en 40% (subir a 50% en S8).

**Task T2.1.2 — Branch protection y política de merge**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Que `main` solo acepte cambios vía PR con CI en verde y al menos una revisión, con reglas extra para rutas CLOSED. |
| **Entradas** | CI operativo (T2.1.1); `docs/OPEN_VS_CLOSED.md` y `docs/REPO_GUARDRAILS.md`. |
| **Salidas** | Branch protection activa; CODEOWNERS que exige revisión del owner de rutas CLOSED/REVIEW; política de merge documentada en CONTRIBUTING. |
| **Dependencias** | T2.1.1. |
| **Estimación** | 1 dd — S2. |
| **Riesgo** | BAJO. |
| **Rollback** | Configuración reversible en GitHub sin impacto en código. |
| **DoR** | Lista de owners por ruta acordada con PM. |
| **DoD** | Push directo a `main` rechazado; PR sin CI verde no mergeable; PR que toca ruta CLOSED exige aprobación del owner designado. |
| **Owner** | SRE, TPM. |

**Task T2.1.3 — Despliegue continuo a staging con smoke test**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Que cada merge a `main` despliegue automáticamente a staging (backend Render, frontend Vercel) y ejecute el smoke test (`smoke-staging`) como verificación post-deploy. |
| **Entradas** | Entorno staging existente (`.env.staging.example`, script de smoke); cuentas Render/Vercel. |
| **Salidas** | Deploy automático a staging; smoke post-deploy que notifica en fallo; procedimiento de promoción a producción documentado (manual con aprobación en S1–S12). |
| **Dependencias** | T2.1.1, T2.1.2; T2.4.1 si el tier gratuito de Render impide estabilidad del smoke (cold starts). |
| **Estimación** | 3 dd — S3. |
| **Riesgo** | MEDIO. El tier gratuito de Render duerme a los 15 min y puede dar falsos negativos en smoke; mitigado por T2.4.1. |
| **Rollback** | Desactivar el trigger de deploy automático y volver a deploy manual; los deploys de Render/Vercel permiten rollback a build anterior con un clic. |
| **DoR** | Paridad de variables de entorno staging/prod auditada (sin secretos de prod en staging). |
| **DoD** | Merge de prueba llega a staging sin intervención; smoke en verde; fallo de smoke genera alerta visible al equipo. |
| **Owner** | SRE. |

### Capability C2.2 — Gobernanza de base de datos y migraciones

> Se sabe con certeza qué migraciones están aplicadas en cada entorno; aplicar y revertir migraciones es un proceso trazable.

#### Story S2.2.1 — Como equipo, quiero una única fuente de verdad del esquema para eliminar el riesgo de drift entre archivos SQL y producción.

**Task T2.2.1 — Auditoría de esquema: producción vs archivos de migración**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Determinar exactamente qué migraciones (001–031) están aplicadas en producción y staging, detectar drift y resolver los archivos duplicados (p. ej. los dos ficheros de hrscore_snapshots). |
| **Entradas** | Carpeta `sql/`; acceso de solo lectura al esquema de producción y staging; hallazgo de Launch 0 sobre duplicados. |
| **Salidas** | Informe de reconciliación (aplicada/no aplicada/drift por migración); decisión documentada por cada duplicado; lista de objetos huérfanos. |
| **Dependencias** | Ninguna. |
| **Estimación** | 2 dd — S2. |
| **Riesgo** | MEDIO. Puede descubrir drift grave que amplíe el alcance (buffer en S3 reservado). |
| **Rollback** | N/A (solo lectura). |
| **DoR** | Acceso de solo lectura concedido; snapshot del esquema de ambos entornos exportado. |
| **DoD** | Informe revisado con BE y DATA; backlog de correcciones creado y priorizado. |
| **Owner** | DATA (ejecuta), BE (revisión). |

**Task T2.2.2 — Registro de migraciones y proceso de aplicación**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Introducir seguimiento de versiones de migración (tabla de control) y un procedimiento único de aplicación con verificación y rollback por migración. |
| **Entradas** | Informe de T2.2.1; convenciones de Supabase CLI. |
| **Salidas** | Tabla de control poblada retroactivamente con lo ya aplicado; procedimiento documentado (quién aplica, cómo se verifica, cómo se revierte); toda migración futura exige script de rollback adjunto. |
| **Dependencias** | T2.2.1. |
| **Estimación** | 3 dd — S3. |
| **Riesgo** | MEDIO. Poblar retroactivamente exige criterio; errores aquí propagan confusión. Mitigación: doble verificación DATA+BE. |
| **Rollback** | La tabla de control es aditiva; eliminarla no afecta al esquema funcional. |
| **DoR** | Informe de reconciliación cerrado; convención de nombres de migración acordada. |
| **DoD** | Estado de control coincide 1:1 con la realidad de staging y producción; una migración de prueba recorre el proceso completo (aplicar→verificar→revertir) en staging. |
| **Owner** | DATA, SRE. |

**Task T2.2.3 — Limpieza de artefactos legacy**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Retirar o archivar el código muerto señalado por las remediaciones (backends antiguos de creación de wallets, tests de integración no canónicos) para reducir superficie y confusión. |
| **Entradas** | Lista de `INVITE_SECURITY_REMEDIATION_REPORT.md`; grep de referencias vivas. |
| **Salidas** | Archivos retirados o movidos a `docs/deprecated/`; confirmación de cero referencias vivas; CHANGELOG del saneamiento. |
| **Dependencias** | T2.1.1 (CI verifica que nada se rompe). |
| **Estimación** | 1 dd — S4. |
| **Riesgo** | BAJO. |
| **Rollback** | Reversión del commit. |
| **DoR** | Verificado que ninguna ruta de producción importa los artefactos. |
| **DoD** | CI verde tras la retirada; smoke de staging verde. |
| **Owner** | BE. |

**Task T2.2.4 — Programación del refresco de vistas materializadas**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Que las vistas materializadas (HRScore latest/evolution, 6 vistas de analytics) se refresquen automáticamente con SLA documentado, eliminando el refresco manual. |
| **Entradas** | Inventario de vistas y su coste de refresco; capacidades del plan de Supabase (pg_cron requiere plan adecuado → T2.4.1). |
| **Salidas** | Trabajos programados activos; SLA de frescura documentado por vista; alerta si un refresco falla o se retrasa. |
| **Dependencias** | T2.4.1 (plan Supabase Pro); T2.2.2 (la programación entra como migración trazada). |
| **Estimación** | 2 dd — S4. |
| **Riesgo** | BAJO. Refrescos costosos podrían competir con tráfico; programar en valle y medir duración. |
| **Rollback** | Desactivar los trabajos y volver al refresco manual documentado. |
| **DoR** | Frecuencia acordada por vista con PM/DATA (¿qué frescura necesita el dashboard?). |
| **DoD** | Vistas refrescándose solas durante una semana sin intervención; alerta de fallo probada provocando un fallo controlado en staging. |
| **Owner** | DATA, SRE. |

### Capability C2.3 — Observabilidad y alertas

> El equipo se entera de los problemas por alertas, no por usuarios.

#### Story S2.3.1 — Como on-call, quiero alertas accionables de errores, caídas y latencia para responder antes de que el impacto crezca.

**Task T2.3.1 — Alertado sobre Sentry y monitoreo de disponibilidad**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Configurar reglas de alerta en Sentry (tasa de errores, regresiones nuevas) y monitoreo externo de uptime sobre `/health` y `/health/deep` de producción y staging, con canal de notificación definido. |
| **Entradas** | Sentry ya integrado; endpoints de health existentes. |
| **Salidas** | Reglas de alerta activas; monitor de uptime externo; matriz de severidad→canal→responsable; mini-runbook de respuesta. |
| **Dependencias** | Ninguna. |
| **Estimación** | 2 dd — S2. |
| **Riesgo** | BAJO. Riesgo de fatiga de alertas; revisar umbrales en la auditoría de S4. |
| **Rollback** | Desactivar reglas; sin impacto en producto. |
| **DoR** | Canal de notificación del equipo decidido; umbrales iniciales propuestos. |
| **DoD** | Alerta de prueba recibida end-to-end por el canal correcto; caída simulada de staging detectada en <5 min. |
| **Owner** | SRE. |

**Task T2.3.2 — Consolidación de logging estructurado**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Confirmar que todo el backend usa el logger estructurado (Winston) con IDs de correlación, sin `console.log` residuales, y definir retención/rotación de logs. |
| **Entradas** | Logger e IDs de correlación ya introducidos en Fase 1; grep de `console.log` en backend. |
| **Salidas** | Backend 100% en logger estructurado; política de retención documentada; check de lint que bloquea `console.log` nuevos en backend. |
| **Dependencias** | T2.1.1 (para el check de lint). |
| **Estimación** | 2 dd — S3. |
| **Riesgo** | BAJO. |
| **Rollback** | Reversión de commits individuales. |
| **DoR** | Inventario de ocurrencias de logging no estructurado. |
| **DoD** | Cero `console.log` en rutas de backend; lint bloqueante activo; un flujo completo trazable por ID de correlación en staging. |
| **Owner** | BE. |

### Capability C2.4 — Infraestructura de pago y continuidad

> Los entornos de producción no dependen de tiers gratuitos con pérdida de servicio o de datos.

#### Story S2.4.1 — Como negocio, quiero que producción no duerma ni pierda datos para sostener usuarios reales y el piloto de datos.

**Task T2.4.1 — Upgrade de planes de hosting y base de datos**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Migrar Render a plan Starter (sin sleep), Supabase a Pro (backups automáticos, pg_cron) y evaluar Vercel Pro, según recomendación del análisis de readiness. |
| **Entradas** | Presupuesto aprobado (~$52/mes según análisis); acceso admin a los tres proveedores. |
| **Salidas** | Planes activos; verificación de que el backend ya no duerme; backups automáticos de Supabase habilitados. |
| **Dependencias** | Aprobación de presupuesto (PM). **Bloquea T2.2.4, T2.4.2 y estabilidad de T2.1.3.** |
| **Estimación** | 0,5 dd — S2 (más el lead time de aprobación). |
| **Riesgo** | BAJO técnico; el riesgo es de decisión (presupuesto). Escalar a PM en S1 si no hay aprobación. |
| **Rollback** | Downgrade de plan (con pérdida de las capacidades asociadas). |
| **DoR** | Presupuesto aprobado por PM. |
| **DoD** | `/health` responde sin cold start tras 30 min de inactividad; backup automático visible en Supabase; factura/plan documentados. |
| **Owner** | SRE, PM (presupuesto). |

**Task T2.4.2 — Estrategia de backups y simulacro de recuperación**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Definir RPO/RTO, complementar los backups automáticos con exports periódicos fuera del proveedor, y probar una restauración completa (simulacro de DR). |
| **Entradas** | Supabase Pro activo (T2.4.1); inventario de datos críticos (wallets, referencias, consentimientos, ledger de revenue). |
| **Salidas** | Política de backups documentada (frecuencia, retención, ubicación externa); simulacro de restore ejecutado sobre un proyecto temporal con informe de tiempos. |
| **Dependencias** | T2.4.1. |
| **Estimación** | 3 dd — S4. |
| **Riesgo** | MEDIO. Sin restore probado, el backup es una hipótesis; este es el riesgo que la task elimina. |
| **Rollback** | N/A (actividad de resiliencia). |
| **DoR** | RPO/RTO objetivo acordados con PM (propuesta: RPO 24 h, RTO 4 h). |
| **DoD** | Restore completo verificado (conteos y muestras coinciden); informe archivado; calendario de simulacros trimestrales fijado. |
| **Owner** | SRE, DATA. |

---

## EPIC E3 — Credibilidad del HRScore (ML sobre datos reales)

**Objetivo estratégico:** convertir el HRScore de una promesa entrenada con datos sintéticos en un modelo validado con observaciones KPI reales. Es, según todas las auditorías (`LAUNCH0`, `ML_MODEL_TRAINING_SUMMARY`, `DATASET_HARDENING_SUMMARY`), **el bloqueador más repetido del programa**.
**Ventana principal:** S2–S8 (piloto de datos largo y en paralelo a otros epics).
**Milestone asociado:** M2, M3.
**Nota de gobernanza IP:** toda task que toque `ml/`, `analytics/proof_of_correlation/`, `backend/services/hrscore/` o `scoringPipeline.service.js` es ruta **CLOSED** — requiere aprobación de PM antes de "In Progress" (`docs/OPEN_VS_CLOSED.md`).

### Capability C3.1 — Piloto de captura de observaciones KPI reales

> Existen entre 50 y 100 observaciones KPI reales, de observadores reales, sobre sujetos reales, con outcome_value poblado.

**Criterio de promoción de la capability:** ≥50 observaciones reales capturadas, con distribución de al menos 3 roles distintos y ≥2 observadores por sujeto en el 60% de los casos (para permitir validación cruzada por grupo).

#### Story S3.1.1 — Como PM, quiero reclutar un grupo piloto de observadores y candidatos para que el modelo deje de depender de datos sintéticos.

**Task T3.1.1 — Diseño y reclutamiento del piloto de datos**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Definir el diseño del piloto (roles objetivo, tamaño de muestra, incentivos, consentimiento) y reclutar observadores/candidatos reales o de un partner de diseño. |
| **Entradas** | KPIs definidos en `Roles_All_Industries_KPIs.json`; modelo de consentimiento ya operativo (`validateConsent`). |
| **Salidas** | Plan de piloto aprobado por PM; lista de participantes reclutados con consentimiento firmado; calendario de captura. |
| **Dependencias** | Ninguna técnica; depende de decisión de negocio (PM) sobre incentivos/presupuesto del piloto. |
| **Estimación** | 3 dd repartidos en 2 semanas — S2–S3. |
| **Riesgo** | ALTO. Es el riesgo de negocio más grande del programa: si no hay reclutamiento suficiente, el resto del epic no puede ejecutarse. Mitigación: arrancar el reclutamiento en la semana 1 del epic, con objetivo mínimo viable de 3 roles. |
| **Rollback** | Si el reclutamiento falla, plan B documentado: partnership con una empresa cliente piloto que aporte KPIs históricos ya medidos (con consentimiento retroactivo). |
| **DoR** | Roles objetivo priorizados por PM; presupuesto de incentivos (si aplica) aprobado. |
| **DoD** | ≥15 participantes con consentimiento firmado y calendario de captura confirmado. |
| **Owner** | PM (diseño y reclutamiento), DATA (soporte de instrumentación). |

**Task T3.1.2 — Instrumentación y captura de observaciones**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Asegurar que el endpoint de KPI observations captura correctamente el piloto real, con validación de calidad de dato en el momento de captura. |
| **Entradas** | Endpoint `/api/kpi-observations` existente; participantes reclutados (T3.1.1). |
| **Salidas** | ≥50 observaciones reales almacenadas; reporte de calidad de dato (completitud, outliers, duplicados). |
| **Dependencias** | T3.1.1. |
| **Estimación** | 5 dd repartidos en 4 semanas — S3–S6 (captura progresiva, no continua). |
| **Riesgo** | ALTO. La tasa de respuesta de observadores es incierta; mitigación: recordatorios automatizados por email (Resend ya integrado) y seguimiento semanal por PM. |
| **Rollback** | Si a mitad de ventana la tasa de captura es insuficiente, ampliar la ventana (mover milestone) en vez de forzar datos de baja calidad. |
| **DoR** | Piloto reclutado (T3.1.1); validaciones de calidad de dato especificadas con ML. |
| **DoD** | ≥50 observaciones válidas; informe de calidad sin bloqueadores (sin duplicados no resueltos, sin outcome_value ausente en >10% de casos). |
| **Owner** | DATA (ejecución), PM (seguimiento de participantes). |

### Capability C3.2 — Reentrenamiento y validación del modelo con datos reales

> El modelo HRScore reentrenado con datos reales supera el umbral de validez estadística acordado, y esa validación queda reproducible.

**Criterio de promoción:** R² ≥ 0.5 en validación GroupKFold sobre datos reales (o decisión documentada de PM de lanzar con un umbral menor y etiqueta de confianza reducida en el producto).

#### Story S3.2.1 — Como ML engineer, quiero reentrenar y validar el modelo con datos reales para poder afirmar honestamente que el HRScore predice desempeño.

**Task T3.2.1 — Reentrenamiento y validación estadística**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Ejecutar el pipeline de `correlation_analysis.py` → `baseline_predictive_model.py` → `export_hrkey_model_config.py` sobre el dataset real del piloto, con validación GroupKFold por sujeto. |
| **Entradas** | ≥50 observaciones reales (T3.1.2); pipeline ML existente; metodología de hardening de `DATASET_HARDENING_SUMMARY.md`. |
| **Salidas** | Métricas de validación (R², MAE, RMSE) sobre datos reales; `hrkey_model_config_global.json` actualizado; comparación explícita sintético-vs-real documentada. |
| **Dependencias** | T3.1.2. **Ruta CLOSED — requiere aprobación PM antes de iniciar.** |
| **Estimación** | 4 dd — S6–S7. |
| **Riesgo** | ALTO. Es posible que con 50 observaciones el R² no supere 0.5 (poder estadístico limitado). Mitigación: decisión de PM pre-acordada sobre umbral mínimo aceptable para lanzamiento con disclaimer, vs. extender el piloto. |
| **Rollback** | Si el modelo real es peor que el objetivo, mantener el modelo sintético en producción **con etiqueta visible de "modelo preliminar"** en vez de desplegar un modelo real de baja confianza sin más piloto. |
| **DoR** | Dataset de piloto cerrado y con reporte de calidad en verde (T3.1.2); criterio de aceptación de R² acordado con PM antes de ejecutar. |
| **DoD** | Métricas documentadas y archivadas; config exportado y cargado por `hrkeyScoreService.js` en staging; decisión de lanzamiento (aceptar / extender piloto) tomada y registrada por PM. |
| **Owner** | ML (ejecuta), PM (decisión de umbral), BE (integra config en staging). |

**Task T3.2.2 — Etiquetado de confianza y transparencia en el producto**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Que la UI del HRScore comunique honestamente el tamaño de muestra y el intervalo de confianza del modelo vigente, evitando sobreconfianza o gaming. |
| **Entradas** | Métricas de T3.2.1; componente de dashboard de HRScore existente (gauge, confidence metrics). |
| **Salidas** | UI actualizada con nivel de confianza visible; copy revisado (legal/PM) sobre las limitaciones del score. |
| **Dependencias** | T3.2.1. |
| **Estimación** | 2 dd — S7. |
| **Riesgo** | MEDIO. Mostrar demasiada incertidumbre puede dañar percepción de producto; PM debe balancear honestidad y UX. |
| **Rollback** | Revertir a copy anterior si genera fricción de producto no anticipada, mientras se reformula. |
| **DoR** | Métricas de T3.2.1 disponibles; copy borrador revisado por Legal (ver E6). |
| **DoD** | Usuario de prueba en staging ve claramente el nivel de confianza; QA valida que el dato mostrado coincide con el config activo. |
| **Owner** | FE, PM. |

### Capability C3.3 — Operación continua del modelo (MLOps mínimo)

> Reentrenar el modelo, detectar degradación y desplegar una nueva versión es un proceso repetible, no un evento manual único.

#### Story S3.3.1 — Como ML engineer, quiero versionado y monitoreo de drift para sostener la credibilidad del HRScore después del piloto inicial.

**Task T3.3.1 — Versionado de modelo y pipeline de reentrenamiento programado**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Versionar cada `hrkey_model_config_*.json` desplegado (con metadata de fecha, tamaño de muestra, métricas) y programar reentrenamiento periódico (mensual) a medida que entren nuevas observaciones. |
| **Entradas** | Pipeline validado (T3.2.1); infraestructura CI/CD (E2). |
| **Salidas** | Esquema de versionado de modelo; job programado de reentrenamiento; historial de versiones consultable. |
| **Dependencias** | T3.2.1, T2.1.1 (CI para ejecutar el job), T2.2.4 (patrón de jobs programados ya establecido). |
| **Estimación** | 3 dd — S8. |
| **Riesgo** | MEDIO. Reentrenar automáticamente sin supervisión puede desplegar una regresión silenciosa; mitigación: el job programado genera un candidato, no lo despliega solo (gate de aprobación en T3.3.2). |
| **Rollback** | Mantener siempre la versión anterior servible; cambio de versión activa es un flag reversible sin redeploy. |
| **DoR** | Convención de versionado acordada con BE/ML. |
| **DoD** | Job de reentrenamiento ejecuta en staging generando una nueva versión candidata sin desplegarla automáticamente; historial de al menos 2 versiones consultable. |
| **Owner** | ML, SRE. |

**Task T3.3.2 — Gate de validación antes de promover una versión de modelo**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Que ninguna versión nueva del modelo se vuelva activa en producción sin superar el mismo umbral de validación que T3.2.1 y sin revisión humana. |
| **Entradas** | T3.3.1; criterio de aceptación de R² acordado. |
| **Salidas** | Checklist de promoción de versión de modelo; aprobación registrada (ML + PM) por cada cambio de versión activa en producción. |
| **Dependencias** | T3.3.1. |
| **Estimación** | 1 dd — S8. |
| **Riesgo** | BAJO. |
| **Rollback** | Revertir la versión activa al valor anterior (cambio de flag, sin redeploy). |
| **DoR** | T3.3.1 cerrada. |
| **DoD** | Un cambio de versión simulado en staging pasa por el checklist completo y queda registrado. |
| **Owner** | ML, PM. |

---

## EPIC E4 — Monetización: Revenue Sharing y Payouts

**Objetivo estratégico:** que el ciclo completo pago→acceso a datos→reparto de ingresos→payout funcione de extremo a extremo, verificado, con un único modelo de reparto vigente.
**Ventana principal:** S3–S7.
**Milestone asociado:** M2, M3.

### Capability C4.1 — Reconciliación del modelo de reparto de ingresos

> Existe un único modelo de revenue split vigente y documentado; el código y la documentación dejan de contradecirse (40/40/20 vs 60/20/15/5).

#### Story S4.1.1 — Como PM, quiero una decisión única sobre el reparto de ingresos para eliminar la ambigüedad entre el modelo fiat (Stripe) y el modelo Web3 (rail de pagos).

**Task T4.1.1 — Decisión y documentación del modelo de reparto único**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Resolver si el reparto 40/40/20 (plataforma/candidato/referencia) y el 60/20/15/5 (proveedor/candidato/tesorería/staking) coexisten para rails distintos (fiat vs Web3) o si uno debe reemplazar al otro, y documentarlo como fuente única de verdad. |
| **Entradas** | `PAYMENT_RAIL_README.md`, esquema de `revenue_shares` en DB, hallazgo de Launch 0. |
| **Salidas** | Documento de decisión firmado por PM; diagrama de qué modelo aplica a qué método de pago; issue de código abierto para cada discrepancia a corregir. |
| **Dependencias** | Ninguna. |
| **Estimación** | 1 dd — S3. |
| **Riesgo** | MEDIO. Una decisión tardía bloquea T4.2.1 y T4.3.1; es la primera task de este epic por una razón. |
| **Rollback** | N/A (decisión de producto). |
| **DoR** | Ambos modelos documentados lado a lado para la reunión de decisión. |
| **DoD** | Decisión registrada y comunicada a BE/SC; sin contradicciones en la documentación tras la actualización. |
| **Owner** | PM (decide), BE + SC (consultados). |

**Task T4.1.2 — Alineación de código y esquema al modelo decidido**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Ajustar `revenue_shares`, los controladores de reparto y (si aplica) los contratos de payment-rail para que reflejen exactamente la decisión de T4.1.1. |
| **Entradas** | T4.1.1; código actual de reparto (backend y/o contratos). |
| **Salidas** | Código y migraciones actualizados; tests de reparto actualizados a los nuevos porcentajes/reglas. |
| **Dependencias** | T4.1.1. Si toca contratos, coordina con C5.1 (toolchain de contratos debe estar operativo). |
| **Estimación** | 3 dd — S4. |
| **Riesgo** | MEDIO. Cambiar porcentajes de reparto en contrato ya escrito exige entender si es upgradeable o requiere redeploy (afecta C5). |
| **Rollback** | Migración de reversión para el esquema; si toca contrato no desplegado aún, no hay rollback on-chain que gestionar. |
| **DoR** | T4.1.1 cerrada; alcance de cambio en contratos aclarado con SC. |
| **DoD** | Tests de reparto en verde con los nuevos valores; staging refleja el modelo único; documentación de negocio y técnica coinciden. |
| **Owner** | BE, SC (si aplica). |

### Capability C4.2 — Automatización de payouts

> Un candidato o proveedor de referencia con saldo disponible recibe su payout sin intervención manual, con reconciliación contable.

#### Story S4.2.1 — Como usuario con earnings acumulados, quiero recibir mi payout automáticamente para confiar en la promesa de monetización de la plataforma.

**Task T4.2.1 — Motor de ejecución de payouts (Stripe Connect / rail Web3)**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Implementar la ejecución automatizada de payouts (actualmente ~5% implementado per Launch 0) sobre el rail decidido en T4.1.1, con manejo de fallos y reintentos. |
| **Entradas** | T4.1.1/T4.1.2; ledger de `revenue_shares`; cuenta Stripe Connect o infraestructura de pago Web3 existente. |
| **Salidas** | Job/endpoint de payout funcional; estados de payout (pendiente/procesando/completado/fallido) persistidos; reintentos automáticos con backoff para fallos transitorios. |
| **Dependencias** | T4.1.2. |
| **Estimación** | 5 dd — S5. |
| **Riesgo** | ALTO. Manejo de dinero real: un bug puede duplicar o perder un payout. Mitigación: idempotencia estricta por transacción, límites de importe en el piloto. |
| **Rollback** | Feature flag que desactiva el payout automático y vuelve a proceso manual asistido, sin perder el ledger. |
| **DoR** | Modelo de reparto único vigente; cuenta de Stripe Connect (o equivalente Web3) configurada en staging. |
| **DoD** | Payout de prueba en staging ejecutado y verificado en el ledger; test de idempotencia (doble disparo no duplica pago) en verde. |
| **Owner** | BE. |

**Task T4.2.2 — Reconciliación contable y alertas de discrepancia**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Verificar automáticamente que la suma de payouts ejecutados coincide con el ledger de `revenue_shares`, alertando ante cualquier discrepancia. |
| **Entradas** | T4.2.1; acceso a reportes de Stripe/rail Web3. |
| **Salidas** | Job de reconciliación diario; alerta en caso de discrepancia; dashboard mínimo de estado financiero para PM/Finanzas. |
| **Dependencias** | T4.2.1, T2.3.1 (canal de alertas). |
| **Estimación** | 2 dd — S6. |
| **Riesgo** | MEDIO. |
| **Rollback** | Job desactivable sin afectar payouts ya ejecutados. |
| **DoR** | T4.2.1 en staging. |
| **DoD** | Discrepancia simulada en staging genera alerta en <1 día (ciclo del job); reporte de reconciliación revisado por PM. |
| **Owner** | BE, SRE. |

### Capability C4.3 — Verificación E2E de monetización

> El camino completo pago→acceso→reparto→payout está cubierto por un test automatizado que corre en CI.

#### Story S4.3.1 — Como QA, quiero un test E2E del ciclo de monetización para prevenir regresiones silenciosas en el flujo que genera ingresos.

**Task T4.3.1 — Test E2E pago→acceso→reparto→payout**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Automatizar un test de extremo a extremo: una compañía paga por acceso a datos, el acceso se concede tras consentimiento, el reparto se calcula correctamente y el payout se dispara, todo verificado contra el estado final de la base de datos. |
| **Entradas** | T4.1.2, T4.2.1; mocks de Stripe/rail ya usados en la suite de tests; `E2E_TESTING_CHECKLIST.md`. |
| **Salidas** | Test E2E incorporado a CI; documentación del escenario cubierto y de los escenarios de fallo (pago rechazado, consentimiento revocado a mitad de flujo). |
| **Dependencias** | T4.2.1; T2.1.1 (CI). |
| **Estimación** | 3 dd — S7. |
| **Riesgo** | MEDIO. Tests E2E de flujos financieros son frágiles frente a mocks desactualizados; mitigación: revisión conjunta con BE al introducir cambios en el flujo de pago. |
| **Rollback** | El test puede marcarse "quarantine" temporalmente si un cambio legítimo lo rompe, con ticket de reparación inmediato — nunca eliminarlo. |
| **DoR** | T4.2.1 desplegado en staging; escenarios de fallo acordados con QA. |
| **DoD** | Test verde en CI de forma estable durante 5 ejecuciones consecutivas; escenarios de fallo (pago rechazado, consentimiento revocado) cubiertos explícitamente. |
| **Owner** | QA, BE. |

---

## EPIC E5 — Smart Contracts: Toolchain, Auditoría y Gobernanza On-Chain

**Objetivo estratégico:** desbloquear la compilación/tests de contratos, obtener una auditoría externa, e introducir controles de gobernanza (multisig, timelock, pausa) antes de considerar cualquier despliegue adicional a mainnet.
**Ventana principal:** S2–S10.
**Milestone asociado:** M2, M4.
**Regla dura del programa:** ningún contrato nuevo (más allá de HRKeyRegistry, ya en mainnet) se despliega a Base mainnet sin auditoría externa aprobada y sin multisig/timelock activos. Esto se refleja como criterio de promoción de C5.3.

### Capability C5.1 — Desbloqueo del toolchain de contratos

> `npm test` y `npx hardhat compile` corren sin conflicto de dependencias sobre todo el árbol de contratos (HRKToken, HRKStaking, HRKSlashing, payment-rail, anchor layer).

#### Story S5.1.1 — Como smart contract engineer, quiero un entorno de build reproducible para poder testear y auditar el código de contratos existente.

**Task T5.1.1 — Resolución de conflictos Hardhat 2.x/3.x, OpenZeppelin v4/v5 y Chai**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Unificar versiones de Hardhat, OpenZeppelin y Chai en todo el árbol de contratos (incluye corregir imports de `HRKSlashing` afectados por el cambio de rutas de OZ v5) para que la compilación y los tests corran sin bloqueos. |
| **Entradas** | Los múltiples `hardhat.config.*` presentes en el repo (`hardhat.config.js`, `.mjs`, `.ts`, backups); hallazgo de `ANCHOR_LAYER_IMPLEMENTATION.md`. |
| **Salidas** | Una única configuración Hardhat vigente (las demás archivadas o eliminadas); `package.json` de contratos con versiones fijadas; `npx hardhat compile` y `npm test` en verde sobre todos los contratos. |
| **Dependencias** | Ninguna. |
| **Estimación** | 4 dd — S2–S3. |
| **Riesgo** | ALTO. Cambiar de OZ v4 a v5 puede alterar comportamiento de contratos ya "terminados" (p. ej. `Ownable` cambia su constructor); requiere revisión línea a línea de cada contrato afectado. |
| **Rollback** | Rama de trabajo aislada; si la migración de versión rompe semántica de un contrato ya auditado conceptualmente, revertir y fijar la versión antigua de OZ documentando la razón. |
| **DoR** | Inventario de qué contrato depende de qué versión de OZ y por qué. |
| **DoD** | Suite de tests de HRKToken/HRKStaking/HRKSlashing/payment-rail/anchor corre completa y en verde; una única config de Hardhat activa. |
| **Owner** | SC. |

**Task T5.1.2 — Incorporación de contratos al CI**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Que el pipeline de CI (E2) compile y testee los contratos en cada PR que toque `contracts/`. |
| **Entradas** | T5.1.1; pipeline de T2.1.1. |
| **Salidas** | Job de CI específico para contratos; cobertura de tests de contratos reportada. |
| **Dependencias** | T5.1.1, T2.1.1. |
| **Estimación** | 1 dd — S3. |
| **Riesgo** | BAJO. |
| **Rollback** | Job desactivable sin afectar el resto del pipeline. |
| **DoR** | T5.1.1 cerrada. |
| **DoD** | PR de prueba que rompe un test de contrato falla el CI. |
| **Owner** | SC, SRE. |

### Capability C5.2 — Auditoría externa de contratos

> Un auditor externo independiente ha revisado HRKToken, HRKStaking, HRKSlashing y los contratos del payment-rail, y los hallazgos críticos/altos están remediados.

**Criterio de promoción:** informe de auditoría entregado y cero hallazgos críticos/altos abiertos (los de severidad media/baja quedan en backlog con dueño y fecha).

#### Story S5.2.1 — Como responsable de producto Web3, quiero una auditoría externa para poder exponer usuarios reales a contratos que gestionan valor.

**Task T5.2.1 — Selección de auditor y encargo**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Seleccionar firma auditora (rango $5k–30k según `PRODUCTION_READINESS_ANALYSIS.md`) y encargar la auditoría sobre el conjunto de contratos congelado tras T5.1.1. |
| **Entradas** | Presupuesto aprobado por PM; código de contratos congelado (feature-freeze) para auditar una versión estable. |
| **Salidas** | Contrato firmado con el auditor; alcance y calendario de entrega acordados (2–4 semanas típico). |
| **Dependencias** | T5.1.1 (el código a auditar debe compilar y testear en verde); aprobación de presupuesto (PM). |
| **Estimación** | 2 dd de gestión — S4 (más 2–4 semanas de lead time externo). |
| **Riesgo** | ALTO en cronograma: el lead time del auditor puede desplazar M4. Mitigación: encargar en cuanto T5.1.1 cierre, no esperar a que todo el epic E5 esté listo. |
| **Rollback** | N/A (gestión de proveedor). |
| **DoR** | Presupuesto aprobado; código congelado y etiquetado (tag de git) como "versión auditada". |
| **DoD** | Contrato firmado; fecha de entrega de informe preliminar confirmada. |
| **Owner** | PM (presupuesto/proveedor), SC (alcance técnico). |

**Task T5.2.2 — Remediación de hallazgos y re-verificación**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Corregir todos los hallazgos críticos y altos del informe de auditoría, y obtener confirmación (re-check) del auditor o de un segundo revisor interno cualificado. |
| **Entradas** | Informe de auditoría (T5.2.1). |
| **Salidas** | Hallazgos críticos/altos remediados con commit vinculado a cada uno; informe de cierre; backlog de hallazgos medios/bajos con dueño y fecha. |
| **Dependencias** | T5.2.1. |
| **Estimación** | 5 dd (variable según hallazgos) — S8–S9. |
| **Riesgo** | ALTO. El volumen de hallazgos es desconocido hasta recibir el informe; este es el mayor riesgo de cronograma del epic. Buffer de una semana reservado en el roadmap (S9). |
| **Rollback** | Si un hallazgo crítico no puede remediarse a tiempo, el contrato afectado no se despliega a mainnet (queda en testnet) hasta la siguiente ventana de auditoría. |
| **DoR** | Informe recibido y triado por severidad con SC. |
| **DoD** | Cero hallazgos críticos/altos abiertos; confirmación de cierre documentada; tag de git de la "versión auditada final". |
| **Owner** | SC, SEC (revisión cruzada). |

### Capability C5.3 — Gobernanza on-chain y despliegue condicionado

> Las funciones privilegiadas (slashing, actualización de parámetros) están protegidas por multisig y timelock, y existe mecanismo de pausa de emergencia, antes de cualquier despliegue adicional a mainnet.

#### Story S5.3.1 — Como responsable de riesgo, quiero controles de gobernanza on-chain para que un solo actor no pueda comprometer fondos o reputación de usuarios.

**Task T5.3.1 — Multisig, timelock y pausa de emergencia**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Sustituir el ownership simple por un multisig (p. ej. Gnosis Safe) con timelock para funciones privilegiadas, y añadir `Pausable` con rol de emergencia donde falte. |
| **Entradas** | Contratos remediados (T5.2.2); recomendación explícita de `PAYMENT_RAIL_README.md` ("multisig ownership + timelock before mainnet"). |
| **Salidas** | Contratos actualizados con control de acceso multisig+timelock; runbook de pausa de emergencia; signatarios del multisig designados y con hardware wallets. |
| **Dependencias** | T5.2.2. |
| **Estimación** | 4 dd — S9. |
| **Riesgo** | ALTO. Mal configurado, un multisig puede bloquear operaciones legítimas (todos los signatarios indisponibles); mitigación: umbral N-de-M con al menos 5 signatarios y SOP de disponibilidad. |
| **Rollback** | Antes de transferir el ownership final al multisig, mantener capacidad de revertir a un owner de emergencia predefinido durante una ventana de validación en testnet. |
| **DoR** | Signatarios designados; umbral N-de-M acordado con PM/SEC. |
| **DoD** | Despliegue en Base Sepolia con multisig activo, timelock probado (cambio de parámetro con delay) y pausa de emergencia ejercitada en un ensayo. |
| **Owner** | SC, SEC. |

**Task T5.3.2 — Decisión y ejecución de despliegue a mainnet (condicionado)**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Desplegar a Base mainnet únicamente los contratos que hayan superado auditoría (C5.2) y gobernanza on-chain (T5.3.1), con decisión explícita de PM sobre cuáles se despliegan en esta ventana del programa. |
| **Entradas** | T5.2.2, T5.3.1; verificación exitosa en Base Sepolia. |
| **Salidas** | Contratos desplegados y verificados en Basescan; documentación de direcciones y ABI publicada; decisión de PM registrada para cualquier contrato que se decida NO desplegar todavía. |
| **Dependencias** | T5.2.2, T5.3.1. |
| **Estimación** | 2 dd — S10. |
| **Riesgo** | ALTO. Despliegue a mainnet es irreversible (el contrato en sí); mitigación: ensayo idéntico previo en Sepolia, checklist de despliegue firmado por SC+SEC+PM antes de ejecutar. |
| **Rollback** | No hay rollback de un contrato ya desplegado; el mecanismo de mitigación es la pausa de emergencia (T5.3.1) y, si el diseño lo permite, un contrato sucesor con migración de estado. |
| **DoR** | Checklist de despliegue firmado por SC, SEC y PM; ensayo en Sepolia idéntico al plan de mainnet. |
| **DoD** | Contratos verificados en Basescan; smoke test on-chain post-despliegue en verde; comunicación de direcciones a BE/FE para integración. |
| **Owner** | SC (ejecuta), SEC + PM (aprueban). |

---

## EPIC E6 — Cumplimiento Legal y Protección de Datos

**Objetivo estratégico:** que la plataforma cumpla los requisitos mínimos de protección de datos (GDPR-like) antes de operar con datos personales reales a escala, dado que ya maneja identidad, referencias y datos de desempeño.
**Ventana principal:** S4–S8.
**Milestone asociado:** M3.

### Capability C6.1 — Marco legal y políticas

> Existen y están publicados los documentos legales mínimos, revisados por asesoría legal.

#### Story S6.1.1 — Como usuario, quiero saber qué se hace con mis datos para poder confiar en la plataforma y cumplir con la ley.

**Task T6.1.1 — Política de privacidad, ToS y política de retención**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Redactar y publicar Política de Privacidad, Términos de Servicio y Política de Retención de Datos, alineados con el modelo real de datos de la plataforma (incluye datos on-chain inmutables — un caso especial para "derecho al olvido"). |
| **Entradas** | Mapa de datos personales manejados (identidad, KPI, referencias, wallets, pagos); hallazgo de gap total en `PRODUCTION_READINESS_ANALYSIS.md`. |
| **Salidas** | Documentos legales publicados en el sitio; matriz de retención por tipo de dato; nota específica sobre inmutabilidad on-chain y cómo se reconcilia con derecho al olvido (vía "hidden ≠ erased" y anclaje de hash, no de dato crudo). |
| **Dependencias** | Mapa de datos (subtask propia); disponibilidad de asesoría legal. |
| **Estimación** | 4 dd de coordinación (más tiempo de asesoría externa) — S4–S5. |
| **Riesgo** | MEDIO. La reconciliación legal de "inmutable on-chain" con "derecho al olvido" es genuinamente compleja; puede requerir ajuste de diseño (anclar solo hashes, nunca PII cruda — a verificar contra `ANCHOR_LAYER_IMPLEMENTATION.md`). |
| **Rollback** | N/A (documento legal; se corrige por versión). |
| **DoR** | Mapa de datos personales completo; asesoría legal contratada o designada. |
| **DoD** | Documentos revisados y aprobados por Legal; publicados y enlazados desde el flujo de registro; versión y fecha de vigencia visibles. |
| **Owner** | LEGAL, PM. |

**Task T6.1.2 — Banner de consentimiento de cookies/tracking**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Implementar consentimiento explícito para cookies/analytics no esenciales, coherente con la política de privacidad. |
| **Entradas** | T6.1.1; inventario de cookies/analytics actuales en frontend. |
| **Salidas** | Banner de consentimiento funcional; registro de consentimiento de cookies persistido. |
| **Dependencias** | T6.1.1. |
| **Estimación** | 2 dd — S5. |
| **Riesgo** | BAJO. |
| **Rollback** | Revertir el componente sin afectar el resto del frontend. |
| **DoR** | Inventario de cookies/trackers de terceros confirmado. |
| **DoD** | Usuario nuevo ve el banner y su elección se respeta (analytics no esencial no carga sin aceptación); QA verifica en staging. |
| **Owner** | FE, LEGAL. |

### Capability C6.2 — Derechos de datos (export, borrado, acceso)

> Un usuario puede ejercer sus derechos de exportación y eliminación de datos personales de forma auto-servicio o asistida, documentada.

#### Story S6.2.1 — Como candidato, quiero exportar o solicitar la eliminación de mis datos personales para ejercer mis derechos legales.

**Task T6.2.1 — Endpoint de exportación de datos personales**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Endpoint autenticado que genere un export completo (JSON/CSV) de los datos personales de un usuario: identidad, referencias, observaciones KPI, consentimientos, historial de pagos/earnings. |
| **Entradas** | Modelo de datos existente (Supabase); autenticación ya operativa. |
| **Salidas** | Endpoint `/api/account/export` (o equivalente); test de integración que verifica completitud del export. |
| **Dependencias** | Ninguna técnica; alineado con T6.1.1 para el copy legal del export. |
| **Estimación** | 3 dd — S6. |
| **Riesgo** | BAJO-MEDIO. Riesgo de omitir alguna tabla con datos personales; mitigar con checklist derivado del mapa de datos de T6.1.1. |
| **Rollback** | Endpoint aditivo, sin riesgo de romper flujos existentes. |
| **DoR** | Mapa de datos de T6.1.1 disponible como checklist de completitud. |
| **DoD** | Export de un usuario de prueba verificado campo a campo contra el mapa de datos; rate-limit aplicado al endpoint (evitar exfiltración masiva). |
| **Owner** | BE. |

**Task T6.2.2 — Proceso de eliminación/anonimización con manejo del caso on-chain**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Definir y construir el proceso de "derecho al olvido": anonimización en base de datos relacional (dado el modelo "hidden ≠ erased", esto puede ser un nivel de hard-delete superior al de strikethrough) y documentar por qué los hashes anclados on-chain no son reversibles ni contienen PII. |
| **Entradas** | T6.1.1 (definición legal); modelo de anclaje (`ANCHOR_LAYER_IMPLEMENTATION.md`) para confirmar que solo se ancla hash, no dato crudo. |
| **Salidas** | Proceso de eliminación/anonimización implementado (auto-servicio o asistido con SLA); confirmación técnica documentada de que el anclaje on-chain no contiene PII recuperable. |
| **Dependencias** | T6.1.1, T6.2.1. |
| **Estimación** | 4 dd — S7. |
| **Riesgo** | MEDIO. Si se descubre que el anclaje sí permite reconstruir PII (p. ej. hash de baja entropía sobre un campo predecible), esto se convierte en un hallazgo de seguridad que debe pasar a E1/E5 antes de cerrar esta task. |
| **Rollback** | Proceso de eliminación reversible durante un período de gracia (p. ej. 30 días de "soft delete") antes de la anonimización definitiva, para permitir revertir solicitudes erróneas. |
| **DoR** | Confirmación técnica de que el anclaje on-chain usa solo hashes de datos con suficiente entropía (no PII recuperable por fuerza bruta). |
| **DoD** | Solicitud de eliminación de prueba ejecutada de punta a punta con evidencia; SLA de atención documentado y comunicado en la política de privacidad. |
| **Owner** | BE, SEC (verificación de anclaje), LEGAL. |

---

## EPIC E7 — Calidad, Frontend y Documentación Técnica

**Objetivo estratégico:** cerrar la brecha entre "funciona" y "es mantenible/auditable": checks de build reactivados, cobertura E2E de frontend, documentación de API pública.
**Ventana principal:** S3–S10.
**Milestone asociado:** M2, M4.

### Capability C7.1 — Calidad de frontend

> El build de producción no ignora errores de lint/TypeScript; existe cobertura de tests de frontend.

#### Story S7.1.1 — Como FE lead, quiero que el pipeline de build detecte errores reales para evitar que lleguen a producción silenciosamente.

**Task T7.1.1 — Reactivar `ignoreDuringBuilds`/`ignoreBuildErrors` y sanear deuda**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Quitar las banderas que desactivan ESLint/TypeScript en el build de Next.js y corregir la deuda de errores que emerja. |
| **Entradas** | `next.config`; hallazgo de `PRODUCTION_READINESS_ANALYSIS.md`. |
| **Salidas** | Build con checks activos; lista de errores corregidos o, si son falsos positivos, suprimidos puntualmente con justificación. |
| **Dependencias** | T2.1.1 (CI debe reflejar el build real). |
| **Estimación** | 3 dd (variable según deuda real) — S3–S4. |
| **Riesgo** | MEDIO. Puede aparecer un volumen alto de errores acumulados; buffer reservado. |
| **Rollback** | Si el volumen es inmanejable en la ventana, reactivar temporalmente solo para las rutas ya saneadas (whitelist) mientras se completa el resto, nunca revertir globalmente sin plan. |
| **DoR** | Conteo previo de errores que aparecerían al reactivar (ejecución en seco). |
| **DoD** | Build de producción pasa con los checks activos; CI los aplica en cada PR. |
| **Owner** | FE. |

**Task T7.1.2 — Suite de tests de frontend (Vitest) sobre flujos críticos**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Cobertura de tests de componentes/flujos críticos de frontend (dashboard HRScore, flujo de consentimiento, checkout Stripe) que hoy no existe. |
| **Entradas** | Componentes existentes; mocks de backend ya usados en tests de integración. |
| **Salidas** | Suite Vitest con cobertura de los flujos críticos listados; integrada al CI. |
| **Dependencias** | T2.1.1. |
| **Estimación** | 4 dd — S5. |
| **Riesgo** | BAJO. |
| **Rollback** | Aditivo. |
| **DoR** | Lista de flujos críticos priorizada con QA. |
| **DoD** | CI ejecuta la suite y falla ante una regresión introducida deliberadamente como prueba. |
| **Owner** | FE, QA. |

### Capability C7.2 — Documentación técnica y de API

> Un desarrollador externo (o un nuevo integrante del equipo) puede integrar contra la API y entender el sistema sin depender de conversación oral.

#### Story S7.2.1 — Como partner/compañía integradora, quiero documentación de API formal para poder construir contra HRKey sin fricción.

**Task T7.2.1 — Especificación OpenAPI/Swagger de la API pública**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Documentar formalmente los ~65 endpoints del backend en OpenAPI, publicando una UI navegable (Swagger UI o equivalente). |
| **Entradas** | Controladores existentes; `HRKEY_SCORE_README.md` y `KPI_OBSERVATIONS_README.md` como base de contenido ya redactado. |
| **Salidas** | Archivo OpenAPI versionado junto al código; UI de documentación desplegada (staging y producción). |
| **Dependencias** | Ninguna técnica; se beneficia de que E1/E4 hayan estabilizado los contratos de request/response antes de documentarlos. |
| **Estimación** | 5 dd — S6–S7. |
| **Riesgo** | BAJO. Riesgo de quedar desactualizada; mitigar con check de CI que compara el spec contra las rutas registradas. |
| **Rollback** | Aditivo. |
| **DoR** | Inventario completo de endpoints activos (incluye los añadidos por E4/E6). |
| **DoD** | Spec cubre el 100% de endpoints activos; check de CI de deriva spec-vs-código en verde. |
| **Owner** | BE. |

**Task T7.2.2 — Documentos de arquitectura, DR y runbooks operativos**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Producir los documentos operativos faltantes señalados en el análisis de readiness: ADRs clave, plan de disaster recovery, runbook de monitoreo/alertas, guía de onboarding de compañías. |
| **Entradas** | Decisiones ya tomadas en E1–E6 (son la fuente de contenido de los ADRs); simulacro de DR de T2.4.2. |
| **Salidas** | Carpeta `docs/` con ADRs, plan de DR, runbook de alertas, guía de onboarding de compañías. |
| **Dependencias** | T2.4.2 (para el plan de DR); resto de epics como fuente de contenido. |
| **Estimación** | 3 dd — S10. |
| **Riesgo** | BAJO. |
| **Rollback** | Aditivo. |
| **DoR** | Simulacro de DR ejecutado; decisiones clave del programa consolidadas. |
| **DoD** | Documentos revisados por TPM y publicados; referenciados desde el README principal. |
| **Owner** | TPM, SRE. |

---

## EPIC E8 — Datos: Rollout del Trust Data Model V1 y Analytics

**Objetivo estratégico:** llevar a producción, de forma controlada y verificada, lo que ya está construido pero no ejecutado (Trust Data Model V1) y cerrar el ciclo de analytics con retención de datos y dashboard operativo.
**Ventana principal:** S2–S6.
**Milestone asociado:** M2.

### Capability C8.1 — Rollout controlado del Trust Data Model V1

> Las migraciones 030/031, el seed y el rollback del modelo de confianza están ejecutados y verificados en staging antes de producción.

#### Story S8.1.1 — Como DATA engineer, quiero un gate de verificación en staging para llevar el modelo de confianza a producción sin sorpresas.

**Task T8.1.1 — Ejecución en staging y validación SQL**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Aplicar las migraciones 030/031 (RLS de tablas de confianza, RPC de moderación, vista de cola, seed) en staging y correr el script de validación SQL definido en `TRUST_DATA_MODEL_V1_PRODUCTION_READINESS_REPORT.md`. |
| **Entradas** | Migraciones y seed ya escritos; script de validación existente; proceso de aplicación de T2.2.2. |
| **Salidas** | Staging con el modelo de confianza activo; resultado de validación SQL documentado; UI de moderación de admin probada contra datos de seed. |
| **Dependencias** | T2.2.2 (proceso de migración trazado); T2.2.1 (esquema reconciliado, para no aplicar sobre un esquema con drift desconocido). |
| **Estimación** | 2 dd — S3. |
| **Riesgo** | MEDIO. Es la primera vez que estas migraciones corren fuera de desarrollo local; mitigación: rollback script ya existe y se prueba explícitamente en la misma ventana. |
| **Rollback** | Script de rollback ya incluido en la entrega original; se ejecuta y verifica en staging como parte de esta misma task (no solo en caso de fallo, sino como prueba deliberada). |
| **DoR** | T2.2.1 y T2.2.2 cerradas. |
| **DoD** | Validación SQL sin discrepancias; rollback ejecutado y re-aplicado exitosamente como ensayo; UI de moderación admin operativa en staging. |
| **Owner** | DATA, BE. |

**Task T8.1.2 — Promoción a producción**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Aplicar el modelo de confianza en producción tras el gate de staging, en ventana de bajo tráfico y con monitoreo activo. |
| **Entradas** | T8.1.1 exitosa; alertas de T2.3.1 activas. |
| **Salidas** | Producción con RLS de confianza y moderación activos; verificación post-despliegue documentada. |
| **Dependencias** | T8.1.1, T2.3.1. |
| **Estimación** | 1 dd — S4. |
| **Riesgo** | MEDIO. Cambios de RLS en producción pueden bloquear queries no anticipadas; mitigación: ventana de bajo tráfico + monitoreo activo + rollback ensayado. |
| **Rollback** | Mismo script de rollback validado en T8.1.1, ahora contra producción. |
| **DoR** | T8.1.1 cerrada con evidencia; ventana de despliegue de bajo tráfico acordada con SRE. |
| **DoD** | Verificación post-despliegue sin incidentes en las 24h siguientes; métricas de error de Sentry estables. |
| **Owner** | DATA, SRE. |

### Capability C8.2 — Cierre del ciclo de analytics

> El dashboard de analytics para administración existe, y hay una política de retención ejecutándose automáticamente.

#### Story S8.2.1 — Como administrador, quiero un dashboard de analytics operativo para tomar decisiones de producto basadas en datos ya capturados.

**Task T8.2.1 — Dashboard de analytics para superadmin**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Construir la UI de dashboard sobre las 6 vistas materializadas y 7 endpoints de superadmin ya existentes (schema/queries completos, UI pendiente per `ANALYTICS_IMPLEMENTATION_SUMMARY.md`). |
| **Entradas** | Endpoints de analytics existentes; vistas materializadas con refresco programado (T2.2.4). |
| **Salidas** | Dashboard funcional en el panel de administración. |
| **Dependencias** | T2.2.4. |
| **Estimación** | 4 dd — S5. |
| **Riesgo** | BAJO. |
| **Rollback** | Aditivo. |
| **DoR** | T2.2.4 cerrada (datos frescos garantizados). |
| **DoD** | Un superadmin puede ver las 6 métricas principales en staging con datos reales del piloto (E3) y de uso de la plataforma. |
| **Owner** | FE, DATA. |

**Task T8.2.2 — Job de retención/archivado de eventos de analytics**

| Atributo | Detalle |
|---|---|
| **Objetivo** | Implementar el job de retención a 90 días (mencionado como pendiente en `ANALYTICS_IMPLEMENTATION_SUMMARY.md`) que archiva o purga `analytics_events` según la política de retención definida en E6. |
| **Entradas** | Política de retención de T6.1.1; tabla `analytics_events`. |
| **Salidas** | Job programado de archivado/purga; verificación de que el archivado no rompe las vistas materializadas dependientes. |
| **Dependencias** | T6.1.1 (política de retención debe existir antes de automatizar el borrado), T2.2.4 (patrón de jobs programados). |
| **Estimación** | 2 dd — S6. |
| **Riesgo** | MEDIO. Purgar antes de tiempo puede invalidar análisis retrospectivos del piloto de E3; coordinar ventana con DATA/ML. |
| **Rollback** | Job desactivable; si se detecta purga incorrecta, restaurar desde backup (T2.4.2) dentro de la ventana de RPO. |
| **DoR** | Política de retención publicada; confirmación de ML de que no interfiere con el piloto de datos en curso. |
| **DoD** | Ejecución de prueba en staging archivando/purgando correctamente eventos fuera de la ventana de retención, sin romper las vistas materializadas. |
| **Owner** | DATA. |

---

## 5. Roadmap de 12 semanas

Notación: ▶ inicio de capability, ■ trabajo continuo, ◆ milestone/gate, ✓ cierre de capability.

| Semana | E1 Seguridad | E2 Infra/CI | E3 ML/HRScore | E4 Monetización | E5 Contratos | E6 Legal | E7 Calidad/Docs | E8 Datos/Analytics |
|---|---|---|---|---|---|---|---|---|
| **S1** | ▶ T1.1.1 rotación, T1.2.1 debug route | ▶ T2.1.1 CI (arranque) | — | — | — | — | — | — |
| **S2** | T1.1.2 purga historial, T1.2.2 CORS, ▶T1.3.1 diseño wallet | T2.1.1 (cierre), T2.1.2 branch protection, ▶T2.2.1 auditoría esquema, T2.3.1 alertas, T2.4.1 upgrade planes | ▶ T3.1.1 diseño piloto | — | ▶ T5.1.1 desbloqueo toolchain | — | — | — |
| **◆ S2** | | | | | | | | **M1 — Fundación segura y observable** |
| **S3** | T1.1.3 SOP secretos, T1.2.3 constraint DB | T2.1.3 deploy staging, T2.2.2 registro migraciones, T2.3.2 logging | T3.1.1 (cierre reclutamiento), ▶T3.1.2 captura | ▶ T4.1.1 decisión reparto | T5.1.1 (cierre), T5.1.2 CI contratos | — | ▶ T7.1.1 build checks | ▶ T8.1.1 rollout staging Trust V1 |
| **S4** | — | T2.2.3 limpieza legacy, T2.2.4 refresco vistas | T3.1.2 (continúa) | T4.1.2 alineación código | ▶ T5.2.1 encargo auditoría (envío) | ▶ T6.1.1 políticas legales | T7.1.1 (cierre) | T8.1.2 promoción producción Trust V1 |
| **◆ S4** | | | | | | | | **M2 — Datos gobernados + capability de negocio destrabada** |
| **S5** | — | — | T3.1.2 (continúa) | ▶ T4.2.1 motor de payout | (lead time externo auditoría) | T6.1.1 (cierre), T6.1.2 cookies | T7.1.2 tests frontend | T8.2.1 dashboard analytics |
| **S6** | — | — | T3.1.2 (cierre ≥50 obs.) | T4.2.1 (cierre), ▶T4.2.2 reconciliación | (lead time externo) | ▶ T6.2.1 export de datos | ▶ T7.2.1 OpenAPI (inicio) | T8.2.2 retención analytics |
| **S7** | — | — | ▶ T3.2.1 reentrenamiento real (gate PM), T3.2.2 UI confianza | T4.2.2 (cierre), ▶T4.3.1 test E2E monetización | (lead time externo) | T6.2.2 eliminación/anonimización | T7.2.1 (cierre) | — |
| **◆ S7** | | | **M3 — Monetización E2E + primera validación real de ML** | | | | | |
| **S8** | — | — | T3.2.1 (cierre/decisión PM), ▶T3.3.1 versionado modelo | T4.3.1 (cierre) | ▶ T5.2.2 remediación hallazgos (recepción informe) | — | — | — |
| **S9** | ▶ T1.3.2 re-cifrado wallets (ventana mantenimiento) | — | T3.3.1 (cierre), T3.3.2 gate promoción | — | T5.2.2 (cierre), ▶T5.3.1 gobernanza on-chain | — | — | — |
| **◆ S9** | | | | | | | | **M4 — Seguridad wallet cerrada + contratos auditados y gobernados** |
| **S10** | — | — | — | — | T5.3.1 (cierre), ▶T5.3.2 despliegue mainnet condicionado | — | ▶ T7.2.2 docs/runbooks | — |
| **S11** | Buffer / auditoría cruzada | Buffer / auditoría cruzada | Buffer / auditoría cruzada | Buffer / auditoría cruzada | T5.3.2 (cierre si aplica) | Buffer / auditoría cruzada | T7.2.2 (cierre) | Buffer / auditoría cruzada |
| **S12** | **Auditoría posterior de programa + Go/No-Go de Launch 0** | | | | | | | |
| **◆ S12** | | | | | | | | **M5 — Go/No-Go Launch 0** |

**Nota de paralelismo:** E3 (piloto de datos, S2–S8) es la ruta crítica más larga del programa y corre en paralelo a todo lo demás desde la semana 2; no bloquea a los otros epics salvo en la decisión de UI de confianza (T3.2.2) y el gate de lanzamiento final. E5 (auditoría externa) tiene lead time no controlable por el equipo (2–4 semanas): se encarga en S4 para no comprometer M4. S11 se reserva deliberadamente como buffer, dado que E3 y E5 son los dos epics con mayor riesgo de desplazamiento de cronograma.

---

## 6. Milestones

| ID | Semana | Nombre | Contenido | Gate para continuar |
|---|---|---|---|---|
| **M0** | Fin S1 | Corte de riesgo inmediato | Credenciales expuestas rotadas; ruta de debug retirada. | Ninguna credencial antigua sigue siendo válida (verificado por SEC). |
| **M1** | Fin S2 | Fundación segura y observable | CI base en verde, branch protection, alertas de Sentry/uptime activas, plan de hosting sin sleep, historial de git purgado. | CI bloqueante activo en `main`; alerta de prueba recibida end-to-end. |
| **M2** | Fin S4 | Datos gobernados + negocio destrabado | Esquema de DB reconciliado y con proceso de migración trazado; Trust Data Model V1 en producción; decisión única de revenue split aplicada en código; piloto de datos KPI reclutado y en captura. | Cero drift de esquema sin resolver; Trust V1 verificado en producción sin incidentes 24h; código sin contradicción de reparto. |
| **M3** | Fin S7 | Monetización E2E + primera validación real de ML | Test E2E pago→acceso→reparto→payout en verde y estable; primer reentrenamiento del HRScore sobre datos reales completado con decisión de PM registrada (aceptar umbral o extender piloto). | Test E2E estable 5 ejecuciones consecutivas; informe de validación de modelo real archivado y decisión tomada. |
| **M4** | Fin S9 | Seguridad de wallets cerrada + contratos auditados y gobernados | Wallets re-cifradas al 100% con nuevo esquema; auditoría externa de contratos cerrada sin hallazgos críticos/altos abiertos; multisig+timelock+pausa verificados en testnet. | Verificación 100% de wallets; informe de cierre de auditoría; ensayo de pausa de emergencia exitoso en Sepolia. |
| **M5** | Fin S12 | Go/No-Go de Launch 0 | Auditoría posterior del programa completa (sección 9); decisión formal de lanzamiento (o de qué capability queda condicionada). | Ver checklist de la sección 9.2. |

---

## 7. Criterios para mover cada Capability (Definition of Promotion)

Una **capability** solo se considera "movida" (promovida de un estado al siguiente: Diseño → En construcción → Verificada en staging → Producción) cuando cumple, además del DoD de cada task individual, el criterio agregado de la capability:

| Capability | Criterio de promoción a "Producción" |
|---|---|
| C1.1 Gestión de secretos | Cero credenciales antiguas válidas + escaneo de secretos bloqueante en CI + SOP de rotación publicado. |
| C1.2 Endurecimiento de superficie | Ruta de debug inaccesible en prod + CORS sin fuga de información + constraint de expiración de tokens activa en prod. |
| C1.3 Cifrado de wallets | 100% de wallets verificadas bajo el nuevo esquema; esquema antiguo eliminado del código. |
| C2.1 CI/CD | CI bloqueante en `main`; despliegue automático a staging con smoke en verde; branch protection activa. |
| C2.2 Gobernanza de DB | Cero drift entre `sql/` y el esquema real de cada entorno; toda migración nueva pasa por el proceso con rollback documentado. |
| C2.3 Observabilidad | Alerta de prueba recibida en <5 min; cero `console.log` en backend; logs correlacionables por request. |
| C2.4 Infra de continuidad | Cero cold starts en producción; restore de backup probado y documentado con RPO/RTO cumplidos. |
| C3.1 Piloto de datos KPI | ≥50 observaciones reales válidas, ≥3 roles, informe de calidad sin bloqueadores. |
| C3.2 Validación del modelo | Métricas de validación real archivadas y decisión de PM tomada (lanzar con umbral acordado o extender piloto); UI de confianza reflejando el estado real. |
| C3.3 MLOps mínimo | Job de reentrenamiento programado operativo; gate de promoción de versión de modelo ejercitado al menos una vez. |
| C4.1 Reconciliación de reparto | Documentación y código sin contradicciones; tests de reparto en verde con el modelo único. |
| C4.2 Payout automatizado | Payout de prueba verificado en ledger; idempotencia probada; reconciliación diaria activa sin discrepancias abiertas. |
| C4.3 Verificación E2E | Test E2E estable 5 ejecuciones consecutivas en CI, incluyendo escenarios de fallo. |
| C5.1 Toolchain de contratos | `compile` + `test` en verde sobre todo `contracts/`; job de CI de contratos activo. |
| C5.2 Auditoría externa | Informe de auditoría entregado; cero hallazgos críticos/altos abiertos. |
| C5.3 Gobernanza on-chain | Multisig+timelock+pausa verificados en Sepolia; despliegue a mainnet solo con checklist firmado por SC+SEC+PM. |
| C6.1 Marco legal | Documentos legales publicados y aprobados por Legal; banner de consentimiento operativo. |
| C6.2 Derechos de datos | Export verificado campo a campo; proceso de eliminación ejecutado E2E con período de gracia. |
| C7.1 Calidad de frontend | Build de producción con lint/TS activos; suite Vitest de flujos críticos en CI. |
| C7.2 Documentación técnica | Spec OpenAPI cubre 100% de endpoints activos sin deriva; docs de DR/runbooks publicados. |
| C8.1 Rollout Trust Model V1 | Validación SQL sin discrepancias en staging y en producción; rollback ensayado exitosamente en ambos entornos. |
| C8.2 Cierre de analytics | Dashboard operativo con datos reales; job de retención ejecutado sin romper vistas materializadas. |

---

## 8. Validaciones automáticas (quality gates continuos)

Estas validaciones corren de forma continua a partir de que su epic habilitador (E2, principalmente) esté operativo, y aplican a **todo** el programa, no a una semana concreta:

1. **CI por PR** (T2.1.1): lint + typecheck + tests backend/frontend + escaneo de secretos. Bloqueante desde S2.
2. **Cobertura mínima de tests**: umbral 40% desde S2, elevado a 50% en S8 tras estabilizar la suite completa (T2.1.1) y sumar los tests de E3/E4/E7.
3. **Deriva de esquema DB→código**: check automático (desde T2.2.2) que compara el estado de control de migraciones contra el esquema real de staging antes de cada despliegue.
4. **Deriva de spec OpenAPI→rutas** (desde T7.2.1): CI falla si una ruta activa no está documentada o el spec referencia una ruta inexistente.
5. **Smoke test post-deploy** (T2.1.3): en cada despliegue a staging y, tras M1, también gate manual antes de producción.
6. **Test E2E de monetización** (T4.3.1): corre en cada PR que toque `backend/controllers/revenue*`, `pages/api/checkout.ts`, `pages/api/webhook.ts` o `payment-rail/`.
7. **Compilación y tests de contratos** (T5.1.2): corre en cada PR que toque `contracts/`.
8. **Alertas de disponibilidad y error rate** (T2.3.1): monitoreo continuo 24/7 de `/health` y `/health/deep` en staging y producción.
9. **Reconciliación financiera diaria** (T4.2.2): job automático que compara ledger vs. ejecutor de payouts y alerta ante discrepancia.
10. **Gate de promoción de versión de modelo ML** (T3.3.2): ninguna versión nueva del HRScore se activa en producción sin pasar el checklist de validación.
11. **Job de retención/archivado de analytics** (T8.2.2): ejecución programada verificada por su propio log de auditoría (cuántos registros archivó, contra la política vigente).
12. **Refresco de vistas materializadas** (T2.2.4): verificación de frescura contra el SLA documentado; alerta si una vista supera su ventana de staleness.

---

## 9. Auditorías posteriores (post-implementación)

A diferencia de las validaciones automáticas (continuas), estas son revisiones puntuales, realizadas por alguien distinto de quien ejecutó el trabajo, con evidencia archivada.

### 9.1 Calendario de auditorías dentro del programa

| Cuándo | Auditoría | Alcance | Auditor (independiente del ejecutor) |
|---|---|---|---|
| Fin S2 | Auditoría de M1 | CI, branch protection, alertas, purga de historial git | TPM + SEC |
| Fin S4 | Auditoría de M2 | Reconciliación de esquema DB, Trust Model V1 en prod, modelo de reparto único | TPM + DATA (distinto de quien ejecutó T2.2.1) |
| Fin S7 | Auditoría de M3 | Test E2E de monetización, informe de validación real del HRScore | TPM + QA + PM |
| Continua (auditoría externa) | Auditoría de contratos (C5.2) | HRKToken, HRKStaking, HRKSlashing, payment-rail | Firma auditora externa |
| Fin S9 | Auditoría de M4 | Verificación 100% de re-cifrado de wallets; cierre de hallazgos de auditoría de contratos; ensayo de gobernanza on-chain | SEC + SC (revisión cruzada, no quien implementó) |
| S11 | Auditoría cruzada de todo el programa | Revisión de que cada capability promovida cumple realmente su criterio de la sección 7 (no solo que la task se marcó "done") | TPM + un lead por área, cada uno auditando un epic que no ejecutó |
| S12 | **Auditoría de cierre / Go-No-Go de Launch 0** | Ver checklist 9.2 | TPM + PM + SEC + SC + ML (comité de lanzamiento) |

### 9.2 Checklist de auditoría de cierre (S12 — Go/No-Go Launch 0)

Cada ítem se verifica con evidencia (enlace a informe, log de CI, captura de dashboard), no de palabra:

- [ ] E1: cero credenciales expuestas activas; historial git purgado y confirmado; wallets 100% re-cifradas; ruta debug inaccesible.
- [ ] E2: CI bloqueante estable ≥4 semanas sin bypass; migraciones sin drift; backups con restore probado.
- [ ] E3: informe de validación del HRScore con datos reales archivado, con decisión explícita de PM sobre el umbral de lanzamiento (aceptado o piloto extendido con fecha).
- [ ] E4: test E2E de monetización verde y estable; reconciliación financiera sin discrepancias abiertas en las últimas 2 semanas.
- [ ] E5: informe de auditoría externa cerrado (cero críticos/altos abiertos); gobernanza on-chain (multisig/timelock/pausa) verificada; decisión explícita sobre qué contratos están en mainnet y cuáles quedan en testnet.
- [ ] E6: documentos legales publicados y aprobados; export y eliminación de datos verificados E2E.
- [ ] E7: build de producción con checks activos; spec de API sin deriva; runbooks de DR publicados.
- [ ] E8: Trust Data Model V1 estable en producción ≥4 semanas sin incidentes; dashboard de analytics operativo con datos reales.
- [ ] **Decisión final registrada por el comité de lanzamiento**: Go / No-Go / Go condicionado (con lista explícita de excepciones y fecha de cierre de cada una).

### 9.3 Principio de independencia de la auditoría

Ninguna auditoría de esta sección puede ser realizada exclusivamente por quien ejecutó el trabajo auditado. Cuando el equipo es pequeño y esto no sea estrictamente posible, se documenta explícitamente el conflicto de interés y se añade una segunda revisión ligera de un par externo al equipo (p. ej. otro squad, un advisor técnico) antes de dar por cerrada la auditoría de esa capability.

---

## 10. Riesgos transversales del programa (vista consolidada)

| Riesgo | Epic(s) afectados | Mitigación primaria | Disparador de escalamiento a PM |
|---|---|---|---|
| Reclutamiento insuficiente para el piloto de datos KPI | E3 | Arranque en S2, plan B de partnership con cliente piloto | Si a fin de S4 hay <15 participantes reclutados |
| Lead time no controlable de auditoría externa de contratos | E5 | Encargo temprano (S4), buffer en S11 | Si el auditor no confirma fecha de entrega antes de fin de S5 |
| Volumen desconocido de hallazgos de auditoría | E5 | Buffer de una semana reservado (S9) | Si hay ≥3 hallazgos críticos/altos |
| Migración OZ v4→v5 altera semántica de contratos | E5 | Revisión línea a línea, tests antes/después | Cualquier test que cambie de resultado tras la migración |
| Suite de tests nunca ejecutada completa en limpio | E2 | Ejecución temprana en S1–S2 con buffer de reparación | Si >20% de tests fallan al ejecutarse por primera vez |
| Tier gratuito de hosting compromete estabilidad de smoke/CI | E2 | Upgrade de planes en S2 (T2.4.1) antes de depender de staging para gates | Si el presupuesto no se aprueba antes de fin de S2 |
| Reconciliación legal de inmutabilidad on-chain vs. derecho al olvido | E6, E5 | Confirmar que solo se ancla hash sin PII recuperable | Si se descubre que el hash es reversible/de baja entropía |
| Multisig mal configurado bloquea operaciones legítimas | E5 | Umbral N-de-M con ≥5 signatarios, SOP de disponibilidad | Si un cambio de gobernanza no logra quórum en un ensayo |

---

## 11. Cómo usar este documento

1. Cada **Task** de este documento puede convertirse 1:1 en un ticket de Jira/Linear con sus 10 atributos como campos o como cuerpo de descripción.
2. El **roadmap (sección 5)** es la vista de planificación por semana; las **Capabilities (sección 7)** son la vista de qué significa realmente "terminado"; no se reporta una capability como completa solo porque sus tasks tienen checkmarks — se reporta completa cuando cumple su criterio de promoción, verificado en la auditoría correspondiente (sección 9).
3. Las **validaciones automáticas (sección 8)** deben quedar corriendo de forma permanente después de este programa de 12 semanas: no son actividades de proyecto, son el nuevo estado estable de operación de HRKey.
4. Ante cualquier tensión entre velocidad y alguno de los gates de seguridad/auditoría/legal de este programa, la escalación es a PM con el riesgo documentado en la sección 10 — no se omite un gate silenciosamente.
