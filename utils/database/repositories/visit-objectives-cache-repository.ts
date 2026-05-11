import { getDb } from "../client";

export async function getCachedObjectiveItemsJson(
  eventId: number,
  productionLineId: number,
): Promise<string | null> {
  const db = getDb();
  const row = await db.getFirstAsync<{ items_json: string }>(
    `SELECT items_json FROM visit_objectives_cache WHERE event_id = ? AND production_line_id = ?`,
    eventId,
    productionLineId,
  );
  return row?.items_json ?? null;
}

export async function upsertCachedObjectiveItemsJson(
  eventId: number,
  productionLineId: number,
  itemsJson: string,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT INTO visit_objectives_cache (event_id, production_line_id, items_json, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(event_id, production_line_id) DO UPDATE SET
       items_json = excluded.items_json,
       updated_at = excluded.updated_at`,
    eventId,
    productionLineId,
    itemsJson,
  );
}
