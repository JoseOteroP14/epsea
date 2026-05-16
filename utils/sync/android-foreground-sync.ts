import notifee, {
  AndroidForegroundServiceType,
  AndroidImportance,
} from "@notifee/react-native";
import type { SyncProgress } from "@/utils/sync/sync-service";
import { Platform } from "react-native";

const CHANNEL_ID = "epsea-sync";
const NOTIFICATION_ID = "epsea-sync";

let registered = false;
let active = false;
let pendingForegroundWork: (() => Promise<void>) | null = null;

export function registerAndroidForegroundSyncService(): void {
  if (Platform.OS !== "android" || registered) return;
  registered = true;

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

async function ensureChannel(): Promise<void> {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: "Sincronización",
    importance: AndroidImportance.LOW,
  });
}

async function showForegroundNotification(
  body: string,
  percent: number,
  indeterminate: boolean,
): Promise<void> {
  await notifee.displayNotification({
    id: NOTIFICATION_ID,
    title: "EPSEA",
    body,
    android: {
      channelId: CHANNEL_ID,
      asForegroundService: true,
      foregroundServiceTypes: [
        AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
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

/**
 * Runs sync inside the Notifee foreground-service task so Android keeps the
 * process eligible for background network + JS while the user switches apps.
 */
export async function runAndroidForegroundSync(
  work: () => Promise<void>,
): Promise<void> {
  if (Platform.OS !== "android") {
    await work();
    return;
  }

  await ensureChannel();

  return new Promise<void>((resolve, reject) => {
    pendingForegroundWork = async () => {
      try {
        await work();
        resolve();
      } catch (error) {
        reject(error);
        throw error;
      } finally {
        try {
          await notifee.stopForegroundService();
        } catch {
          // ignore
        }
        try {
          await notifee.cancelNotification(NOTIFICATION_ID);
        } catch {
          // ignore
        }
      }
    };

    void showForegroundNotification("Sincronizando datos…", 0, true).catch(
      (error) => {
        pendingForegroundWork = null;
        reject(error);
      },
    );
  });
}

export async function updateAndroidForegroundSync(
  progress: SyncProgress,
): Promise<void> {
  if (Platform.OS !== "android" || !active) return;

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
  if (Platform.OS !== "android") return;
  await ensureChannel();
  active = true;
  await showForegroundNotification("Sincronizando datos…", 0, true);
}

/** @deprecated Use runAndroidForegroundSync completion; kept for compatibility. */
export async function stopAndroidForegroundSync(): Promise<void> {
  if (Platform.OS !== "android" || !active) return;
  active = false;
  pendingForegroundWork = null;
  try {
    await notifee.stopForegroundService();
  } catch {
    // ignore
  }
  try {
    await notifee.cancelNotification(NOTIFICATION_ID);
  } catch {
    // ignore
  }
}
