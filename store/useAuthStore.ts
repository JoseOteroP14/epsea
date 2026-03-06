import { create } from "zustand";
import { User, USER_ROLES } from "../schemas/auth";
import {
  getStoredToken,
  setStoredToken,
  clearStoredToken,
} from "@/utils/secure-storage";
import { getDb } from "@/utils/database/client";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
  isHydrated: boolean;
  // Computed role for quick access
  currentRole: number | null;

  // Actions
  login: (userData: User, token: string) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;

  // Helpers
  isAdmin: () => boolean;
  isExtensionist: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  token: null,
  isHydrated: false,
  currentRole: null,

  login: async (user, token) => {
    const primaryRole =
      user.roles.length > 0 ? user.roles[0].role_id : null;

    // Persist token in SecureStore
    await setStoredToken(token);

    // Persist user in SQLite
    try {
      const db = getDb();
      await db.runAsync(
        `INSERT OR REPLACE INTO users (user_id, username, roles_json) VALUES (?, ?, ?)`,
        user.user_id,
        user.username,
        JSON.stringify(user.roles),
      );
    } catch (error) {
      console.error("Failed to persist user to SQLite:", error);
    }

    set({
      user,
      token,
      isAuthenticated: true,
      currentRole: primaryRole,
    });
  },

  logout: async () => {
    await clearStoredToken();

    try {
      const db = getDb();
      await db.runAsync("DELETE FROM users");
    } catch (error) {
      console.error("Failed to clear user from SQLite:", error);
    }

    set({
      user: null,
      token: null,
      isAuthenticated: false,
      currentRole: null,
    });
  },

  hydrate: async () => {
    try {
      const token = await getStoredToken();
      if (!token) {
        set({ isHydrated: true });
        return;
      }

      // Restore user from SQLite
      const db = getDb();
      const row = await db.getFirstAsync<{
        user_id: number;
        username: string;
        roles_json: string;
      }>("SELECT * FROM users LIMIT 1");

      if (row) {
        const user: User = {
          user_id: row.user_id,
          username: row.username,
          roles: JSON.parse(row.roles_json),
        };
        const primaryRole =
          user.roles.length > 0 ? user.roles[0].role_id : null;

        set({
          user,
          token,
          isAuthenticated: true,
          currentRole: primaryRole,
          isHydrated: true,
        });
      } else {
        // Token exists but no user row — clear stale token
        await clearStoredToken();
        set({ isHydrated: true });
      }
    } catch (error) {
      console.error("Auth hydration failed:", error);
      set({ isHydrated: true });
    }
  },

  isAdmin: () => get().currentRole === USER_ROLES.ADMIN,
  isExtensionist: () => get().currentRole === USER_ROLES.EXTENSIONIST,
}));
