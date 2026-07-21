import { useAuthStore } from "@/store/useAuthStore";
import { API_BASE_URL } from "@/utils/api-config";
import { getStoredToken } from "@/utils/secure-storage";

const BASE_URL = API_BASE_URL;

// Prevent cascading 401 logouts when multiple requests fail simultaneously
let isLoggingOut = false;

/** Distinguishable error for network failures (no connectivity). */
export class NetworkError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NetworkError";
    }
}

interface RequestOptions extends RequestInit {
    params?: Record<string, string | number>;
}

export async function apiFetch<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const token = await getStoredToken();

    // Build URL with query params if any
    let url = `${BASE_URL}${endpoint}`;
    if (options.params) {
        const queryString = new URLSearchParams(
            Object.entries(options.params).map(([k, v]) => [k, String(v)])
        ).toString();
        url += `?${queryString}`;
    }

    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    if (token) {
        headers.set("Authorization", `Bearer ${token}`);
    }

    // Default content type to JSON if body exists and not multipart
    if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    let response: Response;
    try {
        response = await fetch(url, {
            ...options,
            headers,
        });
    } catch (fetchError) {
        // Network failure (no connectivity, DNS error, etc.)
        throw new NetworkError(
            fetchError instanceof Error ? fetchError.message : "Error de red",
        );
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || `Error ${response.status}: ${response.statusText}`;

        // Use console.warn for expected 404s (reduces log noise during sync)
        if (response.status === 404) {
            console.warn(`API 404 [${options.method || 'GET'} ${endpoint}]`);
        } else {
            console.error(`API Error [${options.method || 'GET'} ${endpoint}]:`, errorMessage, errorData);
        }

        // Handle expired/invalid token — log out once (prevent cascading logouts)
        if (response.status === 401 && !isLoggingOut) {
            isLoggingOut = true;
            useAuthStore.getState().logout().finally(() => {
                isLoggingOut = false;
            });
        }

        throw new Error(errorMessage);
    }

    return response.json();
}
