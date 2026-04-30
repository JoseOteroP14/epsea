# Informe de Cumplimiento – API Extensionista (Proyecto `epsea`)

Fecha: 2026-04-17

## 1) Resultado ejecutivo

**Estado general:** **No conforme / verificación incompleta**.

Se comparó el estado del proyecto disponible contra `ESPECIFICACION_TECNICA_EXTENSIONISTA_API.md`.
Con la evidencia actual, solo hay incumplimientos confirmados en puntos documentados explícitamente y el resto queda **sin evidencia de implementación** (pendiente de cierre).

### Resumen cuantitativo

- **Workflows requeridos:** 12  
  - Cumple: 0  
  - Parcial / No cumple: 3  
  - Sin evidencia (pendiente): 9

- **Endpoints requeridos:** 50  
  - Cumple: 0 (sin trazabilidad de código en esta revisión)  
  - Parcial / No cumple: 4  
  - Sin evidencia (pendiente): 46

- **Features/reglas de negocio requeridas:** 21  
  - Cumple: 0  
  - Parcial / No cumple: 3  
  - Sin evidencia (pendiente): 18

## 2) Método de comparación y evidencia usada

### Evidencia revisada

1. `c:\Users\jose1\epsea\ESPECIFICACION_TECNICA_EXTENSIONISTA_API.md`
2. `c:\Users\jose1\epsea\CLAUDE.md`

### Limitación crítica

No se incluyeron en esta revisión archivos de implementación (servicios HTTP, stores, hooks, pantallas, formularios, tests).  
Por lo tanto, todo ítem sin trazabilidad directa se clasifica como **“Sin evidencia (pendiente)”**.

## 3) Hallazgos confirmados (incumplimientos reales)

| ID | Severidad | Hallazgo | Estado |
|---|---|---|---|
| F-001 | Crítica | Tablero de seguimiento no conectado a backend de avance real (usa mapeo hardcodeado/fallback local). | **NO CUMPLE** |
| F-002 | Alta | En edición de pesca (`PUT /fishing-lines/{id}`) no se actualizan especies (`lines`). | **PARCIAL** |
| F-003 | Alta | En edición acuícola (`PUT /aquaculture-lines/{id}`) no se actualizan especies (`lines`). | **PARCIAL** |
| F-004 | Media | Endpoints de borrado de especies (`DELETE /fishing-lines/lines/{id}`, `DELETE /aquaculture-lines/lines/{id}`) disponibles pero no integrados al flujo principal. | **NO CUMPLE (funcional parcial)** |

## 4) Workflows faltantes / incompletos

| Workflow | Requerimiento de la especificación | Estado | Brecha |
|---|---|---|---|
| WF-01 Autenticación y sesión JWT | Login, guard por rol/ruta, logout al expirar token | Sin evidencia | Falta trazabilidad de implementación |
| WF-02 Mis proyectos | Carga `/projects/types` + `/users/{id}/projects` | Sin evidencia | Falta trazabilidad |
| WF-03 Detalle de proyecto extensionista | Productores + estadísticas + seguimiento | **No cumple / Sin evidencia** | Seguimiento real no conectado; resto sin trazabilidad |
| WF-04 Caracterización (métodos 1 y 2) | Cargar preguntas, guardar y editar respuestas | Sin evidencia | Falta trazabilidad |
| WF-05 Información de predio (método 7 + fallback 4) | Soporte ubicación y fallback legacy | Sin evidencia | Falta trazabilidad |
| WF-06 Actividad productiva (CRUD líneas) | Agrícola, pecuaria, forestal, pesca, acuícola | **Parcial** | Edición especies pesca/acuícola incompleta |
| WF-07 Encuesta actividad productiva (método 8) | Carga/guardado/edición por reglas | Sin evidencia | Falta trazabilidad |
| WF-08 Clasificación (método 3) | Flujo completo y validaciones | Sin evidencia | Falta trazabilidad |
| WF-09 Visita 1 | Crear/editar + imágenes + validaciones | Sin evidencia | Falta trazabilidad |
| WF-10 Formato grupal | Selección asistentes + export local PDF/Excel | Sin evidencia | Falta trazabilidad |
| WF-11 Perfil (cambio contraseña) | PATCH + validaciones frontend | Sin evidencia | Falta trazabilidad |
| WF-12 Cache/consistencia | TTL, dedupe, invalidaciones, manejo 404 funcional | Sin evidencia | Falta trazabilidad |

## 5) Endpoints faltantes o incompletos (detalle completo)

> Criterio usado:
>
> - **Parcial/No cumple**: brecha explícita documentada.
> - **Sin evidencia**: no hay trazabilidad de implementación en esta revisión.

