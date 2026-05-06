import type { Question } from "@/schemas/characterization";

import { resolveDependentChildIdsFromDetail } from "./dependent-child-ids";

/** Debe mantenerse alineado con el `new_value` guardado offline en cada tab. */

export function serializePersonalOfflineUpsert(params: {
  question: Question;
  typeName: string;
  rawVal: unknown;
  /** First active child question id when lista dependiente, else undefined */
  primaryChildQuestionId: number | undefined;
  rawChildVal: unknown;
}): string {
  const { question, typeName, rawVal, primaryChildQuestionId, rawChildVal } = params;

  if (typeName === "dependent_list") {
    const parentValue =
      typeof rawVal === "object" && rawVal !== null && !Array.isArray(rawVal)
        ? String(
            (rawVal as { _main?: unknown })._main ??
              (rawVal as { value?: unknown }).value ??
              JSON.stringify(rawVal),
          )
        : String(rawVal ?? "");

    const payload: Record<string, unknown> = { __type: "dependent", value: parentValue };
    if (
      primaryChildQuestionId !== undefined &&
      rawChildVal != null &&
      String(rawChildVal) !== ""
    ) {
      payload.child = {
        question_id: primaryChildQuestionId,
        answer_value: String(rawChildVal),
      };
    }
    return JSON.stringify(payload);
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
): {
  primaryChildQuestionId?: number;
  rawChildVal: unknown;
} {
  if (typeName !== "dependent_list") {
    return { rawChildVal: undefined };
  }
  const ids = resolveDependentChildIdsFromDetail(detail, parentRawVal);
  const primaryChildQuestionId = ids[0];
  if (primaryChildQuestionId === undefined || primaryChildQuestionId === null) {
    return { rawChildVal: undefined };
  }
  return {
    primaryChildQuestionId,
    rawChildVal: getAnswersMap[primaryChildQuestionId],
  };
}

export function serializeClassificationOfflineUpsert(question: Question, rawVal: unknown): string {
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

export function serializeCharacterizationOfflineUpsert(rawVal: unknown): string {
  return typeof rawVal === "object" && rawVal !== null && !Array.isArray(rawVal)
    ? String(
        (rawVal as { _main?: unknown })._main ??
          (rawVal as { value?: unknown }).value ??
          JSON.stringify(rawVal),
      )
    : String(rawVal ?? "");
}

export function serializePropertyOfflineUpsert(rawVal: unknown): string {
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
  } catch {}

  return trimPair;
}
