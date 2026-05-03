import { getDb } from "@/utils/database/client";

export interface SurveyResultRow {
  survey_id: number;
  answer_id: number;
  question_id: number;
  answer_value: string;
  question_description: string | null;
  question_type_id: number;
  question_parent_id: number | null;
  intervention_method_id: number;
  producer_id: number;
  project_id: number;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Upsert downloaded survey results into local SQLite for offline access.
 * Uses INSERT OR REPLACE keyed on `answer_id` (UNIQUE constraint).
 */
export async function upsertSurveyResults(
  results: SurveyResultRow[],
): Promise<void> {
  if (results.length === 0) return;
  const db = getDb();

  for (const r of results) {
    await db.runAsync(
      `INSERT OR REPLACE INTO survey_results
        (survey_id, answer_id, question_id, answer_value, question_description,
         question_type_id, question_parent_id, intervention_method_id,
         producer_id, project_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      r.survey_id,
      r.answer_id,
      r.question_id,
      r.answer_value ?? "",
      r.question_description ?? null,
      r.question_type_id,
      r.question_parent_id ?? null,
      r.intervention_method_id,
      r.producer_id,
      r.project_id,
      r.created_at ?? null,
      r.updated_at ?? null,
    );
  }
}

/**
 * Read cached survey results for a given producer + project + intervention method.
 * Returns rows in the same shape as `SurveyResultItem` from the characterization schema.
 */
export async function getSurveyResults(
  producerId: number,
  projectId: number,
  interventionMethodId: number,
): Promise<SurveyResultRow[]> {
  const db = getDb();
  return db.getAllAsync<SurveyResultRow>(
    `SELECT * FROM survey_results
     WHERE producer_id = ? AND project_id = ? AND intervention_method_id = ?`,
    producerId,
    projectId,
    interventionMethodId,
  );
}

/**
 * Delete all cached survey results for a producer/project/method combination.
 * Called before re-downloading to prevent stale data.
 */
export async function deleteSurveyResults(
  producerId: number,
  projectId: number,
  interventionMethodId: number,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `DELETE FROM survey_results
     WHERE producer_id = ? AND project_id = ? AND intervention_method_id = ?`,
    producerId,
    projectId,
    interventionMethodId,
  );
}
