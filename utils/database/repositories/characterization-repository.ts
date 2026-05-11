import type {
  Department,
  Municipality,
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

/** Sort key for listing: API `order` (or PascalCase/alternate keys) in raw_json wins, else DB column. */
function effectiveQuestionListOrder(question: Question, rowSortOrder: number): number {
  const q = question as Record<string, unknown>;
  const fromJsonRaw = q.order ?? q.Order ?? q.orden;
  const fromJson = Number(fromJsonRaw);
  if (Number.isFinite(fromJson)) return fromJson;
  const fromRow = Number(rowSortOrder);
  if (Number.isFinite(fromRow)) return fromRow;
  return 0;
}

export async function upsertQuestions(questions: Question[]): Promise<void> {
  const db = getDb();
  const indexByComponent = new Map<number, number>();
  for (const q of questions) {
    const compId = q.component_id;
    const position = indexByComponent.get(compId) ?? 0;
    indexByComponent.set(compId, position + 1);

    const qRec = q as Record<string, unknown>;
    const explicitOrd = Number(qRec.order ?? qRec.Order ?? qRec.orden);
    const sortOrder = Number.isFinite(explicitOrd)
      ? Math.trunc(explicitOrd)
      : position;

    const required =
      q.is_required === true || q.required === true ? 1 : 0;

    const displayName =
      typeof q.name === "string" && q.name.trim() !== ""
        ? q.name
        : typeof qRec.description === "string"
          ? qRec.description
          : "";

    await db.runAsync(
      `INSERT OR REPLACE INTO questions (id, name, component_id, question_type_id, is_required, sort_order, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      q.id,
      displayName,
      q.component_id,
      q.question_type_id,
      required,
      sortOrder,
      JSON.stringify(q),
    );
  }
}

export async function getQuestionsByComponent(
  componentId: number,
): Promise<Question[]> {
  const db = getDb();
  // Many seeded rows share sort_order=0; SQLite does not guarantee order among ties, so APK vs dev can differ.
  const rows = await db.getAllAsync<{ raw_json: string; sort_order: number }>(
    `SELECT raw_json, sort_order FROM questions
     WHERE component_id = ?
     ORDER BY sort_order ASC, id ASC`,
    componentId,
  );
  const parsed = rows.map((r) => {
    const q = JSON.parse(r.raw_json) as Question;
    return { q, order: effectiveQuestionListOrder(q, r.sort_order) };
  });
  // Prefer API order from JSON; tie-break by id so order is identical on Hermes/APK and dev.
  parsed.sort((a, b) => a.order - b.order || (a.q.id ?? 0) - (b.q.id ?? 0));
  return parsed.map(({ q }) => q);
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

// --- Static Departments & Municipalities (pre-seeded, offline-ready) ---

export async function getStaticDepartments(): Promise<Department[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ department_cod: string; department: string }>(
    "SELECT DISTINCT department_cod, department FROM static_municipalities ORDER BY department",
  );
  return rows;
}

export async function getStaticMunicipalities(departmentCod: string): Promise<Municipality[]> {
  const db = getDb();
  const rows = await db.getAllAsync<Municipality>(
    `SELECT department_cod, department, municipality_code, municipality
     FROM static_municipalities WHERE department_cod = ? ORDER BY municipality`,
    departmentCod,
  );
  return rows;
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
