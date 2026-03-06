import type { Project } from "@/schemas/project";
import { getDb } from "../client";

export async function upsertProjects(projects: Project[]): Promise<void> {
  const db = getDb();
  for (const p of projects) {
    await db.runAsync(
      `INSERT OR REPLACE INTO projects (id, name, description, type_id, role_name, raw_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      p.id,
      p.name,
      p.description ?? null,
      p.type_id ?? null,
      p.role_name ?? null,
      JSON.stringify(p),
    );
  }
}

export async function getAllProjects(): Promise<Project[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ raw_json: string }>(
    "SELECT raw_json FROM projects",
  );
  return rows.map((r) => JSON.parse(r.raw_json) as Project);
}

export async function deleteProjectsNotIn(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  await db.runAsync(
    `DELETE FROM projects WHERE id NOT IN (${placeholders})`,
    ...ids,
  );
}

export async function clearProjects(): Promise<void> {
  const db = getDb();
  await db.runAsync("DELETE FROM projects");
}
