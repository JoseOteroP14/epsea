# Publicación en Google Play — EPSEA

Guía paso a paso: qué ya está en el repo y qué debes hacer **fuera** del repositorio.

---

## Resumen rápido

| Área | En el repo | Fuera del repo (tú) |
|------|------------|---------------------|
| AAB firmado | `bun run build:android:production` | Descargar AAB desde expo.dev |
| Package Android | `com.epsea.unicordoba` en app.json | Crear app en Play Console con el mismo package |
| API producción | `eas.json` → production env | **Confirmar URL real** con el equipo backend |
| Política privacidad | Plantilla HTML en `docs/legal/` | **Publicar en web** y actualizar URL |
| Textos tienda | `docs/store-listing/descriptions.md` | Copiar en Play Console |
| Data safety | `docs/store-listing/data-safety.md` | Completar formulario en Play Console |
| Capturas / banner | Carpeta `store-assets/` | Crear imágenes y subirlas |
| Cuenta demo | Plantilla `reviewer-access.template.md` | Crear usuario en backend + Play Console |
| Cuenta desarrollador | — | Pagar y activar Google Play Developer |

---

## Parte A — Lo que ya quedó preparado en el repo

### 1. Build de producción (AAB)

- Perfil `production` en `eas.json` con `buildType: "app-bundle"`.
- Package: `com.epsea.unicordoba`.
- Variables de entorno de producción en `eas.json` (API, email, web, privacidad).

Comando:

```bash
bun run validate:release   # revisa config antes del build
bun run build:android:production
```

### 2. Enlace a política de privacidad en la app

En la pantalla de login hay un enlace **Política de privacidad** que abre la URL configurada en `EXPO_PUBLIC_PRIVACY_POLICY_URL`.

### 3. Documentación y plantillas

| Archivo | Uso |
|---------|-----|
| `docs/store-listing/descriptions.md` | Textos para la ficha de Play Store |
| `docs/store-listing/data-safety.md` | Respuestas sugeridas del formulario Data safety |
| `docs/legal/privacy-policy.html` | HTML para publicar en sitio web institucional |
| `docs/store-listing/reviewer-access.template.md` | Credenciales demo para revisores de Google |
| `store-assets/README.md` | Especificaciones de capturas y feature graphic |

### 4. Validación pre-release

```bash
bun run validate:release
```

---

## Parte B — Qué debes hacer FUERA del repo (detallado)

### Paso 1 — Cuenta Google Play Developer

