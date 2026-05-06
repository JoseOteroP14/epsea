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
 * Which child question ids are triggered by the current parent value (lista dependiente).
 */
export function resolveDependentChildIdsFromDetail(
  detail: unknown,
  value: unknown,
): number[] {
  const items = getDependentListItems(detail);
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
