import type { SyncProgress } from "@/utils/sync/sync-service";
import { AppState, Platform } from "react-native";
import { isNotifyKitNativeAvailable, loadNotifyKitModule } from "./notify-kit-loader";
import { ensureSyncNotificationPermissions } from "./sync-notifications";

const CHANNEL_ID = "epsea-sync";
const NOTIFICATION_ID = "epsea-sync";

let registered = false;
let active = false;
let iosNotificationActive = false;
let pendingForegroundWork: (() => Promise<void>) | null = null;

/** Serializes FGS runs so a recover session never nests / stops another mid-flight. */
let foregroundSyncTail: Promise<void> = Promise.resolve();

function progressPercent(progress: SyncProgress): number {
  return progress.total > 0
    ? Math.min(100, Math.round((progress.current / progress.total) * 100))
    : progress.current;
}

export function configureNotifyKitAtBoot(): void {
  const notifeePkg = loadNotifyKitModule();
  if (!notifeePkg) return;
  void notifeePkg.default.setNotificationConfig({
    ios: { handleRemoteNotifications: false },
  });
}

export function registerSyncForegroundService(): void {
  if (Platform.OS !== "android" || registered) return;

  const notifeePkg = loadNotifyKitModule();
  if (!notifeePkg) return;

  registered = true;
  const notifee = notifeePkg.default;

  notifee.registerForegroundService(() => {
    return (async () => {
      active = true;
      try {
        const work = pendingForegroundWork;
        pendingForegroundWork = null;
        if (work) {
          await work();
        }
      } finally {
        active = false;
      }
    })();
  });
}

export function isSyncForegroundServiceActive(): boolean {
  return active || iosNotificationActive;
}

/**
 * Waits until no foreground sync work is active (and the mutex chain is idle).
 * Used before starting a recover session so stopForegroundService cannot kill it.
 */
export async function waitForSyncForegroundServiceIdle(
  timeoutMs = 20_000,
): Promise<void> {
  const started = Date.now();
  while (active || iosNotificationActive || pendingForegroundWork != null) {
    if (Date.now() - started > timeoutMs) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  await new Promise((r) => setTimeout(r, 250));
}

/** @deprecated Use waitForSyncForegroundServiceIdle */
export const waitForAndroidForegroundSyncIdle = waitForSyncForegroundServiceIdle;

/** Android 12+: startForegroundService is blocked unless the app is in the foreground (or exempt). */
export function isForegroundServiceStartNotAllowedError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("ForegroundServiceStartNotAllowedException") ||
    msg.includes("startForegroundService() not allowed") ||
    msg.includes("mAllowStartForeground false")
  );
}

function canStartForegroundServiceFromAppState(): boolean {
  return AppState.currentState === "active";
}

async function ensureChannel(): Promise<void> {
  const notifeePkg = loadNotifyKitModule();
  if (!notifeePkg) return;

  await notifeePkg.default.createChannel({
    id: CHANNEL_ID,
    name: "Sincronización",
    importance: notifeePkg.AndroidImportance.LOW,
  });
}

async function showForegroundNotification(
  body: string,
  percent: number,
  indeterminate: boolean,
): Promise<void> {
  const notifeePkg = loadNotifyKitModule();
  if (!notifeePkg) return;

  await notifeePkg.default.displayNotification({
    id: NOTIFICATION_ID,
    title: "EPSEA",
    body,
    android: {
      channelId: CHANNEL_ID,
      asForegroundService: true,
      foregroundServiceTypes: [
        notifeePkg.AndroidForegroundServiceType
          .FOREGROUND_SERVICE_TYPE_DATA_SYNC,
      ],
      ongoing: true,
      onlyAlertOnce: true,
      progress: {
        max: 100,
        current: percent,
        indeterminate,
      },
      pressAction: { id: "default" },
    },
  });
}

async function showProgressNotificationOnly(
  body: string,
  percent: number,
  indeterminate: boolean,
): Promise<void> {
  const notifeePkg = loadNotifyKitModule();
  if (!notifeePkg) return;

  await notifeePkg.default.displayNotification({
    id: NOTIFICATION_ID,
    title: "EPSEA",
    body,
    android: {
      channelId: CHANNEL_ID,
      ...(active
        ? {
            asForegroundService: true,
            foregroundServiceTypes: [
              notifeePkg.AndroidForegroundServiceType
                .FOREGROUND_SERVICE_TYPE_DATA_SYNC,
            ],
          }
        : {}),
      ongoing: active,
      onlyAlertOnce: true,
      progress: {
        max: 100,
        current: percent,
        indeterminate,
      },
      pressAction: { id: "default" },
    },
  });
}

