import { getDb } from "../client";

export interface LocalPhoto {
  uri: string;
  fileName: string;
  type: string;
}

export interface Visit1QueueItem {
  id?: number;
  visit_uuid: string;
  payload: string;
  photos: string;
  user_id: number;
  status: "pending" | "completed" | "failed";
  attempts: number;
  last_error: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Visit1Payload {
  project_id: number;
  producer_id: number;
  objetive: string;
  diagnosis: string;
  recommendations: string;
  observations: string;
  compliance_recommendation_id: number;
  registration_date: string;
  attendance_id: number;
  attendance_name: string | null;
  origin: "web" | "app";
  lat?: string | null;
  lng?: string | null;
  masl?: number | null;
  commitments?: string | null;
  attendance_identification?: string | null;
}

export interface Visit1RemoteImageSlot {
  id: number;
  filename: string;
}

export interface Visit1QueuePhotosEnvelope {
  /** Fotos nuevas a subir (lista plana para sync). */
  photos: LocalPhoto[];
  /** Huecos 0–2 preservando posición (preferido al hidratar UI). */
  photoSlots?: (LocalPhoto | null)[];
  /** Remotas que aún se conservan por hueco (tras ediciones offline). */
  remoteImageSlots?: (Visit1RemoteImageSlot | null)[];
  /** IDs remotos a DELETE al sincronizar. */
  pendingImageDeletions?: number[];
  remote_visit_1_id?: number | null;
}

export function parseVisit1QueuePhotosColumn(raw: string | null | undefined): {
  photos: LocalPhoto[];
  photoSlots: (LocalPhoto | null)[];
  remoteImageSlots: (Visit1RemoteImageSlot | null)[];
  pendingImageDeletions: number[];
  remote_visit_1_id: number | null;
} {
  const emptySlots = (): (LocalPhoto | null)[] => [null, null, null];
  const emptyRemote = (): (Visit1RemoteImageSlot | null)[] => [
    null,
    null,
    null,
  ];
  try {
    const parsed = JSON.parse(raw ?? "[]") as
      | LocalPhoto[]
      | Visit1QueuePhotosEnvelope;
    if (Array.isArray(parsed)) {
      const photoSlots = emptySlots();
      parsed.slice(0, 3).forEach((p, i) => {
        photoSlots[i] = p;
      });
      return {
        photos: parsed,
        photoSlots,
        remoteImageSlots: emptyRemote(),
        pendingImageDeletions: [],
        remote_visit_1_id: null,
      };
    }
    const photos = parsed.photos ?? [];
    const rid = parsed.remote_visit_1_id;
    const photoSlots: (LocalPhoto | null)[] = Array.isArray(parsed.photoSlots)
      ? [
          parsed.photoSlots[0] ?? null,
          parsed.photoSlots[1] ?? null,
          parsed.photoSlots[2] ?? null,
        ]
      : (() => {
          const slots = emptySlots();
          photos.slice(0, 3).forEach((p, i) => {
            slots[i] = p;
          });
          return slots;
        })();
    const remoteImageSlots: (Visit1RemoteImageSlot | null)[] = Array.isArray(
      parsed.remoteImageSlots,
    )
      ? [
          parsed.remoteImageSlots[0] ?? null,
          parsed.remoteImageSlots[1] ?? null,
          parsed.remoteImageSlots[2] ?? null,
        ]
      : emptyRemote();
    const pendingImageDeletions = Array.isArray(parsed.pendingImageDeletions)
      ? parsed.pendingImageDeletions.filter((id) => Number.isFinite(Number(id))).map(Number)
      : [];
    return {
      photos,
      photoSlots,
      remoteImageSlots,
      pendingImageDeletions,
      remote_visit_1_id:
        rid != null && Number.isFinite(Number(rid)) ? Number(rid) : null,
    };
  } catch {
    return {
      photos: [],
      photoSlots: emptySlots(),
      remoteImageSlots: emptyRemote(),
      pendingImageDeletions: [],
      remote_visit_1_id: null,
    };
  }
}

export async function enqueueVisit1(
  visitUuid: string,
  payload: Visit1Payload,
  photos: LocalPhoto[],
  userId: number,
  remoteVisit1Id?: number | null,
  extras?: {
    photoSlots?: (LocalPhoto | null)[];
    remoteImageSlots?: (Visit1RemoteImageSlot | null)[];
    pendingImageDeletions?: number[];
  },
): Promise<void> {
  const db = getDb();
  const envelope: Visit1QueuePhotosEnvelope = {
    photos,
    ...(extras?.photoSlots ? { photoSlots: extras.photoSlots } : {}),
    ...(extras?.remoteImageSlots
      ? { remoteImageSlots: extras.remoteImageSlots }
      : {}),
    ...(extras?.pendingImageDeletions?.length
      ? { pendingImageDeletions: extras.pendingImageDeletions }
      : {}),
    ...(remoteVisit1Id != null && Number.isFinite(remoteVisit1Id)
      ? { remote_visit_1_id: remoteVisit1Id }
      : {}),
  };
  await db.runAsync(
    `INSERT OR REPLACE INTO visit1_queue
      (visit_uuid, payload, photos, user_id, status, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', 0, datetime('now'), datetime('now'))`,
    visitUuid,
    JSON.stringify(payload),
    JSON.stringify(envelope),
    userId,
  );
}

export async function deleteVisit1QueueRow(id: number): Promise<void> {
  const db = getDb();
  await db.runAsync("DELETE FROM visit1_queue WHERE id = ?", id);
}

export async function getPendingVisit1Items(
  userId?: number,
): Promise<Visit1QueueItem[]> {
  const db = getDb();
  if (userId != null) {
    return db.getAllAsync<Visit1QueueItem>(
      "SELECT * FROM visit1_queue WHERE status = 'pending' AND user_id = ? ORDER BY created_at ASC",
      userId,
    );
  }
  return db.getAllAsync<Visit1QueueItem>(
    "SELECT * FROM visit1_queue WHERE status = 'pending' ORDER BY created_at ASC",
  );
}

export async function getPendingVisit1Count(userId?: number): Promise<number> {
  const db = getDb();
  if (userId != null) {
    const row = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM visit1_queue WHERE status = 'pending' AND user_id = ?",
      userId,
    );
    return row?.count ?? 0;
  }
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM visit1_queue WHERE status = 'pending'",
  );
  return row?.count ?? 0;
}

