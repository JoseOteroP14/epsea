import { getDb } from "../client";

export interface LocalPhoto {
  uri: string;
  fileName: string;
  type: string;
}

export interface Visit2QueueItem {
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

export interface Visit2Payload {
  project_id: number;
  producer_id: number;
  registration_date: string;
  origin: "web" | "app";
  attendance_id: number;
  attendance_identification: string | null;
  attendance_name: string | null;
  general_objective: string;
  specific_objectives: string;
  diagnostic: string;
  recommendations_commitments: string;
  observations: string;
}

export interface Visit2MonitoringCommitment {
  id?: number;
  visit_2_id?: number;
  activity: string;
  percentage_compliance: number;
  appropriation_in_field: string;
  recompType?: string;
  porcentaje?: string;
}

export async function enqueueVisit2(
  visitUuid: string,
  payload: Visit2Payload,
  monitoringCommitments: Visit2MonitoringCommitment[],
  photos: LocalPhoto[],
  userId: number,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO visit2_queue
      (visit_uuid, payload, photos, user_id, status, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', 0, datetime('now'), datetime('now'))`,
    visitUuid,
    JSON.stringify(payload),
    JSON.stringify({ monitoringCommitments, photos }),
    userId,
  );
}

export async function getPendingVisit2Items(
  userId?: number,
): Promise<Visit2QueueItem[]> {
  const db = getDb();
  if (userId != null) {
    return db.getAllAsync<Visit2QueueItem>(
      "SELECT * FROM visit2_queue WHERE status = 'pending' AND user_id = ? ORDER BY created_at ASC",
      userId,
    );
  }
  return db.getAllAsync<Visit2QueueItem>(
    "SELECT * FROM visit2_queue WHERE status = 'pending' ORDER BY created_at ASC",
  );
}

export async function getPendingVisit2Count(userId?: number): Promise<number> {
  const db = getDb();
  if (userId != null) {
    const row = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM visit2_queue WHERE status = 'pending' AND user_id = ?",
      userId,
    );
    return row?.count ?? 0;
  }
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM visit2_queue WHERE status = 'pending'",
  );
  return row?.count ?? 0;
}

export async function markVisit2Completed(id: number): Promise<void> {
  const db = getDb();
  await db.runAsync(
    "UPDATE visit2_queue SET status = 'completed', updated_at = datetime('now') WHERE id = ?",
    id,
  );
}

export async function markVisit2Failed(id: number, error: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    "UPDATE visit2_queue SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = datetime('now') WHERE id = ?",
    error,
    id,
  );
}

export async function retryFailedVisit2(): Promise<void> {
  const db = getDb();
  await db.runAsync(
    "UPDATE visit2_queue SET status = 'pending', updated_at = datetime('now') WHERE status = 'failed'",
  );
}

export async function clearCompletedVisit2(): Promise<void> {
  const db = getDb();
  await db.runAsync("DELETE FROM visit2_queue WHERE status = 'completed'");
}

export async function getLocalVisit2(
  producerId: number,
  projectId: number,
  userId: number,
): Promise<Visit2QueueItem | null> {
  const db = getDb();
  return db.getFirstAsync<Visit2QueueItem>(
    `SELECT * FROM visit2_queue
     WHERE JSON_EXTRACT(payload, '$.producer_id') = ? AND JSON_EXTRACT(payload, '$.project_id') = ? AND user_id = ?
     ORDER BY created_at DESC LIMIT 1`,
    producerId,
    projectId,
    userId,
  );
}

export async function getExistingVisit2FromQueue(
  visitUuid: string,
): Promise<Visit2QueueItem | null> {
  const db = getDb();
  return db.getFirstAsync<Visit2QueueItem>(
    "SELECT * FROM visit2_queue WHERE visit_uuid = ?",
    visitUuid,
  );
}