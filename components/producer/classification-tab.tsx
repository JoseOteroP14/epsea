import { ThemedText } from "@/components/themed-text";
import { useAlert } from "@/components/ui/custom-alert";
import { SurveyBottomSheet } from "@/components/wizard/survey-bottom-sheet";
import { checkConnectivity } from "@/hooks/use-network";
import type { Question } from "@/schemas/characterization";
import { useAuthStore } from "@/store/useAuthStore";
import {
    CLASSIFICATION_INTERVENTION_METHOD_ID,
    useCharacterizationStore,
} from "@/store/useCharacterizationStore";
import { useSyncStore } from "@/store/useSyncStore";
import { useSurveyApplyDraft } from "@/hooks/use-survey-apply-draft";
import {
  buildSurveyEditDraftKey,
  useSurveyDraftStore,
} from "@/store/useSurveyDraftStore";
import { apiFetch, NetworkError } from "@/utils/api";
import {
    getAnswers,
    saveAnswersBatch,
} from "@/utils/database/repositories/answer-repository";
import {
    deleteAnswerUpdate,
    getAnswerUpdatesByMethod,
    upsertAnswerUpdate,
} from "@/utils/database/repositories/answer-update-repository";
import { markInterventionMethodApplied } from "@/utils/database/repositories/producer-intervention-repository";
import { enqueue } from "@/utils/database/repositories/sync-repository";
import { findOptionMatchingStoredValue } from "@/utils/survey/option-display";
import {
  offlinePendingValuesAreEquivalent,
  serializeClassificationOfflineUpsert,
  snapshotServerBaselineAnswers,
  unwrapOfflineAnswerUpdateValue,
} from "@/utils/survey/offline-new-value-serializers";
import { rewritePendingSurveyAnswerCreate } from "@/utils/survey/rewrite-pending-survey-answers";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import {
    ClipboardCheck,
    FileQuestion,
    Layers,
    Pencil,
} from "lucide-react-native";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";

export interface ClassificationTabProps {
  producerId: string;
  projectId?: string;
  /**
   * Método de intervención al que se asocian las respuestas. Se usa para
   * reutilizar el wizard tanto en la clasificación inicial (`3`) como en la
   * clasificación de Visita 3 (`9`).
   * @default CLASSIFICATION_INTERVENTION_METHOD_ID (3)
   */
  interventionMethodId?: number;
  /**
   * Se dispara cuando el usuario guarda respuestas (creación o edición). Útil
   * para orquestar refrescos externos, p. ej. desbloquear el registro de Visita 3.
   */
  onSaved?: () => void;
  /** Copy visible en el botón principal cuando aún no existe encuesta. */
  applyButtonLabel?: string;
  /** Título del bottom sheet en modo aplicar. Por defecto usa el nombre del componente. */
  sheetTitle?: string;
}

interface DisplayAnswer {
  questionId: number;
  questionName: string;
  displayValue: string;
  isPending?: boolean;
}

/**
 * Extract the question title from the description field.
 * The description typically contains a title followed by "Este componente..."
 * We extract only the part before "Este componente".
 */
function extractQuestionTitle(
  description: string | null | undefined,
  index: number,
): string {
  if (!description) return `${index + 1}. Pregunta`;

  const separator = "este componente";
  const lowerName = description.toLowerCase();
  const separatorIndex = lowerName.indexOf(separator);

  if (separatorIndex > 0) {
    let title = description.substring(0, separatorIndex).trim();
    if (title.endsWith(".")) {
      title = title.slice(0, -1);
    }
    return `${index + 1}. ${title}`;
  }

  return `${index + 1}. ${description}`;
}

function resolveDisplayValue(
  rawValue: any,
  questionId: number,
  questionDetails: Record<number, any>,
  getCanonicalTypeName: (typeId: number) => string,
  questionTypeId: number,
  itemName?: string | string[] | null,
): string {
  if (rawValue == null || rawValue === "") return "";

  // Handle arrays (multi-select)
  if (Array.isArray(rawValue)) {
    const parts = rawValue
      .map((v, i) => {
        const label = Array.isArray(itemName) ? itemName[i] : itemName;
        return resolveDisplayValue(
          v,
          questionId,
          questionDetails,
          getCanonicalTypeName,
          questionTypeId,
          label,
        );
      })
      .filter(Boolean);
    return parts.join(", ");
  }

  if (itemName && typeof itemName === "string" && itemName !== "") {
    return itemName;
  }

  const typeName = getCanonicalTypeName(questionTypeId);

  // Location type: value is "department_cod|municipality_code|municipality_name|department_name"
  if (typeName === "location") {
    if (typeof rawValue === "string" && rawValue.includes("|")) {
      const parts = rawValue.split("|");
      const muniName = parts[2] ?? "";
      const deptName = parts[3] ?? "";
      if (muniName && deptName) {
        return `${muniName.toUpperCase()}-${deptName.toUpperCase()}`;
      }
    }
    return String(rawValue);
  }

  if (typeName === "list") {
    const detail = questionDetails[questionId] as any;
    const options: any[] =
      detail?.options ??
      detail?.items ??
      detail?.data?.options ??
      detail?.data?.items ??
      detail?.data ??
      [];
    const match = findOptionMatchingStoredValue(options, rawValue);
    if (match?.name) return match.name;
  }

  if (typeName === "bool") {
    return (rawValue === true || rawValue === "true" || rawValue === 1 || rawValue === "1") ? "SI" : "NO";
  }

  // Fallback: detect boolean-like values even if questionTypes aren't loaded yet
  if (rawValue === true || rawValue === "true" || rawValue === 1 || rawValue === "1") return "SI";
  if (rawValue === false || rawValue === "false" || rawValue === 0 || rawValue === "0" || rawValue === 2 || rawValue === "2") return "NO";

  return String(rawValue);
}

