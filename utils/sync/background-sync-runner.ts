import type { SyncProgress } from "@/utils/sync/sync-service";
import { Platform } from "react-native";
import {
  isAndroidForegroundSyncActive,
  runAndroidForegroundSync,
  updateAndroidForegroundSync,
} from "./android-foreground-sync";
import { isNotifeeNativeAvailable } from "./notifee-loader";
import {
  startSyncKeepAlive,
  stopSyncKeepAlive,
  touchSyncKeepAlive,
} from "./sync-background-keepalive";

export function isBackgroundSyncServiceRunning(): boolean {
  return isAndroidForegroundSyncActive();
}

export function isBackgroundSyncServiceAvailable(): boolean {
  return isNotifeeNativeAvailable();
}

export async function runWithBackgroundSyncService(
  work: (reportProgress: (progress: SyncProgress) => void) => Promise<void>,
  options?: { onStallRecover?: () => void },
): Promise<void> {
  if (Platform.OS === "web") {
    await work(() => {});
    return;
  }

  const report = (progress: SyncProgress) => {
    touchSyncKeepAlive(progress);
    if (Platform.OS === "android") {
      void updateAndroidForegroundSync(progress);
    }
  };

  await startSyncKeepAlive({
    onHeartbeat: (progress) => {
      if (progress) {
        void updateAndroidForegroundSync(progress);
      }
    },
    onStallRecover: () => {
      options?.onStallRecover?.();
    },
  });

  try {
    if (Platform.OS === "android") {
      await runAndroidForegroundSync(async () => {
        await work(report);
      });
      return;
    }

    await work(report);
  } finally {
    stopSyncKeepAlive();
  }
}
