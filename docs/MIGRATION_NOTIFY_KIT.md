# Plan de migración: `@notifee/react-native` → `react-native-notify-kit`

> **Proyecto:** EPSEA (Expo SDK 54 · RN 0.81 · New Architecture)  
> **Versión objetivo:** `react-native-notify-kit@^10.6.0`  
> **Fecha:** 2026-08-27  
> **Estado actual:** Build AAB exitoso con Notifee 9.1.8; `expo doctor` falla por paquete unmaintained.

---

## 1. Resumen ejecutivo

`react-native-notify-kit` es el fork mantenido oficialmente recomendado por Invertase tras archivar Notifee (abril 2026). Expone la **misma API pública** (`notifee.*`) con correcciones para New Architecture (TurboModules) y un config plugin de Expo para FGS en Android.

**Objetivos de la migración:**

| Objetivo | Alcance |
|----------|---------|
| Eliminar dependencia archivada | Sustituir `@notifee/react-native` |
| Mantener FGS Android sin regresión | `dataSync` + progress bar (comportamiento actual) |
| Notificaciones iOS durante sync | Progreso textual actualizable (limitado por iOS) |
| Unificar capa de notificaciones | Consolidar Notifee + `expo-notifications` en sync |
| Pasar `expo doctor` | Sin warning de unmaintained |

**No es objetivo de esta migración:** paridad total iOS/Android en sync prolongado en background (requiere Fase 2 futura con Live Activities o Background URLSession).

---

## 2. Estado actual en EPSEA

### 2.1 Dos sistemas de notificaciones coexistiendo

```
┌─────────────────────────────────────────────────────────────────┐
│                        Sync en EPSEA                            │
├──────────────────────────────┬──────────────────────────────────┤
│ Android (primario)           │ iOS + fallback                   │
│ @notifee/react-native        │ expo-notifications               │
│ FGS dataSync + progress bar  │ Notificación estática al         │
│ android-foreground-sync.ts   │ backgroundear (sin updates)      │
│ background-sync-runner.ts    │ sync-notifications.ts            │
│                              │ sync-background-coordinator.tsx  │
└──────────────────────────────┴──────────────────────────────────┘
```

### 2.2 Archivos involucrados hoy

| Archivo | Rol |
|---------|-----|
| `utils/sync/notifee-loader.ts` | Lazy-load Notifee; **solo Android** |
| `utils/sync/android-foreground-sync.ts` | FGS, channel, progress, mutex |
| `utils/sync/background-sync-runner.ts` | Orquesta FGS (Android) vs plain work (iOS) |
| `utils/sync/sync-notifications.ts` | `expo-notifications` para in-progress/result |
| `utils/sync/sync-background-keepalive.ts` | Keep-awake + stall detection |
| `components/sync-background-coordinator.tsx` | AppState → notificaciones fallback |
| `plugins/with-background-sync-service.js` | Manifest Android + Maven Notifee + iOS BG modes |
| `app/_layout.tsx` | `registerAndroidForegroundSyncService()` al boot |
| `app.json` | Plugin custom + `expo-notifications` |

### 2.3 Config nativa existente

**Android** (`with-background-sync-service.js`):

- `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`, `WAKE_LOCK`
- Service merge: `app.notifee.core.ForegroundService` con `foregroundServiceType: dataSync`
- Maven repo: `@notifee/react-native/android/libs`

**iOS** (mismo plugin):

- `UIBackgroundModes`: `fetch`, `processing`
- `BGTaskSchedulerPermittedIdentifiers`: bundle ID

> **Nota:** Los BG modes están declarados pero **no hay implementación JS** de `expo-background-task` todavía.

---

## 3. Documentación oficial de referencia

