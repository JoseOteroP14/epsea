import type { Question } from "@/schemas/characterization";

import { resolveDependentChildIdsFromDetail } from "./dependent-child-ids";

/** Debe mantenerse alineado con el `new_value` guardado offline en cada tab. */

export function serializeMultipleOfflineUpsert(params: {
  questionId: number;
  surveyId: number;
  rawVal: unknown;
}): string {
  const values = Array.isArray(params.rawVal)
    ? params.rawVal
    : [params.rawVal];
  return JSON.stringify({
    __type: "multiple",
    question_id: params.questionId,
    survey_id: params.surveyId,
    answers: values.map((v) => ({ answer_value: String(v ?? "") })),
  });
}

export function serializePersonalOfflineUpsert(params: {
  question: Question;
  typeName: string;
  rawVal: unknown;
  /** First active child question id when lista dependiente, else undefined */
  primaryChildQuestionId: number | undefined;
  rawChildVal: unknown;
  /** Requerido para multi-select → endpoint update-answer-multiple al sincronizar */
  surveyId?: number;
}): string {
  const {
    question,
    typeName,
    rawVal,
    primaryChildQuestionId,
    rawChildVal,
    surveyId,
  } = params;

  if (typeName === "dependent_list") {
    const parentValue =
      typeof rawVal === "object" && rawVal !== null && !Array.isArray(rawVal)
        ? String(
            (rawVal as { _main?: unknown })._main ??
              (rawVal as { value?: unknown }).value ??
              JSON.stringify(rawVal),
          )
        : String(rawVal ?? "");

    const payload: Record<string, unknown> = {
      __type: "dependent",
      value: parentValue,
      child:
        primaryChildQuestionId !== undefined &&
        rawChildVal != null &&
        String(rawChildVal) !== ""
          ? {
              question_id: primaryChildQuestionId,
              answer_value: String(rawChildVal),
            }
          : null,
    };
    return JSON.stringify(payload);
  }

  if (question.multiple === true && surveyId != null && Number.isFinite(surveyId)) {
    return serializeMultipleOfflineUpsert({
      questionId: question.id,
      surveyId,
      rawVal,
    });
  }

  const newValue = Array.isArray(rawVal)
    ? rawVal.join(",")
    : typeof rawVal === "object" && rawVal !== null
      ? String(
          (rawVal as { _main?: unknown })._main ??
            (rawVal as { value?: unknown }).value ??
            JSON.stringify(rawVal),
        )
      : String(rawVal ?? "");
  return newValue;
}

/** Child answer lookup for lista dependiente (baseline vs borrador actual). */
export function getPrimaryDependentChildSerializationContext(
  typeName: string,
  detail: unknown,
  parentRawVal: unknown,
  getAnswersMap: Record<number, unknown>,
  question?: Question,
): {
  primaryChildQuestionId?: number;
  rawChildVal: unknown;
} {
  if (typeName !== "dependent_list") {
    return { rawChildVal: undefined };
  }
  const ids = resolveDependentChildIdsFromDetail(detail, parentRawVal, question);
  const primaryChildQuestionId = ids[0];
  if (primaryChildQuestionId === undefined || primaryChildQuestionId === null) {
    return { rawChildVal: undefined };
  }
  return {
    primaryChildQuestionId,
    rawChildVal: getAnswersMap[primaryChildQuestionId],
  };
}

export function serializeClassificationOfflineUpsert(
  question: Question,
  rawVal: unknown,
  surveyId?: number,
): string {
  if (
    question.multiple === true &&
    surveyId != null &&
    Number.isFinite(surveyId)
  ) {
    return serializeMultipleOfflineUpsert({
      questionId: question.id,
      surveyId,
      rawVal,
    });
  }
  if (question.multiple === true && Array.isArray(rawVal)) {
    return [...rawVal].map((v) => String(v)).join(",");
  }
  const newValue = Array.isArray(rawVal)
    ? rawVal.join(",")
    : typeof rawVal === "object" && rawVal !== null
      ? String(
          (rawVal as { _main?: unknown })._main ??
            (rawVal as { value?: unknown }).value ??
            JSON.stringify(rawVal),
        )
      : String(rawVal ?? "");
  return newValue;
}

export function serializeCharacterizationOfflineUpsert(
  rawVal: unknown,
  opts?: { questionId?: number; surveyId?: number; multiple?: boolean },
): string {
  if (
    opts?.multiple === true &&
    opts.surveyId != null &&
    Number.isFinite(opts.surveyId) &&
    opts.questionId != null
  ) {
    return serializeMultipleOfflineUpsert({
      questionId: opts.questionId,
      surveyId: opts.surveyId,
      rawVal,
    });
  }
  if (Array.isArray(rawVal)) {
    return rawVal.map((v) => String(v)).join(",");
  }
  return typeof rawVal === "object" && rawVal !== null
    ? String(
        (rawVal as { _main?: unknown })._main ??
          (rawVal as { value?: unknown }).value ??
          JSON.stringify(rawVal),
      )
    : String(rawVal ?? "");
}