| # | Endpoint | Estado | Observación de brecha |
|---|---|---|---|
| 1 | `POST /auth/login` | Sin evidencia | Pendiente validar integración |
| 2 | `PATCH /users/password` | Sin evidencia | Pendiente validar integración |
| 3 | `GET /projects/types` | Sin evidencia | Pendiente validar integración |
| 4 | `GET /users/{userId}/projects` | Sin evidencia | Pendiente validar integración |
| 5 | `GET /producer-assigned-to-extensionist/{projectId}/producers` | Sin evidencia | Pendiente validar integración |
| 6 | `GET /reports-extensionist/project/{projectId}/extensionist/{extensionistId}` | Sin evidencia | Pendiente validar integración |
| 7 | `GET /project-participants/{projectId}/` | Sin evidencia | Pendiente validar integración |
| 8 | `GET /assistants/departments` | Sin evidencia | Pendiente validar integración |
| 9 | `GET /assistants/municipalities/{departmentCode}` | Sin evidencia | Pendiente validar integración |
| 10 | `GET /assistants/types-of-fishing` | Sin evidencia | Pendiente validar integración |
| 11 | `GET /assistants/fishing-areas` | Sin evidencia | Pendiente validar integración |
| 12 | `GET /assistants/aquaculture-types-of-system` | Sin evidencia | Pendiente validar integración |
| 13 | `GET /assistants/area-of-cropping-system` | Sin evidencia | Pendiente validar integración |
| 14 | `GET /productive-lines/activity/{activityId}` | Sin evidencia | Pendiente validar integración |
| 15 | `GET /unit-of-measure/{lineId}` | Sin evidencia | Pendiente validar integración |
| 16 | `GET /questions/intervention-method/{interventionMethodId}` | Sin evidencia | Pendiente validar integración |
| 17 | `GET /questions/with-options/{componentId}/` | Sin evidencia | Pendiente validar integración |
| 18 | `POST /surveys` | Sin evidencia | Pendiente validar integración |
| 19 | `GET /surveys/{projectId}/producer/{producerId}/intervention_method/{methodId}` | Sin evidencia | Debe normalizar `404 -> []` |
| 20 | `PUT /surveys/update-answer/{answerId}` | Sin evidencia | Pendiente validar integración |
| 21 | `PUT /surveys/update-answer-multiple` | Sin evidencia | Pendiente validar integración |
| 22 | `PUT /questions-dependent-list/{answerId}` | Sin evidencia | Pendiente validar integración |
| 23 | `GET /visit-1/project/{projectId}/producer/{producerId}` | Sin evidencia | Debe normalizar `404 -> null` |
| 24 | `POST /visit-1` | Sin evidencia | Debe ser multipart + imágenes |
| 25 | `PUT /visit-1/{visitId}` | Sin evidencia | Pendiente validar integración |
| 26 | `POST /visit-1/{visitId}/images` | Sin evidencia | Pendiente validar integración |
| 27 | `DELETE /visit-1/images/{imageId}` | Sin evidencia | Pendiente validar integración |
| 28 | `GET /visit-1/images/{imageId}` | Sin evidencia | Pendiente validar integración |
| 29 | `POST /agricultural-lines/bulk` | Sin evidencia | Pendiente validar integración |
| 30 | `GET /agricultural-lines/producer/{producerId}/project/{projectId}` | Sin evidencia | Pendiente validar integración |
| 31 | `PUT /agricultural-lines/{id}` | Sin evidencia | Pendiente validar integración |
| 32 | `DELETE /agricultural-lines/{id}` | Sin evidencia | Pendiente validar integración |
| 33 | `POST /livestock-lines/bulk` | Sin evidencia | Pendiente validar integración |
| 34 | `GET /livestock-lines/producer/{producerId}/project/{projectId}` | Sin evidencia | Pendiente validar integración |
| 35 | `PUT /livestock-lines/{id}` | Sin evidencia | Pendiente validar integración |
| 36 | `DELETE /livestock-lines/{id}` | Sin evidencia | Pendiente validar integración |
| 37 | `POST /forest-lines/bulk` | Sin evidencia | Pendiente validar integración |
| 38 | `GET /forest-lines/producer/{producerId}/project/{projectId}` | Sin evidencia | Pendiente validar integración |
| 39 | `PUT /forest-lines/{id}` | Sin evidencia | Pendiente validar integración |
| 40 | `DELETE /forest-lines/{id}` | Sin evidencia | Pendiente validar integración |
| 41 | `POST /fishing-lines/bulk` | Sin evidencia | Pendiente validar integración |
| 42 | `GET /fishing-lines/producer/{producerId}/project/{projectId}` | Sin evidencia | Pendiente validar integración |
| 43 | `PUT /fishing-lines/{id}` | **Parcial** | No actualiza especies (`lines`) |
| 44 | `DELETE /fishing-lines/{id}` | Sin evidencia | Pendiente validar integración |
| 45 | `DELETE /fishing-lines/lines/{id}` | **No cumple** | Disponible, no integrado en flujo principal |
| 46 | `POST /aquaculture-lines/bulk` | Sin evidencia | Pendiente validar integración |
| 47 | `GET /aquaculture-lines/producer/{producerId}/project/{projectId}` | Sin evidencia | Pendiente validar integración |
| 48 | `PUT /aquaculture-lines/{id}` | **Parcial** | No actualiza especies (`lines`) |
| 49 | `DELETE /aquaculture-lines/{id}` | Sin evidencia | Pendiente validar integración |
| 50 | `DELETE /aquaculture-lines/lines/{id}` | **No cumple** | Disponible, no integrado en flujo principal |

