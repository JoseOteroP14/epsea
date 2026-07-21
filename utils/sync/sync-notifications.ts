import { isRunningInExpoGo } from "expo";
import { AppState, Platform } from "react-native";

const SYNC_CHANNEL_ID = "epsea-sync";

let inProgressNotificationId: string | null = null;
type NotificationsModule = typeof import("expo-notifications");
let notificationsPromise: Promise<NotificationsModule> | null = null;

async function getNotifications(): Promise<NotificationsModule | null> {
  if (isRunningInExpoGo()) return null;
  notificationsPromise ??= import("expo-notifications");
  return notificationsPromise;
}

export function isAppInBackground(): boolean {
  const state = AppState.currentState;
  return state === "background" || state === "inactive";
}

export async function configureSyncNotifications(): Promise<void> {
  const Notifications = await getNotifications();
  if (!Notifications) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(SYNC_CHANNEL_ID, {
      name: "Sincronización",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
}

export async function ensureSyncNotificationPermissions(): Promise<boolean> {
  const Notifications = await getNotifications();
  if (!Notifications) return false;

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function showSyncInProgressNotification(): Promise<void> {
  const Notifications = await getNotifications();
  if (!Notifications) return;

  const allowed = await ensureSyncNotificationPermissions();
  if (!allowed) return;

  if (inProgressNotificationId) return;

  inProgressNotificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: "EPSEA",
      body: "Sincronizando datos… Puede usar otras aplicaciones.",
      ...(Platform.OS === "android"
        ? { channelId: SYNC_CHANNEL_ID, sticky: true }
        : {}),
    },
    trigger: null,
  });
}

export async function clearSyncInProgressNotification(): Promise<void> {
  if (!inProgressNotificationId) return;
  const Notifications = await getNotifications();
  if (!Notifications) {
    inProgressNotificationId = null;
    return;
  }

  try {
    await Notifications.dismissNotificationAsync(inProgressNotificationId);
  } catch {
    // Notification may already be dismissed
  }
  inProgressNotificationId = null;
}

async function scheduleSyncResultNotification(
  title: string,
  body: string,
): Promise<void> {
  const Notifications = await getNotifications();
  if (!Notifications) return;

  const allowed = await ensureSyncNotificationPermissions();
  if (!allowed) return;

  await clearSyncInProgressNotification();

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      ...(Platform.OS === "android" ? { channelId: SYNC_CHANNEL_ID } : {}),
    },
    trigger: null,
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
