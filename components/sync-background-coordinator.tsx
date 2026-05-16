import { useSyncStore } from "@/store/useSyncStore";
import { isBackgroundSyncServiceRunning } from "@/utils/sync/background-sync-runner";
import {
  configureSyncNotifications,
  ensureSyncNotificationPermissions,
  isAppInBackground,
  notifySyncFailed,
  notifySyncSucceeded,
  showSyncInProgressNotification,
} from "@/utils/sync/sync-notifications";
import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

/**
 * Observa sincronizaciones en curso y, si el usuario deja la app en segundo plano,
 * muestra notificaciones de progreso y de resultado al terminar.
 */
export function SyncBackgroundCoordinator() {
  const isDownloading = useSyncStore((s) => s.isDownloading);
  const isUploading = useSyncStore((s) => s.isUploading);
  const error = useSyncStore((s) => s.error);
  const lastProgressAt = useSyncStore((s) => s.lastProgressAt);
  const recoverStalledDownload = useSyncStore((s) => s.recoverStalledDownload);

  const isBusy = isDownloading || isUploading;
  const isBusyRef = useRef(isBusy);
  const isDownloadingRef = useRef(isDownloading);
  const lastProgressAtRef = useRef(lastProgressAt);
  const recoverStalledRef = useRef(recoverStalledDownload);
  const errorRef = useRef(error);
  const wasBusyRef = useRef(false);
  const inProgressShownRef = useRef(false);

  isBusyRef.current = isBusy;
  isDownloadingRef.current = isDownloading;
  lastProgressAtRef.current = lastProgressAt;
  recoverStalledRef.current = recoverStalledDownload;
  errorRef.current = error;

  useEffect(() => {
    void configureSyncNotifications();
    void ensureSyncNotificationPermissions();
  }, []);

  useEffect(() => {
    const onAppStateChange = (next: AppStateStatus) => {
      if (
        (next === "background" || next === "inactive") &&
        isBusyRef.current &&
        !inProgressShownRef.current &&
        !isBackgroundSyncServiceRunning()
      ) {
        inProgressShownRef.current = true;
        void showSyncInProgressNotification();
        return;
      }

      if (next === "active" && isBusyRef.current && isDownloadingRef.current) {
        const at = lastProgressAtRef.current;
        const stalledFor = at != null ? Date.now() - at : 0;
        if (stalledFor >= 15_000) {
          void recoverStalledRef.current();
        }
      }
    };

    const sub = AppState.addEventListener("change", onAppStateChange);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (isBusy) {
      wasBusyRef.current = true;
      return;
    }

    if (!wasBusyRef.current) return;
    wasBusyRef.current = false;

    inProgressShownRef.current = false;

    if (!isAppInBackground()) return;

    const syncError = errorRef.current;
    if (syncError) {
      void notifySyncFailed(syncError);
    } else {
      void notifySyncSucceeded();
    }
  }, [isBusy]);

  return null;
}
