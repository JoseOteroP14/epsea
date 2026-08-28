# Data safety — respuestas sugeridas para Play Console

Formulario: **Configuración de la app → Seguridad de los datos**.

Basado en el código actual de EPSEA (login, SQLite offline, fotos, sync HTTPS, SecureStore).

> Revisa con el equipo legal/UniCórdoba antes de enviar. Ajusta si el backend comparte datos con terceros adicionales.

## Resumen

| Pregunta | Respuesta sugerida |
|----------|-------------------|
| ¿Recopila o comparte datos? | **Sí** |
| ¿Todos los datos en tránsito encriptados? | **Sí** (HTTPS) |
| ¿Usuario puede solicitar eliminación? | **Sí** (si el backend lo permite — confirmar con TI) |
| ¿Datos obligatorios o el usuario puede elegir? | **La recopilación es necesaria** para usar la app (cuenta extensionista + datos de visitas) |

## Tipos de datos a declarar

### Información personal

| Subtipo | ¿Recopila? | ¿Comparte? | ¿Obligatorio? | Propósito |
|---------|------------|------------|---------------|-----------|
| Nombre | Sí | Sí (servidor EPSEA) | Sí | Funcionalidad de la app |
| Dirección de correo | Sí | Sí | Sí | Cuenta / contacto productor |
| IDs de usuario | Sí | Sí | Sí | Autenticación |
| Otros info personal (teléfono, identificación productores) | Sí | Sí | Sí | Visitas y encuestas |

### Fotos y videos

| Subtipo | ¿Recopila? | ¿Comparte? | Propósito |
|---------|------------|------------|-----------|
| Fotos | Sí | Sí (servidor EPSEA) | Evidencia en visitas técnicas |

### Archivos y documentos

| Subtipo | ¿Recopila? | ¿Comparte? | Propósito |
|---------|------------|------------|-----------|
| Archivos y documentos | Sí (PDFs generados) | Sí | Informes de visita |

### Información de la app

| Subtipo | ¿Recopila? | Notas |
|---------|------------|-------|
| Registros de fallos | **No** (salvo que agreguen Sentry/Crashlytics) | |
| Diagnósticos | **No** | |
| Otros rendimiento | **No** | |

### NO declarar (según código actual)

- Ubicación GPS (no hay permiso de ubicación en app.json)
- Contactos del dispositivo
- SMS / calendario
- Datos financieros del dispositivo
- Push tokens remotos (no hay Firebase/FCM)

## Almacenamiento y procesamiento

| Pregunta | Respuesta |
|----------|-----------|
| ¿Datos en el dispositivo? | Sí — SQLite local, token en SecureStore, caché de imágenes |
| ¿Datos en servidor? | Sí — API EPSEA (`EXPO_PUBLIC_API_URL`) |
| ¿Cifrado en tránsito? | Sí — TLS/HTTPS |
| ¿Cifrado en reposo? | Parcial — token en almacenamiento seguro del SO; SQLite local sin cifrado adicional documentado |

## Permisos Android relacionados

Declarar en la sección de permisos / declaraciones especiales:

| Permiso | Uso |
|---------|-----|
| Cámara | Fotos en visitas |
| Almacenamiento / fotos | Adjuntar imágenes de galería |
| Internet | Sincronización con API |
| Foreground service (dataSync) | Sincronización prolongada con notificación visible |

## Público objetivo

| Pregunta | Respuesta sugerida |
|----------|-------------------|
| Público objetivo | Adultos / profesionales (extensionistas) |
| ¿App para niños? | **No** |
| ¿Contenido generado por usuarios? | **Sí** — textos y fotos de visitas (solo usuarios autorizados) |

## Prácticas de seguridad (checklist Play Console)

- [x] Datos en tránsito cifrados
- [ ] Política de privacidad publicada (URL obligatoria)
- [ ] Confirmar con backend si hay subprocessors / hosting (ej. ineansastem.com)
