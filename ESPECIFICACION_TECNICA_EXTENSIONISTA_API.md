# ESPECIFICACION TECNICA FUNCIONAL - EXTENSIONISTA (WEB) - API Y REGLAS DE NEGOCIO

## 0. Objetivo del documento

Documentar, de forma funcional y tecnica, todo el comportamiento del rol extensionista en el frontend web y sus contratos con API.

Este documento cubre:

- Endpoints consumidos.
- Payloads enviados.
- Estructuras de respuesta usadas.
- Validaciones funcionales (frontend) que condicionan el envio.
- Fallbacks, cache, manejo de errores y reglas de secuencia.

No cubre aspectos visuales/estilos.

## 1. Alcance funcional del rol extensionista

### 1.1 Contexto de autenticacion y rutas

- El flujo extensionista entra por rutas bajo `/generic`.
- El guard global permite `/generic` para cualquier usuario autenticado con sesion valida.
- `/dashboard` queda restringido a `role_id = 1`.
- Si el token expira, la sesion se cierra y redirige a `/login`.

### 1.2 Modulos funcionales del extensionista

- Inicio de sesion y sesion JWT.
- Listado de proyectos asignados al usuario autenticado.
- Detalle de proyecto extensionista:
	- Productores asignados al extensionista.
	- Estadisticas extensionista.
	- Tablero de seguimiento.
- Caracterizacion por productor:
	- Informacion personal (metodo 1).
	- Caracterizacion (metodo 2).
	- Informacion del predio (metodo 7; fallback legacy metodo 4).
	- Actividad productiva:
		- Lineas productivas (CRUD por familias agricola/pecuaria/forestal/pesca/acuicola).
		- Encuesta de actividad productiva (metodo 8).
	- Clasificacion (metodo 3).
	- Visita 1 (endpoint dedicado + imagenes).
- Formato grupal:
	- Seleccion de asistencia desde productores del proyecto/extensionista.
	- Export PDF/Excel local.
	- Sin persistencia backend.
- Perfil extensionista:
	- Cambio de contrasena.

## 2. Arquitectura de consumo API

### 2.1 Helper HTTP base

Se usa `makeRequest(endpoint, method, data?, headers?)` sobre `instanceAxios`.

Comportamiento relevante:

- Inyecta `Authorization: Bearer <token>` desde store de auth.
- Si hay `401`, solo hace logout si el JWT realmente expiro.
- En error, lanza un objeto enriquecido con:
	- `_status`
	- `_statusText`
	- `_headers`
	- `_originalError`
	- body de error backend (si existe)
- `404` se loguea como warning (no como error fuerte), porque en varios flujos es estado funcional valido.

### 2.2 Envoltorios de respuesta

El frontend maneja respuestas en dos formatos segun endpoint:

- Envoltorio tipo `{ code, message, status, data }`.
- O arreglos directos (sin sobre `data`).

Por eso varios servicios hacen parsing defensivo:

- `response.data`
- `response.data.pagination.items`
- `response.data.items`
- `response` directo si ya es array.

## 3. Mapeo funcional por metodo de intervencion y componente

### 3.1 Metodos usados por extensionista

- `1`: informacion personal.
- `2`: caracterizacion.
- `3`: clasificacion.
- `7`: informacion del predio (preferido).
- `4`: informacion del predio legacy (fallback).
- `8`: encuesta de actividad productiva.

### 3.2 Componentes relevantes

- `component_id = 5`: preguntas de informacion personal y caracterizacion.
- `component_id = 4`: preguntas de clasificacion.
- `component_id = 2`: preguntas de informacion del predio.
- `component_id = 3`: encuesta de actividad productiva (metodo 8).
- `component_id = 1`: preguntas de visita 1 (adicionales al endpoint dedicado de visita).

## 4. Catalogo de endpoints (rol extensionista)

## 4.1 Autenticacion y perfil

### POST `/auth/login`

Uso:

- Login del usuario.

Payload:

```json
{
	"username": "string",
	"password": "string"
}
```

Respuesta usada:

```json
{
	"data": {
		"access_token": "jwt",
		"user": {
			"user_id": 0,
			"identification": "string",
			"username": "string",
			"first_name": "string",
			"last_name": "string",
			"profession_name": "string",
			"roles": [
				{
					"role_id": 0,
					"project_id": 0
				}
			]
		}
	}
}
```

### PATCH `/users/password`

Uso:

- Cambio de contrasena desde perfil extensionista.