## 6) Features y reglas de negocio faltantes o pendientes

| ID | Feature / Regla requerida | Estado | Brecha |
|---|---|---|---|
| R-01 | `makeRequest` con error enriquecido (`_status`, `_headers`, etc.) | Sin evidencia | Falta trazabilidad |
| R-02 | `401` solo logout si JWT expiró realmente | Sin evidencia | Falta trazabilidad |
| R-03 | `404` como estado funcional en surveys/visit-1 | Sin evidencia | Falta trazabilidad |
| R-04 | Parsing defensivo de envoltorios (`data`, `pagination.items`, array directo) | Sin evidencia | Falta trazabilidad |
| R-05 | Validación required por tipo de pregunta (incl. múltiple/dependiente) | Sin evidencia | Falta trazabilidad |
| R-06 | Limpieza de texto general/email + `maxlength` | Sin evidencia | Falta trazabilidad |
| R-07 | Limpieza de respuesta hija al cambiar padre dependiente | Sin evidencia | Falta trazabilidad |
| R-08 | Predio tipo 7 con DIVIPOLA normalizado y fallback método 4 | Sin evidencia | Falta trazabilidad |
| R-09 | Validaciones Visita 1 (regex lat/lng, ASNM, asistencia, imágenes <= 3 y <= 6MB) | Sin evidencia | Falta trazabilidad |
| R-10 | `compliance_recommendation_id = 3` y `origin = web` en visita 1 | Sin evidencia | Falta trazabilidad |
| R-11 | Secuencia de sub-tabs líneas productivas (N+1 bloqueado) | Sin evidencia | Falta trazabilidad |
| R-12 | Secuencia de tabs de caracterización + excepción `devMode` | Sin evidencia | Falta trazabilidad |
| R-13 | Consentimiento previo antes de método 1 primera vez | Sin evidencia | Falta trazabilidad |
| R-14 | Validaciones de cambio de contraseña | Sin evidencia | Falta trazabilidad |
| R-15 | Cache por proyecto, TTL 5 min, métodos `[1,2,3,7,8]` | Sin evidencia | Falta trazabilidad |
| R-16 | Dedupe respuestas por `question_id` y `updated_at/created_at` | Sin evidencia | Falta trazabilidad |
| R-17 | Invalidación cache tras guardar/editar encuestas | Sin evidencia | Falta trazabilidad |
| R-18 | Compatibilidad preguntas dependientes combinando endpoints | Sin evidencia | Falta trazabilidad |
| R-19 | Formato grupal local (sin persistencia backend), con export PDF/Excel | Sin evidencia | Falta trazabilidad |
| R-20 | Tablero de seguimiento con backend real de progreso | **No cumple** | Actualmente hardcode/fallback |
| R-21 | Edición completa de especies pesca/acuícola | **Parcial** | PUT no envía `lines` |

## 7) Plan de remediación recomendado (priorizado)

### Prioridad P0 (bloqueante funcional)

1. Conectar tablero de seguimiento a endpoint real de avance por productor/método.
2. Corregir edición de pesca para enviar y persistir `lines` (especies).
3. Corregir edición de acuicultura para enviar y persistir `lines` (especies).
4. Integrar endpoints de borrado de especies en edición (`/fishing-lines/lines/{id}`, `/aquaculture-lines/lines/{id}`).

### Prioridad P1 (cumplimiento de contratos API)

1. Verificar y completar integración de los 46 endpoints sin evidencia.
2. Asegurar normalización de `404` funcional en surveys y visit-1.
3. Validar `makeRequest` y política exacta de `401`/expiración JWT.

### Prioridad P2 (calidad y consistencia)

1. Implementar/validar reglas de validación frontend por flujo (Survey, Predio, Visit1, Perfil).
2. Implementar/validar cache TTL + invalidación + dedupe.
3. Cubrir con tests de integración por workflow crítico.

## 8) Criterios de cierre de cumplimiento

Se considera cumplimiento cuando:

1. Cada workflow tiene evidencia funcional (código + prueba) contra su contrato API.
2. Los 50 endpoints tienen trazabilidad de uso (servicio + llamada real + manejo de error esperado).
3. No quedan hallazgos P0/P1 abiertos.
4. Se adjuntan evidencias de pruebas:
   - Casos 404 funcional.
   - Casos de edición de especies pesca/acuícola.
   - Casos de expiración de sesión y logout.
   - Casos de validación de formularios críticos.
