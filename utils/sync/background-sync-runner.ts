import type { SyncProgress } from "@/utils/sync/sync-service";
import { Platform } from "react-native";
import {
  isAndroidForegroundSyncActive,
  startAndroidForegroundSync,
  stopAndroidForegroundSync,
  updateAndroidForegroundSync,
} from "./android-foreground-sync";

export function isBackgroundSyncServiceRunning(): boolean {
  return isAndroidForegroundSyncActive();
}

export function isBackgroundSyncServiceAvailable(): boolean {
  return Platform.OS === "android";
}

/**
 * Android: foreground service keeps the process alive while sync runs on the
 * main React Native thread (SQLite / auth remain valid).
 * iOS: sync runs in-process; background time is limited by the OS.
 */
export async function runWithBackgroundSyncService(
  work: (reportProgress: (progress: SyncProgress) => void) => Promise<void>,
): Promise<void> {
  if (Platform.OS === "web") {
    await work(() => {});
    return;
  }

  if (Platform.OS === "android") {
    await startAndroidForegroundSync();
    try {
      await work((progress) => {
        void updateAndroidForegroundSync(progress);
      });
    } finally {
      await stopAndroidForegroundSync();
    }
    return;
  }

  await work(() => {});
}
