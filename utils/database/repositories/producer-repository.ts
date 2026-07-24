import type { Producer, ProducerDetail } from "@/schemas/producer";
import { getDb } from "../client";

export async function upsertProducers(
  producers: Producer[],
  projectId: number | string,
): Promise<void> {
  const db = getDb();
  const pid = Number(projectId);
  for (const p of producers) {
    const id = p.producer_id ?? p.id;
    if (id == null) continue;
    await db.runAsync(
      `INSERT OR REPLACE INTO producers (id, project_id, identification, first_name, middle_name, first_surname, last_surname, email, phone, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      pid,
      p.identification,
      p.first_name,
      p.middle_name ?? null,
      p.first_surname,
      p.last_surname ?? null,
      p.email ?? null,
      p.phone ?? null,
      JSON.stringify(p),
    );
  }
}

export async function getProducersByProject(
  projectId: number | string,
): Promise<Producer[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ raw_json: string }>(
    `SELECT raw_json FROM producers
     WHERE project_id = ?
     ORDER BY first_surname COLLATE NOCASE,
              first_name COLLATE NOCASE,
              identification COLLATE NOCASE,
              id`,
    Number(projectId),
  );
  return rows.map((r) => JSON.parse(r.raw_json) as Producer);
}

/** `raw_json` de la lista de productores (incluye campos passthrough como línea productiva). */
export async function getProducerRawJsonRow(
  producerId: number,
  projectId: number,
): Promise<Record<string, unknown> | null> {
  const db = getDb();
  const row = await db.getFirstAsync<{ raw_json: string }>(
    "SELECT raw_json FROM producers WHERE id = ? AND project_id = ?",
    producerId,
    projectId,
  );
  if (!row?.raw_json) return null;
  try {
    return JSON.parse(row.raw_json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function upsertProducerDetail(
  detail: ProducerDetail,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO producer_details (id, raw_json) VALUES (?, ?)`,
    detail.id,
    JSON.stringify(detail),
  );
}

export async function getProducerDetail(
  producerId: number | string,
): Promise<ProducerDetail | null> {
  const db = getDb();
  const row = await db.getFirstAsync<{ raw_json: string }>(
    "SELECT raw_json FROM producer_details WHERE id = ?",
    Number(producerId),
  );
  return row ? (JSON.parse(row.raw_json) as ProducerDetail) : null;
}

export async function deleteProducersNotIn(
  projectId: number,
  ids: number[],
): Promise<void> {
  const db = getDb();
  if (ids.length === 0) {
    await db.runAsync(
      "DELETE FROM producers WHERE project_id = ?",
      projectId,
    );
    return;
  }
  const placeholders = ids.map(() => "?").join(",");
  await db.runAsync(
    `DELETE FROM producers WHERE project_id = ? AND id NOT IN (${placeholders})`,
    projectId,
    ...ids,
  );
}

export async function clearProducers(): Promise<void> {
  const db = getDb();
  await db.runAsync("DELETE FROM producers");
  await db.runAsync("DELETE FROM producer_details");
}
