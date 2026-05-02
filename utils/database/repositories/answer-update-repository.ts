import { getDb } from "../client";

export interface AnswerUpdate {
  answer_id: number;
  new_value: string;
  producer_id: number;
  project_id: number;
  component_id: number;
  question_id: number;
  user_id: number;
  intervention_method_id: number;
}

export interface AnswerUpdateRow extends AnswerUpdate {
  id?: number;
  created_at?: string;
}

export async function upsertAnswerUpdate(update: AnswerUpdate): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO answer_updates
      (answer_id, new_value, producer_id, project_id, component_id, question_id, user_id, intervention_method_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    update.answer_id,
    update.new_value,
    update.producer_id,
    update.project_id,
    update.component_id,
    update.question_id,
    update.user_id,
    update.intervention_method_id,
  );
}

export async function getAnswerUpdates(
  answerId: number,
): Promise<AnswerUpdateRow | null> {
  const db = getDb();
  return db.getFirstAsync<AnswerUpdateRow>(
    "SELECT * FROM answer_updates WHERE answer_id = ?",
    answerId,
  );
}

export async function getPendingAnswerUpdates(
  userId?: number,
): Promise<AnswerUpdateRow[]> {
  const db = getDb();
  if (userId != null) {
    return db.getAllAsync<AnswerUpdateRow>(
      "SELECT * FROM answer_updates WHERE user_id = ? ORDER BY created_at ASC",
      userId,
    );
  }
  return db.getAllAsync<AnswerUpdateRow>(
    "SELECT * FROM answer_updates ORDER BY created_at ASC",
  );
}

export async function deleteAnswerUpdate(answerId: number): Promise<void> {
  const db = getDb();
  await db.runAsync(
    "DELETE FROM answer_updates WHERE answer_id = ?",
    answerId,
  );
}

export async function getPendingAnswerUpdateCount(userId?: number): Promise<number> {
  const db = getDb();
  if (userId != null) {
    const row = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM answer_updates WHERE user_id = ?",
      userId,
    );
    return row?.count ?? 0;
  }
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM answer_updates",
  );
  return row?.count ?? 0;
}