export async function markVisit1Completed(id: number): Promise<void> {
  const db = getDb();
  await db.runAsync(
    "UPDATE visit1_queue SET status = 'completed', updated_at = datetime('now') WHERE id = ?",
    id,
  );
}

export async function markVisit1Failed(id: number, error: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    "UPDATE visit1_queue SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = datetime('now') WHERE id = ?",
    error,
    id,
  );
}

export async function retryFailedVisit1(): Promise<void> {
  const db = getDb();
  await db.runAsync(
    "UPDATE visit1_queue SET status = 'pending', updated_at = datetime('now') WHERE status = 'failed'",
  );
}

export async function clearCompletedVisit1(): Promise<void> {
  const db = getDb();
  await db.runAsync("DELETE FROM visit1_queue WHERE status = 'completed'");
}

export async function getLocalVisit1(
  producerId: number,
  projectId: number,
  userId: number,
): Promise<Visit1QueueItem | null> {
  const db = getDb();
  return db.getFirstAsync<Visit1QueueItem>(
    `SELECT * FROM visit1_queue
     WHERE JSON_EXTRACT(payload, '$.producer_id') = ? AND JSON_EXTRACT(payload, '$.project_id') = ? AND user_id = ?
     ORDER BY created_at DESC LIMIT 1`,
    producerId,
    projectId,
    userId,
  );
}

export async function getPendingLocalVisit1(
  producerId: number,
  projectId: number,
  userId: number,
): Promise<Visit1QueueItem | null> {
  const db = getDb();
  return db.getFirstAsync<Visit1QueueItem>(
    `SELECT * FROM visit1_queue
     WHERE JSON_EXTRACT(payload, '$.producer_id') = ? AND JSON_EXTRACT(payload, '$.project_id') = ? AND user_id = ? AND status = 'pending'
     ORDER BY updated_at DESC LIMIT 1`,
    producerId,
    projectId,
    userId,
  );
}

export async function getExistingVisit1FromQueue(
  visitUuid: string,
): Promise<Visit1QueueItem | null> {
  const db = getDb();
  return db.getFirstAsync<Visit1QueueItem>(
    "SELECT * FROM visit1_queue WHERE visit_uuid = ?",
    visitUuid,
  );
}