import { create } from "zustand";
import { User, USER_ROLES } from "../schemas/auth";

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    token: string | null;
    // Computed role for quick access
    currentRole: number | null;

    // Actions
    login: (userData: User, token: string) => void;
    logout: () => void;

    // Helpers
    isAdmin: () => boolean;
    isExtensionist: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    isAuthenticated: false,
    token: null,
    currentRole: null,

    login: (user, token) => {
        // Assuming the first role is the primary one for this session context
        const primaryRole = user.roles.length > 0 ? user.roles[0].role_id : null;
        set({
            user,
            token,
            isAuthenticated: true,
            currentRole: primaryRole,
        });
    },

    logout: () => set({
        user: null,
        token: null,
        isAuthenticated: false,
        currentRole: null
    }),

    isAdmin: () => get().currentRole === USER_ROLES.ADMIN,
    isExtensionist: () => get().currentRole === USER_ROLES.EXTENSIONIST,
}));