| Tema | URL |
|------|-----|
| Overview | https://docs.page/marcocrupi/react-native-notify-kit/react-native/overview |
| Instalación | https://docs.page/marcocrupi/react-native-notify-kit/react-native/installation |
| Migración desde Notifee | https://github.com/marcocrupi/react-native-notify-kit#migration-from-notifeereact-native |
| Android FGS | https://docs.page/marcocrupi/react-native-notify-kit/react-native/android/foreground-service |
| Android progress | https://docs.page/marcocrupi/react-native-notify-kit/react-native/android/progress-indicators |
| iOS permisos | https://docs.page/marcocrupi/react-native-notify-kit/react-native/ios/permissions |
| iOS behaviour | https://docs.page/marcocrupi/react-native-notify-kit/react-native/ios/behaviour |
| Actualizar notificación | https://docs.page/marcocrupi/react-native-notify-kit/react-native/displaying-a-notification |
| Config plugin FGS | https://github.com/marcocrupi/react-native-notify-kit/blob/main/docs/fcm-mode.mdx |
| API `setNotificationConfig` | https://docs.page/marcocrupi/react-native-notify-kit/react-native/ios/remote-notification-support |
| Changelog 10.x | https://github.com/marcocrupi/react-native-notify-kit/blob/main/CHANGELOG.md |

---

## 4. Compatibilidad y requisitos

### 4.1 Matriz de compatibilidad EPSEA ↔ Notify Kit

| Requisito | EPSEA actual | Notify Kit 10.6.0 | Estado |
|-----------|--------------|-------------------|--------|
| React Native | 0.81.5 | `>= 0.73` | ✅ |
| New Architecture | `true` | Obligatorio (TurboModules) | ✅ |
| Expo SDK | 54 | Peer `expo: *` | ✅ |
| Expo Go | No usado en prod | **No soportado** | ✅ (dev builds / EAS) |
| iOS deployment | 15.1 | 15.1+ | ✅ |
| Android minSdk | 24 | Baseline documentado 24 | ✅ |
| Android targetSdk | 35 | Recomendado 35 | ✅ |

### 4.2 Restricciones de plataforma (documentación oficial)

#### Android — Foreground Service

- `registerForegroundService()` debe registrarse **fuera de componentes React**, lo antes posible (p. ej. `app/_layout.tsx` module scope — ya cumplido).
- Solo **un FGS activo** por app a la vez (mutex actual en `android-foreground-sync.ts` — conservar).
- Android 14+ (API 34): `foregroundServiceType` **obligatorio** en manifest. Desde v9.1.13 del fork, **ya no se hardcodea** en la lib; la app debe declararlo (EPSEA ya usa `dataSync`).
- Android 12+ (API 31): `startForegroundService()` bloqueado desde background → fallback existente (conservar).
- Progress bar: solo propiedad `android.progress` (`max`, `current`, `indeterminate`).
- `onlyAlertOnce: true` recomendado para updates frecuentes (ya usado).
- `FOREGROUND_SERVICE_IMMEDIATE` es default desde fork 9.4.0 (elimina delay de 10s en Android 12+).

#### iOS — Notificaciones locales

- **No existe FGS en iOS.** `registerForegroundService` y `asForegroundService` son Android-only.
- **No hay progress bar** en notificaciones iOS; solo actualización de `title` / `body` vía mismo `id`.
- Permisos: `notifee.requestPermission()` antes de mostrar (requerido iOS + Android 13+).
- Actualizar notificación: volver a llamar `displayNotification({ id: '...', ... })` con el mismo `id`.
- `interruptionLevel: 'timeSensitive'` mejora visibilidad (iOS 15+); entitlement adicional para App Store si se usa en producción.
- iOS suspende JS en background (~30s grace period); updates de notificación **dejan de actualizarse** cuando el proceso se suspende.
- Simulador iOS: notificaciones locales sí funcionan; BGTaskScheduler no (irrelevante para Fase 1).

#### Expo

- Requiere **development build** o EAS Build (no Expo Go).
- Config plugin disponible desde v10.4.0 para FGS manifest.
- `expo-build-properties` recomendado para fijar SDK Android (ya configurado).

---

## 5. Arquitectura objetivo post-migración

