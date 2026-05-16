import notifee, {
  AndroidForegroundServiceType,
  AndroidImportance,
} from "@notifee/react-native";
import type { SyncProgress } from "@/utils/sync/sync-service";
import { Platform } from "react-native";

const CHANNEL_ID = "epsea-sync";
const NOTIFICATION_ID = "epsea-sync";

let releaseForegroundService: (() => void) | null = null;
let registered = false;
let active = false;

export function registerAndroidForegroundSyncService(): void {
  if (Platform.OS !== "android" || registered) return;
  registered = true;

  // The task only keeps the FGS alive; sync runs on the main React Native thread.
  notifee.registerForegroundService(() => {
    return new Promise<void>((resolve) => {
      releaseForegroundService = () => {
        releaseForegroundService = null;
        resolve();
      };
    });
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

export async function startAndroidForegroundSync(): Promise<void> {
  if (Platform.OS !== "android") return;

  await ensureChannel();
  active = true;

  await notifee.displayNotification({
    id: NOTIFICATION_ID,
    title: "EPSEA",
    body: "Sincronizando datos…",
    android: {
      channelId: CHANNEL_ID,
      asForegroundService: true,
      foregroundServiceTypes: [
        AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
      ],
      ongoing: true,
      onlyAlertOnce: true,
      pressAction: { id: "default" },
    },
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
    await notifee.displayNotification({
      id: NOTIFICATION_ID,
      title: "EPSEA",
      body: progress.stage,
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
          indeterminate: progress.total <= 0,
        },
        pressAction: { id: "default" },
      },
    });
  } catch {
    // best-effort
  }
}

export async function stopAndroidForegroundSync(): Promise<void> {
  if (Platform.OS !== "android" || !active) return;

  active = false;
  releaseForegroundService?.();
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
