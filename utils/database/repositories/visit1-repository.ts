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

export async function enqueueVisit1(
  visitUuid: string,
  payload: Visit1Payload,
  photos: LocalPhoto[],
  userId: number,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO visit1_queue
      (visit_uuid, payload, photos, user_id, status, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', 0, datetime('now'), datetime('now'))`,
    visitUuid,
    JSON.stringify(payload),
    JSON.stringify(photos),
    userId,
  );
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