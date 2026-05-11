import {
  copyAsync,
  documentDirectory,
  makeDirectoryAsync,
} from "expo-file-system/legacy";

export interface VisitOfflinePhoto {
  uri: string;
  fileName: string;
  type: string;
}

const OFFLINE_MEDIA_SEGMENT = "offline-visit-media";

function extensionFromPhoto(type: string, fileName: string): string {
  const t = type.toLowerCase();
  if (t.includes("png")) return ".png";
  if (t.includes("webp")) return ".webp";
  if (t.includes("heic")) return ".heic";
  const m = /\.[a-z0-9]+$/i.exec(fileName);
  return m ? m[0].toLowerCase() : ".jpg";
}

/** True si la URI ya apunta a una copia bajo `documentDirectory/offline-visit-media/`. */
export function isPersistedOfflineVisitPhotoUri(uri: string): boolean {
  if (!documentDirectory || !uri.startsWith("file")) return false;
  const root = documentDirectory.replace(/\/*$/, "/");
  return uri.startsWith(root) && uri.includes(`/${OFFLINE_MEDIA_SEGMENT}/`);
}

export type VisitOfflinePhotoKind = "visit1" | "visit2";

/**
 * Copia cada foto nueva al almacenamiento persistente de la app (máx. 3 huecos).
 * Las URIs de cámara/galería a menudo caducan; la cola de sync y la UI deben usar rutas estables.
 */
export async function persistLocalVisitPhotoSlots(
  slots: (VisitOfflinePhoto | null)[],
  meta: {
    kind: VisitOfflinePhotoKind;
    userId: number;
    producerId: number;
    projectId: number;
  },
): Promise<(VisitOfflinePhoto | null)[]> {
  if (!documentDirectory) {
    return [...slots].slice(0, 3) as (VisitOfflinePhoto | null)[];
  }

  const { kind, userId, producerId, projectId } = meta;
  const baseDir = `${documentDirectory}${OFFLINE_MEDIA_SEGMENT}/${kind}/${userId}-${projectId}-${producerId}/`;
  await makeDirectoryAsync(baseDir, { intermediates: true });

  const out: (VisitOfflinePhoto | null)[] = [null, null, null];
  const stamp = Date.now();

  for (let i = 0; i < 3; i++) {
    const p = slots[i] ?? null;
    if (!p) continue;

    if (isPersistedOfflineVisitPhotoUri(p.uri)) {
      out[i] = p;
      continue;
    }

    const ext = extensionFromPhoto(p.type, p.fileName);
    const name = `photo_${stamp}_slot${i}${ext}`;
    const dest = `${baseDir}${name}`;
    try {
      await copyAsync({ from: p.uri, to: dest });
      out[i] = { uri: dest, fileName: name, type: p.type };
    } catch (e) {
      console.warn("[visit-offline-photos] copyAsync failed, keeping original uri", e);
      out[i] = p;
    }
  }

  return out;
}
