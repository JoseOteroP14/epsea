import type { Question } from "@/schemas/characterization";

const CLASSIFICATION_BODY_MARKER = "este componente";

export type ClassificationQuestionCopy = {
  /** Texto corto de la pregunta (antes de "Este componente…"). */
  title: string;
  /** Justificación / contexto a mostrar en el body del sheet. */
  body: string | null;
};

/**
 * Parte la descripción de clasificación:
 * - título: lo anterior a "Este componente"
 * - body: desde "Este componente" (justificación)
 */
export function splitClassificationQuestionCopy(
  description: string | null | undefined,
  index = 0,
): ClassificationQuestionCopy {
  if (!description?.trim()) {
    return { title: `${index + 1}. Pregunta`, body: null };
  }

  const lower = description.toLowerCase();
  const markerIndex = lower.indexOf(CLASSIFICATION_BODY_MARKER);

  if (markerIndex > 0) {
    let title = description.substring(0, markerIndex).trim();
    if (title.endsWith(".")) {
      title = title.slice(0, -1).trim();
    }
    const body = description.substring(markerIndex).trim();
    return {
      title: `${index + 1}. ${title}`,
      body: body.length > 0 ? body : null,
    };
  }

  return {
    title: `${index + 1}. ${description.trim()}`,
    body: null,
  };
}

/** Título legible de una pregunta de encuesta (sin split de clasificación). */
export function getSurveyQuestionTitle(
  question: Question,
  index = 0,
): string {
  const raw =
    question.description?.trim() ||
    question.name?.trim() ||
    `Pregunta ${index + 1}`;
  // Si ya viene numerada, no duplicar
  if (/^\d+(?:\.\d+)*\.\s/.test(raw)) return raw;
  return `${index + 1}. ${raw}`;
}
