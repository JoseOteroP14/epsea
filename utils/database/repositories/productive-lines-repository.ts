import { getDb } from "../client";
import type { LineAnswers } from "@/constants/productive-lines-questions";

export interface ProductiveLinesData {
  producer_id: number;
  project_id: number;
  user_id: number;
  line_type: string;
  line_count: number;
  lines_data: LineAnswers[];
}

export async function getProductiveLines(
  producerId: number,
  projectId: number,
  userId: number,
): Promise<ProductiveLinesData | null> {
  const db = getDb();
  const row = await db.getFirstAsync<{
    producer_id: number;
    project_id: number;
    user_id: number;
    line_type: string;
    line_count: number;
    lines_data: string;
  }>(
    "SELECT * FROM productive_lines WHERE producer_id = ? AND project_id = ? AND user_id = ?",
    producerId,
    projectId,
    userId,
  );

  if (!row) return null;

  return {
    producer_id: row.producer_id,
    project_id: row.project_id,
    user_id: row.user_id,
    line_type: row.line_type,
    line_count: row.line_count,
    lines_data: JSON.parse(row.lines_data ?? "[]"),
  };
}

export async function saveProductiveLines(
  data: ProductiveLinesData,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO productive_lines
       (producer_id, project_id, user_id, line_type, line_count, lines_data, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    data.producer_id,
    data.project_id,
    data.user_id,
    data.line_type,
    data.line_count,
    JSON.stringify(data.lines_data),
  );
}
