import { create } from "zustand";
import { AppState } from "react-native";
import {
  downloadAllData,
  uploadPendingAnswers,
  type SyncProgress,
} from "@/utils/sync/sync-service";
import {
  getPendingCount,
  getMetadata,
} from "@/utils/database/repositories/sync-repository";
import { getPendingVisit1Count } from "@/utils/database/repositories/visit1-repository";
import { getPendingVisit2Count } from "@/utils/database/repositories/visit2-repository";
import { getPendingVisit3Count } from "@/utils/database/repositories/visit3-repository";
import { getPendingAnswerUpdateCount } from "@/utils/database/repositories/answer-update-repository";
import { runWithBackgroundSyncService } from "@/utils/sync/background-sync-runner";
import {
  isForegroundServiceStartNotAllowedError,
  waitForSyncForegroundServiceIdle,
} from "@/utils/sync/sync-foreground-service";
import {
  abortActiveDownloadSession,
  beginDownloadSession,
  hasIncompleteDownloadCheckpoint,
  isDownloadSessionAbortedError,
  loadDownloadResultsCheckpoint,
} from "@/utils/sync/sync-download-session";
import { useAuthStore } from "./useAuthStore";

let syncRecoverInFlight = false;
let lastSyncRecoverAt = 0;
let resumeIncompleteInFlight = false;
/** Set when stall is detected while backgrounded — resume when app is active again. */
let deferredStallRecover = false;

function humanizeSyncError(error: unknown): string {
  if (isForegroundServiceStartNotAllowedError(error)) {
    return "La sincronización se pausó en segundo plano. Vuelve a abrir EPSEA para reanudarla.";
  }
  if (error instanceof Error) return error.message;
  return "Error de sincronización";
}

export interface FullSyncResult {
  uploaded: number;
  failed: number;
  /** True si hubo subida exitosa y se intentó alinear la copia local con el servidor. */
  downloadRanAfterUpload: boolean;
  /** True si la copia local se actualizó (descarga global o refresco selectivo). */
  downloadCompleted: boolean;
  /** True si se ejecutó `downloadAllData` (proyectos, todos los productores y resultados). */
  fullDownloadRan: boolean;
  /** True si solo se refrescaron productores/métodos tocados tras la subida. */
  selectiveRefreshRan: boolean;
}

async function countPendingUploads(userId: number | undefined): Promise<number> {
  if (userId == null) return 0;
  const pendingSurvey = await getPendingCount(userId);
  const pendingVisit1 = await getPendingVisit1Count(userId);
  const pendingVisit2 = await getPendingVisit2Count(userId);
  const pendingVisit3 = await getPendingVisit3Count(userId);
  const pendingAnswerUpdates = await getPendingAnswerUpdateCount(userId);
  return (
    pendingSurvey +
    pendingVisit1 +
    pendingVisit2 +
    pendingVisit3 +
    pendingAnswerUpdates
  );
}

interface SyncState {
  isDownloading: boolean;
  isUploading: boolean;
  progress: SyncProgress | null;
  lastProgressAt: number | null;
  pendingUploads: number;
  lastDownload: string | null;
  lastUpload: string | null;
  error: string | null;

  startDownload: (externalProgressCallback?: (p: SyncProgress) => void) => Promise<void>;
  /** Descarga sin bloquear al llamador; útil tras login o al salir de la pantalla de sync. */
  startDownloadDetached: () => boolean;
  /** Reanuda la cola de productores si Android pausó el hilo JS en segundo plano. */
  recoverStalledDownload: () => Promise<boolean>;
  /**
   * Tras matar el proceso o reiniciar: si quedó un checkpoint incompleto en SQLite,
   * reanuda la descarga bajo el foreground service.
   */
  resumeIncompleteDownloadIfNeeded: () => Promise<boolean>;
  startUpload: () => Promise<{ uploaded: number; failed: number }>;
  /** Sube pendientes primero (si hay); luego descarga. Evita descargar antes y pisar trabajo offline. */
  startFullSync: () => Promise<FullSyncResult>;
  /** Igual que startFullSync pero no bloquea al llamador. */
  startFullSyncDetached: () => boolean;
  refreshStatus: () => Promise<void>;
}

