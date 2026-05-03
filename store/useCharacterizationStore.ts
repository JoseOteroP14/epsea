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
import { create } from "zustand";

import { useAuthStore } from "./useAuthStore";
import {
    getAllComponents,
    getAllInnovaFields,
    getAllQuestionTypes,
    getQuestionDetail as getQuestionDetailFromDb,
    getQuestionsByComponent,
    upsertComponents,
    upsertInnovaFields,
    upsertQuestionDetail,
    upsertQuestions,
    upsertQuestionTypes,
} from "@/utils/database/repositories/characterization-repository";
import {
    getAppliedInterventionMethods,
    hasInterventionMethodApplied as hasAppliedInDb,
} from "@/utils/database/repositories/producer-intervention-repository";

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
export const PRODUCTIVE_LINES_INTERVENTION_METHOD_ID = 8;

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

// Map both English and Spanish type names to endpoints
const QUESTION_TYPE_ENDPOINTS: Record<string, string> = {
  text: "/questions-text",
  texto: "/questions-text",
  date: "/questions-date",
  fecha: "/questions-date",
  bool: "/questions-bool",
  boolean: "/questions-bool",
  booleana: "/questions-bool",
  booleano: "/questions-bool",
  "si/no": "/questions-bool",
  "sí/no": "/questions-bool",
  numeric: "/questions-numeric",
  numerica: "/questions-numeric",
  "numérica": "/questions-numeric",
  numerico: "/questions-numeric",
  "numérico": "/questions-numeric",
  list: "/questions-list",
  lista: "/questions-list",
  logica: "/questions-bool",
  "lógica": "/questions-bool",
  logico: "/questions-bool",
  "lógico": "/questions-bool",
  logic: "/questions-bool",
  logical: "/questions-bool",
  dependent_list: "/questions-list",
  "lista dependiente": "/questions-list",
  // Location type has no detail endpoint — uses departments/municipalities assistants
};

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

