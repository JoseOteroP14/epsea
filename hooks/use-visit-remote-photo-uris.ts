import { useEffect, useMemo, useState } from "react";
import { type ImageSource } from "expo-image";
import {
  buildVisitImageSource,
  normalizeVisitImageId,
  prefetchVisitImageSources,
  type VisitImageKind,
} from "@/utils/visit-image-cache";
import { getStoredToken } from "@/utils/secure-storage";

type RemoteSlot = { id: number | string; filename?: string } | null;

/**
 * Equivalente móvil de agro-proj-vue `fetchVisitImageAsObjectUrl`:
 * entrega ImageSource con Bearer para que expo-image descargue/cachee
 * (Glide LRU en Android — bajo impacto en almacenamiento permanente).
 */
export function useVisitRemotePhotoUris(
  kind: VisitImageKind,
  existingImages: RemoteSlot[],
): {
  /** @deprecated usar `sources` */
  uris: (string | null)[];
  sources: (ImageSource | null)[];
  loading: boolean;
  imageIds: (number | null)[];
} {
  const [token, setToken] = useState<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false);

  const idsKey = existingImages
    .map((img) => (img != null ? String(img.id) : ""))
    .join("|");

  const imageIds = useMemo(
    () =>
      [0, 1, 2].map((i) => {
        const img = existingImages[i];
        return img != null ? normalizeVisitImageId(img.id) : null;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idsKey captura cambios
    [idsKey],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await getStoredToken();
      if (cancelled) return;
      setToken(t);
      setTokenReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sources = useMemo<(ImageSource | null)[]>(() => {
    if (!token) return [null, null, null];
    return imageIds.map((id) =>
      id != null ? buildVisitImageSource(kind, id, token) : null,
    );
  }, [kind, imageIds, token]);

  const uris = useMemo(
    () => sources.map((s) => s?.uri ?? null),
    [sources],
  );

  useEffect(() => {
    if (!token) return;
    const ids = imageIds.filter((id): id is number => id != null);
    if (ids.length === 0) return;
    void prefetchVisitImageSources(kind, ids, token);
  }, [kind, idsKey, token]);

  const hasRemote = imageIds.some((id) => id != null);
  const loading = hasRemote && !tokenReady;

  return { uris, sources, loading, imageIds };
}
