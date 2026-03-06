import { create } from "zustand";
import { Producer, ProducerDetail } from "../schemas/producer";
import { apiFetch } from "@/utils/api";
import {
  upsertProducers,
  getProducersByProject,
  upsertProducerDetail,
  getProducerDetail as getProducerDetailFromDb,
} from "@/utils/database/repositories/producer-repository";

interface PaginationMeta {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  limit: number;
}

interface ProducerState {
  producers: Producer[];
  producerDetail: ProducerDetail | null;
  loading: boolean;
  loadingDetail: boolean;
  error: string | null;
  searchQuery: string;
  pagination: PaginationMeta;

  fetchProducers: (
    projectId: string | number,
    page?: number,
    limit?: number,
  ) => Promise<void>;
  fetchProducerDetail: (
    producerId: string | number,
    projectId?: string | number,
  ) => Promise<void>;
  setSearchQuery: (query: string) => void;
  resetState: () => void;
}

const initialPagination: PaginationMeta = {
  currentPage: 1,
  totalPages: 1,
  totalCount: 0,
  limit: 20,
};

// Helper para obtener el ID del productor de diferentes estructuras de respuesta
const getProducerId = (producer: any): string => {
  return String(producer.producer_id ?? producer.id ?? "");
};

export const useProducerStore = create<ProducerState>((set, get) => ({
  producers: [],
  producerDetail: null,
  loading: false,
  loadingDetail: false,
  error: null,
  searchQuery: "",
  pagination: { ...initialPagination },

  fetchProducers: async (projectId, page = 1, limit = 20) => {
    set({ loading: true, error: null });
    try {
      const response = await apiFetch<any>(
        `/producer-assigned-to-extensionist/${projectId}/producers`,
        {
          method: "GET",
          params: { page, limit },
        },
      );

      let producersData: Producer[] = [];
      let totalPages = 1;
      let totalCount = 0;

      if (response?.data?.pagination) {
        const pag = response.data.pagination;
        producersData = Array.isArray(pag.items) ? pag.items : [];
        totalPages = pag.totalPages ?? pag.total_pages ?? 1;
        totalCount =
          pag.totalItems ??
          pag.total_items ??
          pag.total ??
          producersData.length;
      } else if (response?.meta) {
        producersData = Array.isArray(response.data) ? response.data : [];
        totalPages = Math.ceil((response.meta.total ?? 0) / limit);
        totalCount = response.meta.total ?? producersData.length;
      } else if (Array.isArray(response?.data)) {
        producersData = response.data;
        totalCount = producersData.length;
      } else if (Array.isArray(response)) {
        producersData = response;
        totalCount = producersData.length;
      }

      // Write-through: persist to SQLite
      try {
        await upsertProducers(producersData, projectId);
      } catch (e) {
        console.error("Failed to persist producers to SQLite:", e);
      }

      set({
        producers: producersData,
        loading: false,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
        },
      });
    } catch (error) {
      console.error("Error fetching producers:", error);

      // Fallback: read from SQLite
      try {
        const cached = await getProducersByProject(projectId);
        if (cached.length > 0) {
          set({
            producers: cached,
            loading: false,
            error: null,
            pagination: {
              currentPage: 1,
              totalPages: 1,
              totalCount: cached.length,
              limit,
            },
          });
          return;
        }
      } catch (e) {
        console.error("SQLite fallback failed:", e);
      }

      set({
        error: error instanceof Error ? error.message : "Error desconocido",
        loading: false,
        producers: [],
      });
    }
  },

  fetchProducerDetail: async (producerId, _projectId?: string | number) => {
    const currentProducers = get().producers;
    const producerIdStr = String(producerId);

    // Buscar en la lista actual usando ambos campos posibles (id o producer_id)
    const fromList = currentProducers.find(
      (p) => getProducerId(p) === producerIdStr,
    );

    // Los extensionistas no tienen acceso al endpoint de detalle de productor.
    // Usamos solo datos locales: lista en memoria o cache SQLite.

    if (fromList) {
      set({
        producerDetail: fromList as ProducerDetail,
        loadingDetail: false,
        error: null,
      });
      return;
    }

    // Si no está en la lista, intentar cargar desde SQLite
    set({ loadingDetail: true, error: null, producerDetail: null });

    try {
      const cached = await getProducerDetailFromDb(producerId);
      if (cached) {
        set({ producerDetail: cached, loadingDetail: false });
        return;
      }
    } catch (e) {
      console.error("SQLite fallback failed:", e);
    }

    // No hay datos disponibles
    set({
      error: "No se encontraron datos del productor",
      loadingDetail: false,
    });
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  resetState: () =>
    set({
      producers: [],
      producerDetail: null,
      loading: false,
      loadingDetail: false,
      error: null,
      searchQuery: "",
      pagination: { ...initialPagination },
    }),
}));
