import type { Question } from "@/schemas/characterization";
import { findOptionMatchingStoredValue } from "@/utils/survey/option-display";

/** Detail blob from question detail API / cache (lista dependiente). */
export function getDependentListItems(detail: unknown): any[] {
  const d = detail as Record<string, unknown> | null | undefined;
  if (!d) return [];
  const items =
    (d as any)?.items ??
    (d as any)?.options ??
    (d as any)?.data?.items ??
    (d as any)?.data?.options ??
    (d as any)?.data ??
    [];
  return Array.isArray(items) ? items : [];
}

/**
 * Alinea un ítem del detalle (SQLite/API) con la fila correspondiente en
 * `question.options` cuando los `id` no coinciden (detalle minimal o ids distintos).
 */
function matchDependentListDetailItemToQuestionOption(
  item: Record<string, unknown>,
  fromQuestion: readonly unknown[],
): unknown | undefined {
  if (fromQuestion.length === 0) return undefined;

  if (item.id != null && item.id !== "") {
    const idNum = Number(item.id);
    const bySameId = fromQuestion.find((o: any) => {
      if (o?.id == null) return false;
      return Number(o.id) === idNum;
    });
    if (bySameId) return bySameId;
  }

  const itemValRaw = item.value;
  if (itemValRaw != null && String(itemValRaw) !== "") {
    const iv = String(itemValRaw).trim();
    const byVal = fromQuestion.find(
      (o: any) => o?.value != null && String(o.value).trim() === iv,
    );
    if (byVal) return byVal;
  }

  const itemNameRaw = item.name;
  if (typeof itemNameRaw === "string" && itemNameRaw.trim() !== "") {
    const n = itemNameRaw.trim().toLowerCase();
    const byName = fromQuestion.find(
      (o: any) =>
        typeof o?.name === "string" && o.name.trim().toLowerCase() === n,
    );
    if (byName) return byName;
  }

  const qId = Number(item.question_id);
  if (Number.isFinite(qId)) {
    const iv =
      itemValRaw != null && String(itemValRaw) !== ""
        ? String(itemValRaw).trim()
        : "";
    if (iv !== "") {
      const byQuestionAndVal = fromQuestion.find(
        (o: any) =>
          Number(o.question_id) === qId &&
          o?.value != null &&
          String(o.value).trim() === iv,
      );
      if (byQuestionAndVal) return byQuestionAndVal;
    }
    if (typeof itemNameRaw === "string" && itemNameRaw.trim() !== "") {
      const ln = itemNameRaw.trim().toLowerCase();
      const byQuestionAndName = fromQuestion.find(
        (o: any) =>
          Number(o.question_id) === qId &&
          typeof o?.name === "string" &&
          o.name.trim().toLowerCase() === ln,
      );
      if (byQuestionAndName) return byQuestionAndName;
    }
  }

  return undefined;
}

/**
 * Lista dependiente: el detalle en SQLite a veces no trae `other_question_id`,
 * pero el objeto pregunta (raw_json del listado GET /questions) sí.
 * Unimos por `id` de opción y rellenamos referencias faltantes.
 */
export function getEffectiveDependentListItems(
  detail: unknown,
  question?: Question,
): any[] {
  const fromDetail = getDependentListItems(detail);
  const qOpts = (question as { options?: unknown } | undefined)?.options;
  const fromQuestion = Array.isArray(qOpts) ? qOpts : [];

  if (fromDetail.length === 0) {
    return fromQuestion;
  }
  if (fromQuestion.length === 0) {
    return fromDetail;
  }

  return fromDetail.map((item: any) => {
    const row = item as Record<string, unknown>;
    const match = matchDependentListDetailItemToQuestionOption(
      row,
      fromQuestion,
    );
    if (!match) return item;
    const oid =
      item?.other_question_id ?? (match as any)?.other_question_id;
    if (oid === undefined) return item;
    return { ...item, other_question_id: oid };
  });
}

/**
 * Which child question ids are triggered by the current parent value (lista dependiente).
 */
export function resolveDependentChildIdsFromDetail(
  detail: unknown,
  value: unknown,
  question?: Question,
): number[] {
  const items = getEffectiveDependentListItems(detail, question);
  if (items.length === 0) return [];

  const mainSelection =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as { _main?: unknown })._main
      : value;

  if (mainSelection == null || mainSelection === "") return [];

  const selectedValues = Array.isArray(mainSelection)
    ? mainSelection
    : [mainSelection];

  const childIds: number[] = [];
  for (const selectedValue of selectedValues) {
    const option = findOptionMatchingStoredValue(items, selectedValue);
    if (option?.other_question_id) {
      childIds.push(Number(option.other_question_id));
    }
  }

  return childIds;
}

/**
 * Preguntas hijas enlazadas solo por `other_question_id` en una lista dependiente.
 * (No incluye `question_parent_id`: esas siguen el flujo del wizard aparte.)
 */
export function collectListaDependienteChildQuestionIds(
  questions: Question[],
  questionDetails: Record<number, unknown>,
  getCanonicalTypeName: (typeId: number) => string,
): Set<number> {
  const ids = new Set<number>();
  for (const q of questions) {
    if (getCanonicalTypeName(q.question_type_id) !== "dependent_list") continue;
    const detail = questionDetails[q.id];
    const items = getEffectiveDependentListItems(detail, q);
    for (const opt of items) {
      if (opt?.other_question_id != null && opt.other_question_id !== "") {
        ids.add(Number(opt.other_question_id));
      }
    }
  }
  return ids;
}

/** Hij@s de lista dependiente que aplican con las respuestas actuales del padre. */
export function collectActiveDependentChildQuestionIds(
  questions: Question[],
  questionDetails: Record<number, unknown>,
  answers: Record<number, unknown>,
  getCanonicalTypeName: (typeId: number) => string,
): Set<number> {
  const active = new Set<number>();
  for (const q of questions) {
    if (getCanonicalTypeName(q.question_type_id) !== "dependent_list") continue;
    const detail = questionDetails[q.id];
    for (const cid of resolveDependentChildIdsFromDetail(
      detail,
      answers[q.id],
      q,
    )) {
      active.add(cid);
    }
  }
  return active;
}

export function isSurveyAnswerEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if ("_main" in o) {
      const m = o._main;
      if (m === undefined || m === null || m === "") return true;
      if (Array.isArray(m) && m.length === 0) return true;
      return false;
    }
  }
  return false;
}
