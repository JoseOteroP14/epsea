import {
    InnovaField,
    Question,
    QuestionBoolDetail,
    QuestionDateDetail,
    QuestionDependentListDetail,
    QuestionListDetail,
    QuestionNumericDetail,
    QuestionTextDetail,
    QuestionType,
    SurveyComponent,
    type Department,
    type Municipality,
    type SurveyResultItem,
} from "@/schemas/characterization";
import { apiFetch } from "@/utils/api";
import { checkConnectivity } from "@/hooks/use-network";
import { create } from "zustand";

import { useAuthStore } from "./useAuthStore";
import {
    getAllComponents,
    getAllInnovaFields,
    getAllQuestionTypes,
    getQuestionDetail as getQuestionDetailFromDb,
    getQuestionsByComponent,
    getStaticDepartments,
    getStaticMunicipalities,
} from "@/utils/database/repositories/characterization-repository";
import {
    getAppliedInterventionMethods,
    hasInterventionMethodApplied as hasAppliedInDb,
} from "@/utils/database/repositories/producer-intervention-repository";
import {
  getSurveyResults as getSurveyResultsFromDb,
  upsertSurveyResults,
} from "@/utils/database/repositories/survey-results-repository";
import {
  flattenInterventionMethodSurveyPayloadToRows,
  mapSurveyResultRowsToItems,
} from "@/utils/survey/flatten-intervention-method-survey-results";

// Component IDs (from backend)
export const PERSONAL_INFO_COMPONENT_ID = 1;
export const PROPERTY_INFO_COMPONENT_ID = 2;
export const PRODUCTIVE_LINES_COMPONENT_ID = 3;
export const CLASSIFICATION_COMPONENT_ID = 4;
export const CHARACTERIZATION_COMPONENT_ID = 5;

// Intervention method IDs used by POST /surveys & GET /surveys
export const PERSONAL_INFO_INTERVENTION_METHOD_ID = 1;
export const CHARACTERIZATION_INTERVENTION_METHOD_ID = 2;
export const CLASSIFICATION_INTERVENTION_METHOD_ID = 3;
export const PROPERTY_INFO_INTERVENTION_METHOD_ID = 7;
export const VISIT_INTERVENTION_METHOD_ID = 5;
export const VISIT2_INTERVENTION_METHOD_ID = 6;
export const PRODUCTIVE_LINES_INTERVENTION_METHOD_ID = 8;
/** Método REST del registro de Visita 3 (`/visit-3`). */
export const VISIT3_REGISTRATION_INTERVENTION_METHOD_ID = 11;
/** Método REST de las respuestas de clasificación aplicadas dentro de Visita 3. */
export const VISIT3_CLASSIFICATION_INTERVENTION_METHOD_ID = 9;

type QuestionDetail =
  | QuestionTextDetail
  | QuestionDateDetail
  | QuestionBoolDetail
  | QuestionNumericDetail
  | QuestionListDetail
  | QuestionDependentListDetail;

interface CharacterizationState {
  // Data
  components: SurveyComponent[];
  questions: Question[];
  questionTypes: QuestionType[];
  questionDetails: Record<number, QuestionDetail>;
  innovaFields: InnovaField[];

  // Loading states
  loadingComponents: boolean;
  loadingQuestions: boolean;
  loadingQuestionDetail: boolean;
  loadingInnovaFields: boolean;

  error: string | null;

  // Pagination for questions
  questionsPagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    limit: number;
  };

  // Actions
  fetchComponents: () => Promise<void>;
  fetchQuestions: (
    componentId: number,
    page?: number,
    limit?: number,
  ) => Promise<void>;
  fetchQuestionTypes: () => Promise<void>;
  fetchQuestionDetail: (questionId: number, typeName: string) => Promise<void>;
  fetchInnovaFields: () => Promise<void>;
  fetchSurveyResults: (
    projectId: number,
    producerId: number,
    interventionMethodId: number,
  ) => Promise<SurveyResultItem[]>;
  updateSurveyAnswer: (answerId: number, value: string) => Promise<void>;
  updateDependentListAnswer: (
    answerId: number,
    value: string,
    child: { question_id: number; value: string } | null,
  ) => Promise<void>;
  updateMultipleAnswers: (
    questionId: number,
    surveyId: number,
    answers: { answer_value: string }[],
  ) => Promise<void>;
  getPersonalInfoComponent: () => SurveyComponent | undefined;
  getPropertyInfoComponent: () => SurveyComponent | undefined;
  getProductiveLinesComponent: () => SurveyComponent | undefined;
  getClassificationComponent: () => SurveyComponent | undefined;
  getCharacterizationComponent: () => SurveyComponent | undefined;
  getCanonicalTypeName: (typeId: number) => string;
  fetchDepartments: () => Promise<Department[]>;
  fetchMunicipalities: (departmentCod: string) => Promise<Municipality[]>;
  resetQuestions: () => void;
  hasInterventionMethodApplied: (
    producerId: number,
    projectId: number,
    interventionMethodId: number,
  ) => Promise<boolean>;
  getAppliedInterventionMethods: (
    producerId: number,
    projectId: number,
  ) => Promise<number[]>;
}