function resolveNumericValue(
  rawValue: any,
  questionId: number,
  questionDetails: Record<number, any>,
  getCanonicalTypeName: (typeId: number) => string,
  questionTypeId: number,
): number | null {
  if (rawValue == null || rawValue === "") return null;

  if (Array.isArray(rawValue)) {
    const values = rawValue
      .map((v) =>
        resolveNumericValue(
          v,
          questionId,
          questionDetails,
          getCanonicalTypeName,
          questionTypeId,
        ),
      )
      .filter((v): v is number => v !== null);
    if (values.length === 0) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  const typeName = getCanonicalTypeName(questionTypeId);

  if (typeName === "list") {
    const detail = questionDetails[questionId] as any;
    const options: any[] =
      detail?.options ??
      detail?.items ??
      detail?.data?.options ??
      detail?.data?.items ??
      detail?.data ??
      [];
    const match = findOptionMatchingStoredValue(options, rawValue);
    if (match?.value != null) {
      const val = Number(match.value);
      if (!Number.isNaN(val)) return val;
    }
  }

  const direct = Number(rawValue);
  if (!Number.isNaN(direct)) return direct;

  return null;
}

function computeGeometricMean(values: number[]): number | null {
  const positive = values.filter((v) => v > 0);
  if (positive.length === 0) return null;
  const logSum = positive.reduce((sum, v) => sum + Math.log(v), 0);
  return Math.exp(logSum / positive.length);
}

export function ClassificationTab({
  producerId,
  projectId,
  interventionMethodId = CLASSIFICATION_INTERVENTION_METHOD_ID,
  onSaved,
  applyButtonLabel,
  sheetTitle,
}: ClassificationTabProps) {
  const {
    components,
    questions: storeQuestions,
    questionDetails,
    loadingComponents,
    loadingQuestions,
    fetchComponents,
    fetchQuestions,
    fetchQuestionTypes,
    fetchQuestionDetail,
    fetchSurveyResults,
    updateSurveyAnswer,
    updateMultipleAnswers,
    getClassificationComponent,
    getCanonicalTypeName,
  } = useCharacterizationStore();

  const currentUserId = useAuthStore((state) => state.user?.user_id);
  const { showAlert } = useAlert();

  const [showSheet, setShowSheet] = useState(false);
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [answerIds, setAnswerIds] = useState<Record<number, number>>({});
  const [surveyIds, setSurveyIds] = useState<Record<number, number>>({});
  const [hasSurvey, setHasSurvey] = useState(false);
  const [savedAnswers, setSavedAnswers] = useState<DisplayAnswer[]>([]);
  const [loadingAnswers, setLoadingAnswers] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [itemNames, setItemNames] = useState<
    Record<number, string | string[] | null>
  >({});
  const [pendingQuestionIds, setPendingQuestionIds] = useState<Set<number>>(
    new Set(),
  );

  // Local copy of classification questions (survives tab switches)
  const [localQuestions, setLocalQuestions] = useState<Question[]>([]);
  const hasFetchedQuestions = useRef(false);
  const requestedDetailsRef = useRef(new Set<number>());

  // Edit mode
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editAnswers, setEditAnswers] = useState<Record<number, any>>({});
  const skipEditDraftPersistRef = useRef(false);
  const setSurveyDraft = useSurveyDraftStore((s) => s.setDraft);
  const getSurveyDraft = useSurveyDraftStore((s) => s.getDraft);
  const clearSurveyDraft = useSurveyDraftStore((s) => s.clearDraft);

  // Snapshot of answers before opening sheet, used to restore display state on close
  const answersSnapshotRef = useRef<Record<number, any>>({});

  const baselineAnswersRef = useRef<Record<number, unknown>>({});
  const baselineItemNamesRef = useRef<Record<number, string | string[] | null>>({});
  const baselineDataScopeRef = useRef<string>("");

  const {
    wizardSessionKey,
    draftWizardIndex,
    syncAnswersRef,
    beginApplySession,
    persistOnClose,
    markSavedAndSkipPersist,
    handleWizardIndexChange,
    wrapAnswerChange,
  } = useSurveyApplyDraft({
    producerId,
    projectId,
    interventionMethodId,
    hasSurvey,
  });

  useEffect(() => {
    syncAnswersRef(answers);
  }, [answers, syncAnswersRef]);

  // Refresh answers when upload completes so pending badges clear
  const isUploading = useSyncStore((state) => state.isUploading);
  const prevIsUploadingRef = useRef(false);
  useEffect(() => {
    if (prevIsUploadingRef.current && !isUploading) {
      setRefreshKey((k) => k + 1);
    }
    prevIsUploadingRef.current = isUploading;
  }, [isUploading]);

  useEffect(() => {
    if (components.length === 0) {
      fetchComponents();
    }
    fetchQuestionTypes();
  }, [components.length, fetchComponents, fetchQuestionTypes]);

  const classificationComponent = getClassificationComponent();

  // Fetch classification questions on mount
  useEffect(() => {
    if (!classificationComponent || hasFetchedQuestions.current) return;
    hasFetchedQuestions.current = true;
    fetchQuestions(classificationComponent.id);
  }, [classificationComponent, fetchQuestions]);

  // Sync store questions → local copy
  useEffect(() => {
    if (
      storeQuestions.length > 0 &&
      classificationComponent &&
      storeQuestions[0]?.component_id === classificationComponent.id
    ) {
      setLocalQuestions(storeQuestions);
    }
  }, [storeQuestions, classificationComponent]);

  // Load answers: first from API, then overlay local pending answers
  useEffect(() => {
    if (!classificationComponent || !producerId || !projectId || !currentUserId)
      return;

    const pid = Number(producerId);
    const projId = Number(projectId);

    setLoadingAnswers(true);
    (async () => {
      const merged: Record<number, any> = {};
      const ids: Record<number, number> = {};
      const sIds: Record<number, number> = {};
      const iNames: Record<number, string | string[] | null> = {};
      let foundRemote = false;

      const baselineScopeKey = `${pid}-${projId}-${interventionMethodId}`;
      if (baselineDataScopeRef.current !== baselineScopeKey) {
        baselineDataScopeRef.current = baselineScopeKey;
        baselineAnswersRef.current = {};
        baselineItemNamesRef.current = {};
      }

      let remoteSurveyRowCount = 0;

      // 1. Fetch survey results (store handles offline-first: SQLite cache → API)
      try {
        const remote = await fetchSurveyResults(
          projId,
          pid,
          interventionMethodId,
        );
        remoteSurveyRowCount = remote.length;
        for (const item of remote) {
          // Accumulate multiple answers for same question (multi-select)
          if (merged[item.question_id] !== undefined) {
            if (Array.isArray(merged[item.question_id])) {
              merged[item.question_id].push(item.answer_value);
            } else {
              merged[item.question_id] = [
                merged[item.question_id],
                item.answer_value,
              ];
            }
          } else {
            merged[item.question_id] = item.answer_value;
          }
          ids[item.question_id] = item.answer_id;
          sIds[item.question_id] = item.survey_id;
          if (item.item_name) {
            const existing = iNames[item.question_id];
            if (existing !== undefined) {
              if (Array.isArray(existing)) {
                existing.push(item.item_name);
              } else {
                iNames[item.question_id] = [
                  existing as string,
                  item.item_name as string,
                ];
              }
            } else {
              iNames[item.question_id] = item.item_name;
            }
          }
        }
        foundRemote = remote.length > 0;
      } catch (e) {
        console.error("Failed to fetch survey results:", e);
      }

      if (remoteSurveyRowCount > 0) {
        const serverBaselineSnap = snapshotServerBaselineAnswers(merged, iNames);
        baselineAnswersRef.current = serverBaselineSnap.baselineAnswers;
        baselineItemNamesRef.current = serverBaselineSnap.baselineItemNames;
      }

      // 2. Overlay local SQLite answers (pending upload take precedence) — always available offline
      const pendingIds = new Set<number>();
      try {
        const local = await getAnswers(
          pid,
          projId,
          classificationComponent.id,
          currentUserId,
          interventionMethodId,
        );
        for (const a of local) {
          // Restore JSON array stored for multi-select
          try {
            const parsed = JSON.parse(a.value ?? "");
            if (Array.isArray(parsed)) {
              merged[a.question_id] = parsed;
              pendingIds.add(a.question_id);
              continue;
            }
          } catch {}
          merged[a.question_id] = a.value;
          pendingIds.add(a.question_id);
        }
      } catch (e) {
        console.error("Failed to load local answers:", e);
      }

      // If no remote data found but we have local data, mark as having survey
      if (!foundRemote && Object.keys(merged).length > 0) {
        foundRemote = true;
      }

      // 3. Overlay offline pending answer_updates (edits saved without internet)
      //    These take top priority and mark those questions as pending
      try {
        const updates = await getAnswerUpdatesByMethod(
          pid,
          projId,
          currentUserId,
          interventionMethodId,
        );
        for (const upd of updates) {
          const unwrapped = unwrapOfflineAnswerUpdateValue(upd.new_value);
          merged[upd.question_id] = unwrapped.value;
          pendingIds.add(upd.question_id);
          if (
            unwrapped.childQuestionId != null &&
            Number.isFinite(unwrapped.childQuestionId)
          ) {
            merged[unwrapped.childQuestionId] = unwrapped.childValue;
            pendingIds.add(unwrapped.childQuestionId);
          }
        }
      } catch (e) {
        console.error("Failed to load pending answer updates:", e);
      }

      setAnswers(merged);
      setAnswerIds(ids);
      setSurveyIds(sIds);
      setItemNames(iNames);
      setPendingQuestionIds(pendingIds);
      setHasSurvey(foundRemote);
      setLoadingAnswers(false);
    })();
  }, [
    classificationComponent,
    producerId,
    projectId,
    currentUserId,
    fetchSurveyResults,
    refreshKey,
    interventionMethodId,
  ]);

  // Pre-fetch question details
  useEffect(() => {
    for (const q of localQuestions) {
      const alreadyHave = questionDetails[q.id] !== undefined;
      const alreadyRequested = requestedDetailsRef.current.has(q.id);
      if (!alreadyHave && !alreadyRequested) {
        requestedDetailsRef.current.add(q.id);
        const typeName = getCanonicalTypeName(q.question_type_id);
        fetchQuestionDetail(q.id, typeName);
      }
    }
  }, [localQuestions, getCanonicalTypeName, fetchQuestionDetail]);

  // Compute geometric mean from answer values
  const geometricMean = useMemo(() => {
    if (localQuestions.length === 0 || Object.keys(answers).length === 0)
      return null;
    const numericValues: number[] = [];
    for (const q of localQuestions) {
      const raw = answers[q.id];
      if (raw == null || raw === "" || (Array.isArray(raw) && raw.length === 0))
        continue;
      const val = resolveNumericValue(
        raw,
        q.id,
        questionDetails,
        getCanonicalTypeName,
        q.question_type_id,
      );
      if (val !== null) numericValues.push(val);
    }
    return computeGeometricMean(numericValues);
  }, [localQuestions, answers, questionDetails, getCanonicalTypeName]);

  // Build display answers
  useEffect(() => {
    // Don't recompute while sheet is open to avoid unmounting the sheet
    if (showSheet) return;
    if (localQuestions.length === 0 || Object.keys(answers).length === 0) {
      setSavedAnswers([]);
      return;
    }
    const display: DisplayAnswer[] = [];
    localQuestions.forEach((q, index) => {
      const rawValue = answers[q.id];
      if (
        rawValue == null ||
        rawValue === "" ||
        (Array.isArray(rawValue) && rawValue.length === 0)
      )
        return;
      display.push({
        questionId: q.id,
        questionName: extractQuestionTitle(q.description, index),
        displayValue: resolveDisplayValue(
          rawValue,
          q.id,
          questionDetails,
          getCanonicalTypeName,
          q.question_type_id,
          itemNames[q.id],
        ),
        isPending: pendingQuestionIds.has(q.id),
      });
    });
    setSavedAnswers(display);
  }, [
    localQuestions,
    answers,
    questionDetails,
    getCanonicalTypeName,
    showSheet,
    itemNames,
    pendingQuestionIds,
  ]);

  const handleApply = useCallback(() => {
    if (!classificationComponent) return;
    setEditingQuestion(null);
    answersSnapshotRef.current = { ...answers };
    const restored = beginApplySession(answers);
    setAnswers(restored as Record<number, any>);
    fetchQuestions(classificationComponent.id);
    setShowSheet(true);
  }, [
    classificationComponent,
    fetchQuestions,
    answers,
    beginApplySession,
  ]);

  const handleCloseSheet = useCallback(() => {
    if (!editingQuestion) {
      persistOnClose(answers);
      setAnswers(answersSnapshotRef.current);
    } else if (!skipEditDraftPersistRef.current) {
      setSurveyDraft(
        buildSurveyEditDraftKey(
          producerId,
          projectId,
          interventionMethodId,
          editingQuestion.id,
        ),
        { answers: editAnswers, wizardIndex: 0 },
      );
    }
    skipEditDraftPersistRef.current = false;
    setShowSheet(false);
    setEditingQuestion(null);
  }, [
    editingQuestion,
    answers,
    editAnswers,
    persistOnClose,
    producerId,
    projectId,
    interventionMethodId,
    setSurveyDraft,
  ]);

  const handleAnswerChange = useMemo(
    () => wrapAnswerChange(setAnswers),
    [wrapAnswerChange],
  );

  const handleEditAnswerChange = useCallback(
    (questionId: number, value: any) => {
      setEditAnswers((prev) => {
        let next: Record<number, any>;
        if (value === undefined) {
          if (prev[questionId] === undefined) return prev;
          next = { ...prev };
          delete next[questionId];
        } else {
          next = { ...prev, [questionId]: value };
        }
        if (editingQuestion) {
          setSurveyDraft(
            buildSurveyEditDraftKey(
              producerId,
              projectId,
              interventionMethodId,
              editingQuestion.id,
            ),
            { answers: next, wizardIndex: 0 },
          );
        }
        return next;
      });
    },
    [
      editingQuestion,
      producerId,
      projectId,
      interventionMethodId,
      setSurveyDraft,
    ],
  );

  // Save new survey (apply mode)
  const handleSave = useCallback(async () => {
    if (!classificationComponent || !producerId || !projectId || !currentUserId)
      return;

    const pid = Number(producerId);
    const projId = Number(projectId);
    const compId = classificationComponent.id;
    const userId = currentUserId;

    try {
      // Multi-select stored as JSON string in SQLite (single row per question)
      const answerRows = Object.entries(answers).map(([qId, value]) => ({
        producer_id: pid,
        project_id: projId,
        component_id: compId,
        question_id: Number(qId),
        user_id: userId,
        intervention_method_id: interventionMethodId,
        value: Array.isArray(value)
          ? JSON.stringify(value)
          : value != null
            ? String(value)
            : null,
      }));

      // Build sync payload — multi-select uses nested `answers` array format
      const syncAnswers: (
        | { question_id: number; answer_value: string }
        | { question_id: number; answers: { answer_value: string }[] }
      )[] = [];
      for (const row of answerRows) {
        try {
          const parsed = JSON.parse(row.value ?? "");
          if (Array.isArray(parsed)) {
            syncAnswers.push({
              question_id: row.question_id,
              answers: parsed.map((v) => ({ answer_value: String(v) })),
            });
            continue;
          }
        } catch {}
        syncAnswers.push({
          question_id: row.question_id,
          answer_value: row.value ?? "",
        });
      }

      const payload = {
        project_id: projId,
        intervention_method_id: interventionMethodId,
        producer_id: pid,
        created_at: new Date().toISOString().split("T")[0],
        answers: syncAnswers,
      };

      const isOnline = await checkConnectivity();
      const saveLocally = async () => {
        await saveAnswersBatch(answerRows);
        await enqueue(
          "survey_answers",
          `${pid}-${projId}-${compId}-${userId}-${interventionMethodId}`,
          payload,
          userId,
        );
        await markInterventionMethodApplied(
          pid,
          projId,
          interventionMethodId,
          userId,
        );
        showAlert({
          title: "Sin conexión con el servidor",
          message:
            "Las respuestas se guardaron localmente y se enviarán al sincronizar.",
          type: "warning",
        });
      };

      if (isOnline) {
        try {
          await apiFetch("/surveys", {
            method: "POST",
            body: JSON.stringify(payload),
          });
          await markInterventionMethodApplied(
            pid,
            projId,
            interventionMethodId,
            userId,
          );
          showAlert({
            title: "Guardado",
            message: "Las respuestas se guardaron correctamente.",
            type: "success",
          });
        } catch (error) {
          if (!(error instanceof NetworkError)) throw error;
          await saveLocally();
        }
      } else {
        await saveLocally();
      }

      // Sheet dismiss calls handleCloseSheet → restores snapshot; keep submitted answers
      markSavedAndSkipPersist();
      answersSnapshotRef.current = { ...answers };
      setHasSurvey(true);
      setShowSheet(false);
      setRefreshKey((k) => k + 1);
      onSaved?.();
    } catch (error) {
      console.error("Failed to save answers:", error);
      showAlert({
        title: "Error",
        message: "No se pudieron guardar las respuestas.",
        type: "error",
      });
    }
  }, [
    answers,
    classificationComponent,
    producerId,
    projectId,
    currentUserId,
    showAlert,
    interventionMethodId,
    onSaved,
    markSavedAndSkipPersist,
  ]);

  // Edit single answer
  const handleEditPress = useCallback(
    (questionId: number) => {
      const question = localQuestions.find((q) => q.id === questionId);
      if (!question) return;
      setEditingQuestion(question);
      const editKey = buildSurveyEditDraftKey(
        producerId,
        projectId,
        interventionMethodId,
        questionId,
      );
      const draft = getSurveyDraft(editKey);
      if (draft && Object.keys(draft.answers).length > 0) {
        setEditAnswers(draft.answers as Record<number, any>);
      } else {
        setEditAnswers({ [questionId]: answers[questionId] });
      }
      setShowSheet(true);
    },
    [
      localQuestions,
      answers,
      producerId,
      projectId,
      interventionMethodId,
      getSurveyDraft,
    ],
  );

  const handleEditSave = useCallback(async () => {
    if (!editingQuestion) return;
    const answerId = answerIds[editingQuestion.id];
    const surveyId = surveyIds[editingQuestion.id];
    const rawVal = editAnswers[editingQuestion.id];
    const isMultiple = editingQuestion.multiple === true;
    const editKey = buildSurveyEditDraftKey(
      producerId,
      projectId,
      interventionMethodId,
      editingQuestion.id,
    );
    const finishEditClose = () => {
      clearSurveyDraft(editKey);
      skipEditDraftPersistRef.current = true;
      setShowSheet(false);
      setEditingQuestion(null);
    };

    const isLocalCreatePending =
      answerId == null && pendingQuestionIds.has(editingQuestion.id);

    if (isLocalCreatePending) {
      const pid = Number(producerId);
      const projId = Number(projectId ?? 0);
      const compId = classificationComponent?.id ?? 0;
      const userId = currentUserId ?? 0;
      try {
        await rewritePendingSurveyAnswerCreate({
          entityKey: `${pid}-${projId}-${compId}-${userId}-${interventionMethodId}`,
          userId,
          producerId: pid,
          projectId: projId,
          componentId: compId,
          interventionMethodId,
          updates: [{ questionId: editingQuestion.id, rawVal }],
        });
        setAnswers((prev) => ({ ...prev, [editingQuestion.id]: rawVal }));
        setItemNames((prev) => {
          const next = { ...prev };
          delete next[editingQuestion.id];
          return next;
        });
        setPendingQuestionIds((prev) => new Set([...prev, editingQuestion.id]));
        useSyncStore.getState().refreshStatus();
        finishEditClose();
        onSaved?.();
        showAlert({
          title: "Sin internet",
          message:
            "La respuesta pendiente se actualizó y se enviará al sincronizar.",
          type: "warning",
        });
      } catch (error) {
        console.error("Failed to rewrite pending survey create:", error);
        showAlert({
          title: "Error",
          message: "No se pudo actualizar la respuesta pendiente.",
          type: "error",
        });
      }
      return;
    }

    const isOnline = await checkConnectivity();

    if (isOnline) {
      try {
        if (isMultiple && surveyId) {
          const values = Array.isArray(rawVal)
            ? rawVal.map((v: any) => ({ answer_value: String(v) }))
            : [{ answer_value: String(rawVal ?? "") }];
          await updateMultipleAnswers(editingQuestion.id, surveyId, values);
        } else {
          const newValue = Array.isArray(rawVal)
            ? rawVal.join(",")
            : typeof rawVal === "object" && rawVal !== null
              ? String(rawVal._main ?? rawVal.value ?? JSON.stringify(rawVal))
              : String(rawVal ?? "");
          await apiFetch(`/surveys/update-answer/${answerId}`, {
            method: "PUT",
            body: JSON.stringify({ value: newValue }),
          });
        }
        await deleteAnswerUpdate(answerId);
        setAnswers((prev) => ({ ...prev, [editingQuestion.id]: rawVal }));
        setItemNames((prev) => { const next = { ...prev }; delete next[editingQuestion.id]; return next; });
        setPendingQuestionIds((prev) => { const next = new Set(prev); next.delete(editingQuestion.id); return next; });
        finishEditClose();
        onSaved?.();
        showAlert({
          title: "Actualizado",
          message: "La respuesta se actualizó correctamente.",
          type: "success",
        });
      } catch (error) {
        console.error("Failed to update answer:", error);
        showAlert({
          title: "Error",
          message: "No se pudo actualizar la respuesta.",
          type: "error",
        });
      }
    } else {
      const pid = Number(producerId);
      const projId = Number(projectId ?? 0);
      const compId = classificationComponent?.id ?? 0;
      const userId = currentUserId ?? 0;

      const proposedStored = serializeClassificationOfflineUpsert(
        editingQuestion,
        rawVal,
        surveyId,
      );

      if (answerId == null) {
        showAlert({
          title: "Error",
          message: "No se encontró el identificador de la respuesta a editar.",
          type: "error",
        });
        return;
      }

      const baselineRow = baselineAnswersRef.current;
      const qid = editingQuestion.id;
      const hasServerBaseline = Object.prototype.hasOwnProperty.call(
        baselineRow,
        qid,
      );

      if (hasServerBaseline) {
        const baselineStored = serializeClassificationOfflineUpsert(
          editingQuestion,
          baselineRow[qid],
          surveyId,
        );
        if (
          offlinePendingValuesAreEquivalent({
            proposed: proposedStored,
            baseline: baselineStored,
            isCommaMultiselect: editingQuestion.multiple === true,
          })
        ) {
          await deleteAnswerUpdate(answerId);
          const base = baselineAnswersRef.current as Record<number, any>;
          const baseNames = baselineItemNamesRef.current;
          setAnswers((prev) => ({
            ...prev,
            [qid]: base[qid],
          }));
          setItemNames((prev) => {
            const next = { ...prev };
            if (Object.prototype.hasOwnProperty.call(baseNames, qid)) {
              next[qid] = baseNames[qid] as string | string[] | null;
            } else {
              delete next[qid];
            }
            return next;
          });
          setPendingQuestionIds((prev) => {
            const next = new Set(prev);
            next.delete(qid);
            return next;
          });
          useSyncStore.getState().refreshStatus();
          finishEditClose();
          showAlert({
            title: "Sin cambios pendientes",
            message:
              "La respuesta coincidió con la última versión sincronizada. No hay edición pendiente por subir.",
            type: "success",
          });
          return;
        }
      }

      await upsertAnswerUpdate({
        answer_id: answerId,
        new_value: proposedStored,
        producer_id: pid,
        project_id: projId,
        component_id: compId,
        question_id: qid,
        user_id: userId,
        intervention_method_id: interventionMethodId,
      });
      useSyncStore.getState().refreshStatus();
      setAnswers((prev) => ({ ...prev, [editingQuestion.id]: rawVal }));
      setItemNames((prev) => {
        const next = { ...prev };
        delete next[editingQuestion.id];
        return next;
      });
      setPendingQuestionIds((prev) => new Set([...prev, editingQuestion.id]));
      finishEditClose();
      onSaved?.();
      showAlert({
        title: "Sin internet",
        message: "La edición se guardó localmente y se enviará al sincronizar.",
        type: "warning",
      });
    }
  }, [
    editingQuestion,
    editAnswers,
    answerIds,
    surveyIds,
    pendingQuestionIds,
    classificationComponent,
    producerId,
    projectId,
    currentUserId,
    showAlert,
    interventionMethodId,
    onSaved,
    clearSurveyDraft,
  ]);

  if (loadingComponents) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a7a3a" />
        <ThemedText style={styles.loadingText}>Cargando...</ThemedText>
      </View>
    );
  }

  if (!classificationComponent) {
    return (
      <View style={styles.center}>
        <Layers size={responsiveFont(48)} color="#11181C" />
        <ThemedText style={styles.emptyText}>
          No se encontró el componente de clasificación
        </ThemedText>
      </View>
    );
  }

  if (
    loadingAnswers ||
    (!showSheet && Object.keys(answers).length > 0 && savedAnswers.length === 0)
  ) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a7a3a" />
        <ThemedText style={styles.loadingText}>
          Cargando respuestas...
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Apply button — only when no survey exists */}
        {!hasSurvey && savedAnswers.length === 0 ? (
          <TouchableOpacity
            style={styles.applyButton}
            activeOpacity={0.8}
            onPress={handleApply}
          >
            <ClipboardCheck size={responsiveFont(20)} color="#ffffff" />
            <ThemedText
              lightColor="#ffffff"
              darkColor="#ffffff"
              type="defaultSemiBold"
              style={styles.applyButtonText}
            >
              {applyButtonLabel ?? "Aplicar Clasificación"}
            </ThemedText>
          </TouchableOpacity>
        ) : null}

        {/* Answers section */}
        <View style={styles.answersSection}>
          <View style={styles.answersTitleRow}>
            <ThemedText
              type="defaultSemiBold"
              style={styles.answersSectionTitle}
            >
              Respuestas
            </ThemedText>
            {geometricMean !== null && (
              <View style={styles.geometricMeanBadge}>
                <ThemedText style={styles.geometricMeanText}>
                  Media Geométrica: {Math.round(geometricMean)}
                </ThemedText>
              </View>
            )}
          </View>

          {savedAnswers.length > 0 ? (
            savedAnswers.map((item, index) => (
              <View
                key={index}
                style={[
                  styles.answerCard,
                  item.isPending && styles.answerCardPending,
                ]}
              >
                <View style={styles.answerHeader}>
                  <ThemedText style={styles.answerQuestion}>
                    {item.questionName}
                  </ThemedText>
                  <View style={styles.answerHeaderRight}>
                    {item.isPending && (
                      <View style={styles.pendingBadge}>
                        <ThemedText style={styles.pendingBadgeText}>
                          PENDIENTE
                        </ThemedText>
                      </View>
                    )}
                    {(answerIds[item.questionId] != null ||
                      pendingQuestionIds.has(item.questionId)) && (
                      <TouchableOpacity
                        style={[
                          styles.editButton,
                          item.isPending && styles.editButtonPending,
                        ]}
                        onPress={() => handleEditPress(item.questionId)}
                        activeOpacity={0.7}
                      >
                        <Pencil
                          size={responsiveFont(16)}
                          color={item.isPending ? "#92400e" : "#1a7a3a"}
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <View
                  style={[
                    styles.answerValueContainer,
                    item.isPending && styles.answerValueContainerPending,
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.answerValue,
                      item.isPending && styles.answerValuePending,
                    ]}
                  >
                    {item.displayValue}
                  </ThemedText>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.noAnswersContainer}>
              <FileQuestion size={responsiveFont(36)} color="#11181C" />
              <ThemedText style={styles.noAnswersText}>
                Aún no se han registrado respuestas de clasificación
              </ThemedText>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Apply mode bottom sheet */}
      {!editingQuestion && (
        <SurveyBottomSheet
          visible={showSheet}
          onClose={handleCloseSheet}
          title={sheetTitle ?? classificationComponent.name}
          questions={
            localQuestions.length > 0 ? localQuestions : storeQuestions
          }
          answers={answers}
          onAnswerChange={handleAnswerChange}
          onSave={handleSave}
          getTypeName={getCanonicalTypeName}
          loading={loadingQuestions}
          wizardSessionKey={wizardSessionKey}
          initialIndex={draftWizardIndex}
          onIndexChange={handleWizardIndexChange}
        />
      )}

      {/* Edit single answer bottom sheet */}
      {editingQuestion && (
        <SurveyBottomSheet
          visible={showSheet}
          onClose={handleCloseSheet}
          title={extractQuestionTitle(
            editingQuestion.description,
            localQuestions.findIndex((q) => q.id === editingQuestion.id),
          )}
          questions={[editingQuestion]}
          answers={editAnswers}
          onAnswerChange={handleEditAnswerChange}
          onSave={handleEditSave}
          getTypeName={getCanonicalTypeName}
          loading={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: verticalScale(12),
  },
  loadingText: {
    fontSize: responsiveFont(17),
  },
  emptyText: {
    fontSize: responsiveFont(17),
    textAlign: "center",
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: verticalScale(12),
    paddingHorizontal: widthScale(4),
    paddingBottom: verticalScale(120),
  },
  applyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a7a3a",
    paddingVertical: verticalScale(14),
    paddingHorizontal: widthScale(24),
    borderRadius: widthScale(12),
    gap: widthScale(8),
  },
  applyButtonText: {
    fontSize: responsiveFont(17),
  },
  answersSection: {
    marginTop: verticalScale(20),
  },
  answersTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: verticalScale(12),
  },
  answersSectionTitle: {
    fontSize: responsiveFont(17),
    color: "#1a7a3a",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  geometricMeanBadge: {
    backgroundColor: "rgba(26, 122, 58, 0.12)",
    borderRadius: widthScale(8),
    paddingVertical: verticalScale(4),
    paddingHorizontal: widthScale(10),
  },
  geometricMeanText: {
    fontSize: responsiveFont(13),
    fontWeight: "600",
    color: "#1a7a3a",
  },
  answerCard: {
    backgroundColor: "#ffffff",
    borderRadius: widthScale(10),
    padding: widthScale(14),
    marginBottom: verticalScale(10),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  answerCardPending: {
    backgroundColor: "#fffbeb",
    borderWidth: 1.5,
    borderColor: "#f59e0b",
    shadowColor: "#f59e0b",
    shadowOpacity: 0.15,
  },
  answerHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: widthScale(8),
  },
  answerHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: widthScale(6),
    flexShrink: 0,
  },
  pendingBadge: {
    backgroundColor: "#fef3c7",
    borderRadius: widthScale(6),
    borderWidth: 1,
    borderColor: "#f59e0b",
    paddingVertical: verticalScale(2),
    paddingHorizontal: widthScale(6),
  },
  pendingBadgeText: {
    fontSize: responsiveFont(10),
    fontWeight: "700",
    color: "#92400e",
    letterSpacing: 0.5,
  },
  answerQuestion: {
    flex: 1,
    fontSize: responsiveFont(15),
    fontWeight: "600",
    marginBottom: verticalScale(8),
  },
  editButton: {
    width: widthScale(32),
    height: widthScale(32),
    borderRadius: widthScale(16),
    backgroundColor: "rgba(26, 122, 58, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  editButtonPending: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
  },
  answerValueContainer: {
    backgroundColor: "rgba(26, 122, 58, 0.12)",
    borderRadius: widthScale(8),
    paddingVertical: verticalScale(10),
    paddingHorizontal: widthScale(12),
  },
  answerValueContainerPending: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
  },
  answerValue: {
    fontSize: responsiveFont(16),
    fontWeight: "500",
  },
  answerValuePending: {
    color: "#92400e",
  },
  noAnswersContainer: {
    alignItems: "center",
    paddingVertical: verticalScale(24),
    gap: verticalScale(10),
  },
  noAnswersText: {
    fontSize: responsiveFont(17),
    textAlign: "center",
  },
});
