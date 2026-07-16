import { getDb } from "../client";

export type VisitServerCacheKind = "visit1" | "visit2" | "visit3";

export async function upsertVisitServerCache(params: {
  userId: number;
  producerId: number;
  projectId: number;
  kind: VisitServerCacheKind;
  jsonPayload: string;
}): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO server_visit_cache
      (visit_kind, producer_id, project_id, user_id, json_payload, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    params.kind,
    params.producerId,
    params.projectId,
    params.userId,
    params.jsonPayload,
  );
}

export async function getVisitServerCacheRaw(
  kind: VisitServerCacheKind,
  producerId: number,
  projectId: number,
  userId: number,
): Promise<string | null> {
  const db = getDb();
  const row = await db.getFirstAsync<{ json_payload: string }>(
    `SELECT json_payload FROM server_visit_cache
     WHERE visit_kind = ? AND producer_id = ? AND project_id = ? AND user_id = ?`,
    kind,
    producerId,
    projectId,
    userId,
  );
  return row?.json_payload ?? null;
}

export async function upsertProductiveLinesBundleCache(params: {
  userId: number;
  producerId: number;
  projectId: number;
  jsonPayload: string;
}): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO productive_lines_server_bundle
      (producer_id, project_id, user_id, json_payload, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    params.producerId,
    params.projectId,
    params.userId,
    params.jsonPayload,
  );
}

export async function getProductiveLinesBundleCacheRaw(
  producerId: number,
  projectId: number,
  userId: number,
): Promise<string | null> {
  const db = getDb();
  const row = await db.getFirstAsync<{ json_payload: string }>(
    `SELECT json_payload FROM productive_lines_server_bundle
     WHERE producer_id = ? AND project_id = ? AND user_id = ?`,
    producerId,
    projectId,
    userId,
  );
  return row?.json_payload ?? null;
}

/** Quita caches de extensionistas cuando el productor deja de estar en el proyecto. */
export async function deleteExtensionistCachesNotInProject(
  projectId: number,
  keepProducerIds: number[],
): Promise<void> {
  const db = getDb();
  if (keepProducerIds.length === 0) {
    await db.runAsync(
      `DELETE FROM server_visit_cache WHERE project_id = ?`,
      projectId,
    );
    await db.runAsync(
      `DELETE FROM productive_lines_server_bundle WHERE project_id = ?`,
      projectId,
    );
    return;
  }
  const placeholders = keepProducerIds.map(() => "?").join(",");
  await db.runAsync(
    `DELETE FROM server_visit_cache WHERE project_id = ? AND producer_id NOT IN (${placeholders})`,
    projectId,
    ...keepProducerIds,
  );
  await db.runAsync(
    `DELETE FROM productive_lines_server_bundle WHERE project_id = ? AND producer_id NOT IN (${placeholders})`,
    projectId,
    ...keepProducerIds,
  );
}