Payload:

```json
{
	"current_password": "string",
	"new_password": "string",
	"confirm_password": "string"
}
```

## 4.2 Carga de proyectos del extensionista

### GET `/projects/types`

Uso:

- Resolver nombre de tipo de proyecto en `Mis Proyectos`.

### GET `/users/{userId}/projects`

Uso:

- Listar proyectos asignados al usuario autenticado.

Respuesta usada (tipica):

```json
{
	"data": {
		"pagination": {
			"items": [
				{
					"id": 0,
					"type_id": 0,
					"name": "string",
					"description": "string",
					"role_name": "string",
					"role_id": 0
				}
			]
		}
	}
}
```

## 4.3 Proyecto extensionista y productores asignados

### GET `/producer-assigned-to-extensionist/{projectId}/producers?page={page}&limit={limit}`

Uso:

- Tabla de productores del extensionista (`UserProjectDetail`).
- Fuente de productores para flujo de caracterizacion.
- Fuente primaria de asistencia en formato grupal.

### GET `/reports-extensionist/project/{projectId}/extensionist/{extensionistId}`

Uso:

- Estadisticas del extensionista por proyecto.

Respuesta usada:

```json
{
	"data": {
		"total_assigned": 0,
		"total_surveyed_classification": 0,
		"total_surveyed_visit_1": 0,
		"total_surveyed_general_information": 0,
		"total_surveyed_characterization": 0,
		"total_surveyed_property_information": 0,
		"detail_producers": []
	}
}
```

### GET `/project-participants/{projectId}/?page={page}&limit={limit}`

Uso:

- Fallback en formato grupal cuando no hay datos en endpoint de productores asignados al extensionista.

## 4.4 Catalogos demograficos y auxiliares

### GET `/assistants/departments`

Uso:

- Selector de departamento en pregunta de ubicacion (predio).
- Resolver nombre de departamento desde codigo en flujos de preview/export.

### GET `/assistants/municipalities/{departmentCode}`

Uso:

- Selector de municipio en pregunta de ubicacion.
- Resolver codigo DIVIPOLA a nombre de municipio/departamento.

### GET `/assistants/types-of-fishing`

Uso:

- Catalogo de tipo de pesca.

### GET `/assistants/fishing-areas`

Uso:

- Catalogo de zona/area de pesca.

### GET `/assistants/aquaculture-types-of-system`

Uso:

- Catalogo de tipos de sistema acuicola.

### GET `/assistants/area-of-cropping-system`

Uso:

- Catalogo de unidad/sistema de cultivo acuicola.

### GET `/productive-lines/activity/{activityId}`

Uso:

- `activityId = 1`: lineas agricolas.
- `activityId = 2`: lineas pecuarias.
- `activityId = 3`: lineas forestales.
- `activityId = 5`: especies para pesca/acuicola.

### GET `/unit-of-measure/{lineId}`

Uso:

- Catalogo de unidades para lineas pecuarias (y resolucion de unidad al guardar).

## 4.5 Preguntas, respuestas y encuestas

### GET `/questions/intervention-method/{interventionMethodId}`

Uso:

- Cargar preguntas por metodo de intervencion.

### GET `/questions/with-options/{componentId}/`

Uso:

- Completar opciones faltantes para preguntas tipo lista/tipo dependiente.
- Fallback de carga de preguntas cuando por metodo no retorna data.

### POST `/surveys`

Uso:

- Crear respuestas de encuesta completas (alta inicial por metodo).

Payload enviado:

```json
{
	"project_id": 0,
	"intervention_method_id": 0,
	"producer_id": 0,
	"created_at": "YYYY-MM-DD",
	"answers": [
		{
			"question_id": 0,
			"answer_value": "string"
		},
		{
			"question_id": 0,
			"answers": [
				{ "answer_value": "string" }
			]
		}
	]
}
```

### GET `/surveys/{projectId}/producer/{producerId}/intervention_method/{methodId}`

Uso:

- Cargar respuestas por metodo.

Semantica clave:

- `404` se interpreta como estado valido "sin respuestas" y se transforma a `data: []`.

### PUT `/surveys/update-answer/{answerId}`

Uso:

- Actualizar respuesta simple existente.

Payload:

```json
{
	"value": "string"
}
```

### PUT `/surveys/update-answer-multiple`

Uso:

- Actualizar pregunta de seleccion multiple.

Payload:

```json
{
	"survey_id": 0,
	"question_id": 0,
	"answers": [
		{ "answer_value": "string" }
	]
}
```

