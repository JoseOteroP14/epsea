import type { Question } from "@/schemas/characterization";

/**
 * Reads numeric `order` from GET /surveys/.../intervention_method payloads.
 * Some backends serialize as `Order` (PascalCase) or `orden`.
 */
export function getInterventionMethodItemOrder(item: unknown): number {
  if (!item || typeof item !== "object") return 0;
  const o = item as Record<string, unknown>;
  const raw = o.order ?? o.Order ?? o.orden;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function readQuestionRecordOrder(question: Question): number | undefined {
  const r = question as Record<string, unknown>;
  const raw = r.order ?? r.Order ?? r.orden;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined;
}

/**
 * Stable tie-break after `question_order`: lower question id sorts first when orders match.
 */
export function compareInterventionMethodItemsStable(
  a: unknown,
  b: unknown,
): number {
  const da = getInterventionMethodItemOrder(a) - getInterventionMethodItemOrder(b);
  if (da !== 0) return da;
  const aid = Number((a as Record<string, unknown>)?.id) || 0;
  const bid = Number((b as Record<string, unknown>)?.id) || 0;
  return aid - bid;
}

/**
 * Ordinal shown before the question text (matches backend `order` when available).
 */
export function resolveSurveyQuestionDisplayOrdinal(args: {
  questionId: number;
  question: Question;
  surveyOrderByQuestionId: Record<number, number>;
  /** 1-based position in the locally sorted question list — last-resort fallback */
  listPositionFallback: number;
}): number {
  const fromSurvey = args.surveyOrderByQuestionId[args.questionId];
  if (
    typeof fromSurvey === "number" &&
    Number.isFinite(fromSurvey) &&
    fromSurvey > 0
  ) {
    return Math.trunc(fromSurvey);
  }
  const fromJson = readQuestionRecordOrder(args.question);
  if (fromJson != null) return fromJson;
  return Math.max(1, Math.trunc(args.listPositionFallback));
}

/** Tracks the smallest positive `question_order` per question_id when flattening multis. */
export function recordSurveyQuestionMinOrder(
  acc: Record<number, number>,
  questionId: number,
  order: number | undefined | null,
): void {
  if (
    typeof order !== "number" ||
    !Number.isFinite(order) ||
    Math.trunc(order) < 1
  )
    return;
  const ord = Math.trunc(order);
  const prev = acc[questionId];
  if (prev == null || ord < prev) acc[questionId] = ord;
}
