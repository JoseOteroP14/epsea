import { API_BASE_URL } from "@/utils/api-config";
import { getDb } from "@/utils/database/client";
import {
    clearStoredToken,
    getStoredToken,
    setStoredToken,
} from "@/utils/secure-storage";
import { create } from "zustand";
import { User, USER_ROLES } from "../schemas/auth";

const BASE_URL = API_BASE_URL;

function normalizeName(value?: string | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length > 0 ? cleaned : undefined;
}

async function enrichUserNames(user: User, token: string): Promise<User> {
  const currentFirstName = normalizeName(user.first_name);
  const currentLastName = normalizeName(user.last_name);

  if (currentFirstName && currentLastName) {
    return {
      ...user,
      first_name: currentFirstName,
      last_name: currentLastName,
    };
  }

  try {
    const response = await fetch(`${BASE_URL}/users/${user.user_id}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return user;
    }

    const payload = await response.json().catch(() => null);
    const data = payload?.data ?? payload;

    const first_name =
      normalizeName(data?.first_name) ??
      normalizeName(data?.firstName) ??
      currentFirstName;
    const last_name =
      normalizeName(data?.last_name) ??
      normalizeName(data?.lastName) ??
      currentLastName;

    return {
      ...user,
      first_name,
      last_name,
    };
  } catch {
    return user;
  }
}

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
    const normalizedUser: User = {
      ...user,
      first_name: normalizeName(user.first_name),
      last_name: normalizeName(user.last_name),
    };

    const enrichedUser = await enrichUserNames(normalizedUser, token);
    const primaryRole =
      enrichedUser.roles.length > 0 ? enrichedUser.roles[0].role_id : null;

    // Persist token in SecureStore
    await setStoredToken(token);

    // Persist user in SQLite
    try {
      const db = getDb();
      await db.runAsync(
        `INSERT OR REPLACE INTO users (user_id, username, first_name, last_name, roles_json) VALUES (?, ?, ?, ?, ?)`,
        enrichedUser.user_id,
        enrichedUser.username,
        enrichedUser.first_name ?? null,
        enrichedUser.last_name ?? null,
        JSON.stringify(enrichedUser.roles),
      );
    } catch (error) {
      console.error("Failed to persist user to SQLite:", error);
    }

    set({
      user: enrichedUser,
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
        first_name: string | null;
        last_name: string | null;
        roles_json: string;
      }>("SELECT * FROM users LIMIT 1");

      if (row) {
        const hydratedUser: User = {
          user_id: row.user_id,
          username: row.username,
          first_name: row.first_name ?? undefined,
          last_name: row.last_name ?? undefined,
          roles: JSON.parse(row.roles_json),
        };
        const user = await enrichUserNames(hydratedUser, token);
        const hasCompleteName =
          !!normalizeName(user.first_name) && !!normalizeName(user.last_name);

        // If this persisted session has no resolvable name, force re-auth so
        // /auth/login can provide first_name/last_name and the Home header
        // does not remain stuck on the generic fallback.
        if (!hasCompleteName) {
          await clearStoredToken();
          try {
            await db.runAsync("DELETE FROM users");
          } catch (error) {
            console.error("Failed to clear users after missing profile names:", error);
          }

          set({
            user: null,
            token: null,
            isAuthenticated: false,
            currentRole: null,
            isHydrated: true,
          });
          return;
        }

        const primaryRole =
          user.roles.length > 0 ? user.roles[0].role_id : null;

        // Persist names if they were completed from remote profile
        if (
          user.first_name !== hydratedUser.first_name ||
          user.last_name !== hydratedUser.last_name
        ) {
          try {
            await db.runAsync(
              `UPDATE users SET first_name = ?, last_name = ? WHERE user_id = ?`,
              user.first_name ?? null,
              user.last_name ?? null,
              user.user_id,
            );
          } catch (error) {
            console.error("Failed to update hydrated user names:", error);
          }
        }

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