async function stopForegroundNotification(): Promise<void> {
  const notifeePkg = loadNotifyKitModule();
  if (!notifeePkg) return;
  try {
    await notifeePkg.default.stopForegroundService();
  } catch {
    // ignore
  }
  try {
    await notifeePkg.default.cancelNotification(NOTIFICATION_ID);
  } catch {
    // ignore
  }
}

async function showIosSyncNotification(body: string): Promise<void> {
  const notifeePkg = loadNotifyKitModule();
  if (!notifeePkg) return;

  await notifeePkg.default.displayNotification({
    id: NOTIFICATION_ID,
    title: "EPSEA",
    body,
  });
}

async function stopIosSyncNotification(): Promise<void> {
  const notifeePkg = loadNotifyKitModule();
  if (!notifeePkg) return;
  try {
    await notifeePkg.default.cancelNotification(NOTIFICATION_ID);
  } catch {
    // ignore
  }
}

async function runAndroidForegroundSyncInternal(
  work: () => Promise<void>,
): Promise<void> {
  if (Platform.OS !== "android" || !isNotifyKitNativeAvailable()) {
    await work();
    return;
  }

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previous = foregroundSyncTail;
  foregroundSyncTail = previous.then(() => gate).catch(() => gate);
  await previous.catch(() => {});

  try {
    if (!canStartForegroundServiceFromAppState() && !active) {
      console.warn(
        "[notify-kit] App not in foreground — skipping new FGS start (Android 12+ restriction)",
      );
      await work();
      return;
    }

    await ensureChannel();

    await new Promise<void>((resolve, reject) => {
      pendingForegroundWork = async () => {
        try {
          await work();
          resolve();
        } catch (error) {
          reject(error);
          throw error;
        } finally {
          await stopForegroundNotification();
        }
      };

      void showForegroundNotification("Sincronizando datos…", 0, true).catch(
        async (error) => {
          pendingForegroundWork = null;
          if (isForegroundServiceStartNotAllowedError(error)) {
            console.warn(
              "[notify-kit] FGS start denied by Android — continuing without foreground service",
            );
            try {
              await work();
              resolve();
            } catch (workError) {
              reject(workError);
            }
            return;
          }
          reject(error);
        },
      );
    });
  } finally {
    release();
  }
}

async function runIosForegroundSync(work: () => Promise<void>): Promise<void> {
  if (Platform.OS !== "ios" || !isNotifyKitNativeAvailable()) {
    await work();
    return;
  }

  iosNotificationActive = true;
  try {
    const allowed = await ensureSyncNotificationPermissions();
    if (allowed) {
      await showIosSyncNotification("Sincronizando datos…");
    }
    await work();
  } finally {
    iosNotificationActive = false;
    await stopIosSyncNotification();
  }
}

export async function runSyncForegroundService(
  work: () => Promise<void>,
): Promise<void> {
  if (Platform.OS === "android") {
    await runAndroidForegroundSyncInternal(work);
    return;
  }
  if (Platform.OS === "ios") {
    await runIosForegroundSync(work);
    return;
  }
  await work();
}

export async function updateSyncForegroundNotification(
  progress: SyncProgress,
): Promise<void> {
  if (!isNotifyKitNativeAvailable()) return;

  const percent = progressPercent(progress);
  const body =
    progress.total > 0
      ? `${progress.stage} (${percent}%)`
      : progress.stage;

  if (Platform.OS === "android") {
    if (!active) return;
    try {
      await showProgressNotificationOnly(
        body,
        percent,
        progress.total <= 0,
      );
    } catch (error) {
      if (isForegroundServiceStartNotAllowedError(error)) return;
    }
    return;
  }

  if (Platform.OS === "ios" && iosNotificationActive) {
    try {
      await showIosSyncNotification(body);
    } catch {
      // best-effort
    }
  }
}

/** @deprecated Use isSyncForegroundServiceActive */
export const isAndroidForegroundSyncActive = isSyncForegroundServiceActive;

/** @deprecated Use runSyncForegroundService */
export const runAndroidForegroundSync = runSyncForegroundService;

/** @deprecated Use updateSyncForegroundNotification */
export const updateAndroidForegroundSync = updateSyncForegroundNotification;

/** @deprecated Use registerSyncForegroundService */
export const registerAndroidForegroundSyncService = registerSyncForegroundService;
