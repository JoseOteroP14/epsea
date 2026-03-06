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
import { getPendingAnswerCount } from "@/utils/database/repositories/answer-repository";
import { useAuthStore } from "./useAuthStore";

interface SyncState {
  isDownloading: boolean;
  isUploading: boolean;
  progress: SyncProgress | null;
  pendingUploads: number;
  lastDownload: string | null;
  lastUpload: string | null;
  error: string | null;

  startDownload: () => Promise<void>;
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

  startDownload: async () => {
    set({ isDownloading: true, error: null, progress: null });
    try {
      await downloadAllData((progress) => set({ progress }));
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
      const pending = await getPendingAnswerCount(userId);
      const lastUpload = await getMetadata("last_upload");
      set({ isUploading: false, pendingUploads: pending, lastUpload });
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
      const pending = await getPendingAnswerCount(userId);
      const lastDownload = await getMetadata("last_full_download");
      const lastUpload = await getMetadata("last_upload");
      set({ pendingUploads: pending, lastDownload, lastUpload });
    } catch (error) {
      console.error("Failed to refresh sync status:", error);
    }
  },
}));