function applySyncProgress(
  set: (partial: Partial<SyncState>) => void,
  progress: SyncProgress,
  external?: (p: SyncProgress) => void,
): void {
  set({ progress, lastProgressAt: Date.now() });
  external?.(progress);
}

async function runDownloadUnderBackgroundService(
  set: (partial: Partial<SyncState>) => void,
  get: () => SyncState,
  generation: number,
  options: { resumeResultsOnly?: boolean },
  externalProgressCallback?: (p: SyncProgress) => void,
): Promise<"completed" | "aborted"> {
  try {
    await runWithBackgroundSyncService(
      async (reportProgress) => {
        await downloadAllData(
          (progress) => {
            applySyncProgress(set, progress, externalProgressCallback);
            reportProgress(progress);
          },
          { generation, resumeResultsOnly: options.resumeResultsOnly },
        );
      },
      { onStallRecover: () => void get().recoverStalledDownload() },
    );
    return "completed";
  } catch (error) {
    if (isDownloadSessionAbortedError(error)) {
      return "aborted";
    }
    throw error;
  }
}

export const useSyncStore = create<SyncState>((set, get) => ({
  isDownloading: false,
  isUploading: false,
  progress: null,
  lastProgressAt: null,
  pendingUploads: 0,
  lastDownload: null,
  lastUpload: null,
  error: null,

  startDownload: async (externalProgressCallback) => {
    const generation = beginDownloadSession();
    set({
      isDownloading: true,
      error: null,
      progress: null,
      lastProgressAt: Date.now(),
    });
    try {
      const outcome = await runDownloadUnderBackgroundService(
        set,
        get,
        generation,
        {},
        externalProgressCallback,
      );

      if (outcome === "aborted") {
        // Recover owns the download; do not clear isDownloading or notify success.
        if (syncRecoverInFlight || get().isDownloading) {
          return;
        }
        set({ isDownloading: false, lastProgressAt: null });
        return;
      }

      const lastDownload = await getMetadata("last_full_download");
      set({ isDownloading: false, lastDownload, lastProgressAt: null });
    } catch (error) {
      set({
        isDownloading: false,
        lastProgressAt: null,
        error: humanizeSyncError(error),
      });
      throw error;
    }
  },

  recoverStalledDownload: async () => {
    const { isDownloading, isUploading } = get();
    if (!isDownloading || isUploading || syncRecoverInFlight) {
      return false;
    }

    const now = Date.now();
    if (now - lastSyncRecoverAt < 8_000) {
      return false;
    }

    const { index, queue } = await loadDownloadResultsCheckpoint();
    if (queue.length === 0 || index >= queue.length) {
      return false;
    }

    const lastProgressAt = get().lastProgressAt;
    const forceDeferred =
      deferredStallRecover && AppState.currentState === "active";
    if (
      !forceDeferred &&
      lastProgressAt != null &&
      now - lastProgressAt < 15_000
    ) {
      return false;
    }

    // Critical: do NOT abort + restart FGS while backgrounded (Android 12+ blocks it).
    // Keep the existing service running; resume only when the user returns.
    if (AppState.currentState !== "active") {
      deferredStallRecover = true;
      console.warn(
        "[sync] Stall while backgrounded — deferring recover until app is active",
      );
      return false;
    }

    lastSyncRecoverAt = now;
    syncRecoverInFlight = true;
    deferredStallRecover = false;

    // App is in foreground: safe to abort hung session and start a new FGS.
    const generation = abortActiveDownloadSession();

    set({
      error: null,
      isDownloading: true,
      progress: {
        stage: `Reanudando descarga (${index + 1} de ${queue.length})…`,
        current: Math.round((index / Math.max(queue.length, 1)) * 100),
        total: 100,
      },
      lastProgressAt: now,
    });

    void (async () => {
      try {
        await waitForSyncForegroundServiceIdle(25_000);

        // Re-check: user may have backgrounded again while waiting.
        if (AppState.currentState !== "active") {
          deferredStallRecover = true;
          return;
        }

        const outcome = await runDownloadUnderBackgroundService(
          set,
          get,
          generation,
          { resumeResultsOnly: true },
        );

        if (outcome === "aborted") {
          return;
        }

        const lastDownload = await getMetadata("last_full_download");
        set({ isDownloading: false, lastDownload, lastProgressAt: null });
      } catch (error) {
        if (isForegroundServiceStartNotAllowedError(error)) {
          deferredStallRecover = true;
          // Do not bump lastProgressAt — keep stalled so returning to the app retries.
          set({
            error: humanizeSyncError(error),
          });
          return;
        }
        set({
          isDownloading: false,
          lastProgressAt: null,
          error: humanizeSyncError(error),
        });
      } finally {
        syncRecoverInFlight = false;
      }
    })();

    return true;
  },

  resumeIncompleteDownloadIfNeeded: async () => {
    const { isDownloading, isUploading } = get();
    if (
      isDownloading ||
      isUploading ||
      syncRecoverInFlight ||
      resumeIncompleteInFlight
    ) {
      return false;
    }

    const user = useAuthStore.getState().user;
    if (!user) return false;

    if (!(await hasIncompleteDownloadCheckpoint())) return false;

    resumeIncompleteInFlight = true;
    const { index, queue } = await loadDownloadResultsCheckpoint();
    const generation = beginDownloadSession();

    set({
      isDownloading: true,
      error: null,
      progress: {
        stage: `Reanudando descarga pendiente (${index + 1} de ${queue.length})…`,
        current: Math.round((index / Math.max(queue.length, 1)) * 100),
        total: 100,
      },
      lastProgressAt: Date.now(),
    });

    try {
      const outcome = await runDownloadUnderBackgroundService(set, get, generation, {
        resumeResultsOnly: true,
      });

      if (outcome === "aborted") {
        if (syncRecoverInFlight || get().isDownloading) return true;
        set({ isDownloading: false, lastProgressAt: null });
        return true;
      }

      const lastDownload = await getMetadata("last_full_download");
      set({ isDownloading: false, lastDownload, lastProgressAt: null });
      return true;
    } catch (error) {
      set({
        isDownloading: false,
        lastProgressAt: null,
        error: humanizeSyncError(error),
      });
      return false;
    } finally {
      resumeIncompleteInFlight = false;
    }
  },

  startDownloadDetached: () => {
    const { isDownloading, isUploading, startDownload } = get();
    if (isDownloading || isUploading) return false;
    void startDownload().catch(() => {});
    return true;
  },

  startUpload: async () => {
    set({
      isUploading: true,
      error: null,
      progress: null,
      lastProgressAt: Date.now(),
    });
    try {
      const userId = useAuthStore.getState().user?.user_id;
      let result = { uploaded: 0, failed: 0 };
      await runWithBackgroundSyncService(async (reportProgress) => {
        result = await uploadPendingAnswers((progress) => {
          applySyncProgress(set, progress);
          reportProgress(progress);
        });
      });
      const pendingSurvey = await getPendingCount(userId);
      const pendingVisit1 = await getPendingVisit1Count(userId);
      const pendingVisit2 = await getPendingVisit2Count(userId);
      const pendingVisit3 = await getPendingVisit3Count(userId);
      const pendingAnswerUpdates = await getPendingAnswerUpdateCount(userId);
      const lastUpload = await getMetadata("last_upload");
      set({
        isUploading: false,
        pendingUploads:
          pendingSurvey +
          pendingVisit1 +
          pendingVisit2 +
          pendingVisit3 +
          pendingAnswerUpdates,
        lastUpload,
        lastProgressAt: null,
      });
      return result;
    } catch (error) {
      set({
        isUploading: false,
        lastProgressAt: null,
        error: humanizeSyncError(error),
      });
      throw error;
    }
  },

  startFullSync: async () => {
    const userId = useAuthStore.getState().user?.user_id;
    set({
      error: null,
      progress: null,
      isDownloading: false,
      isUploading: false,
    });

    const pending = await countPendingUploads(userId);
    set({ pendingUploads: pending });

    let uploaded = 0;
    let failed = 0;
    let downloadRanAfterUpload = false;
    let downloadCompleted = false;
    let fullDownloadRan = false;
    let selectiveRefreshRan = false;

    const generation = beginDownloadSession();

    try {
      await runWithBackgroundSyncService(
        async (reportProgress) => {
          if (pending > 0) {
            set({ isUploading: true, progress: null, lastProgressAt: Date.now() });
            const result = await uploadPendingAnswers((progress) => {
              applySyncProgress(set, progress);
              reportProgress(progress);
            });
            uploaded = result.uploaded;
            failed = result.failed;
            const newPending = await countPendingUploads(userId);
            const lastUpload = await getMetadata("last_upload");
            set({
              isUploading: false,
              pendingUploads: newPending,
              lastUpload,
            });

            if (failed > 0) {
              const msg = `${failed} envío(s) con error. No se ejecutó la descarga para no sobrescribir datos locales que siguen pendientes.`;
              set({ error: msg });
              throw new Error(msg);
            }

            if (uploaded > 0) {
              downloadRanAfterUpload = true;
              downloadCompleted = true;
              selectiveRefreshRan = true;
              const lastDownload = await getMetadata("last_full_download");
              set({ lastDownload });
              return;
            }
          }

          set({ isDownloading: true, progress: null, lastProgressAt: Date.now() });
          try {
            await downloadAllData(
              (progress) => {
                applySyncProgress(set, progress);
                reportProgress(progress);
              },
              { generation },
            );
          } catch (error) {
            if (isDownloadSessionAbortedError(error)) {
              // Recover will continue; keep isDownloading true.
              throw error;
            }
            throw error;
          }

          const lastDownload = await getMetadata("last_full_download");
          const newPending = await countPendingUploads(userId);
          set({
            isDownloading: false,
            lastDownload,
            pendingUploads: newPending,
            lastProgressAt: null,
          });
          downloadCompleted = true;
          fullDownloadRan = true;
        },
        { onStallRecover: () => void get().recoverStalledDownload() },
      );
    } catch (error) {
      if (isDownloadSessionAbortedError(error)) {
        // Stall recover owns the download — do not flip to idle/success.
        if (!syncRecoverInFlight) {
          set({ isUploading: false, isDownloading: false, lastProgressAt: null });
        } else {
          set({ isUploading: false });
        }
        return {
          uploaded,
          failed,
          downloadRanAfterUpload,
          downloadCompleted: false,
          fullDownloadRan: false,
          selectiveRefreshRan,
        };
      }

      set({ isUploading: false, isDownloading: false, lastProgressAt: null });
      if (!get().error) {
        set({
          error: humanizeSyncError(error),
        });
      }
      throw error;
    }

    return {
      uploaded,
      failed,
      downloadRanAfterUpload,
      downloadCompleted,
      fullDownloadRan,
      selectiveRefreshRan,
    };
  },

  startFullSyncDetached: () => {
    const { isDownloading, isUploading, startFullSync } = get();
    if (isDownloading || isUploading) return false;
    void startFullSync().catch(() => {});
    return true;
  },

  refreshStatus: async () => {
    try {
      const userId = useAuthStore.getState().user?.user_id;
      const pendingSurvey = await getPendingCount(userId);
      const pendingVisit1 = await getPendingVisit1Count(userId);
      const pendingVisit2 = await getPendingVisit2Count(userId);
      const pendingVisit3 = await getPendingVisit3Count(userId);
      const pendingAnswerUpdates = await getPendingAnswerUpdateCount(userId);
      const lastDownload = await getMetadata("last_full_download");
      const lastUpload = await getMetadata("last_upload");
      set({
        pendingUploads:
          pendingSurvey +
          pendingVisit1 +
          pendingVisit2 +
          pendingVisit3 +
          pendingAnswerUpdates,
        lastDownload,
        lastUpload,
      });
    } catch (error) {
      console.error("Failed to refresh sync status:", error);
    }
  },
}));
