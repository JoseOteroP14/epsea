import { useAuthStore } from "@/store/useAuthStore";

const BASE_URL = "https://playmusic.com.co/agro/api/v1";

interface RequestOptions extends RequestInit {
    params?: Record<string, string | number>;
}

export async function apiFetch<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { token } = useAuthStore.getState();

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

    const response = await fetch(url, {
        ...options,
        headers,
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || `Error ${response.status}: ${response.statusText}`;
        console.error(`API Error [${options.method || 'GET'} ${endpoint}]:`, errorMessage, errorData);
        throw new Error(errorMessage);
    }

    return response.json();
}
