import { useAuthStore } from "@/store/useAuthStore";
import { useSyncStore } from "@/store/useSyncStore";
import { isBackgroundSyncServiceRunning } from "@/utils/sync/background-sync-runner";
import { hasIncompleteDownloadCheckpoint } from "@/utils/sync/sync-download-session";
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
 * También reanuda descargas incompletas tras matar el proceso / reiniciar.
 */
export function SyncBackgroundCoordinator() {
  const isDownloading = useSyncStore((s) => s.isDownloading);
  const isUploading = useSyncStore((s) => s.isUploading);
  const error = useSyncStore((s) => s.error);
  const lastProgressAt = useSyncStore((s) => s.lastProgressAt);
  const recoverStalledDownload = useSyncStore((s) => s.recoverStalledDownload);
  const resumeIncompleteDownloadIfNeeded = useSyncStore(
    (s) => s.resumeIncompleteDownloadIfNeeded,
  );
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const user = useAuthStore((s) => s.user);

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

  // Cold-start / process-death resume once auth + DB are ready.
  useEffect(() => {
    if (!isHydrated || !user) return;
    void resumeIncompleteDownloadIfNeeded();
  }, [isHydrated, user, resumeIncompleteDownloadIfNeeded]);

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

      // If we returned to the app idle but a checkpoint remains, resume.
      if (next === "active" && !isBusyRef.current) {
        void (async () => {
          if (await hasIncompleteDownloadCheckpoint()) {
            await useSyncStore.getState().resumeIncompleteDownloadIfNeeded();
          }
        })();
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
      return;
    }

    // Never announce success if a producer queue is still pending in SQLite.
    void (async () => {
      if (await hasIncompleteDownloadCheckpoint()) {
        void notifySyncFailed(
          "La sincronización quedó incompleta. Ábrela de nuevo para reanudarla.",
        );
        return;
      }
      void notifySyncSucceeded();
    })();
  }, [isBusy]);

  return null;
}