### PUT `/questions-dependent-list/{answerId}`

Uso:

- Actualizar pregunta padre de lista dependiente y opcionalmente su hijo.

Payload:

```json
{
	"value": "string",
	"child": {
		"question_id": 0,
		"answer_value": "string"
	}
}
```

`child` se envia como `null` si no aplica o no hay valor hijo.

## 4.6 Visita 1

### GET `/visit-1/project/{projectId}/producer/{producerId}`

Uso:

- Cargar visita 1 existente.

Semantica:

- `404` se normaliza a `null`.

### POST `/visit-1` (multipart/form-data)

Uso:

- Crear visita 1 con campos + imagenes en una sola operacion.

Campos enviados en multipart:

- `project_id`
- `producer_id`
- `objetive`
- `diagnosis`
- `recommendations`
- `observations`
- `compliance_recommendation_id`
- `registration_date`
- `attendance_id`
- `attendance_name`
- `origin`
- `lat`
- `lng`
- `masl`
- `commitments`
- `attendance_identification`
- `images` (repetible)

### PUT `/visit-1/{visitId}`

Uso:

- Actualizar visita 1 (sin imagenes en este request).

Payload JSON (Visit1Payload):

```json
{
	"project_id": 0,
	"producer_id": 0,
	"objetive": "string",
	"diagnosis": "string",
	"recommendations": "string",
	"observations": "string",
	"compliance_recommendation_id": 3,
	"registration_date": "YYYY-MM-DD HH:mm:ss",
	"attendance_id": 0,
	"attendance_name": "string|null",
	"origin": "web",
	"lat": "string|null",
	"lng": "string|null",
	"masl": 0,
	"commitments": "string|null",
	"attendance_identification": "string|null"
}
```

### POST `/visit-1/{visitId}/images` (multipart/form-data)

Uso:

- Subir nuevas imagenes de visita en modo edicion.

### DELETE `/visit-1/images/{imageId}`

Uso:

- Eliminar imagen existente de visita 1.

### GET `/visit-1/images/{imageId}`

Uso:

- Descargar imagen protegida (con token) y convertir a blob URL para previsualizacion.

## 4.7 Lineas productivas

### Agricolas

- POST `/agricultural-lines/bulk`
- GET `/agricultural-lines/producer/{producerId}/project/{projectId}`
- PUT `/agricultural-lines/{id}`
- DELETE `/agricultural-lines/{id}`

Payload bulk enviado:

```json
{
	"lines": [
		{
			"producer_id": 0,
			"project_id": 0,
			"line_id": 0,
			"area": 0,
			"harvests": 0,
			"production": 0,
			"date": "YYYY-MM-DD"
		}
	]
}
```

### Pecuarias

- POST `/livestock-lines/bulk`
- GET `/livestock-lines/producer/{producerId}/project/{projectId}`
- PUT `/livestock-lines/{id}`
- DELETE `/livestock-lines/{id}`

Payload bulk enviado:

```json
{
	"lines": [
		{
			"producer_id": 0,
			"project_id": 0,
			"line_id": 0,
			"unit_of_measure_id": 0,
			"area": 0,
			"cycles": 0,
			"production": 0,
			"date": "YYYY-MM-DD"
		}
	]
}
```

### Forestales

- POST `/forest-lines/bulk`
- GET `/forest-lines/producer/{producerId}/project/{projectId}`
- PUT `/forest-lines/{id}`
- DELETE `/forest-lines/{id}`

Payload bulk enviado:

```json
{
	"lines": [
		{
			"producer_id": 0,
			"project_id": 0,
			"line_id": 0,
			"unit_of_measure_id": 0,
			"area": 0,
			"cycles": 0,
			"production": 0,
			"date": "YYYY-MM-DD"
		}
	]
}
```

### Pesca

- POST `/fishing-lines/bulk`
- GET `/fishing-lines/producer/{producerId}/project/{projectId}`
- PUT `/fishing-lines/{id}`
- DELETE `/fishing-lines/{id}`
- DELETE `/fishing-lines/lines/{id}` (disponible en servicio; no usado en flujo principal de edicion)

Payload bulk enviado:

```json
{
	"lines": [
		{
			"producer_id": 0,
			"project_id": 0,
			"type_id": 0,
			"fishing_area_id": 0,
			"weight": 0,
			"date": "YYYY-MM-DD",
			"lines": [
				{ "line_id": 0 }
			]
		}
	]
}
```

