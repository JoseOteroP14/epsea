import type { Question } from "@/schemas/characterization";

/** API usa `required`; SQLite/UI histórico usa `is_required`. */
export function isQuestionRequired(q: Question): boolean {
  return q.is_required === true || q.required === true;
}