const CANONICAL_TYPE_DEFAULT_ID: Record<string, number> = {
  text: 1,
  date: 2,
  bool: 3,
  numeric: 4,
  list: 5,
  dependent_list: 6,
  location: 7,
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
        const response = await apiFetch<any>("/components", { method: "GET" });
        const data: SurveyComponent[] = Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response)
            ? response
            : [];

        // Write-through
        try {
          await upsertComponents(data);
        } catch (e) {
          console.error("Failed to persist components to SQLite:", e);
        }

        set({ components: data, loadingComponents: false });
      } catch (error) {
        console.error("Error fetching components:", error);

        // Fallback
        try {
          const cached = await getAllComponents();
          if (cached.length > 0) {
            set({ components: cached, loadingComponents: false, error: null });
            return;
          }
        } catch (e) {
          console.error("SQLite fallback failed:", e);
        }

        set({
          error: error instanceof Error ? error.message : "Error desconocido",
          loadingComponents: false,
        });
      }
    },

    fetchQuestions: async (componentId, page = 1, limit = 50) => {
      set({ loadingQuestions: true, error: null });
      try {
        const response = await apiFetch<any>("/questions/", {
          method: "GET",
          params: { page, limit, component_id: componentId },
        });

        let questionsData: Question[] = [];
        let totalPages = 1;
        let totalCount = 0;

        if (response?.data?.pagination) {
          const pag = response.data.pagination;
          questionsData = Array.isArray(pag.items) ? pag.items : [];
          totalPages = pag.totalPages ?? pag.total_pages ?? 1;
          totalCount =
            pag.totalItems ?? pag.total_items ?? questionsData.length;
        } else if (response?.meta) {
          questionsData = Array.isArray(response.data) ? response.data : [];
          totalPages = Math.ceil((response.meta.total ?? 0) / limit);
          totalCount = response.meta.total ?? questionsData.length;
        } else if (Array.isArray(response?.data)) {
          questionsData = response.data;
          totalCount = questionsData.length;
        } else if (Array.isArray(response)) {
          questionsData = response;
          totalCount = questionsData.length;
        }

        // Deduplicate by id (API may return duplicates) and sort ascending
        const seen = new Set<number>();
        questionsData = questionsData
          .filter((q) => {
            if (seen.has(q.id)) return false;
            seen.add(q.id);
            return true;
          })
          .sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id));

        // Write-through
        try {
          await upsertQuestions(questionsData);
        } catch (e) {
          console.error("Failed to persist questions to SQLite:", e);
        }

        set({
          questions: questionsData,
          loadingQuestions: false,
          questionsPagination: {
            currentPage: page,
            totalPages,
            totalCount,
            limit,
          },
        });
      } catch (error) {
        console.error("Error fetching questions:", error);

        // Fallback
        try {
          const cached = await getQuestionsByComponent(componentId);
          if (cached.length > 0) {
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
            return;
          }
        } catch (e) {
          console.error("SQLite fallback failed:", e);
        }

        set({
          error: error instanceof Error ? error.message : "Error desconocido",
          loadingQuestions: false,
          questions: [],
        });
      }
    },

    fetchQuestionTypes: async () => {
      try {
        const response = await apiFetch<any>("/questions/types", {
          method: "GET",
        });
        const rawData: any[] = Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response)
            ? response
            : [];

        const data: QuestionType[] = rawData
          .map((item: any) => {
            const rawName =
              typeof item?.name === "string" ? item.name.trim() : "";
            const rawType =
              typeof item?.type === "string" ? item.type.trim() : "";

            const normalizedName = rawName.toLowerCase();
            const normalizedType = rawType.toLowerCase();

            const canonical =
              TYPE_NAME_MAP[normalizedType] ?? TYPE_NAME_MAP[normalizedName] ?? null;

            const resolvedId =
              typeof item?.id === "number"
                ? item.id
                : canonical
                  ? CANONICAL_TYPE_DEFAULT_ID[canonical]
                  : undefined;

            if (resolvedId == null) return null;

            return {
              id: resolvedId,
              name: rawName || rawType || canonical || `type_${resolvedId}`,
            } as QuestionType;
          })
          .filter((item): item is QuestionType => item !== null)
          .filter(
            (item, index, arr) =>
              arr.findIndex((candidate) => candidate.id === item.id) === index,
          );

        // Write-through
        try {
          await upsertQuestionTypes(data);
        } catch (e) {
          console.error("Failed to persist question types to SQLite:", e);
        }

        set({ questionTypes: data });
      } catch (error) {
        console.error("Error fetching question types:", error);

        // Fallback
        try {
          const cached = await getAllQuestionTypes();
          if (cached.length > 0) {
            set({ questionTypes: cached });
            return;
          }
        } catch (e) {
          console.error("SQLite fallback failed:", e);
        }
      }
    },

    fetchQuestionDetail: async (questionId, typeName) => {
      const normalizedType = typeName.toLowerCase();
      const canonical = TYPE_NAME_MAP[normalizedType];

      // Only "list" type questions support GET on their detail endpoint.
      // text, date, bool, numeric endpoints only support POST/PUT/DELETE (admin ops).
      // location uses departments/municipalities assistants instead.
      if (canonical !== "list" && canonical !== "dependent_list") {
        set((state) => ({
          questionDetails: {
            ...state.questionDetails,
            [questionId]: {} as QuestionDetail,
          },
        }));
        return;
      }

      const endpoint = QUESTION_TYPE_ENDPOINTS[normalizedType];
      if (!endpoint) {
        console.warn(`Unknown question type: ${typeName}`);
        return;
      }

      set({ loadingQuestionDetail: true });
      try {
        const response = await apiFetch<any>(`${endpoint}/${questionId}`, {
          method: "GET",
        });
        const detail = response?.data ?? response;

        // Write-through
        try {
          await upsertQuestionDetail(questionId, normalizedType, detail);
        } catch (e) {
          console.error("Failed to persist question detail to SQLite:", e);
        }

        set((state) => ({
          questionDetails: {
            ...state.questionDetails,
            [questionId]: detail,
          },
          loadingQuestionDetail: false,
        }));
      } catch (error) {
        console.error("Error fetching question detail:", error);

        // Fallback
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
            return;
          }
        } catch (e) {
          console.error("SQLite fallback failed:", e);
        }

        set({ loadingQuestionDetail: false });
      }
    },

    fetchInnovaFields: async () => {
      set({ loadingInnovaFields: true, error: null });
      try {
        const response = await apiFetch<any>("/assistants/innova-fields", {
          method: "GET",
        });
        const data: InnovaField[] = Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response)
            ? response
            : [];

        // Write-through
        try {
          await upsertInnovaFields(data);
        } catch (e) {
          console.error("Failed to persist innova fields to SQLite:", e);
        }

        set({ innovaFields: data, loadingInnovaFields: false });
      } catch (error) {
        console.error("Error fetching innova fields:", error);

        // Fallback
        try {
          const cached = await getAllInnovaFields();
          if (cached.length > 0) {
            set({
              innovaFields: cached as InnovaField[],
              loadingInnovaFields: false,
              error: null,
            });
            return;
          }
        } catch (e) {
          console.error("SQLite fallback failed:", e);
        }

        set({
          error: error instanceof Error ? error.message : "Error desconocido",
          loadingInnovaFields: false,
        });
      }
    },

    fetchSurveyResults: async (projectId, producerId, interventionMethodId) => {
      try {
        const response = await apiFetch<any>(
          `/surveys/${projectId}/producer/${producerId}/intervention_method/${interventionMethodId}`,
          { method: "GET" },
        );
        const rawData = Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response)
            ? response
            : [];

        // Always use the raw `value` field — this is the option value (e.g., "1", "2")
        // that the API expects. `item_name` is only a display label.
        // This matches the Vue web app's normalizeMethodResponses() which uses firstAnswer?.value.
        const pickAnswerValue = (answer: any): any => {
          return answer?.value ?? answer?.answer_value ?? answer?.answerValue ?? "";
        };

        // The API returns questions with nested `answers` arrays:
        //   { id, description, answers: [{ id, survey_id, question_id, value }] }
        // Flatten into SurveyResultItem[] expected by the tabs.
        const flattened: SurveyResultItem[] = [];
        for (const item of rawData) {
          const nestedAnswers = item.answers;
          if (Array.isArray(nestedAnswers) && nestedAnswers.length > 0) {
            for (const ans of nestedAnswers) {
              const answerValue = pickAnswerValue(ans);
              flattened.push({
                survey_id: ans.survey_id ?? 0,
                created_at: item.created_at ?? "",
                updated_at: item.updated_at ?? "",
                intervention_method_id: interventionMethodId,
                intervention_method_name: "",
                answer_id: ans.id,
                answer_value: answerValue ?? "",
                question_id: ans.question_id ?? item.id,
                question_description: item.description ?? null,
                question_type_id: item.question_type_id ?? 0,
                question_parent_id: item.question_parent_id ?? null,
              });
            }
          } else if (item.answer_id != null) {
            // Already in flat format — pass through as-is
            // Use value fields only (never item_name) to stay consistent
            const flatAnswerValue = pickAnswerValue({
              value: item?.answer_value ?? item?.value ?? item?.answer?.value,
            });
            flattened.push({
              ...(item as SurveyResultItem),
              answer_value: flatAnswerValue ?? item?.answer_value ?? "",
            });
          }
        }
        return flattened;
      } catch (error) {
        console.error("Error fetching survey results:", error);
        return [];
      }
    },

    updateSurveyAnswer: async (answerId, value) => {
      await apiFetch(`/surveys/update-answer/${answerId}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      });
    },

    updateDependentListAnswer: async (answerId, value, _child) => {
      await apiFetch(`/surveys/update-answer/${answerId}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
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
      const response = await apiFetch<any>("/assistants/departments", {
        method: "GET",
      });
      const data: Department[] = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response)
          ? response
          : [];
      return data;
    },

    fetchMunicipalities: async (departmentCod: string) => {
      const response = await apiFetch<any>(
        `/assistants/municipalities/${departmentCod}`,
        { method: "GET" },
      );
      const data: Municipality[] = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response)
          ? response
          : [];
      return data;
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