export function serializePropertyOfflineUpsert(
  rawVal: unknown,
  opts?: { questionId?: number; surveyId?: number; multiple?: boolean },
): string {
  if (
    opts?.multiple === true &&
    opts.surveyId != null &&
    Number.isFinite(opts.surveyId) &&
    opts.questionId != null
  ) {
    return serializeMultipleOfflineUpsert({
      questionId: opts.questionId,
      surveyId: opts.surveyId,
      rawVal,
    });
  }
  return Array.isArray(rawVal)
    ? rawVal.join(",")
    : typeof rawVal === "object" && rawVal !== null
      ? JSON.stringify(rawVal)
      : String(rawVal ?? "");
}

function cloneBaselineSnapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function snapshotServerBaselineAnswers(
  mergedAfterRemoteOnly: Record<number, unknown>,
  itemNamesAfterRemoteOnly: Record<number, string | string[] | null>,
): {
  baselineAnswers: Record<number, unknown>;
  baselineItemNames: Record<number, string | string[] | null>;
} {
  return {
    baselineAnswers: cloneBaselineSnapshot(mergedAfterRemoteOnly),
    baselineItemNames: cloneBaselineSnapshot(itemNamesAfterRemoteOnly),
  };
}

function normalizeMultiplePayloadValues(parsed: {
  answers?: unknown;
}): string {
  const raw = parsed.answers;
  if (!Array.isArray(raw)) return "";
  return raw
    .map((a) =>
      String(
        a != null && typeof a === "object"
          ? (a as { answer_value?: unknown }).answer_value ?? ""
          : a ?? "",
      ).trim(),
    )
    .filter(Boolean)
    .sort()
    .join("|");
}

/** Compara `new_value` como lo guardamos offline, tolerando orden en multi-select y espacios. */
export function offlinePendingValuesAreEquivalent(params: {
  proposed: string;
  baseline: string;
  /** Pregunta con multiple=true y payload tipo lista separada por comas (no JSON de dependiente) */
  isCommaMultiselect: boolean;
}): boolean {
  const { proposed, baseline, isCommaMultiselect } = params;

  const trimPair = proposed.trim() === baseline.trim();

  let proposedNorm = proposed.trim();
  let baselineNorm = baseline.trim();

  if (isCommaMultiselect && proposedNorm && baselineNorm && !proposedNorm.startsWith("{")) {
    proposedNorm = proposedNorm
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .sort()
      .join("|");
    baselineNorm = baselineNorm
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .sort()
      .join("|");
  }

  if (proposedNorm === baselineNorm) return true;

  try {
    const pa = JSON.parse(proposed.trim());
    const pb = JSON.parse(baseline.trim());
    if (
      pa &&
      typeof pa === "object" &&
      pa.__type === "dependent" &&
      pb &&
      typeof pb === "object" &&
      pb.__type === "dependent"
    ) {
      const ca = pa.child
        ? {
            question_id: Number(pa.child.question_id),
            answer_value: String(pa.child.answer_value ?? "").trim(),
          }
        : null;
      const cb = pb.child
        ? {
            question_id: Number(pb.child.question_id),
            answer_value: String(pb.child.answer_value ?? "").trim(),
          }
        : null;
      const childEq =
        (ca === null && cb === null) ||
        (ca != null &&
          cb != null &&
          ca.question_id === cb.question_id &&
          ca.answer_value === cb.answer_value);
      return (
        childEq &&
        String(pa.value ?? "").trim() === String(pb.value ?? "").trim()
      );
    }
    if (
      pa &&
      typeof pa === "object" &&
      pa.__type === "multiple" &&
      pb &&
      typeof pb === "object" &&
      pb.__type === "multiple"
    ) {
      return (
        normalizeMultiplePayloadValues(pa) ===
        normalizeMultiplePayloadValues(pb)
      );
    }
  } catch {}

  return trimPair;
}

/** Desenvuelve `new_value` de answer_updates para mostrar en UI. */
export function unwrapOfflineAnswerUpdateValue(newValue: string | null): {
  value: unknown;
  childQuestionId?: number;
  childValue?: string;
} {
  if (newValue == null) return { value: null };
  try {
    const parsed = JSON.parse(newValue);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      if (parsed.__type === "multiple" && Array.isArray(parsed.answers)) {
        return {
          value: parsed.answers.map((a: { answer_value?: unknown }) =>
            String(a?.answer_value ?? ""),
          ),
        };
      }
      if (parsed.__type === "dependent") {
        const child = parsed.child as
          | { question_id?: unknown; answer_value?: unknown }
          | null
          | undefined;
        return {
          value: String(parsed.value ?? ""),
          childQuestionId:
            child != null ? Number(child.question_id) : undefined,
          childValue:
            child != null ? String(child.answer_value ?? "") : undefined,
        };
      }
      return { value: parsed };
    }
    if (Array.isArray(parsed)) return { value: parsed };
  } catch {}
  return { value: newValue };
}
