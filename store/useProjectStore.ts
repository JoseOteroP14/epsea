import { create } from "zustand";
import { Project } from "../schemas/project";

interface ProjectState {
    projects: Project[];
    loading: boolean;
    fetchProjects: () => Promise<void>;
    addProject: (project: Partial<Project>) => void;
    removeProject: (id: number) => void;
    setProjects: (projects: Project[]) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
    projects: [
        {
            id: 1,
            nombre: "Rediseño de App",
            id_mga: "2024-001",
            municipios: "Cali, Palmira",
            id_tipo_proyecto: "S/N",
        } as Project,
        {
            id: 2,
            nombre: "Integración de Zustand",
            id_mga: "2024-002",
            municipios: "Buga",
            id_tipo_proyecto: "S/N",
        } as Project,
    ],
    loading: false,
    fetchProjects: async () => {
        set({ loading: true });
        try {
            // Mock delay
            await new Promise(resolve => setTimeout(resolve, 500));
        } finally {
            set({ loading: false });
        }
    },
    addProject: (project) => {
        set((state) => ({
            projects: [...state.projects, { ...project, id: Math.floor(Math.random() * 1000) } as Project],
        }));
    },
    removeProject: (id) =>
        set((state) => ({
            projects: state.projects.filter((p) => p.id !== id),
        })),
    setProjects: (projects) => set({ projects }),
}));