```
app/_layout.tsx
  └── registerSyncForegroundService()     // module scope, ambas plataformas donde aplique

utils/sync/
  ├── notify-kit-loader.ts              // reemplaza notifee-loader.ts (Android + iOS)
  ├── sync-foreground-service.ts        // reemplaza android-foreground-sync.ts
  │     ├── Android: FGS + progress bar (igual que hoy)
  │     └── iOS: local notification + body updates por progress
  ├── sync-notifications.ts             // refactor: notify-kit como backend único
  ├── background-sync-runner.ts         // usa sync-foreground-service en ambas plataformas
  └── sync-background-keepalive.ts      // sin cambios

plugins/
  └── with-background-sync-service.js   // simplificar: iOS BG modes; delegar FGS al plugin notify-kit

app.json
  └── plugins: [
        ["react-native-notify-kit", { android: { foregroundService: { types: ["dataSync"] } } }],
        "./plugins/with-background-sync-service.js",  // solo iOS BG modes + permisos legacy si aplica
        ...
      ]
```

### 5.1 Decisión: `expo-notifications` post-migración

EPSEA ya tiene `expo-notifications` en `app.json` (icon/color push). Opciones:

| Opción | Pros | Contras |
|--------|------|---------|
| **A — Mantener expo-notifications solo para push futuro** | Separación push vs local sync | Dos delegates iOS; requiere `setNotificationConfig` |
| **B — Migrar sync-notifications.ts 100% a notify-kit** | Una API para sync | Push futuro también vía notify-kit o FCM Mode |
| **C — Híbrido temporal** | Menor diff inicial | Deuda técnica |

**Recomendación:** **Opción B** para sync (Fase 1), con `setNotificationConfig({ ios: { handleRemoteNotifications: false } })` al boot si se mantiene `expo-notifications` para push.

---

## 6. Plan de implementación por fases

### Fase 0 — Preparación (sin código)

- [ ] Crear branch `feat/notify-kit-migration`
- [ ] Verificar que builds actuales pasan en EAS (baseline Android + iOS)
- [ ] Documentar escenario de prueba manual (sync largo, background, kill process, resume)
- [ ] Confirmar que no hay otros imports de `@notifee/react-native` fuera de `utils/sync/`

**Comando:**

```bash
bun remove @notifee/react-native
bun add react-native-notify-kit@^10.6.0
```

---

### Fase 1 — Drop-in (Android sin cambio de comportamiento)

**Objetivo:** Sustituir paquete e imports; validar FGS Android idéntico.

#### 1.1 Renombrar loader

`utils/sync/notifee-loader.ts` → `utils/sync/notify-kit-loader.ts`

```typescript
// Cambios clave según docs oficiales:
type NotifyKitPackage = typeof import("react-native-notify-kit");

export function isNotifyKitNativeAvailable(): boolean {
  if (Platform.OS === "web") return false;
  return Boolean(NativeModules.NotifeeApiModule); // mismo native module name
}

export function loadNotifyKitModule(): NotifyKitPackage | null {
  // require("react-native-notify-kit") — lazy, no top-level import (Expo Go safe)
}
```

> El TurboModule sigue exponiéndose como `NotifeeApiModule` por compatibilidad upstream.

#### 1.2 Actualizar imports en archivos existentes

| Archivo | Cambio |
|---------|--------|
| `android-foreground-sync.ts` | `@/utils/sync/notify-kit-loader` |
| `background-sync-runner.ts` | `isNotifyKitNativeAvailable()` |
| Todos los `require("@notifee/react-native")` | `require("react-native-notify-kit")` |

#### 1.3 Config plugin en `app.json`

Reemplazar Maven manual + service merge por plugin oficial (v10.4.0+):

```json
[
  "react-native-notify-kit",
  {
    "android": {
      "foregroundService": {
        "types": ["dataSync"]
      }
    }
  }
]
```

Según documentación, tipos válidos incluyen: `dataSync`, `shortService`, `remoteMessaging`, etc. EPSEA debe usar **`dataSync`** (sync de datos offline), **no** `shortService` (timeout 3 min en Android 14+).