Nota funcional:

- El PUT de pesca en frontend actualiza `type_id`, `fishing_area_id`, `weight`, `date`.
- No actualiza especies (`lines`) en el PUT.

### Acuicola

- POST `/aquaculture-lines/bulk`
- GET `/aquaculture-lines/producer/{producerId}/project/{projectId}`
- PUT `/aquaculture-lines/{id}`
- DELETE `/aquaculture-lines/{id}`
- DELETE `/aquaculture-lines/lines/{id}` (disponible en servicio; no usado en flujo principal de edicion)

Payload bulk enviado:

```json
{
	"lines": [
		{
			"producer_id": 0,
			"project_id": 0,
			"type_id": 0,
			"area_crop_id": 0,
			"area_value_crop": 0,
			"number_of_animals": 0,
			"cycles": 0,
			"production": 0,
			"date": "YYYY-MM-DD",
			"lines": [
				{ "line_id": 0 }
			]
		}
	]
}
```

Nota funcional:

- El PUT de acuicola en frontend actualiza campos base.
- No actualiza especies (`lines`) en el PUT.

## 5. Validaciones funcionales por flujo

## 5.1 Encuestas genericas (SurveyDialog)

Reglas:

- Todas las preguntas `required` mostradas deben estar respondidas para guardar.
- En tipo lista/lista dependiente (`question_type_id = 5 o 6`), requerido implica al menos una seleccion.
- Limpieza de texto para tipo 1:
	- General: letras, numeros, espacios, guion.
	- Preguntas detectadas como correo/email: letras, numeros, `._%+-@`, maximo una `@`.
- Si `maxlength` existe en pregunta, se respeta.
- Para seleccion multiple se envia arreglo de `answer_value`.
- En modo edicion por pregunta (`singleQuestionId`):
	- Simple: `PUT /surveys/update-answer/{answerId}`.
	- Multiple: `PUT /surveys/update-answer-multiple`.
	- Dependiente: `PUT /questions-dependent-list/{answerId}`.

Regla dependiente importante:

- Si cambia la opcion padre y una hija deja de aplicar, la respuesta hija se limpia en frontend.

## 5.2 Encuesta de predio (PredioSurveyDialog)

Adicional a reglas de encuesta generica:

- Soporta `question_type_id = 7` (ubicacion):
	- Debe seleccionar departamento y municipio.
	- Se guarda codigo de municipio (DIVIPOLA).
	- El codigo se limpia de caracteres invisibles y se normaliza con padding a 5 digitos.
- Si metodo 7 no trae preguntas, usa fallback `GET /questions/with-options/2`.

## 5.3 Visita 1 (Visit1Dialog)

Validaciones de entrada:

- Latitud/longitud:
	- Regex: `^-?\d*\.?\d*$`.
	- Permitido: digitos, un guion inicial, un punto decimal maximo.
- ASNM obligatorio.
- Objetivo obligatorio (se autocompleta por linea productiva principal).
- Diagnostico obligatorio.
- Recomendaciones obligatorias.
- `attendance_id` obligatorio.
- Si `attendance_id != 1`, `attendance_name` obligatorio.
- `attendance_identification` opcional, pero si existe debe ser solo digitos.
- Imagenes:
	- Tipos permitidos: `image/jpeg`, `image/png`, `image/webp`.
	- Tamano maximo: 6 MB.
	- Maximo 3 slots.

Reglas de guardado:

- Creacion:
	- `POST /visit-1` multipart con campos + imagenes.
- Edicion:
	- `PUT /visit-1/{id}` (json) + `POST /visit-1/{id}/images` para nuevas fotos.
- `compliance_recommendation_id` se fija en `3` (No aplica en primera visita).
- `origin` se fija en `web`.

## 5.4 Lineas productivas (LineasProductivasDialog)

Validaciones transversales:

- Secuencia por sub-tab: no se habilita linea N+1 hasta registrar linea N.
- Campos requeridos por esquema Zod segun tipo.
- Decimal: `^\d+(\.\d+)?$`.
- Entero: `^\d+$`.

Mapeo de campos por tipo (A..H) ya detallado en seccion de payloads.

Reglas especificas:

- Pecuaria:
	- `unit_of_measure_id` se resuelve desde `/unit-of-measure/{lineId}`.
- Forestal:
	- `unit_of_measure_id` derivado desde mapa local especie -> unidad -> id.
