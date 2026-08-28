import { isRunningInExpoGo } from "expo";
import { AppState, Platform } from "react-native";
import { isNotifyKitNativeAvailable, loadNotifyKitModule } from "./notify-kit-loader";

const SYNC_CHANNEL_ID = "epsea-sync";
const SYNC_NOTIFICATION_ID = "epsea-sync";

export function isAppInBackground(): boolean {
  const state = AppState.currentState;
  return state === "background" || state === "inactive";
}

export async function configureSyncNotifications(): Promise<void> {
  if (isRunningInExpoGo() || !isNotifyKitNativeAvailable()) return;

  const notifeePkg = loadNotifyKitModule();
  if (!notifeePkg) return;

  await notifeePkg.default.setNotificationConfig({
    ios: { handleRemoteNotifications: false },
  });

  if (Platform.OS === "android") {
    await notifeePkg.default.createChannel({
      id: SYNC_CHANNEL_ID,
      name: "Sincronización",
      importance: notifeePkg.AndroidImportance.HIGH,
    });
  }
}

export async function ensureSyncNotificationPermissions(): Promise<boolean> {
  if (isRunningInExpoGo() || !isNotifyKitNativeAvailable()) return false;

  const notifeePkg = loadNotifyKitModule();
  if (!notifeePkg) return false;

  const settings = await notifeePkg.default.requestPermission();
  return (
    settings.authorizationStatus >= notifeePkg.AuthorizationStatus.AUTHORIZED
  );
}

export async function showSyncInProgressNotification(): Promise<void> {
  if (isRunningInExpoGo() || !isNotifyKitNativeAvailable()) return;

  const allowed = await ensureSyncNotificationPermissions();
  if (!allowed) return;

  const notifeePkg = loadNotifyKitModule();
  if (!notifeePkg) return;

  await notifeePkg.default.displayNotification({
    id: SYNC_NOTIFICATION_ID,
    title: "EPSEA",
    body: "Sincronizando datos… Puede usar otras aplicaciones.",
    android: {
      channelId: SYNC_CHANNEL_ID,
      ongoing: true,
      onlyAlertOnce: true,
    },
  });
}

export async function clearSyncInProgressNotification(): Promise<void> {
  if (!isNotifyKitNativeAvailable()) return;

  const notifeePkg = loadNotifyKitModule();
  if (!notifeePkg) return;

  try {
    await notifeePkg.default.cancelNotification(SYNC_NOTIFICATION_ID);
  } catch {
    // Notification may already be dismissed
  }
}

async function scheduleSyncResultNotification(
  title: string,
  body: string,
): Promise<void> {
  if (isRunningInExpoGo() || !isNotifyKitNativeAvailable()) return;

  const allowed = await ensureSyncNotificationPermissions();
  if (!allowed) return;

  const notifeePkg = loadNotifyKitModule();
  if (!notifeePkg) return;

  await clearSyncInProgressNotification();

  await notifeePkg.default.displayNotification({
    id: `epsea-sync-result-${Date.now()}`,
    title,
    body,
    android: {
      channelId: SYNC_CHANNEL_ID,
    },
  });
}

export async function notifySyncSucceeded(): Promise<void> {
  await scheduleSyncResultNotification(
    "Sincronización completada",
    "Los datos se descargaron correctamente. Ya puede continuar en EPSEA.",
  );
}

export async function notifySyncFailed(message: string): Promise<void> {
  await scheduleSyncResultNotification(
    "Error de sincronización",
    message.length > 180 ? `${message.slice(0, 177)}…` : message,
  );
}
