import { getDb } from "@/utils/database/client";

/**
 * Get the count of producers for a given project from local SQLite.
 * Used as offline fallback for project stats.
 */
export async function getProducerCountByProject(
  projectId: number | string,
): Promise<number> {
  const db = getDb();
  const row = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM producers WHERE project_id = ?`,
    Number(projectId),
  );
  return row?.cnt ?? 0;
}
