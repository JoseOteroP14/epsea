import { getDb } from "../client";

export interface SurveyAnswer {
  id?: number;
  producer_id: number;
  project_id: number;
  component_id: number;
  question_id: number;
  user_id: number;
  /**
   * Método REST al que pertenece la respuesta (`/surveys` POST body).
   * Necesario para separar clasificación inicial (3) de la de Visita 3 (9),
   * que comparten el mismo `component_id = 4`.
   */
  intervention_method_id: number;
  value: string | null;
  answered_at?: string;
}

export async function saveAnswer(answer: SurveyAnswer): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO survey_answers
      (producer_id, project_id, component_id, question_id, user_id, intervention_method_id, value, answered_at, local_modified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    answer.producer_id,
    answer.project_id,
    answer.component_id,
    answer.question_id,
    answer.user_id,
    answer.intervention_method_id,
    answer.value,
  );
}

export async function saveAnswersBatch(answers: SurveyAnswer[]): Promise<void> {
  const db = getDb();
  await db.execAsync("BEGIN TRANSACTION;");
  try {
    for (const answer of answers) {
      await db.runAsync(
        `INSERT OR REPLACE INTO survey_answers
          (producer_id, project_id, component_id, question_id, user_id, intervention_method_id, value, answered_at, local_modified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        answer.producer_id,
        answer.project_id,
        answer.component_id,
        answer.question_id,
        answer.user_id,
        answer.intervention_method_id,
        answer.value,
      );
    }
    await db.execAsync("COMMIT;");
  } catch (error) {
    await db.execAsync("ROLLBACK;");
    throw error;
  }
}

/**
 * Consulta respuestas locales. `interventionMethodId` es opcional para
 * mantener retro-compatibilidad con tabs que dependen únicamente del
 * `component_id` (información personal, predio, etc.); cuando se pasa,
 * se aplica un filtro adicional para separar clasificación inicial (3)
 * de la de Visita 3 (9).
 */
export async function getAnswers(
  producerId: number,
  projectId: number,
  componentId?: number,
  userId?: number,
  interventionMethodId?: number,
): Promise<SurveyAnswer[]> {
  const db = getDb();
  const clauses: string[] = ["producer_id = ?", "project_id = ?"];
  const params: (number | null)[] = [producerId, projectId];
  if (componentId != null) {
    clauses.push("component_id = ?");
    params.push(componentId);
  }
  if (userId != null) {
    clauses.push("user_id = ?");
    params.push(userId);
  }
  if (interventionMethodId != null) {
    clauses.push("intervention_method_id = ?");
    params.push(interventionMethodId);
  }
  const sql = `SELECT * FROM survey_answers WHERE ${clauses.join(" AND ")}`;
  return db.getAllAsync<SurveyAnswer>(sql, ...(params as number[]));
}

export async function deleteAnswers(
  producerId: number,
  projectId: number,
  componentId: number,
  userId?: number,
  interventionMethodId?: number,
): Promise<void> {
  const db = getDb();
  const clauses = ["producer_id = ?", "project_id = ?", "component_id = ?"];
  const params: number[] = [producerId, projectId, componentId];
  if (userId != null) {
    clauses.push("user_id = ?");
    params.push(userId);
  }
  if (interventionMethodId != null) {
    clauses.push("intervention_method_id = ?");
    params.push(interventionMethodId);
  }
  await db.runAsync(
    `DELETE FROM survey_answers WHERE ${clauses.join(" AND ")}`,
    ...params,
  );
}

export async function getPendingAnswerCount(userId?: number): Promise<number> {
  const db = getDb();
  if (userId != null) {
    const row = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM survey_answers WHERE user_id = ?",
      userId,
    );
    return row?.count ?? 0;
  }
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM survey_answers",
  );
  return row?.count ?? 0;
}
