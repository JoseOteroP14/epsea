import { getDb } from "../client";

export interface SyncQueueItem {
  id: number;
  entity_type: string;
  entity_key: string;
  payload: string;
  user_id: number | null;
  status: "pending" | "completed" | "failed";
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export async function enqueue(
  entityType: string,
  entityKey: string,
  payload: unknown,
  userId?: number,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT INTO sync_queue (entity_type, entity_key, payload, user_id, status)
     VALUES (?, ?, ?, ?, 'pending')`,
    entityType,
    entityKey,
    JSON.stringify(payload),
    userId ?? null,
  );
}

export async function getPending(userId?: number): Promise<SyncQueueItem[]> {
  const db = getDb();
  if (userId != null) {
    return db.getAllAsync<SyncQueueItem>(
      "SELECT * FROM sync_queue WHERE status = 'pending' AND user_id = ? ORDER BY created_at ASC",
      userId,
    );
  }
  return db.getAllAsync<SyncQueueItem>(
    "SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC",
  );
}

export async function getPendingCount(userId?: number): Promise<number> {
  const db = getDb();
  if (userId != null) {
    const row = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending' AND user_id = ?",
      userId,
    );
    return row?.count ?? 0;
  }
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'",
  );
  return row?.count ?? 0;
}

export async function markCompleted(id: number): Promise<void> {
  const db = getDb();
  await db.runAsync(
    "UPDATE sync_queue SET status = 'completed', updated_at = datetime('now') WHERE id = ?",
    id,
  );
}

export async function markFailed(id: number, error: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    "UPDATE sync_queue SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = datetime('now') WHERE id = ?",
    error,
    id,
  );
}

export async function retryFailed(): Promise<void> {
  const db = getDb();
  await db.runAsync(
    "UPDATE sync_queue SET status = 'pending', updated_at = datetime('now') WHERE status = 'failed'",
  );
}

export async function clearCompleted(): Promise<void> {
  const db = getDb();
  await db.runAsync("DELETE FROM sync_queue WHERE status = 'completed'");
}

// --- Sync Metadata ---

export async function getMetadata(key: string): Promise<string | null> {
  const db = getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM sync_metadata WHERE key = ?",
    key,
  );
  return row?.value ?? null;
}

export async function setMetadata(key: string, value: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
    key,
    value,
  );
}