// Normalize type names to canonical English keys for the renderer
const TYPE_NAME_MAP: Record<string, string> = {
  text: "text",
  texto: "text",
  date: "date",
  fecha: "date",
  bool: "bool",
  boolean: "bool",
  booleana: "bool",
  booleano: "bool",
  "si/no": "bool",
  "sí/no": "bool",
  numeric: "numeric",
  numerica: "numeric",
  "numérica": "numeric",
  numerico: "numeric",
  "numérico": "numeric",
  list: "list",
  lista: "list",
  logica: "bool",
  "lógica": "bool",
  logico: "bool",
  "lógico": "bool",
  logic: "bool",
  logical: "bool",
  dependent_list: "dependent_list",
  "lista dependiente": "dependent_list",
  location: "location",
  "ubicación": "location",
  ubicacion: "location",
};

const QUESTION_TYPE_ID_FALLBACK: Record<number, string> = {
  1: "text",
  2: "date",
  3: "bool",
  4: "numeric",
  5: "list",
  6: "dependent_list",
  7: "location",
};


export const useCharacterizationStore = create<CharacterizationState>(
  (set, get) => ({
    components: [],
    questions: [],
    questionTypes: [],
    questionDetails: {},
    innovaFields: [],
    loadingComponents: false,
    loadingQuestions: false,
    loadingQuestionDetail: false,
    loadingInnovaFields: false,
    error: null,
    questionsPagination: {
      currentPage: 1,
      totalPages: 1,
      totalCount: 0,
      limit: 50,
    },

    fetchComponents: async () => {
      set({ loadingComponents: true, error: null });
      try {
        const cached = await getAllComponents();
        set({ components: cached, loadingComponents: false, error: null });
      } catch (e) {
        console.error("Failed to load components from SQLite:", e);
        set({ loadingComponents: false });
      }
    },

    fetchQuestions: async (componentId, _page = 1, limit = 50) => {
      set({ loadingQuestions: true, error: null });
      try {
        const cached = await getQuestionsByComponent(componentId);
        set({
          questions: cached,
          loadingQuestions: false,
          error: null,
          questionsPagination: {
            currentPage: 1,
            totalPages: 1,
            totalCount: cached.length,
            limit,
          },
        });
      } catch (e) {
        console.error("Failed to load questions from SQLite:", e);
        set({ loadingQuestions: false, questions: [] });
      }
    },

    fetchQuestionTypes: async () => {
      try {
        const cached = await getAllQuestionTypes();
        if (cached.length > 0) {
          set({ questionTypes: cached });
        }
      } catch (e) {
        console.error("Failed to load question types from SQLite:", e);
      }
    },

    fetchQuestionDetail: async (questionId, typeName) => {
      const normalizedType = typeName.toLowerCase();
      const canonical = TYPE_NAME_MAP[normalizedType];

      if (canonical !== "list" && canonical !== "dependent_list") {
        set((state) => ({
          questionDetails: {
            ...state.questionDetails,
            [questionId]: {} as QuestionDetail,
          },
        }));
        return;
      }

      try {
        const cached = await getQuestionDetailFromDb(questionId);
        if (cached) {
          set((state) => ({
            questionDetails: {
              ...state.questionDetails,
              [questionId]: cached as QuestionDetail,
            },
            loadingQuestionDetail: false,
          }));
        } else {
          set({ loadingQuestionDetail: false });
        }
      } catch (e) {
        console.error("Failed to load question detail from SQLite:", e);
        set({ loadingQuestionDetail: false });
      }
    },

    fetchInnovaFields: async () => {
      set({ loadingInnovaFields: true, error: null });
      try {
        const cached = await getAllInnovaFields();
        set({ innovaFields: cached as InnovaField[], loadingInnovaFields: false });
      } catch (e) {
        console.error("Failed to load innova fields from SQLite:", e);
        set({ loadingInnovaFields: false });
      }
    },

    fetchSurveyResults: async (projectId, producerId, interventionMethodId) => {
      // Helper to map SQLite cached rows to SurveyResultItem[]
      const mapCachedResults = (cached: Awaited<ReturnType<typeof getSurveyResultsFromDb>>): SurveyResultItem[] =>
        cached.map((r) => ({
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

      // 1. Always load from SQLite cache first (populated during sync download)
      let cachedResults: SurveyResultItem[] = [];
      try {
        const cached = await getSurveyResultsFromDb(
          producerId,
          projectId,
          interventionMethodId,
        );
        if (cached.length > 0) {
          cachedResults = mapCachedResults(cached);
        }
      } catch (e) {
        console.error("Failed to load survey results from SQLite:", e);
      }

      // 2. If offline, return cached data immediately
      const isOnline = await checkConnectivity();
      if (!isOnline) {
        return cachedResults;
      }

      // 3. If online, try to fetch from API and write-through to SQLite
      try {
        const response = await apiFetch<any>(
          `/surveys/${projectId}/producer/${producerId}/intervention_method/${interventionMethodId}`,
          { method: "GET" },
        );
        const rows = flattenInterventionMethodSurveyPayloadToRows(
          response,
          interventionMethodId,
          producerId,
          projectId,
        );
        if (rows.length > 0) {
          await upsertSurveyResults(rows);
          return mapSurveyResultRowsToItems(rows);
        }
        // API vacía o no aplanable: conservar caché local (fuente de verdad offline)
        if (cachedResults.length > 0) {
          return cachedResults;
        }
        return [];
      } catch (error) {
        // API failed — return cached results if available
        if (cachedResults.length > 0) {
          return cachedResults;
        }
        return [];
      }
    },

    updateSurveyAnswer: async (answerId, value) => {
      await apiFetch(`/surveys/update-answer/${answerId}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      });
    },

    updateDependentListAnswer: async (answerId, value, child) => {
      const body: {
        value: string;
        child:
          | null
          | { question_id: number; answer_value: string };
      } = {
        value: String(value ?? ""),
        child:
          child != null
            ? {
                question_id: child.question_id,
                answer_value: String(child.value ?? ""),
              }
            : null,
      };
      await apiFetch(`/questions-dependent-list/${answerId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
    },

    updateMultipleAnswers: async (questionId: number, surveyId: number, answers: { answer_value: string }[]) => {
      await apiFetch(`/surveys/update-answer-multiple`, {
        method: "PUT",
        body: JSON.stringify({ question_id: questionId, survey_id: surveyId, answers }),
      });
    },

    getPersonalInfoComponent: () => {
      const { components } = get();
      return components.find((c) => c.id === PERSONAL_INFO_COMPONENT_ID);
    },

    getPropertyInfoComponent: () => {
      const { components } = get();
      return components.find((c) => c.id === PROPERTY_INFO_COMPONENT_ID);
    },

    getProductiveLinesComponent: () => {
      const { components } = get();
      return components.find((c) => c.id === PRODUCTIVE_LINES_COMPONENT_ID);
    },

    getClassificationComponent: () => {
      const { components } = get();
      return components.find((c) => c.id === CLASSIFICATION_COMPONENT_ID);
    },

    getCharacterizationComponent: () => {
      const { components } = get();
      return components.find((c) => c.id === CHARACTERIZATION_COMPONENT_ID);
    },

    getCanonicalTypeName: (typeId: number) => {
      const { questionTypes } = get();
      const found = questionTypes.find((t) => t.id === typeId);
      if (found) {
        const normalized = found.name.toLowerCase().trim();
        const mapped = TYPE_NAME_MAP[normalized];
        if (mapped) return mapped;
      }
      return QUESTION_TYPE_ID_FALLBACK[typeId] ?? "text";
    },

    fetchDepartments: async () => {
      return getStaticDepartments();
    },

    fetchMunicipalities: async (departmentCod: string) => {
      return getStaticMunicipalities(departmentCod);
    },

    resetQuestions: () =>
      set({
        questions: [],
        questionDetails: {},
        questionsPagination: {
          currentPage: 1,
          totalPages: 1,
          totalCount: 0,
          limit: 50,
        },
      }),

    hasInterventionMethodApplied: async (producerId, projectId, interventionMethodId) => {
      const userId = useAuthStore.getState().user?.user_id;
      if (!userId) return false;
      try {
        return await hasAppliedInDb(producerId, projectId, interventionMethodId, userId);
      } catch {
        return false;
      }
    },

    getAppliedInterventionMethods: async (producerId, projectId) => {
      const userId = useAuthStore.getState().user?.user_id;
      if (!userId) return [];
      try {
        return await getAppliedInterventionMethods(producerId, projectId, userId);
      } catch {
        return [];
      }
    },
  }),
);
