import { getDb } from "../client";
import type {
  Visit3CreatePayload,
  Visit3UpdatePayload,
} from "@/schemas/visit3";

export interface Visit3LocalPhoto {
  uri: string;
  fileName: string;
  type: string;
}

export interface Visit3QueueTracking {
  /** ID en el servidor cuando ya existe. */
  id?: number;
  activity: string;
  percentage_compliance: number;
  appropriation_in_field: string;
}

export interface Visit3QueueExtras {
  photos: Visit3LocalPhoto[];
  /** Existentes en servidor que se conservan (no borradas por el usuario). */
  keepRemoteImages: number[];
  /** Imágenes remotas que se deben eliminar al sincronizar. */
  pendingImageDeletions: number[];
  /** Seguimientos remotos que se deben eliminar al sincronizar. */
  pendingCommitmentDeletions: number[];
  /** Todos los seguimientos activos del formulario (nuevos + editados). */
  trackings: Visit3QueueTracking[];
  /** ID remoto cuando se está actualizando (PUT vs POST). */
  remote_visit_3_id?: number | null;
  /** Payload de actualización cuando existe visita remota. */
  update_payload?: Visit3UpdatePayload;
}

export interface Visit3QueueItem {
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

export async function enqueueVisit3(params: {
  visitUuid: string;
  payload: Visit3CreatePayload | Visit3UpdatePayload;
  extras: Visit3QueueExtras;
  userId: number;
}): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO visit3_queue
       (visit_uuid, payload, photos, user_id, status, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', 0, datetime('now'), datetime('now'))`,
    params.visitUuid,
    JSON.stringify(params.payload),
    JSON.stringify(params.extras),
    params.userId,
  );
}

export async function getPendingVisit3Items(
  userId?: number,
): Promise<Visit3QueueItem[]> {
  const db = getDb();
  if (userId != null) {
    return db.getAllAsync<Visit3QueueItem>(
      "SELECT * FROM visit3_queue WHERE status = 'pending' AND user_id = ? ORDER BY created_at ASC",
      userId,
    );
  }
  return db.getAllAsync<Visit3QueueItem>(
    "SELECT * FROM visit3_queue WHERE status = 'pending' ORDER BY created_at ASC",
  );
}

export async function getPendingVisit3Count(userId?: number): Promise<number> {
  const db = getDb();
  if (userId != null) {
    const row = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM visit3_queue WHERE status = 'pending' AND user_id = ?",
      userId,
    );
    return row?.count ?? 0;
  }
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM visit3_queue WHERE status = 'pending'",
  );
  return row?.count ?? 0;
}

export async function markVisit3Completed(id: number): Promise<void> {
  const db = getDb();
  await db.runAsync(
    "UPDATE visit3_queue SET status = 'completed', updated_at = datetime('now') WHERE id = ?",
    id,
  );
}

export async function markVisit3Failed(id: number, error: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    "UPDATE visit3_queue SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = datetime('now') WHERE id = ?",
    error,
    id,
  );
}

export async function deleteVisit3QueueRow(id: number): Promise<void> {
  const db = getDb();
  await db.runAsync("DELETE FROM visit3_queue WHERE id = ?", id);
}

export async function retryFailedVisit3(): Promise<void> {
  const db = getDb();
  await db.runAsync(
    "UPDATE visit3_queue SET status = 'pending', updated_at = datetime('now') WHERE status = 'failed'",
  );
}

export async function clearCompletedVisit3(): Promise<void> {
  const db = getDb();
  await db.runAsync("DELETE FROM visit3_queue WHERE status = 'completed'");
}

export async function getPendingLocalVisit3(
  producerId: number,
  projectId: number,
  userId: number,
): Promise<Visit3QueueItem | null> {
  const db = getDb();
  return db.getFirstAsync<Visit3QueueItem>(
    `SELECT * FROM visit3_queue
     WHERE JSON_EXTRACT(payload, '$.producer_id') = ?
       AND JSON_EXTRACT(payload, '$.project_id') = ?
       AND user_id = ?
       AND status = 'pending'
     ORDER BY updated_at DESC
     LIMIT 1`,
    producerId,
    projectId,
    userId,
  );
}
