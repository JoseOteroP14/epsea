import { create } from "zustand";

export type SurveyDraftAnswers = Record<number, unknown>;

export interface SurveyDraft {
  answers: SurveyDraftAnswers;
  wizardIndex: number;
  updatedAt: number;
}

export interface FormDraft<T = unknown> {
  payload: T;
  updatedAt: number;
}

interface SurveyDraftState {
  drafts: Record<string, SurveyDraft>;
  formDrafts: Record<string, FormDraft>;
  setDraft: (
    key: string,
    draft: { answers: SurveyDraftAnswers; wizardIndex?: number },
  ) => void;
  getDraft: (key: string) => SurveyDraft | undefined;
  clearDraft: (key: string) => void;
  setFormDraft: <T>(key: string, payload: T) => void;
  getFormDraft: <T = unknown>(key: string) => FormDraft<T> | undefined;
  clearFormDraft: (key: string) => void;
  /** Drop drafts that do not belong to the current producer. */
  clearOtherProducers: (producerId: string) => void;
  clearAll: () => void;
}

export function buildSurveyDraftKey(
  producerId: string | number,
  projectId: string | number | undefined,
  interventionMethodId: number,
): string {
  return `${producerId}:${projectId ?? ""}:${interventionMethodId}`;
}

export function buildFormDraftKey(
  producerId: string | number,
  projectId: string | number | undefined,
  scope: string,
): string {
  return `${producerId}:${projectId ?? ""}:form:${scope}`;
}

export function buildSurveyEditDraftKey(
  producerId: string | number,
  projectId: string | number | undefined,
  interventionMethodId: number,
  questionId: number,
): string {
  return `${buildSurveyDraftKey(producerId, projectId, interventionMethodId)}:edit:${questionId}`;
}

function keepProducerKeys<T>(
  map: Record<string, T>,
  producerId: string,
): { next: Record<string, T>; changed: boolean } {
  const prefix = `${producerId}:`;
  let changed = false;
  const next: Record<string, T> = {};
  for (const [key, value] of Object.entries(map)) {
    if (key.startsWith(prefix)) {
      next[key] = value;
    } else {
      changed = true;
    }
  }
  return { next, changed };
}

export const useSurveyDraftStore = create<SurveyDraftState>((set, get) => ({
  drafts: {},
  formDrafts: {},

  setDraft: (key, draft) =>
    set((state) => ({
      drafts: {
        ...state.drafts,
        [key]: {
          answers: draft.answers,
          wizardIndex: draft.wizardIndex ?? state.drafts[key]?.wizardIndex ?? 0,
          updatedAt: Date.now(),
        },
      },
    })),

  getDraft: (key) => get().drafts[key],

  clearDraft: (key) =>
    set((state) => {
      if (!(key in state.drafts)) return state;
      const next = { ...state.drafts };
      delete next[key];
      return { drafts: next };
    }),

  setFormDraft: (key, payload) =>
    set((state) => ({
      formDrafts: {
        ...state.formDrafts,
        [key]: { payload, updatedAt: Date.now() },
      },
    })),

  getFormDraft: <T = unknown>(key: string) =>
    get().formDrafts[key] as FormDraft<T> | undefined,

  clearFormDraft: (key) =>
    set((state) => {
      if (!(key in state.formDrafts)) return state;
      const next = { ...state.formDrafts };
      delete next[key];
      return { formDrafts: next };
    }),

  clearOtherProducers: (producerId) =>
    set((state) => {
      const survey = keepProducerKeys(state.drafts, producerId);
      const forms = keepProducerKeys(state.formDrafts, producerId);
      if (!survey.changed && !forms.changed) return state;
      return { drafts: survey.next, formDrafts: forms.next };
    }),

  clearAll: () => set({ drafts: {}, formDrafts: {} }),
}));
