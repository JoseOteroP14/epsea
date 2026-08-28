import type { SyncProgress } from "@/utils/sync/sync-service";
import { Platform } from "react-native";
import { isNotifyKitNativeAvailable } from "./notify-kit-loader";
import {
  isSyncForegroundServiceActive,
  runSyncForegroundService,
  updateSyncForegroundNotification,
} from "./sync-foreground-service";
import {
  startSyncKeepAlive,
  stopSyncKeepAlive,
  touchSyncKeepAlive,
} from "./sync-background-keepalive";

export function isBackgroundSyncServiceRunning(): boolean {
  return isSyncForegroundServiceActive();
}

export function isBackgroundSyncServiceAvailable(): boolean {
  return isNotifyKitNativeAvailable();
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
    void updateSyncForegroundNotification(progress);
  };

  await startSyncKeepAlive({
    onHeartbeat: (progress) => {
      if (progress) {
        void updateSyncForegroundNotification(progress);
      }
    },
    onStallRecover: () => {
      options?.onStallRecover?.();
    },
  });

  try {
    await runSyncForegroundService(async () => {
      await work(report);
    });
  } finally {
    stopSyncKeepAlive();
  }
}
