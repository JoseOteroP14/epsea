import { saveAnswer } from "@/utils/database/repositories/answer-repository";
import {
  enqueue,
  getSyncQueueItem,
} from "@/utils/database/repositories/sync-repository";

export type SurveySyncAnswerEntry =
  | { question_id: number; answer_value: string }
  | { question_id: number; answers: { answer_value: string }[] };

export interface PendingSurveyCreatePayload {
  project_id: number;
  intervention_method_id: number;
  producer_id: number;
  created_at: string;
  answers: SurveySyncAnswerEntry[];
}

function rawValToSqliteValue(rawVal: unknown): string | null {
  if (Array.isArray(rawVal)) return JSON.stringify(rawVal.map((v) => String(v)));
  if (rawVal == null) return null;
  if (typeof rawVal === "object") {
    const obj = rawVal as { _main?: unknown; value?: unknown };
    if (obj._main != null || obj.value != null) {
      return String(obj._main ?? obj.value ?? "");
    }
    return JSON.stringify(rawVal);
  }
  return String(rawVal);
}

export function rawValToSurveySyncEntry(
  questionId: number,
  rawVal: unknown,
): SurveySyncAnswerEntry {
  if (Array.isArray(rawVal)) {
    return {
      question_id: questionId,
      answers: rawVal.map((v) => ({ answer_value: String(v) })),
    };
  }
  if (typeof rawVal === "object" && rawVal !== null) {
    const obj = rawVal as { _main?: unknown; value?: unknown };
    return {
      question_id: questionId,
      answer_value: String(obj._main ?? obj.value ?? JSON.stringify(rawVal)),
    };
  }
  return {
    question_id: questionId,
    answer_value: String(rawVal ?? ""),
  };
}

/**
 * Actualiza respuestas de un create offline pendiente (SQLite + cola `survey_answers`).
 * No usa `answer_updates` (requiere `answer_id` del servidor).
 */
export async function rewritePendingSurveyAnswerCreate(params: {
  entityKey: string;
  userId: number;
  producerId: number;
  projectId: number;
  componentId: number;
  interventionMethodId: number;
  updates: { questionId: number; rawVal: unknown }[];
}): Promise<boolean> {
  const {
    entityKey,
    userId,
    producerId,
    projectId,
    componentId,
    interventionMethodId,
    updates,
  } = params;

  if (!updates.length) return false;

  for (const u of updates) {
    await saveAnswer({
      producer_id: producerId,
      project_id: projectId,
      component_id: componentId,
      question_id: u.questionId,
      user_id: userId,
      intervention_method_id: interventionMethodId,
      value: rawValToSqliteValue(u.rawVal),
    });
  }

  const queued = await getSyncQueueItem("survey_answers", entityKey);
  if (!queued) {
    // Sin fila de cola: reconstruir payload mínimo con las preguntas tocadas.
    const payload: PendingSurveyCreatePayload = {
      project_id: projectId,
      intervention_method_id: interventionMethodId,
      producer_id: producerId,
      created_at: new Date().toISOString().split("T")[0]!,
      answers: updates.map((u) => rawValToSurveySyncEntry(u.questionId, u.rawVal)),
    };
    await enqueue("survey_answers", entityKey, payload, userId);
    return true;
  }

  let payload: PendingSurveyCreatePayload;
  try {
    payload = JSON.parse(queued.payload) as PendingSurveyCreatePayload;
  } catch {
    return false;
  }

  const answers = Array.isArray(payload.answers) ? [...payload.answers] : [];
  for (const u of updates) {
    const entry = rawValToSurveySyncEntry(u.questionId, u.rawVal);
    const idx = answers.findIndex((a) => a.question_id === u.questionId);
    if (idx >= 0) answers[idx] = entry;
    else answers.push(entry);
  }

  await enqueue(
    "survey_answers",
    entityKey,
    { ...payload, answers },
    userId,
  );
  return true;
}