#### 1.4 Simplificar `with-background-sync-service.js`

| Mantener | Eliminar / delegar al plugin |
|----------|------------------------------|
| `withIosBackgroundSync` (BG modes) | `withNotifeeMavenRepo` |
| Permisos extra si el plugin no los cubre | Merge manual de `ForegroundService` (plugin lo hace) |

#### 1.5 Prebuild limpio

```bash
# Local (si aplica)
bunx expo prebuild --clean

# EAS
bunx eas-cli build --platform android --profile production
bunx eas-cli build --platform ios --profile production
```

#### 1.6 Criterios de aceptación Fase 1

- [ ] Sync Android con app en foreground → FGS + progress bar
- [ ] Usuario cambia de app → sync continúa (FGS activo)
- [ ] Android 12+: app ya en background al iniciar sync → fallback sin crash (`ForegroundServiceStartNotAllowedException`)
- [ ] `expo doctor` ya no reporta `@notifee/react-native` unmaintained
- [ ] AAB + IPA compilan en EAS

---

### Fase 2 — iOS: notificaciones de progreso con Notify Kit

**Objetivo:** Paridad UX parcial — notificación visible con texto actualizado durante sync.

#### 2.1 Permisos iOS al primer sync

Según [iOS Permissions](https://docs.page/marcocrupi/react-native-notify-kit/react-native/ios/permissions):

```typescript
import notifee, { AuthorizationStatus } from "react-native-notify-kit";

const settings = await notifee.requestPermission();
const granted = settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
```

Integrar en flujo existente `ensureSyncNotificationPermissions()` (reemplazar o unificar con expo-notifications).

#### 2.2 Extender `sync-foreground-service.ts` — rama iOS

```typescript
const NOTIFICATION_ID = "epsea-sync";

async function showIosSyncNotification(body: string): Promise<void> {
  await notifee.displayNotification({
    id: NOTIFICATION_ID,
    title: "EPSEA",
    body,
    ios: {
      // Opcional Fase 2b: interruptionLevel: 'timeSensitive'
    },
  });
}

async function updateIosSyncNotification(progress: SyncProgress): Promise<void> {
  const percent = /* calcular */;
  await showIosSyncNotification(`${progress.stage} (${percent}%)`);
}

async function stopIosSyncNotification(): Promise<void> {
  await notifee.cancelNotification(NOTIFICATION_ID);
}
```

#### 2.3 Integrar en `background-sync-runner.ts`

```typescript
// Antes: iOS → await work(report) sin notificación
// Después:
if (Platform.OS === "ios") {
  await runIosForegroundSync(async () => { await work(report); });
  return;
}
```

`runIosForegroundSync` no usa FGS; envuelve `work()` con show/update/cancel de notificación local.

#### 2.4 Actualizar `SyncBackgroundCoordinator`

Hoy dispara `showSyncInProgressNotification()` (expo-notifications) cuando `!isBackgroundSyncServiceRunning()`. Tras Fase 2:

- iOS con notify-kit activo durante sync → **eliminar duplicado** (coordinator no debe crear segunda notificación).
- Mantener coordinator para: resultado éxito/error en background, resume checkpoint cold-start.

#### 2.5 Criterios de aceptación Fase 2

- [ ] iOS: al iniciar sync → notificación "Sincronizando datos…"
- [ ] iOS: progreso actualiza `body` mientras app tiene tiempo de background
- [ ] iOS: al completar sync → notificación se cancela o muestra resultado
- [ ] iOS: permiso denegado → sync funciona sin notificación (degradación graceful)
- [ ] No hay dos notificaciones simultáneas (notify-kit + expo-notifications)

---

### Fase 3 — Unificar `sync-notifications.ts`

Migrar funciones restantes de `expo-notifications` a notify-kit:

| Función actual | Implementación notify-kit |
|----------------|---------------------------|
| `configureSyncNotifications()` | Channel Android + `setNotificationConfig` iOS |
| `ensureSyncNotificationPermissions()` | `notifee.requestPermission()` |
| `showSyncInProgressNotification()` | `displayNotification({ id: 'epsea-sync', ... })` |
| `clearSyncInProgressNotification()` | `cancelNotification('epsea-sync')` |
| `notifySyncSucceeded()` / `notifySyncFailed()` | `displayNotification` one-shot + cancel in-progress |

**Coexistencia con expo-notifications (si se mantiene para push):**

```typescript
// app/_layout.tsx — module scope, antes de registrar FGS
import notifee from "react-native-notify-kit";

void notifee.setNotificationConfig({
  ios: { handleRemoteNotifications: false },
});
```

Documentado en [Remote Notification Support](https://docs.page/marcocrupi/react-native-notify-kit/react-native/ios/remote-notification-support): evita que notify-kit intercepte taps de push manejados por expo-notifications / FCM.

---

### Fase 4 — Hardening y observabilidad

#### 4.1 Android OEM / battery

Documentación oficial advierte que FGS puede pausarse en Samsung/Xiaomi. EPSEA ya tiene:

- Checkpoints SQLite
- `recoverStalledDownload`
- Defer recover mientras backgrounded (Android 12+)

No cambiar en migración; verificar que siguen funcionando post-swap.

#### 4.2 `prewarmForegroundService()` (opcional)

Solo si hay latencia perceptible al primer FGS en cold start:

```typescript
// app/_layout.tsx
notifee.prewarmForegroundService(); // no-op en iOS; idempotente
```

La lib ya calienta vía `InitProvider`; esto es escape hatch documentado.

#### 4.3 Logging

Añadir prefijo `[notify-kit]` en paths de error FGS para distinguir de lógica de sync.

---

## 7. Matriz de pruebas

### 7.1 Android

| # | Escenario | Resultado esperado |
|---|-----------|-------------------|
| A1 | Sync completo en foreground | FGS + progress 0→100%, notificación desaparece |
| A2 | Sync + home button (< 5s) | Sync continúa, progress actualiza |
| A3 | Sync largo (> 5 min) background | Continúa con FGS dataSync |
| A4 | Iniciar sync ya en background | Fallback sin FGS, checkpoint al volver |
| A5 | Stall + volver a foreground | recover reinicia sesión |
| A6 | Kill app mid-sync | Resume checkpoint al reopen |
| A7 | Permiso notificaciones denegado (API 33+) | Sync funciona; FGS puede fallar display → fallback |

### 7.2 iOS

| # | Escenario | Resultado esperado |
|---|-----------|-------------------|
| I1 | Sync en foreground | Notificación local opcional o in-app progress |
| I2 | Sync + home button | Notificación visible; body actualiza ~30–180s |
| I3 | Sync largo background (> 3 min) | JS suspendido; notificación congelada; checkpoint al volver |
| I4 | Permiso denegado | Sync sin notificación |
| I5 | Permiso denegado → Settings → habilitar | Próximo sync muestra notificación |
| I6 | Cold start con checkpoint | Resume sin crash |

### 7.3 CI / tooling

| # | Check | Comando |
|---|-------|---------|
| T1 | TypeScript | `bun run type-check` |
| T2 | Lint | `bun run lint` |
| T3 | Expo doctor | `bunx expo-doctor` |
| T4 | EAS Android | `bun run build:android:production` |
| T5 | EAS iOS | build profile iOS equivalente |

---

## 8. Checklist de archivos a modificar

```
package.json                          # swap dependency
bun.lock                              # auto
app.json                              # + plugin react-native-notify-kit
plugins/with-background-sync-service.js  # simplificar Android FGS
utils/sync/notifee-loader.ts          # → notify-kit-loader.ts
utils/sync/android-foreground-sync.ts # → sync-foreground-service.ts (+ iOS)
utils/sync/background-sync-runner.ts  # iOS path + rename imports
utils/sync/sync-notifications.ts      # backend notify-kit
components/sync-background-coordinator.tsx  # evitar duplicados iOS
app/_layout.tsx                       # register + setNotificationConfig
store/useSyncStore.ts                 # imports si cambian paths
```

**Archivos sin cambio esperado:**

- `utils/sync/sync-service.ts`
- `utils/sync/sync-download-session.ts`
- `utils/sync/sync-background-keepalive.ts`

---

## 9. Rollback

Si FGS Android falla post-migración:

```bash
bun remove react-native-notify-kit
bun add @notifee/react-native@^9.1.8
git checkout -- app.json plugins/with-background-sync-service.js utils/sync/
bunx expo prebuild --clean
```

Revertir commit completo de la branch es preferible a rollback parcial.

---

## 10. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Conflicto delegate iOS notify-kit ↔ expo-notifications | Media | Push/sync taps rotos | `setNotificationConfig({ handleRemoteNotifications: false })` |
| Regresión FGS Android 14+ | Baja | Sync cortado en background | Plugin `types: ['dataSync']`; probar en device API 34+ |
| Expectativa iOS = Android | Alta (UX) | Insatisfacción usuario | Documentar limitación; plan Fase futura |
| Maven repo Notifee removido antes de plugin | Media | Build Android falla | Aplicar plugin notify-kit **antes** de quitar Maven manual |
| Expo Go devs | Baja | Crash en Go | Mantener lazy-load pattern (no import top-level) |

---

## 11. Fase futura (fuera de scope notify-kit)

Para progreso **realmente en tiempo real** en iOS con app suspendida:

| Enfoque | Cuándo | Esfuerzo |
|---------|--------|----------|
| **Live Activities** (ActivityKit) | Lock screen / Dynamic Island durante sync | Alto — módulo nativo |
| **Background URLSession** | Descargas HTTP largas sobreviven suspensión | Alto — refactor download layer |
| **expo-background-task** | Reintentos periódicos de checkpoint | Medio — complemento, no sustituto |

Notify Kit cubre Fase 1–3; estas opciones son arquitectura adicional.

---

## 12. Orden de ejecución recomendado (sprint)

```
Día 1: Fase 0 + Fase 1 (swap + plugin + EAS Android)
Día 2: Validación Android manual + Fase 2 iOS notifications
Día 3: Fase 3 unificación sync-notifications.ts + Fase 4 hardening
Día 4: Matriz de pruebas completa + merge
```

---

## 13. Snippets de referencia (documentación oficial)

### Registro FGS (Android)

```typescript
import notifee from "react-native-notify-kit";

notifee.registerForegroundService(() => {
  return new Promise(() => {
    // EPSEA: pendingForegroundWork pattern — conservar
  });
});
```

### Notificación FGS con progress (Android)

```typescript
await notifee.displayNotification({
  id: "epsea-sync",
  title: "EPSEA",
  body: "Sincronizando datos…",
  android: {
    channelId: "epsea-sync",
    asForegroundService: true,
    foregroundServiceTypes: [
      AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
    ],
    ongoing: true,
    onlyAlertOnce: true,
    progress: { max: 100, current: 45, indeterminate: false },
  },
});
```

### Actualizar notificación (iOS + Android)

```typescript
// Mismo id → reemplaza payload completo
await notifee.displayNotification({
  id: "epsea-sync",
  title: "EPSEA",
  body: "Usuarios descargados (3/10)…",
  android: { channelId: "epsea-sync", onlyAlertOnce: true },
});
```

### Config plugin Expo (EPSEA)

```json
[
  "react-native-notify-kit",
  {
    "android": {
      "foregroundService": {
        "types": ["dataSync"]
      }
    }
  }
]
```

---

## 14. Aprobaciones

| Rol | Decisión | Fecha |
|-----|----------|-------|
| Dev | | |
| QA | | |
| Product (expectativas iOS) | | |

---

*Generado a partir de la documentación oficial de react-native-notify-kit v10.x y el análisis del codebase EPSEA (agosto 2026).*
