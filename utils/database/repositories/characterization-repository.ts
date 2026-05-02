import type {
  Question,
  QuestionType,
  SurveyComponent,
} from "@/schemas/characterization";
import { getDb } from "../client";

// --- Components ---

export async function upsertComponents(
  components: SurveyComponent[],
): Promise<void> {
  const db = getDb();
  for (const c of components) {
    await db.runAsync(
      `INSERT OR REPLACE INTO components (id, name, description, raw_json)
       VALUES (?, ?, ?, ?)`,
      c.id,
      c.name,
      c.description ?? null,
      JSON.stringify(c),
    );
  }
}

export async function getAllComponents(): Promise<SurveyComponent[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ raw_json: string }>(
    "SELECT raw_json FROM components",
  );
  return rows.map((r) => JSON.parse(r.raw_json) as SurveyComponent);
}

// --- Question Types ---

export async function upsertQuestionTypes(
  types: QuestionType[],
): Promise<void> {
  const db = getDb();
  for (const t of types) {
    await db.runAsync(
      `INSERT OR REPLACE INTO question_types (id, name) VALUES (?, ?)`,
      t.id,
      t.name,
    );
  }
}

export async function getAllQuestionTypes(): Promise<QuestionType[]> {
  const db = getDb();
  return db.getAllAsync<QuestionType>("SELECT id, name FROM question_types");
}

// --- Questions ---

export async function upsertQuestions(questions: Question[]): Promise<void> {
  const db = getDb();
  for (const q of questions) {
    await db.runAsync(
      `INSERT OR REPLACE INTO questions (id, name, component_id, question_type_id, is_required, sort_order, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      q.id,
      q.name ?? "",
      q.component_id,
      q.question_type_id,
      q.is_required ? 1 : 0,
      q.order ?? 0,
      JSON.stringify(q),
    );
  }
}

export async function getQuestionsByComponent(
  componentId: number,
): Promise<Question[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ raw_json: string }>(
    "SELECT raw_json FROM questions WHERE component_id = ? ORDER BY sort_order",
    componentId,
  );
  return rows.map((r) => JSON.parse(r.raw_json) as Question);
}

export async function getQuestionById(
  questionId: number,
): Promise<Question | null> {
  const db = getDb();
  const row = await db.getFirstAsync<{ raw_json: string }>(
    "SELECT raw_json FROM questions WHERE id = ?",
    questionId,
  );
  return row ? (JSON.parse(row.raw_json) as Question) : null;
}

// --- Question Details ---

export async function upsertQuestionDetail(
  questionId: number,
  typeName: string,
  detail: unknown,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO question_details (question_id, type_name, raw_json)
     VALUES (?, ?, ?)`,
    questionId,
    typeName,
    JSON.stringify(detail),
  );
}

export async function getQuestionDetail(
  questionId: number,
): Promise<unknown | null> {
  const db = getDb();
  const row = await db.getFirstAsync<{ raw_json: string }>(
    "SELECT raw_json FROM question_details WHERE question_id = ?",
    questionId,
  );
  return row ? JSON.parse(row.raw_json) : null;
}

// --- Innova Fields ---

export async function upsertInnovaFields(fields: unknown[]): Promise<void> {
  const db = getDb();
  for (const f of fields as { id: number; name: string; field_type?: string }[]) {
    await db.runAsync(
      `INSERT OR REPLACE INTO innova_fields (id, name, field_type, raw_json)
       VALUES (?, ?, ?, ?)`,
      f.id,
      f.name,
      f.field_type ?? null,
      JSON.stringify(f),
    );
  }
}

export async function getAllInnovaFields(): Promise<unknown[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ raw_json: string }>(
    "SELECT raw_json FROM innova_fields",
  );
  return rows.map((r) => JSON.parse(r.raw_json));
}

// --- Clear all ---

export async function clearCharacterizationData(): Promise<void> {
  const db = getDb();
  await db.runAsync("DELETE FROM components");
  await db.runAsync("DELETE FROM question_types");
  await db.runAsync("DELETE FROM questions");
  await db.runAsync("DELETE FROM question_details");
  await db.runAsync("DELETE FROM innova_fields");
}
