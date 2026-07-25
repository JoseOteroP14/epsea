import {
  cacheDirectory,
  deleteAsync,
  downloadAsync,
  EncodingType,
  getInfoAsync,
  readAsStringAsync,
} from "expo-file-system/legacy";
import { Image, type ImageSource } from "expo-image";
import { Platform } from "react-native";
import { API_BASE_URL } from "@/utils/api-config";
import { getStoredToken } from "@/utils/secure-storage";

export type VisitImageKind = "visit1" | "visit2" | "visit3";

/** Fallos recientes: evita tormentas de reintentos (p. ej. 404 del API). */
const failedUntil = new Map<string, number>();
const FAIL_COOLDOWN_MS = 5 * 60 * 1000;

function failKey(kind: VisitImageKind, imageId: number): string {
  return `${kind}:${imageId}`;
}

function isInFailCooldown(kind: VisitImageKind, imageId: number): boolean {
  const until = failedUntil.get(failKey(kind, imageId));
  return until != null && Date.now() < until;
}

function markFailed(kind: VisitImageKind, imageId: number): void {
  failedUntil.set(failKey(kind, imageId), Date.now() + FAIL_COOLDOWN_MS);
}

function clearFailed(kind: VisitImageKind, imageId: number): void {
  failedUntil.delete(failKey(kind, imageId));
}

