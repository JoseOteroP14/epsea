import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { AppState, type AppStateStatus, Platform } from "react-native";

import type { SyncProgress } from "@/utils/sync/sync-service";

const KEEP_AWAKE_TAG = "epsea-sync";
const HEARTBEAT_MS = 12_000;
const STALL_THRESHOLD_MS = 18_000;

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let lastProgressAt = 0;
let lastProgress: SyncProgress | null = null;
let onStallRecover: (() => void) | null = null;
let appStateSub: { remove: () => void } | null = null;

function clearHeartbeat(): void {
  if (heartbeatTimer != null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function onAppStateChange(next: AppStateStatus): void {
  if (next !== "active" || !onStallRecover) return;

  const stalledFor = Date.now() - lastProgressAt;
  if (lastProgressAt > 0 && stalledFor >= STALL_THRESHOLD_MS) {
    onStallRecover();
  }
}

export function touchSyncKeepAlive(progress: SyncProgress): void {
  lastProgressAt = Date.now();
  lastProgress = progress;
}

export async function startSyncKeepAlive(options: {
  onHeartbeat: (progress: SyncProgress | null) => void;
  onStallRecover: () => void;
}): Promise<void> {
  stopSyncKeepAlive();

  lastProgressAt = Date.now();
  lastProgress = null;
  onStallRecover = options.onStallRecover;

  try {
    await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
  } catch {
    // best-effort
  }

  if (Platform.OS !== "web") {
    appStateSub = AppState.addEventListener("change", onAppStateChange);
  }

  heartbeatTimer = setInterval(() => {
    options.onHeartbeat(lastProgress);

    if (AppState.currentState !== "active" && onStallRecover) {
      const stalledFor = Date.now() - lastProgressAt;
      if (lastProgressAt > 0 && stalledFor >= STALL_THRESHOLD_MS) {
        onStallRecover();
      }
    }
  }, HEARTBEAT_MS);
}

export function stopSyncKeepAlive(): void {
  clearHeartbeat();
  appStateSub?.remove();
  appStateSub = null;
  onStallRecover = null;
  lastProgress = null;
  lastProgressAt = 0;

  try {
    deactivateKeepAwake(KEEP_AWAKE_TAG);
  } catch {
    // best-effort
  }
}
