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
}

export interface Visit1QueuePhotosEnvelope {
  photos: LocalPhoto[];
  remote_visit_1_id?: number | null;
}

/** Compatibilidad: columnas viejas guardaban sólo JSON de `LocalPhoto[]`. */
export function parseVisit1QueuePhotosColumn(raw: string | null | undefined): {
  photos: LocalPhoto[];
  remote_visit_1_id: number | null;
} {
  try {
    const parsed = JSON.parse(raw ?? "[]") as
      | LocalPhoto[]
      | Visit1QueuePhotosEnvelope;
    if (Array.isArray(parsed)) {
      return { photos: parsed, remote_visit_1_id: null };
    }
    const photos = parsed.photos ?? [];
    const rid = parsed.remote_visit_1_id;
    return {
      photos,
      remote_visit_1_id:
        rid != null && Number.isFinite(Number(rid)) ? Number(rid) : null,
    };
  } catch {
    return { photos: [], remote_visit_1_id: null };
  }
}

export async function enqueueVisit1(
  visitUuid: string,
  payload: Visit1Payload,
  photos: LocalPhoto[],
  userId: number,
  remoteVisit1Id?: number | null,
): Promise<void> {
  const db = getDb();
  const envelope: Visit1QueuePhotosEnvelope = {
    photos,
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