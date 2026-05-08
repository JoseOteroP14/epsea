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
import { useAuthStore } from "./useAuthStore";

interface SyncState {
  isDownloading: boolean;
  isUploading: boolean;
  progress: SyncProgress | null;
  pendingUploads: number;
  lastDownload: string | null;
  lastUpload: string | null;
  error: string | null;

  startDownload: (externalProgressCallback?: (p: SyncProgress) => void) => Promise<void>;
  startUpload: () => Promise<{ uploaded: number; failed: number }>;
  refreshStatus: () => Promise<void>;
}

export const useSyncStore = create<SyncState>((set) => ({
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
      await downloadAllData((progress) => {
        set({ progress });
        externalProgressCallback?.(progress);
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