export function normalizeVisitImageId(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function apiSegment(kind: VisitImageKind): string {
  return kind === "visit1" ? "visit-1" : kind === "visit2" ? "visit-2" : "visit-3";
}

/** URL autenticada GET /visit-N/images/{id} (igual que agro-proj-vue). */
export function getVisitImageUrl(
  kind: VisitImageKind,
  imageIdRaw: number | string,
): string | null {
  const imageId = normalizeVisitImageId(imageIdRaw);
  if (imageId == null) return null;
  return `${API_BASE_URL}/${apiSegment(kind)}/images/${imageId}`;
}

/**
 * Source para expo-image: el runtime (Glide/SDWebImage) cachea en disco del sistema
 * con LRU — no persiste full-size en documentDirectory.
 */
export function buildVisitImageSource(
  kind: VisitImageKind,
  imageIdRaw: number | string,
  token: string,
): ImageSource | null {
  const imageId = normalizeVisitImageId(imageIdRaw);
  const uri = getVisitImageUrl(kind, imageIdRaw);
  if (imageId == null || !uri || !token) return null;
  if (isInFailCooldown(kind, imageId)) return null;

  return {
    uri,
    headers: {
      Accept: "image/*,application/octet-stream,*/*",
      Authorization: `Bearer ${token}`,
    },
    cacheKey: `epsea-${kind}-img-${imageId}`,
  };
}

export async function prefetchVisitImageSources(
  kind: VisitImageKind,
  imageIds: (number | string)[],
  token: string,
): Promise<void> {
  const sources = imageIds
    .map((id) => buildVisitImageSource(kind, id, token))
    .filter((s): s is ImageSource => s != null && !!s.uri);

  if (sources.length === 0) return;

  try {
    await Image.prefetch(
      sources.map((s) => s.uri!),
      {
        cachePolicy: "memory-disk",
        headers: {
          Accept: "image/*,application/octet-stream,*/*",
          Authorization: `Bearer ${token}`,
        },
      },
    );
  } catch (e) {
    console.warn("[visit-image-cache] prefetch failed", kind, e);
  }
}

export function reportVisitImageLoadFailure(
  kind: VisitImageKind,
  imageIdRaw: number | string,
): void {
  const imageId = normalizeVisitImageId(imageIdRaw);
  if (imageId == null) return;
  markFailed(kind, imageId);
  console.warn("[visit-image-cache] image load failed", kind, imageId);
}

export function reportVisitImageLoadSuccess(
  kind: VisitImageKind,
  imageIdRaw: number | string,
): void {
  const imageId = normalizeVisitImageId(imageIdRaw);
  if (imageId == null) return;
  clearFailed(kind, imageId);
}

async function fileLooksValid(path: string): Promise<boolean> {
  try {
    const info = await getInfoAsync(path);
    if (!info.exists || info.isDirectory) return false;
    const size = (info as { size?: number }).size;
    return typeof size !== "number" || size >= 32;
  } catch {
    return false;
  }
}

/**
 * Descarga temporal a cacheDirectory (evictable por el OS) — uso PDF / export.
 * No usar para previews de UI.
 */
export async function ensureVisitImageCached(
  kind: VisitImageKind,
  imageIdRaw: number | string,
): Promise<string | null> {
  const imageId = normalizeVisitImageId(imageIdRaw);
  const url = getVisitImageUrl(kind, imageIdRaw);
  if (imageId == null || !url) return null;
  if (isInFailCooldown(kind, imageId)) return null;

  const token = await getStoredToken();
  if (!token) {
    console.warn("[visit-image-cache] no auth token");
    return null;
  }

  const dir = cacheDirectory;
  if (!dir || Platform.OS === "web") {
    return downloadViaFetchDataUri(kind, imageId, token, url);
  }

  const path = `${dir}visit-img-${kind}-${imageId}.bin`;
  try {
    const result = await downloadAsync(url, path, {
      headers: {
        Accept: "image/*,application/octet-stream,*/*",
        Authorization: `Bearer ${token}`,
      },
    });
    const statusOk =
      result.status == null ||
      (result.status >= 200 && result.status < 300);
    if (statusOk && (await fileLooksValid(path))) {
      clearFailed(kind, imageId);
      return result.uri || path;
    }
    await deleteAsync(path, { idempotent: true }).catch(() => undefined);
  } catch (e) {
    console.warn("[visit-image-cache] downloadAsync failed", kind, imageId, e);
    await deleteAsync(path, { idempotent: true }).catch(() => undefined);
  }

  const dataUri = await downloadViaFetchDataUri(kind, imageId, token, url);
  if (!dataUri) markFailed(kind, imageId);
  else clearFailed(kind, imageId);
  return dataUri;
}

async function downloadViaFetchDataUri(
  kind: VisitImageKind,
  imageId: number,
  token: string,
  url: string,
): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "image/*,application/octet-stream,*/*",
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      console.warn(
        "[visit-image-cache] fetch HTTP",
        response.status,
        kind,
        imageId,
      );
      return null;
    }
    const contentType = (
      response.headers.get("content-type") ?? ""
    ).toLowerCase();
    if (
      contentType.includes("application/json") ||
      contentType.includes("text/html")
    ) {
      console.warn("[visit-image-cache] not an image", contentType);
      return null;
    }
    const buffer = await response.arrayBuffer();
    if (!buffer || buffer.byteLength < 32) return null;
    const bytes = new Uint8Array(buffer);
    const base64 = bytesToBase64(bytes);

    let mime = "image/jpeg";
    if (contentType.includes("png") || (bytes[0] === 0x89 && bytes[1] === 0x50)) {
      mime = "image/png";
    } else if (
      contentType.includes("webp") ||
      (bytes[0] === 0x52 && bytes[1] === 0x49)
    ) {
      mime = "image/webp";
    }
    return `data:${mime};base64,${base64}`;
  } catch (e) {
    console.warn("[visit-image-cache] fetch failed", kind, imageId, e);
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += alphabet[(triple >> 18) & 63];
    out += alphabet[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? alphabet[(triple >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? alphabet[triple & 63] : "=";
  }
  return out;
}

/** @deprecated Prefer buildVisitImageSource + expo-image para UI. */
export async function prefetchVisitImages(
  kind: VisitImageKind,
  imageIds: (number | string)[],
): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  const unique = [
    ...new Set(
      imageIds
        .map(normalizeVisitImageId)
        .filter((id): id is number => id != null),
    ),
  ];
  await Promise.all(
    unique.map(async (id) => {
      const uri = await ensureVisitImageCached(kind, id);
      if (uri) out[id] = uri;
    }),
  );
  return out;
}

export async function invalidateVisitImageCache(
  kind: VisitImageKind,
  imageIdRaw: number | string,
): Promise<void> {
  const imageId = normalizeVisitImageId(imageIdRaw);
  if (imageId == null) return;
  clearFailed(kind, imageId);

  if (cacheDirectory) {
    const path = `${cacheDirectory}visit-img-${kind}-${imageId}.bin`;
    try {
      await deleteAsync(path, { idempotent: true });
    } catch (e) {
      console.warn("[visit-image-cache] invalidate failed", path, e);
    }
  }

  // Limpia cache legado en documentDirectory si aún existe
  try {
    const { documentDirectory } = await import("expo-file-system/legacy");
    if (documentDirectory) {
      const legacyDir = `${documentDirectory}visit-image-preview-cache/`;
      for (const ext of ["jpg", "img"]) {
        await deleteAsync(`${legacyDir}${kind}_${imageId}.${ext}`, {
          idempotent: true,
        }).catch(() => undefined);
      }
    }
  } catch {
    /* ignore */
  }
}

/** Lee un archivo local (cache PDF) como data URI. */
export async function localFileToDataUri(
  localUri: string,
  mime = "image/jpeg",
): Promise<string | null> {
  try {
    const b64 = await readAsStringAsync(localUri, {
      encoding: EncodingType.Base64,
    });
    return `data:${mime};base64,${b64}`;
  } catch {
    return null;
  }
}
