import type { SurveyResultItem } from "@/schemas/characterization";
import type { SurveyResultRow } from "@/utils/database/repositories/survey-results-repository";
import {
  compareInterventionMethodItemsStable,
  getInterventionMethodItemOrder,
} from "@/utils/survey/intervention-method-order";

function pickAnswerValue(answer: unknown): string {
  if (answer == null || typeof answer !== "object") return "";
  const a = answer as Record<string, unknown>;
  const v = a.value ?? a.answer_value ?? a.answerValue ?? a.name;
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  return "";
}

function resolveQuestionId(item: Record<string, unknown>): number {
  const q =
    item.question_id ??
    item.questionId ??
    (typeof item.id === "number" || typeof item.id === "string" ? item.id : undefined);
  const n = Number(q);
  return Number.isFinite(n) ? n : 0;
}

/**
 * When the API omits `answer.id`, SQLite still needs a stable UNIQUE `answer_id`.
 * Negative space avoids collisions with real server ids.
 */
function syntheticAnswerId(
  producerId: number,
  projectId: number,
  interventionMethodId: number,
  questionId: number,
  salt: number,
): number {
  const base =
    (Math.abs(producerId) % 900719) * 1000003 +
    (Math.abs(projectId) % 900719) * 10007 +
    (Math.abs(interventionMethodId) % 100) * 100003 +
    (Math.abs(questionId) % 1000003) * 17 +
    salt;
  return -Math.max(1, base % 2000000000);
}

/**
 * Flattens GET `/surveys/{project}/producer/{producer}/intervention_method/{method}` payloads
 * into rows for `survey_results` (same shape as tabs + sync).
 *
 * Supports:
 * - `answers: [{ id, question_id, value, ... }]`
 * - top-level `answer_id` + `answer_value` / `value`
 * - single embedded `answer: { id?, value?, name? }` (common for list / boolean rows)
 * - `answer_value` / `value` without `answer_id` when `question_id` / `id` identifies the question
 */
