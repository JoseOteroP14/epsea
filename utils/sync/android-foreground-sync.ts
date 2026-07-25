import type { SyncProgress } from "@/utils/sync/sync-service";
import { Platform } from "react-native";
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
 * Falls back to running work directly in Expo Go (no native Notifee).
 *
 * Concurrent callers are queued (mutex) so recover never tears down an active FGS.
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
        (error) => {
          pendingForegroundWork = null;
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
  if (Platform.OS !== "android" || !active || !isNotifeeNativeAvailable()) {
    return;
  }

  const percent =
    progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : progress.current;

  try {
    await showForegroundNotification(
      progress.stage,
      percent,
      progress.total <= 0,
    );
  } catch {
    // best-effort
  }
}

/** @deprecated Use runAndroidForegroundSync; kept for compatibility. */
export async function startAndroidForegroundSync(): Promise<void> {
  if (Platform.OS !== "android" || !isNotifeeNativeAvailable()) return;
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