- Pesca/Acuicola:
	- Especies multiple se almacenan como ids separados y luego se mapean a `lines[{line_id}]` para bulk.

## 5.5 Caracterizacion por productor (UserCharacterization)

Reglas de secuencia de tabs (salvo modo dev):

- Caracterizacion desbloquea cuando hay informacion personal.
- Informacion predio desbloquea cuando hay informacion personal + caracterizacion.
- Actividad productiva desbloquea cuando hay informacion personal + caracterizacion + predio.
- Clasificacion desbloquea cuando hay informacion personal + caracterizacion + actividad productiva.
- Visita 1 desbloquea cuando hay informacion personal + caracterizacion + actividad productiva + clasificacion.

Excepcion:

- En `devMode` se deshabilitan bloqueos.

Consentimiento:

- Antes de abrir informacion personal por primera vez, se muestra dialogo de autorizacion de tratamiento de datos.

## 5.6 Perfil (cambio de contrasena)

Validaciones frontend:

- `current_password` requerido.
- `new_password` requerido, minimo 8 caracteres y al menos una letra.
- `confirm_password` debe coincidir con `new_password`.

## 6. Cache, performance y consistencia

## 6.1 Store `projectCacheStore`

Reglas clave:

- Cache por proyecto para preguntas, productores y respuestas.
- TTL de respuestas por metodo: 5 minutos.
- Metodos pre/cargados para respuestas: `[1, 2, 3, 7, 8]`.
- Dedupe por `question_id` conservando la respuesta mas reciente (`updated_at` / `created_at`).

Invalidacion:

- Tras guardar encuesta/edicion: `invalidateProducerResponses(projectId, producerId)` o invalidacion por metodo.

Compatibilidad de preguntas dependientes:

- Combina `questions/intervention-method` con `questions/with-options` para asegurar opciones en tipo lista/tipo dependiente.
- Si metodo 7 no trae info predio, cae a metodo 4.

## 6.2 Semantica de 404 como estado funcional

Casos donde `404` no se trata como error de negocio:

- `GET /surveys/.../intervention_method/...` -> productor aun sin respuestas: retorna `[]`.
- `GET /visit-1/project/.../producer/...` -> sin visita 1: retorna `null`.

## 7. Formato grupal: comportamiento funcional real

El flujo de formato grupal es local/exportador.

Hechos funcionales:

- No hace `POST`, `PUT` ni `PATCH` de persistencia del formato.
- Estado en memoria local del formulario.
- Seleccion de asistentes si consume API (productores del extensionista o fallback de proyecto).
- Exporta PDF/Excel localmente con datos del formulario.
- Datos de extensionista (seccion 7) se inyectan desde sesion (`authStore.user`) y son de solo lectura.

## 8. Reglas de negocio y observaciones criticas

## 8.1 Fallback legacy de info predio

Si no existen respuestas/preguntas en metodo 7:

- Se consulta metodo 4.

Esto aplica en carga de respuestas y en armado de previews/export de caracterizacion/visita.

## 8.2 Tablero de seguimiento no conectado a backend de avance real

En `UserProjectDetail`, el estado por productor en tablero de seguimiento usa:

- Mapeo hardcodeado para algunos IDs.
- Fallback deterministico local para otros IDs.

No representa un endpoint de progreso real por productor/metodo.

## 8.3 Edicion parcial de especies en pesca/acuicola

En edicion (`PUT`) de pesca y acuicola, el frontend actual no envia `lines` de especies.

Resultado:

- Se pueden editar campos base.
- Especies no cambian por PUT en flujo actual.

## 9. Matriz resumen (quick reference)

