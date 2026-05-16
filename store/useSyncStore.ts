import { create } from "zustand";
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
import { getPendingAnswerUpdateCount } from "@/utils/database/repositories/answer-update-repository";
import { runWithBackgroundSyncService } from "@/utils/sync/background-sync-runner";
import { useAuthStore } from "./useAuthStore";

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
  const pendingAnswerUpdates = await getPendingAnswerUpdateCount(userId);
  return pendingSurvey + pendingVisit1 + pendingVisit2 + pendingAnswerUpdates;
}

interface SyncState {
  isDownloading: boolean;
  isUploading: boolean;
  progress: SyncProgress | null;
  pendingUploads: number;
  lastDownload: string | null;
  lastUpload: string | null;
  error: string | null;

  startDownload: (externalProgressCallback?: (p: SyncProgress) => void) => Promise<void>;
  /** Descarga sin bloquear al llamador; útil tras login o al salir de la pantalla de sync. */
  startDownloadDetached: () => boolean;
  startUpload: () => Promise<{ uploaded: number; failed: number }>;
  /** Sube pendientes primero (si hay); luego descarga. Evita descargar antes y pisar trabajo offline. */
  startFullSync: () => Promise<FullSyncResult>;
  /** Igual que startFullSync pero no bloquea al llamador. */
  startFullSyncDetached: () => boolean;
  refreshStatus: () => Promise<void>;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  isDownloading: false,
  isUploading: false,
  progress: null,
  pendingUploads: 0,
  lastDownload: null,
  lastUpload: null,
  error: null,

  startDownload: async (externalProgressCallback) => {
    set({ isDownloading: true, error: null, progress: null });
    try {
      await runWithBackgroundSyncService(async (reportProgress) => {
        await downloadAllData((progress) => {
          set({ progress });
          externalProgressCallback?.(progress);
          reportProgress(progress);
        });
      });
      const lastDownload = await getMetadata("last_full_download");
      set({ isDownloading: false, lastDownload });
    } catch (error) {
      set({
        isDownloading: false,
        error: error instanceof Error ? error.message : "Error de descarga",
      });
      throw error;
    }
  },

  startDownloadDetached: () => {
    const { isDownloading, isUploading, startDownload } = get();
    if (isDownloading || isUploading) return false;
    void startDownload().catch(() => {});
    return true;
  },

  startUpload: async () => {
    set({ isUploading: true, error: null, progress: null });
    try {
      const userId = useAuthStore.getState().user?.user_id;
      const result = await uploadPendingAnswers((progress) =>
        set({ progress }),
      );
      const pendingSurvey = await getPendingCount(userId);
      const pendingVisit1 = await getPendingVisit1Count(userId);
      const pendingVisit2 = await getPendingVisit2Count(userId);
      const pendingAnswerUpdates = await getPendingAnswerUpdateCount(userId);
      const lastUpload = await getMetadata("last_upload");
      set({
        isUploading: false,
        pendingUploads:
          pendingSurvey + pendingVisit1 + pendingVisit2 + pendingAnswerUpdates,
        lastUpload,
      });
      return result;
    } catch (error) {
      set({
        isUploading: false,
        error: error instanceof Error ? error.message : "Error de subida",
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

    try {
      await runWithBackgroundSyncService(async (reportProgress) => {
        if (pending > 0) {
          set({ isUploading: true, progress: null });
          const result = await uploadPendingAnswers((progress) => {
            set({ progress });
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

        set({ isDownloading: true, progress: null });
        await downloadAllData((progress) => {
          set({ progress });
          reportProgress(progress);
        });
        const lastDownload = await getMetadata("last_full_download");
        const newPending = await countPendingUploads(userId);
        set({
          isDownloading: false,
          lastDownload,
          pendingUploads: newPending,
        });
        downloadCompleted = true;
        fullDownloadRan = true;
      });
    } catch (error) {
      set({ isUploading: false, isDownloading: false });
      if (!get().error) {
        set({
          error:
            error instanceof Error ? error.message : "Error de sincronización",
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
      const pendingAnswerUpdates = await getPendingAnswerUpdateCount(userId);
      const lastDownload = await getMetadata("last_full_download");
      const lastUpload = await getMetadata("last_upload");
      set({
        pendingUploads:
          pendingSurvey + pendingVisit1 + pendingVisit2 + pendingAnswerUpdates,
        lastDownload,
        lastUpload,
      });
    } catch (error) {
      console.error("Failed to refresh sync status:", error);
    }
  },
}));