export function flattenInterventionMethodSurveyPayloadToRows(
  rawData: unknown,
  interventionMethodId: number,
  producerId: number,
  projectId: number,
): SurveyResultRow[] {
  const arr: unknown[] = Array.isArray(rawData)
    ? rawData
    : Array.isArray((rawData as { data?: unknown })?.data)
      ? ((rawData as { data: unknown[] }).data ?? [])
      : [];
  if (arr.length === 0) return [];

  const sorted = [...arr].sort(compareInterventionMethodItemsStable);
  const out: SurveyResultRow[] = [];
  let synthSalt = 0;

  for (const raw of sorted) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const qOrder = getInterventionMethodItemOrder(item);
    const questionIdBase = resolveQuestionId(item);
    const nestedAnswers = item.answers;

    if (Array.isArray(nestedAnswers) && nestedAnswers.length > 0) {
      for (let nestedIdx = 0; nestedIdx < nestedAnswers.length; nestedIdx++) {
        const ans = nestedAnswers[nestedIdx];
        if (!ans || typeof ans !== "object") continue;
        const a = ans as Record<string, unknown>;
        const aid = a.id ?? a.answer_id;
        const qidRaw = a.question_id ?? questionIdBase;
        const qid = Number(qidRaw);
        const qidSafe = Number.isFinite(qid) && qid > 0 ? qid : questionIdBase;
        const numAid = Number(aid);
        const answerId =
          aid != null && Number.isFinite(numAid) && numAid !== 0
            ? numAid
            : syntheticAnswerId(
                producerId,
                projectId,
                interventionMethodId,
                qidSafe,
                nestedIdx,
              );
        const desc =
          item.description != null
            ? String(item.description)
            : item.question_description != null
              ? String(item.question_description)
              : null;
        out.push({
          survey_id: Number(a.survey_id ?? item.survey_id ?? 0) || 0,
          answer_id: answerId,
          question_id: qidSafe,
          answer_value: String(pickAnswerValue(a) || ""),
          item_name: a.item_name != null ? String(a.item_name) : null,
          question_description: desc,
          question_type_id: Number(item.question_type_id ?? 0) || 0,
          question_parent_id:
            item.question_parent_id != null ? Number(item.question_parent_id) : null,
          question_order: qOrder,
          intervention_method_id: interventionMethodId,
          producer_id: producerId,
          project_id: projectId,
          created_at: item.created_at != null ? String(item.created_at) : null,
          updated_at: item.updated_at != null ? String(item.updated_at) : null,
        });
      }
      continue;
    }

    const topAnswerId = item.answer_id ?? (item as { answerId?: unknown }).answerId;
    const numTopAid = Number(topAnswerId);
    if (topAnswerId != null && Number.isFinite(numTopAid) && numTopAid !== 0) {
      const pickVal = pickAnswerValue({
        value: item.answer_value ?? item.value,
        answer_value: item.answer_value,
        name: (item.answer as Record<string, unknown> | undefined)?.name,
        answer: item.answer,
      });
      const desc =
        item.question_description != null
          ? String(item.question_description)
          : item.description != null
            ? String(item.description)
            : null;
      out.push({
        survey_id: Number(item.survey_id ?? 0) || 0,
        answer_id: numTopAid,
        question_id: questionIdBase,
        answer_value: String(pickVal || ""),
        item_name: item.item_name != null ? String(item.item_name) : null,
        question_description: desc,
        question_type_id: Number(item.question_type_id ?? 0) || 0,
        question_parent_id:
          item.question_parent_id != null ? Number(item.question_parent_id) : null,
        question_order: qOrder,
        intervention_method_id: interventionMethodId,
        producer_id: producerId,
        project_id: projectId,
        created_at: item.created_at != null ? String(item.created_at) : null,
        updated_at: item.updated_at != null ? String(item.updated_at) : null,
      });
      continue;
    }

    const singleAnswer = item.answer;
    if (singleAnswer && typeof singleAnswer === "object") {
      const sa = singleAnswer as Record<string, unknown>;
      const aid = sa.id ?? sa.answer_id;
      const qFromA = Number(sa.question_id);
      const qidSafe =
        Number.isFinite(qFromA) && qFromA > 0 ? qFromA : questionIdBase > 0 ? questionIdBase : 0;
      if (qidSafe <= 0) continue;
      const numAid = Number(aid);
      const answerId =
        aid != null && Number.isFinite(numAid) && numAid !== 0
          ? numAid
          : syntheticAnswerId(producerId, projectId, interventionMethodId, qidSafe, 0);
      const itemName = sa.item_name ?? sa.name;
      const desc =
        item.description != null
          ? String(item.description)
          : item.question_description != null
            ? String(item.question_description)
            : null;
      out.push({
        survey_id: Number(item.survey_id ?? sa.survey_id ?? 0) || 0,
        answer_id: answerId,
        question_id: qidSafe,
        answer_value: String(pickAnswerValue(sa) || ""),
        item_name: itemName != null ? String(itemName) : null,
        question_description: desc,
        question_type_id: Number(item.question_type_id ?? 0) || 0,
        question_parent_id:
          item.question_parent_id != null ? Number(item.question_parent_id) : null,
        question_order: qOrder,
        intervention_method_id: interventionMethodId,
        producer_id: producerId,
        project_id: projectId,
        created_at: item.created_at != null ? String(item.created_at) : null,
        updated_at: item.updated_at != null ? String(item.updated_at) : null,
      });
      continue;
    }

    const topVal =
      item.answer_value !== undefined && item.answer_value !== null
        ? item.answer_value
        : item.value;
    if (topVal !== undefined && topVal !== null && questionIdBase > 0) {
      const desc =
        item.description != null
          ? String(item.description)
          : item.question_description != null
            ? String(item.question_description)
            : null;
      out.push({
        survey_id: Number(item.survey_id ?? 0) || 0,
        answer_id: syntheticAnswerId(
          producerId,
          projectId,
          interventionMethodId,
          questionIdBase,
          synthSalt++,
        ),
        question_id: questionIdBase,
        answer_value: String(topVal),
        item_name: item.item_name != null ? String(item.item_name) : null,
        question_description: desc,
        question_type_id: Number(item.question_type_id ?? 0) || 0,
        question_parent_id:
          item.question_parent_id != null ? Number(item.question_parent_id) : null,
        question_order: qOrder,
        intervention_method_id: interventionMethodId,
        producer_id: producerId,
        project_id: projectId,
        created_at: item.created_at != null ? String(item.created_at) : null,
        updated_at: item.updated_at != null ? String(item.updated_at) : null,
      });
    }
  }

  return out;
}

export function mapSurveyResultRowsToItems(rows: SurveyResultRow[]): SurveyResultItem[] {
  return rows.map((r) => ({
    survey_id: r.survey_id,
    created_at: r.created_at ?? "",
    updated_at: r.updated_at ?? "",
    intervention_method_id: r.intervention_method_id,
    intervention_method_name: "",
    answer_id: r.answer_id,
    answer_value: r.answer_value ?? "",
    item_name: r.item_name ?? null,
    question_id: r.question_id,
    question_description: r.question_description ?? null,
    question_type_id: r.question_type_id,
    question_parent_id: r.question_parent_id ?? null,
    question_order: r.question_order,
  }));
}