| Dominio | Metodo | Endpoint | Uso extensionista |
|---|---|---|---|
| Auth | POST | `/auth/login` | Login |
| Auth | PATCH | `/users/password` | Cambio de contrasena perfil |
| Proyectos | GET | `/projects/types` | Catalogo tipo proyecto |
| Proyectos | GET | `/users/{userId}/projects` | Mis proyectos |
| Proyecto | GET | `/producer-assigned-to-extensionist/{projectId}/producers` | Productores del extensionista |
| Proyecto | GET | `/reports-extensionist/project/{projectId}/extensionist/{extensionistId}` | Estadisticas extensionista |
| Proyecto | GET | `/project-participants/{projectId}/` | Fallback formato grupal |
| Demografia | GET | `/assistants/departments` | Catalogo deptos / resolucion DIVIPOLA |
| Demografia | GET | `/assistants/municipalities/{departmentCode}` | Catalogo municipios / resolucion DIVIPOLA |
| Preguntas | GET | `/questions/intervention-method/{id}` | Preguntas por metodo |
| Preguntas | GET | `/questions/with-options/{componentId}/` | Opciones completas / fallback |
| Encuestas | POST | `/surveys` | Crear encuesta |
| Encuestas | GET | `/surveys/{projectId}/producer/{producerId}/intervention_method/{methodId}` | Cargar respuestas por metodo |
| Encuestas | PUT | `/surveys/update-answer/{answerId}` | Editar respuesta simple |
| Encuestas | PUT | `/surveys/update-answer-multiple` | Editar seleccion multiple |
| Encuestas | PUT | `/questions-dependent-list/{answerId}` | Editar padre-hijo dependiente |
| Visit1 | GET | `/visit-1/project/{projectId}/producer/{producerId}` | Obtener visita 1 |
| Visit1 | POST | `/visit-1` | Crear visita 1 con imagenes |
| Visit1 | PUT | `/visit-1/{id}` | Actualizar visita 1 |
| Visit1 | POST | `/visit-1/{id}/images` | Subir imagenes nuevas |
| Visit1 | DELETE | `/visit-1/images/{imageId}` | Eliminar imagen |
| Visit1 | GET | `/visit-1/images/{imageId}` | Descargar imagen protegida |
| Agricola | POST | `/agricultural-lines/bulk` | Crear lineas agricolas |
| Agricola | GET | `/agricultural-lines/producer/{producerId}/project/{projectId}` | Listar lineas agricolas |
| Agricola | PUT | `/agricultural-lines/{id}` | Editar linea agricola |
| Agricola | DELETE | `/agricultural-lines/{id}` | Eliminar linea agricola |
| Pecuaria | POST | `/livestock-lines/bulk` | Crear lineas pecuarias |
| Pecuaria | GET | `/livestock-lines/producer/{producerId}/project/{projectId}` | Listar lineas pecuarias |
| Pecuaria | PUT | `/livestock-lines/{id}` | Editar linea pecuaria |
| Pecuaria | DELETE | `/livestock-lines/{id}` | Eliminar linea pecuaria |
| Forestal | POST | `/forest-lines/bulk` | Crear lineas forestales |
| Forestal | GET | `/forest-lines/producer/{producerId}/project/{projectId}` | Listar lineas forestales |
| Forestal | PUT | `/forest-lines/{id}` | Editar linea forestal |
| Forestal | DELETE | `/forest-lines/{id}` | Eliminar linea forestal |
| Pesca | POST | `/fishing-lines/bulk` | Crear lineas de pesca |
| Pesca | GET | `/fishing-lines/producer/{producerId}/project/{projectId}` | Listar lineas de pesca |
| Pesca | PUT | `/fishing-lines/{id}` | Editar linea de pesca (sin especies) |
| Pesca | DELETE | `/fishing-lines/{id}` | Eliminar linea de pesca |
| Acuicola | POST | `/aquaculture-lines/bulk` | Crear lineas acuicolas |
| Acuicola | GET | `/aquaculture-lines/producer/{producerId}/project/{projectId}` | Listar lineas acuicolas |
| Acuicola | PUT | `/aquaculture-lines/{id}` | Editar linea acuicola (sin especies) |
| Acuicola | DELETE | `/aquaculture-lines/{id}` | Eliminar linea acuicola |
| Catalogos LP | GET | `/productive-lines/activity/{activityId}` | Catalogos por actividad |
| Catalogos LP | GET | `/unit-of-measure/{lineId}` | Unidades pecuaria |
| Catalogos LP | GET | `/assistants/types-of-fishing` | Tipos pesca |
| Catalogos LP | GET | `/assistants/fishing-areas` | Areas pesca |
| Catalogos LP | GET | `/assistants/aquaculture-types-of-system` | Tipos sistema acuicola |
| Catalogos LP | GET | `/assistants/area-of-cropping-system` | Unidad sistema cultivo acuicola |

## 10. Conclusiones funcionales para cliente movil

- La implementacion movil debe respetar secuencia por metodos y validaciones de requeridos para mantener consistencia de datos.
- Debe tratar `404` de encuestas/visita como estado vacio valido, no como error bloqueante.
- Debe contemplar fallback de info predio en metodo 4 cuando metodo 7 no tenga data.
- Formato grupal no tiene endpoint de persistencia en el frontend actual; solo selecciona asistentes y exporta artefactos.

