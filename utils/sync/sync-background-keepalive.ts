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

/**
 * Stall recovery must run when the app is foregrounded again.
 * Triggering recover while backgrounded aborts the existing FGS and tries to
 * start a new one → ForegroundServiceStartNotAllowedException on Android 12+.
 */
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
    // Intentionally do NOT call onStallRecover here while backgrounded.
    // Android blocks starting a new foreground service from the background.
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
