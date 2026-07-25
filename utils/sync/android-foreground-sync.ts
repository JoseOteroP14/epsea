import type { SyncProgress } from "@/utils/sync/sync-service";
import { AppState, Platform } from "react-native";
import { isNotifeeNativeAvailable, loadNotifeeModule } from "./notifee-loader";

const CHANNEL_ID = "epsea-sync";
const NOTIFICATION_ID = "epsea-sync";

let registered = false;
let active = false;
let pendingForegroundWork: (() => Promise<void>) | null = null;

/** Serializes FGS runs so a recover session never nests / stops another mid-flight. */
let foregroundSyncTail: Promise<void> = Promise.resolve();

export function registerAndroidForegroundSyncService(): void {
  if (Platform.OS !== "android" || registered) return;

  const notifeePkg = loadNotifeeModule();
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

export function isAndroidForegroundSyncActive(): boolean {
  return active;
}

/**
 * Waits until no foreground sync work is active (and the mutex chain is idle).
 * Used before starting a recover session so stopForegroundService cannot kill it.
 */
export async function waitForAndroidForegroundSyncIdle(
  timeoutMs = 20_000,
): Promise<void> {
  const started = Date.now();
  while (active || pendingForegroundWork != null) {
    if (Date.now() - started > timeoutMs) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  // Let Notifee finish stopForegroundService / cancelNotification.
  await new Promise((r) => setTimeout(r, 250));
}

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
  // Only 'active' is a reliable exemption for starting a new dataSync FGS.
  return AppState.currentState === "active";
}

async function ensureChannel(): Promise<void> {
  const notifeePkg = loadNotifeeModule();
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
  const notifeePkg = loadNotifeeModule();
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

/** Progress update without attempting to (re)start the FGS. */
async function showProgressNotificationOnly(
  body: string,
  percent: number,
  indeterminate: boolean,
): Promise<void> {
  const notifeePkg = loadNotifeeModule();
  if (!notifeePkg) return;

  await notifeePkg.default.displayNotification({
    id: NOTIFICATION_ID,
    title: "EPSEA",
    body,
    android: {
      channelId: CHANNEL_ID,
      // Keep FGS type only while the service is already running.
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
  const notifeePkg = loadNotifeeModule();
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

/**
 * Runs sync inside the Notifee foreground-service task so Android keeps the
 * process eligible for background network + JS while the user switches apps.
 *
 * If the app is already backgrounded, Android 12+ blocks startForegroundService —
 * we fall back to plain JS work (and rely on checkpoint resume when the user returns).
 */
export async function runAndroidForegroundSync(
  work: () => Promise<void>,
): Promise<void> {
  if (Platform.OS !== "android" || !isNotifeeNativeAvailable()) {
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
    // Already have an FGS: cannot nest; run work on the JS thread after idle wait upstream.
    // Starting a second FGS from background throws ForegroundServiceStartNotAllowedException.
    if (!canStartForegroundServiceFromAppState() && !active) {
      console.warn(
        "[sync] App not in foreground — skipping new FGS start (Android 12+ restriction)",
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
              "[sync] FGS start denied by Android — continuing without foreground service",
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

export async function updateAndroidForegroundSync(
  progress: SyncProgress,
): Promise<void> {
  if (Platform.OS !== "android" || !isNotifeeNativeAvailable()) {
    return;
  }

  // Only update the ongoing FGS notification while the service is alive.
  // Updating with asForegroundService while inactive can try to start a new FGS → crash.
  if (!active) return;

  const percent =
    progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : progress.current;

  try {
    await showProgressNotificationOnly(
      progress.stage,
      percent,
      progress.total <= 0,
    );
  } catch (error) {
    if (isForegroundServiceStartNotAllowedError(error)) {
      // Ignore — OS blocked a spurious restart attempt.
      return;
    }
    // best-effort
  }
}

/** @deprecated Use runAndroidForegroundSync; kept for compatibility. */
export async function startAndroidForegroundSync(): Promise<void> {
  if (Platform.OS !== "android" || !isNotifeeNativeAvailable()) return;
  if (!canStartForegroundServiceFromAppState()) return;
  await ensureChannel();
  active = true;
  await showForegroundNotification("Sincronizando datos…", 0, true);
}

/** @deprecated Use runAndroidForegroundSync completion; kept for compatibility. */
export async function stopAndroidForegroundSync(): Promise<void> {
  if (Platform.OS !== "android" || !active) return;
  active = false;
  pendingForegroundWork = null;
  await stopForegroundNotification();
}