1. Entra a [Google Play Console](https://play.google.com/console).
2. Regístrate como desarrollador (**USD 25**, pago único).
3. Completa el perfil de desarrollador (nombre, email, verificación de identidad si la piden).
4. **Recomendación institucional:** usa una cuenta de la Universidad de Córdoba / EPSEA, no personal, si la app es oficial.

**Tiempo estimado:** 1–2 días (verificación puede tardar).

---

### Paso 2 — Confirmar URL de API de producción

En `eas.json` la URL de producción está como:

```
https://epsea.ineansastem.com/agro/api/v1
```

**Acción tuya:**

1. Pregunta al equipo backend cuál es la URL **definitiva** de producción (no `agro-test`).
2. Si es otra, edita `eas.json` → `build.production.env.EXPO_PUBLIC_API_URL`.
3. Opcional: duplica el valor en [expo.dev](https://expo.dev) → proyecto EPSEA → **Environment variables** → environment `production`.
4. **Genera un nuevo AAB** después de cambiar la URL.

Si publicas con la URL de prueba, los extensionistas en producción hablarían con el servidor equivocado.

---

### Paso 3 — Publicar política de privacidad (URL obligatoria)

Google **exige** una URL pública accesible sin login.

**Acción tuya:**

1. Abre `docs/legal/privacy-policy.html`.
2. Reemplaza:
   - `REEMPLAZAR_FECHA` → fecha real (ej. 28 de agosto de 2026).
   - Sección 5 → proveedores reales de hosting (ej. ineansastem.com si aplica).
3. Pide al área web / TI de UniCórdoba que publique el HTML en una ruta estable, por ejemplo:
   ```
   https://www.unicordoba.edu.co/epsea/politica-de-privacidad
   ```
4. Verifica en el navegador que la URL carga (sin 404).
5. Si la URL final es distinta, actualiza:
   - `eas.json` → `EXPO_PUBLIC_PRIVACY_POLICY_URL`
   - `constants/app-info.ts` (valor por defecto)
6. Vuelve a compilar el AAB si cambiaste variables embebidas en build.

**Tiempo estimado:** depende del área web (1–5 días hábiles).

---

### Paso 4 — Crear la app en Play Console

1. Play Console → **Crear app**.
2. Nombre: **EPSEA**.
3. Idioma predeterminado: **Español (Latinoamérica)** o **Español (España)**.
4. Tipo: **App** / **Juego: No**.
5. Gratis o de pago: **Gratis**.
6. Acepta políticas de desarrollador.

Al crear la ficha técnica, el **package name** debe ser exactamente:

```
com.epsea.unicordoba
```

No uses `com.joselito14.epsea` ni otros builds antiguos.

---

### Paso 5 — Ficha de Play Store (textos e imágenes)

Play Console → **Presencia en Play Store → Ficha principal de Play Store**.

| Campo | Dónde obtener el contenido |
|-------|----------------------------|
| Nombre | EPSEA |
| Descripción corta | `docs/store-listing/descriptions.md` |
| Descripción completa | mismo archivo |
| Icono 512×512 | Exportar desde `assets/images/Epsea.png` o `store-assets/icon-512.png` |
| Feature graphic 1024×500 | Crear y guardar en `store-assets/feature-graphic.png` |
| Capturas teléfono (mín. 2) | `store-assets/screenshots/phone/` — ver `store-assets/README.md` |
| Categoría | Productividad |
| Email de contacto | epsea@unicordoba.edu.co (o el definitivo) |
| Sitio web | https://www.unicordoba.edu.co |
| Política de privacidad | URL publicada en Paso 3 |

**Cómo tomar capturas:**

1. Instala el APK preview o AAB en un teléfono/emulador.
2. Captura: Login, Inicio, Proyectos/productor, Sincronizar.
3. Guárdalas en `store-assets/screenshots/phone/`.
4. Súbelas en Play Console.

---

### Paso 6 — Data safety (Seguridad de los datos)

Play Console → **Configuración de la app → Seguridad de los datos**.

Usa `docs/store-listing/data-safety.md` como guía línea por línea.

Puntos clave para EPSEA:

- **Sí** recopila datos personales, fotos y archivos.
- **Sí** transmite al servidor EPSEA por HTTPS.
- **No** usa ubicación GPS.
- **No** usa analytics/crash reporting (por ahora).
- Declara **foreground service** para sincronización.

Revisa con legal/TI antes de enviar.

---

### Paso 7 — Clasificación de contenido

Play Console → **Contenido de la app → Clasificación de contenido**.

1. Completa el cuestionario IARC.
2. Para EPSEA (app profesional, sin violencia ni apuestas): suele resultar **Para todos** o **3+**.
3. Guarda el certificado generado.

**Tiempo:** ~10 minutos.

---

### Paso 8 — Acceso a la app (credenciales demo)

La app **requiere login**. Google rechaza apps bloqueadas sin credenciales de prueba.

**Acción tuya:**

1. En el **backend de producción**, crea un usuario demo (solo lectura o permisos limitados).
2. Copia `docs/store-listing/reviewer-access.template.md` → `reviewer-access.local.md` (ignorado por git).
3. Completa usuario y contraseña.
4. Play Console → **Configuración de la app → Acceso a la app**:
   - Marca que **todas las funcionalidades requieren acceso**.
   - Pega usuario, contraseña e instrucciones del template.
5. Prueba tú mismo esas credenciales contra el AAB de producción antes de enviar.

---

### Paso 9 — Público objetivo y declaraciones

| Sección | Acción |
|---------|--------|
| Público objetivo | Adultos / 18+ (extensionistas) |
| App para niños | **No** |
| Anuncios | **No** (si no hay ads) |
| COVID / salud / financiero | **No** (salvo que aplique) |
| Permisos sensibles | Declara cámara, fotos, FGS dataSync |

---

### Paso 10 — Subir el AAB manualmente

1. Espera build production con package `com.epsea.unicordoba` (verifica en expo.dev).
2. Descarga el `.aab`.
3. Play Console → **Prueba → Prueba interna** (recomendado para el primer release) o **Producción**.
4. **Crear nueva versión** → subir AAB.
5. Notas de la versión: texto de `descriptions.md` (sección notas).
6. Revisa errores (package, firma, target SDK — debería pasar con SDK 35).
7. **Enviar a revisión**.

**Primera subida:** Google puede tardar **3–7 días** en revisar.

---

## Orden recomendado (checklist)

```
□ 1. Confirmar URL API producción con backend
□ 2. Publicar política de privacidad en web
□ 3. Actualizar URLs/emails en eas.json si cambian
□ 4. bun run validate:release
□ 5. bun run build:android:production
□ 6. Crear cuenta Google Play Developer
□ 7. Crear app con package com.epsea.unicordoba
□ 8. Completar ficha (textos + imágenes)
□ 9. Completar Data safety
□ 10. Clasificación IARC
□ 11. Crear usuario demo + Acceso a la app
□ 12. Subir AAB en Prueba interna
□ 13. Probar instalación desde Play (testers internos)
□ 14. Promover a Producción cuando el equipo apruebe
```

---

## Errores frecuentes

| Error | Causa | Solución |
|-------|-------|----------|
| Package name no coincide | AAB viejo (`com.joselito14.epsea`) | Usar build con `com.epsea.unicordoba` |
| Política de privacidad inválida | URL 404 o placeholder | Publicar HTML y probar URL |
| Revisión rechazada | Sin credenciales demo | Paso 8 |
| App no sincroniza en revisión | API caída o URL test | Backend producción estable |
| Version code duplicado | Re-subir mismo build | Nuevo build (autoIncrement en eas.json) |

---

## Contactos internos sugeridos

| Tema | Quién |
|------|-------|
| URL API producción | Equipo backend / ineansastem |
| Publicar política HTML | Web / TI UniCórdoba |
| Usuario demo | Admin del sistema EPSEA |
| Cuenta Play Developer | EPSEA / Vicerrectoría / TI |
| Textos legales | Oficina jurídica / protección de datos |

---

## Comandos útiles

```bash
# Validar config
bun run validate:release

# Build AAB producción
bun run build:android:production

# Ver builds recientes
bunx eas-cli build:list --platform android --profile production

# Descargar AAB del último build terminado (desde expo.dev UI o artifact URL)
```

---

## Referencias

- [Expo — Submit to Google Play](https://docs.expo.dev/submit/android/)
- [Google Play Console Help](https://support.google.com/googleplay/android-developer)
- Textos: `docs/store-listing/descriptions.md`
- Data safety: `docs/store-listing/data-safety.md`
- Privacidad: `docs/legal/privacy-policy.html`
