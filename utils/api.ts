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

/**
 * HTTP error with status so callers can treat 404 as a valid empty state
 * (e.g. producer has not applied a given intervention method yet).
 */
export class ApiHttpError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
    this.data = data;
  }
}

export function isApiHttpError(error: unknown): error is ApiHttpError {
  return (
    error instanceof ApiHttpError ||
    (error instanceof Error &&
      error.name === "ApiHttpError" &&
      typeof (error as ApiHttpError).status === "number")
  );
}

/**
 * True when the survey/method endpoint reports "nothing applied yet".
 * Matches the web client: 404 is a valid empty state, not a sync failure.
 */
export function isExpectedMissingResourceError(error: unknown): boolean {
  if (isApiHttpError(error) && (error.status === 404 || error.status === 204)) {
    return true;
  }

  const msg = error instanceof Error ? error.message : String(error);
  if (/\b404\b/.test(msg) || /not[\s_-]?found/i.test(msg)) return true;
  // Mensajes típicos del backend en español (sin incluir el dígito 404).
  if (/no se encontr/i.test(msg)) return true;
  if (/sin (encuesta|resultados|respuestas)/i.test(msg)) return true;
  if (/aún no (tiene|hay)/i.test(msg)) return true;
  return false;
}

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number>;
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const token = await getStoredToken();

  // Build URL with query params if any
  let url = `${BASE_URL}${endpoint}`;
  if (options.params) {
    const queryString = new URLSearchParams(
      Object.entries(options.params).map(([k, v]) => [k, String(v)]),
    ).toString();
    url += `?${queryString}`;
  }

  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Default content type to JSON if body exists and not multipart
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
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
    const errorMessage =
      (errorData &&
      typeof errorData === "object" &&
      "message" in errorData &&
      (errorData as { message?: unknown }).message != null
        ? String((errorData as { message: unknown }).message)
        : "") || `Error ${response.status}: ${response.statusText}`;

    // Use console.warn for expected 404s (reduces log noise during sync)
    if (response.status === 404) {
      console.warn(`API 404 [${options.method || "GET"} ${endpoint}]`);
    } else {
      console.error(
        `API Error [${options.method || "GET"} ${endpoint}]:`,
        errorMessage,
        errorData,
      );
    }

    // Handle expired/invalid token — log out once (prevent cascading logouts)
    if (response.status === 401 && !isLoggingOut) {
      isLoggingOut = true;
      useAuthStore
        .getState()
        .logout()
        .finally(() => {
          isLoggingOut = false;
        });
    }

    throw new ApiHttpError(response.status, errorMessage, errorData);
  }

  return response.json();
}
