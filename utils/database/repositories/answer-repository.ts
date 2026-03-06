import { getDb } from "../client";

export interface SurveyAnswer {
  id?: number;
  producer_id: number;
  project_id: number;
  component_id: number;
  question_id: number;
  user_id: number;
  value: string | null;
  answered_at?: string;
}

export async function saveAnswer(answer: SurveyAnswer): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO survey_answers (producer_id, project_id, component_id, question_id, user_id, value, answered_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    answer.producer_id,
    answer.project_id,
    answer.component_id,
    answer.question_id,
    answer.user_id,
    answer.value,
  );
}

export async function saveAnswersBatch(answers: SurveyAnswer[]): Promise<void> {
  const db = getDb();
  await db.execAsync("BEGIN TRANSACTION;");
  try {
    for (const answer of answers) {
      await db.runAsync(
        `INSERT OR REPLACE INTO survey_answers (producer_id, project_id, component_id, question_id, user_id, value, answered_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        answer.producer_id,
        answer.project_id,
        answer.component_id,
        answer.question_id,
        answer.user_id,
        answer.value,
      );
    }
    await db.execAsync("COMMIT;");
  } catch (error) {
    await db.execAsync("ROLLBACK;");
    throw error;
  }
}

export async function getAnswers(
  producerId: number,
  projectId: number,
  componentId?: number,
  userId?: number,
): Promise<SurveyAnswer[]> {
  const db = getDb();
  if (componentId != null && userId != null) {
    return db.getAllAsync<SurveyAnswer>(
      "SELECT * FROM survey_answers WHERE producer_id = ? AND project_id = ? AND component_id = ? AND user_id = ?",
      producerId,
      projectId,
      componentId,
      userId,
    );
  }
  if (componentId != null) {
    return db.getAllAsync<SurveyAnswer>(
      "SELECT * FROM survey_answers WHERE producer_id = ? AND project_id = ? AND component_id = ?",
      producerId,
      projectId,
      componentId,
    );
  }
  if (userId != null) {
    return db.getAllAsync<SurveyAnswer>(
      "SELECT * FROM survey_answers WHERE producer_id = ? AND project_id = ? AND user_id = ?",
      producerId,
      projectId,
      userId,
    );
  }
  return db.getAllAsync<SurveyAnswer>(
    "SELECT * FROM survey_answers WHERE producer_id = ? AND project_id = ?",
    producerId,
    projectId,
  );
}

export async function deleteAnswers(
  producerId: number,
  projectId: number,
  componentId: number,
  userId?: number,
): Promise<void> {
  const db = getDb();
  if (userId != null) {
    await db.runAsync(
      "DELETE FROM survey_answers WHERE producer_id = ? AND project_id = ? AND component_id = ? AND user_id = ?",
      producerId,
      projectId,
      componentId,
      userId,
    );
  } else {
    await db.runAsync(
      "DELETE FROM survey_answers WHERE producer_id = ? AND project_id = ? AND component_id = ?",
      producerId,
      projectId,
      componentId,
    );
  }
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
