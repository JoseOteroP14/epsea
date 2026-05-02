import { getDb } from "../client";

export interface ProducerInterventionMethod {
  id?: number;
  producer_id: number;
  project_id: number;
  intervention_method_id: number;
  user_id: number;
  applied_at?: string;
}

export async function markInterventionMethodApplied(
  producerId: number,
  projectId: number,
  interventionMethodId: number,
  userId: number,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO producer_intervention_methods
       (producer_id, project_id, intervention_method_id, user_id, applied_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    producerId,
    projectId,
    interventionMethodId,
    userId,
  );
}

export async function hasInterventionMethodApplied(
  producerId: number,
  projectId: number,
  interventionMethodId: number,
  userId: number,
): Promise<boolean> {
  const db = getDb();
  const row = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM producer_intervention_methods
     WHERE producer_id = ? AND project_id = ? AND intervention_method_id = ? AND user_id = ?`,
    producerId,
    projectId,
    interventionMethodId,
    userId,
  );
  return (row?.cnt ?? 0) > 0;
}

export async function getAppliedInterventionMethods(
  producerId: number,
  projectId: number,
  userId: number,
): Promise<number[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ intervention_method_id: number }>(
    `SELECT intervention_method_id FROM producer_intervention_methods
     WHERE producer_id = ? AND project_id = ? AND user_id = ?`,
    producerId,
    projectId,
    userId,
  );
  return rows.map((r) => r.intervention_method_id);
}

export async function clearInterventionMethods(): Promise<void> {
  const db = getDb();
  await db.runAsync("DELETE FROM producer_intervention_methods");
}
