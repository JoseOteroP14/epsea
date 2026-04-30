import { apiFetch } from "@/utils/api";
import {
    getAllProjects,
    upsertProjects,
} from "@/utils/database/repositories/project-repository";
import { create } from "zustand";
import { Project } from "../schemas/project";
import { useAuthStore } from "./useAuthStore";

export interface ProjectStats {
  totalProducers: number;
  characterizedProducers: number;
  loading: boolean;
}

interface ProjectState {
  projects: Project[];
  projectStats: Record<number, ProjectStats>;
  loading: boolean;
  error: string | null;
  fetchProjects: () => Promise<void>;
  fetchProjectStats: (projectId: number) => Promise<void>;
  addProject: (project: Partial<Project>) => void;
  removeProject: (id: number) => void;
  setProjects: (projects: Project[]) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  projectStats: {},
  loading: false,
  error: null,

  fetchProjects: async () => {
    set({ loading: true, error: null });
    try {
      const { user } = useAuthStore.getState();

      if (!user) {
        set({ projects: [], loading: false });
        return;
      }

      // Obtener todos los proyectos del extensionista
      const response = await apiFetch<any>(`/users/${user.user_id}/projects`, {
        method: "GET",
      });

      // Manejar diferentes estructuras de respuesta
      let projects: Project[] = [];

      if (Array.isArray(response)) {
        projects = response;
      } else if (response?.data && Array.isArray(response.data)) {
        projects = response.data;
      } else if (
        response?.data?.pagination?.items &&
        Array.isArray(response.data.pagination.items)
      ) {
        projects = response.data.pagination.items;
      } else if (
        response?.data?.projects &&
        Array.isArray(response.data.projects)
      ) {
        projects = response.data.projects;
      } else if (
        response?.pagination?.items &&
        Array.isArray(response.pagination.items)
      ) {
        projects = response.pagination.items;
      }

      // Write-through: persist to SQLite
      try {
        await upsertProjects(projects);
      } catch (e) {
        console.error("Failed to persist projects to SQLite:", e);
      }

      set({ projects, loading: false });

      // Fetch stats for each project in parallel
      projects.forEach((project) => {
        if (project.id) {
          get().fetchProjectStats(project.id);
        }
      });
    } catch (error) {
      console.error("Error fetching projects:", error);

      // Fallback: read from SQLite
      try {
        const cached = await getAllProjects();
        if (cached.length > 0) {
          set({ projects: cached, loading: false, error: null });
          cached.forEach((project) => {
            if (project.id) {
              get().fetchProjectStats(project.id);
            }
          });
          return;
        }
      } catch (e) {
        console.error("SQLite fallback failed:", e);
      }

      set({
        error: error instanceof Error ? error.message : "Error desconocido",
        loading: false,
        projects: [],
      });
    }
  },

  fetchProjectStats: async (projectId: number) => {
    // Set loading state for this project's stats
    set((state) => ({
      projectStats: {
        ...state.projectStats,
        [projectId]: {
          ...(state.projectStats[projectId] || {
            totalProducers: 0,
            characterizedProducers: 0,
          }),
          loading: true,
        },
      },
    }));

    try {
      // Fetch producers with limit=1 to get total count from meta
      const response = await apiFetch<any>(
        `/producer-assigned-to-extensionist/${projectId}/producers`,
        {
          method: "GET",
          params: { page: 1, limit: 1 },
        },
      );

      let totalProducers = 0;
      let characterizedProducers = 0;

      const toNumber = (value: unknown): number | null => {
        if (value === null || value === undefined) return null;
        const num = Number(value);
        return Number.isFinite(num) ? num : null;
      };

      const extractTotal = (payload: any): number | null =>
        toNumber(payload?.meta?.total) ??
        toNumber(payload?.data?.meta?.total) ??
        toNumber(payload?.data?.pagination?.totalItems) ??
        toNumber(payload?.data?.pagination?.total_items) ??
        toNumber(payload?.data?.pagination?.total) ??
        toNumber(payload?.pagination?.total) ??
        toNumber(payload?.pagination?.total_items) ??
        toNumber(payload?.pagination?.totalItems);

      const totalFromResponse = extractTotal(response);

      // Extract total count from different response structures
      if (totalFromResponse !== null) {
        totalProducers = totalFromResponse;
      } else if (Array.isArray(response?.data)) {
        // If no pagination, we need to get all to count
        const fullResponse = await apiFetch<any>(
          `/producer-assigned-to-extensionist/${projectId}/producers`,
          { method: "GET" },
        );
        totalProducers = Array.isArray(fullResponse?.data)
          ? fullResponse.data.length
          : Array.isArray(fullResponse)
            ? fullResponse.length
            : 0;
      } else if (Array.isArray(response)) {
        totalProducers = response.length;
      }

      // Try to get characterization stats if available
      try {
        const fullProducersResponse = await apiFetch<any>(
          `/producer-assigned-to-extensionist/${projectId}/producers`,
          { method: "GET" },
        );

        let producers: any[] = [];
        if (Array.isArray(fullProducersResponse?.data)) {
          producers = fullProducersResponse.data;
        } else if (Array.isArray(fullProducersResponse)) {
          producers = fullProducersResponse;
        } else if (fullProducersResponse?.data?.pagination?.items) {
          producers = fullProducersResponse.data.pagination.items;
        }

        const fullTotalFromResponse = extractTotal(fullProducersResponse);
        const hasPagination = Boolean(
          fullProducersResponse?.data?.pagination ||
            fullProducersResponse?.pagination ||
            fullProducersResponse?.meta ||
            fullProducersResponse?.data?.meta,
        );

        // Count characterized producers based on is_characterized field if it exists
        characterizedProducers = producers.filter(
          (p: any) =>
            p.is_characterized === true ||
            p.characterized === true ||
            p.characterization_completed === true ||
            p.has_characterization === true,
        ).length;

        // Only override total when we can confirm a full list or explicit total
        if (totalFromResponse === null && fullTotalFromResponse !== null) {
          totalProducers = fullTotalFromResponse;
        } else if (
          totalFromResponse === null &&
          fullTotalFromResponse === null &&
          !hasPagination &&
          producers.length > 0
        ) {
          totalProducers = producers.length;
        }
      } catch {
        // Characterization data not available, keep as 0
        characterizedProducers = 0;
      }

      set((state) => ({
        projectStats: {
          ...state.projectStats,
          [projectId]: {
            totalProducers,
            characterizedProducers,
            loading: false,
          },
        },
      }));
    } catch (error) {
      console.error(`Error fetching stats for project ${projectId}:`, error);
      set((state) => ({
        projectStats: {
          ...state.projectStats,
          [projectId]: {
            totalProducers: 0,
            characterizedProducers: 0,
            loading: false,
          },
        },
      }));
    }
  },

  addProject: (project) => {
    set((state) => ({
      projects: [
        ...state.projects,
        { ...project, id: Math.floor(Math.random() * 1000) } as Project,
      ],
    }));
  },

  removeProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
    })),

  setProjects: (projects) => set({ projects }),
}));
