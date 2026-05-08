import { ThemedText } from "@/components/themed-text";
import { useAlert } from "@/components/ui/custom-alert";
import { SurveyBottomSheet } from "@/components/wizard/survey-bottom-sheet";
import { checkConnectivity } from "@/hooks/use-network";
import type { Question } from "@/schemas/characterization";
import { useAuthStore } from "@/store/useAuthStore";
import {
    CHARACTERIZATION_INTERVENTION_METHOD_ID,
    useCharacterizationStore,
} from "@/store/useCharacterizationStore";
import { useSyncStore } from "@/store/useSyncStore";
import { apiFetch } from "@/utils/api";
import {
    getAnswers,
    saveAnswersBatch,
} from "@/utils/database/repositories/answer-repository";
import {
    deleteAnswerUpdate,
    getAnswerUpdatesByMethod,
    upsertAnswerUpdate,
} from "@/utils/database/repositories/answer-update-repository";
import { enqueue } from "@/utils/database/repositories/sync-repository";
import {
    getPrimaryDependentChildSerializationContext,
    offlinePendingValuesAreEquivalent,
    serializeCharacterizationOfflineUpsert,
    serializePersonalOfflineUpsert,
    snapshotServerBaselineAnswers,
} from "@/utils/survey/offline-new-value-serializers";
import {
    collectActiveDependentChildQuestionIds,
    collectListaDependienteChildQuestionIds,
    isSurveyAnswerEmpty,
    resolveDependentChildIdsFromDetail,
} from "@/utils/survey/dependent-child-ids";
import {
    recordSurveyQuestionMinOrder,
    resolveSurveyQuestionDisplayOrdinal,
} from "@/utils/survey/intervention-method-order";
import {
    markInterventionMethodApplied,
} from "@/utils/database/repositories/producer-intervention-repository";
import { findOptionMatchingStoredValue } from "@/utils/survey/option-display";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import {
    ClipboardList,
    FileQuestion,
    Layers,
    Pencil,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";

interface CharacterizationTabProps {
  producerId: string;
  projectId?: string;
}

interface DisplayAnswer {
  questionId: number;
  displayOrder: number;
  questionName: string;
  displayValue: string;
  isPending?: boolean;
}

function resolveDisplayValue(
  rawValue: any,
  questionId: number,
  questionDetails: Record<number, any>,
  getCanonicalTypeName: (typeId: number) => string,
  questionTypeId: number,
  itemName?: string | string[] | null,
  /** Si es false y el API devolvió varias filas para la misma pregunta, se muestra una sola (evita “x, x, x, x”). */
  allowMultipleValues?: boolean,
): string {
  if (rawValue == null || rawValue === "") return "";

  // Handle arrays (multi-select o filas duplicadas del servidor en preguntas no multivalor)
  if (Array.isArray(rawValue)) {
    const multi = allowMultipleValues === true;
    if (!multi && rawValue.length > 0) {
      const last = rawValue.length - 1;
      const label = Array.isArray(itemName) ? itemName[last] : itemName;
      return resolveDisplayValue(
        rawValue[last],
        questionId,
        questionDetails,
        getCanonicalTypeName,
        questionTypeId,
        label,
        allowMultipleValues,
      );
    }
    const parts = rawValue
      .map((v, i) => {
        const label = Array.isArray(itemName) ? itemName[i] : itemName;
        return resolveDisplayValue(v, questionId, questionDetails, getCanonicalTypeName, questionTypeId, label, allowMultipleValues);
      })
      .filter(Boolean);
    return parts.join(", ");
  }

  // If item_name is available, prefer it over the raw value
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

  if (typeName === "list" || typeName === "dependent_list") {
    const detail = questionDetails[questionId] as any;
    const options: any[] =
      detail?.options ??
      detail?.items ??
      detail?.data?.options ??
      detail?.data?.items ??
      detail?.data ??
      [];
    let lookupVal: any = rawValue;
    if (
      typeName === "dependent_list" &&
      typeof rawValue === "object" &&
      rawValue !== null &&
      !Array.isArray(rawValue) &&
      (rawValue as { _main?: unknown })._main != null
    ) {
      lookupVal = (rawValue as { _main: unknown })._main;
    }
    const match = findOptionMatchingStoredValue(options, lookupVal);
    if (match?.name) return match.name;
    if (typeName === "dependent_list" && lookupVal != null && lookupVal !== "") {
      return String(lookupVal);
    }
  }

  if (typeName === "bool") {
    return (rawValue === true || rawValue === "true" || rawValue === 1 || rawValue === "1") ? "SI" : "NO";
  }

  // Fallback: detect boolean-like values even if questionTypes aren't loaded yet
  if (rawValue === true || rawValue === "true" || rawValue === 1 || rawValue === "1") return "SI";
  if (rawValue === false || rawValue === "false" || rawValue === 0 || rawValue === "0" || rawValue === 2 || rawValue === "2") return "NO";

  return String(rawValue);
}

export function CharacterizationTab({
  producerId,
  projectId,
}: CharacterizationTabProps) {
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
    updateMultipleAnswers,
    getCharacterizationComponent,
    getCanonicalTypeName,
    hasInterventionMethodApplied,
  } = useCharacterizationStore();

  const currentUserId = useAuthStore((state) => state.user?.user_id);
  const { showAlert } = useAlert();

  const [showSheet, setShowSheet] = useState(false);
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [answerIds, setAnswerIds] = useState<Record<number, number>>({});
  const [surveyIds, setSurveyIds] = useState<Record<number, number>>({});
  const [hasSurvey, setHasSurvey] = useState(false);
  const [savedAnswers, setSavedAnswers] = useState<DisplayAnswer[]>([]);
  const [surveyQuestionOrders, setSurveyQuestionOrders] = useState<
    Record<number, number>
  >({});
  const [loadingAnswers, setLoadingAnswers] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [methodAlreadyApplied, setMethodAlreadyApplied] = useState(false);
  const [itemNames, setItemNames] = useState<Record<number, string | string[] | null>>({});
  const [pendingQuestionIds, setPendingQuestionIds] = useState<Set<number>>(new Set());

  // Local copy of characterization questions (survives tab switches)
  const [localQuestions, setLocalQuestions] = useState<Question[]>([]);
  const hasFetchedQuestions = useRef(false);
  const requestedDetailsRef = useRef(new Set<number>());

  // Edit mode: which question is being individually edited
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editAnswers, setEditAnswers] = useState<Record<number, any>>({});
  /** Padre lista dependiente + hijas opcionales para el mismo bottom sheet que en información personal */
  const [editQuestions, setEditQuestions] = useState<Question[]>([]);

  // Snapshot of answers before opening sheet, used to restore on close without save
  const answersSnapshotRef = useRef<Record<number, any>>({});

  const baselineAnswersRef = useRef<Record<number, unknown>>({});
  const baselineItemNamesRef = useRef<Record<number, string | string[] | null>>({});
  const baselineDataScopeRef = useRef<string>("");

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

  const activeComponent = getCharacterizationComponent();

  // Fetch questions on mount
  useEffect(() => {
    if (!activeComponent || hasFetchedQuestions.current) return;
    hasFetchedQuestions.current = true;
    fetchQuestions(activeComponent.id);
  }, [activeComponent, fetchQuestions]);

  // Sync store questions → local copy
  useEffect(() => {
    if (
      storeQuestions.length > 0 &&
      activeComponent &&
      storeQuestions[0]?.component_id === activeComponent.id
    ) {
      setLocalQuestions(storeQuestions);
    }
  }, [storeQuestions, activeComponent]);

  // Load answers: fetch survey results (offline-first via store), then overlay local pending answers
  useEffect(() => {
    if (!activeComponent || !producerId || !projectId || !currentUserId) return;

    const pid = Number(producerId);
    const projId = Number(projectId);

    setLoadingAnswers(true);
    (async () => {
      const merged: Record<number, any> = {};
      const ids: Record<number, number> = {};
      const sIds: Record<number, number> = {};
      const iNames: Record<number, string | string[] | null> = {};
      let foundRemote = false;

      const baselineScopeKey = `${pid}-${projId}-${CHARACTERIZATION_INTERVENTION_METHOD_ID}`;
      if (baselineDataScopeRef.current !== baselineScopeKey) {
        baselineDataScopeRef.current = baselineScopeKey;
        baselineAnswersRef.current = {};
        baselineItemNamesRef.current = {};
      }

      let remoteSurveyRowCount = 0;
      const orderByQuestion: Record<number, number> = {};

      // 1. Fetch survey results (store handles offline-first: SQLite cache → API)
      try {
        const remote = await fetchSurveyResults(
          projId,
          pid,
          CHARACTERIZATION_INTERVENTION_METHOD_ID,
        );
        remoteSurveyRowCount = remote.length;
        for (const item of remote) {
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
                iNames[item.question_id] = [existing as string, item.item_name as string];
              }
            } else {
              iNames[item.question_id] = item.item_name;
            }
          }
          recordSurveyQuestionMinOrder(
            orderByQuestion,
            item.question_id,
            item.question_order,
          );
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
        const local = await getAnswers(pid, projId, activeComponent.id, currentUserId);
        for (const a of local) {
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
        const updates = await getAnswerUpdatesByMethod(pid, projId, currentUserId, CHARACTERIZATION_INTERVENTION_METHOD_ID);
        for (const upd of updates) {
          let usedParsed = false;
          try {
            const parsed = JSON.parse(upd.new_value ?? "");
            if (Array.isArray(parsed) || (parsed && typeof parsed === "object")) {
              merged[upd.question_id] = parsed;
              usedParsed = true;
            }
          } catch {}
          if (!usedParsed) {
            merged[upd.question_id] = upd.new_value;
          }
          pendingIds.add(upd.question_id);
        }
      } catch (e) {
        console.error("Failed to load pending answer updates:", e);
      }

      setAnswers(merged);
      setAnswerIds(ids);
      setSurveyIds(sIds);
      setItemNames(iNames);
      setSurveyQuestionOrders(orderByQuestion);
      setPendingQuestionIds(pendingIds);
      setHasSurvey(foundRemote);
      setLoadingAnswers(false);
    })();
  }, [activeComponent, producerId, projectId, currentUserId, fetchSurveyResults, refreshKey]);

  // Check if method already applied (for apply/re-apply guard)
  useEffect(() => {
    if (!producerId || !projectId || !currentUserId) return;
    const pid = Number(producerId);
    const projId = Number(projectId);
    (async () => {
      const applied = await hasInterventionMethodApplied(
        pid,
        projId,
        CHARACTERIZATION_INTERVENTION_METHOD_ID,
      );
      setMethodAlreadyApplied(applied);
    })();
  }, [producerId, projectId, currentUserId, hasInterventionMethodApplied]);

  // Pre-fetch question details for display value resolution
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

  // Build display answers
  useEffect(() => {
    // Don't recompute while sheet is open to avoid unmounting the sheet
    if (showSheet) return;
    if (localQuestions.length === 0 || Object.keys(answers).length === 0) {
      setSavedAnswers([]);
      return;
    }
    const listaDependienteChildren = collectListaDependienteChildQuestionIds(
      localQuestions,
      questionDetails,
      getCanonicalTypeName,
    );
    const activeChildren = collectActiveDependentChildQuestionIds(
      localQuestions,
      questionDetails,
      answers,
      getCanonicalTypeName,
    );

    const visibleQuestions = localQuestions.filter((q) => {
      if (!listaDependienteChildren.has(q.id)) return true;
      return activeChildren.has(q.id);
    });

    const display: DisplayAnswer[] = [];
    visibleQuestions.forEach((q, index) => {
      const rawValue = answers[q.id];
      if (
        rawValue == null ||
        rawValue === "" ||
        (Array.isArray(rawValue) && rawValue.length === 0)
      )
        return;
      const fullListIdx = localQuestions.findIndex((lq) => lq.id === q.id);
      const displayOrder = resolveSurveyQuestionDisplayOrdinal({
        questionId: q.id,
        question: q,
        surveyOrderByQuestionId: surveyQuestionOrders,
        listPositionFallback:
          fullListIdx >= 0 ? fullListIdx + 1 : Math.max(1, index + 1),
      });
      display.push({
        questionId: q.id,
        displayOrder,
        questionName: `${displayOrder}. ${q.description ?? q.name ?? "Pregunta"}`,
        displayValue: resolveDisplayValue(
          rawValue,
          q.id,
          questionDetails,
          getCanonicalTypeName,
          q.question_type_id,
          itemNames[q.id],
          q.multiple === true,
        ),
        isPending: pendingQuestionIds.has(q.id),
      });
    });
    display.sort((a, b) => a.displayOrder - b.displayOrder);
    setSavedAnswers(display);
  }, [
    localQuestions,
    answers,
    questionDetails,
    getCanonicalTypeName,
    showSheet,
    itemNames,
    pendingQuestionIds,
    surveyQuestionOrders,
  ]);

  const handleApply = useCallback(() => {
    if (!activeComponent) return;
    setEditingQuestion(null);
    setEditQuestions([]);
    answersSnapshotRef.current = { ...answers };
    fetchQuestions(activeComponent.id);
    setShowSheet(true);
  }, [activeComponent, fetchQuestions, answers]);

  const handleCloseSheet = useCallback(() => {
    if (!editingQuestion) {
      setAnswers(answersSnapshotRef.current);
    }
    setShowSheet(false);
    setEditingQuestion(null);
    setEditQuestions([]);
  }, [editingQuestion]);

  const handleAnswerChange = useCallback((questionId: number, value: any) => {
    setAnswers((prev) => {
      if (value === undefined) {
        if (prev[questionId] === undefined) return prev;
        const next = { ...prev };
        delete next[questionId];
        return next;
      }
      return { ...prev, [questionId]: value };
    });
  }, []);

  const handleEditAnswerChange = useCallback((questionId: number, value: any) => {
    setEditAnswers((prev) => {
      if (value === undefined) {
        if (prev[questionId] === undefined) return prev;
        const next = { ...prev };
        delete next[questionId];
        return next;
      }
      return { ...prev, [questionId]: value };
    });
  }, []);

  // Save new survey (apply mode)
  const handleSave = useCallback(async () => {
    if (!activeComponent || !producerId || !projectId || !currentUserId) return;

    const pid = Number(producerId);
    const projId = Number(projectId);
    const compId = activeComponent.id;
    const userId = currentUserId;

    try {
      // Multi-select stored as JSON string in SQLite (single row per question)
      const answerRows = Object.entries(answers).map(([qId, value]) => ({
        producer_id: pid,
        project_id: projId,
        component_id: compId,
        question_id: Number(qId),
        user_id: userId,
        value: Array.isArray(value)
          ? JSON.stringify(value)
          : value != null
            ? String(value)
            : null,
      }));

      // Build sync payload — multi-select uses nested `answers` array format
      const syncAnswers: ({ question_id: number; answer_value: string } | { question_id: number; answers: { answer_value: string }[] })[] = [];
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
        intervention_method_id: CHARACTERIZATION_INTERVENTION_METHOD_ID,
        producer_id: pid,
        created_at: new Date().toISOString().split("T")[0],
        answers: syncAnswers,
      };

      const isOnline = await checkConnectivity();

      if (isOnline) {
        const response = await apiFetch<any>("/surveys", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        // Mark method as applied in local cache so re-apply is prevented
        await markInterventionMethodApplied(
          pid,
          projId,
          CHARACTERIZATION_INTERVENTION_METHOD_ID,
          userId,
        );
        showAlert({
          title: "Guardado",
          message: "Las respuestas se guardaron correctamente.",
          type: "success",
        });
      } else {
        await saveAnswersBatch(answerRows);
        await enqueue(
          "survey_answers",
          `${pid}-${projId}-${compId}-${userId}`,
          payload,
          userId,
        );
        // Mark as applied locally so the tab shows existing data
        await markInterventionMethodApplied(
          pid,
          projId,
          CHARACTERIZATION_INTERVENTION_METHOD_ID,
          userId,
        );
        showAlert({
          title: "Sin internet",
          message:
            "Las respuestas se guardaron localmente y se enviarán al sincronizar.",
          type: "warning",
        });
      }

      setMethodAlreadyApplied(true);
      setShowSheet(false);
      setHasSurvey(true);
      setRefreshKey((k) => k + 1);
    } catch (error) {
      console.error("Failed to save answers:", error);
      showAlert({ title: "Error", message: "No se pudieron guardar las respuestas.", type: "error" });
    }
  }, [answers, activeComponent, producerId, projectId, currentUserId, showAlert]);

  // Edit single answer
  const handleEditPress = useCallback(
    (questionId: number) => {
      const question = localQuestions.find((q) => q.id === questionId);
      if (!question) return;

      const typeName = getCanonicalTypeName(question.question_type_id);
      let questionsForEdit: Question[] = [question];

      if (typeName === "dependent_list") {
        const detail = questionDetails[question.id];
        const childIds = resolveDependentChildIdsFromDetail(
          detail,
          answers[question.id],
          question,
        );
        const childQuestions = childIds
          .map((id) => localQuestions.find((cq) => cq.id === id))
          .filter((cq): cq is Question => cq != null);
        questionsForEdit = [question, ...childQuestions];
      }

      const initialAnswers: Record<number, unknown> = {};
      for (const q of questionsForEdit) {
        if (answers[q.id] !== undefined) {
          initialAnswers[q.id] = answers[q.id];
        }
      }

      setEditingQuestion(question);
      setEditQuestions(questionsForEdit);
      setEditAnswers(initialAnswers as Record<number, any>);
      setShowSheet(true);
    },
    [localQuestions, answers, getCanonicalTypeName, questionDetails],
  );

  const handleEditSave = useCallback(async () => {
    if (!editingQuestion) return;
    const answerId = answerIds[editingQuestion.id];
    const surveyId = surveyIds[editingQuestion.id];
    const rawVal = editAnswers[editingQuestion.id];
    const typeName = getCanonicalTypeName(editingQuestion.question_type_id);
    const isDependent = typeName === "dependent_list";
    const isMultiple = editingQuestion.multiple === true;

    const detailParent = questionDetails[editingQuestion.id];
    const requiredChildIds = isDependent
      ? resolveDependentChildIdsFromDetail(
          detailParent,
          rawVal,
          editingQuestion,
        )
      : [];

    if (isDependent) {
      for (const cid of requiredChildIds) {
        if (isSurveyAnswerEmpty(editAnswers[cid])) {
          showAlert({
            title: "Respuesta incompleta",
            message:
              "Seleccione una respuesta para la pregunta relacionada antes de guardar.",
            type: "warning",
          });
          return;
        }
      }
    }

    const primaryChildId =
      requiredChildIds.length > 0 ? requiredChildIds[0] : undefined;
    const childQuestion =
      primaryChildId != null
        ? editQuestions.find((q) => q.id === primaryChildId) ??
          localQuestions.find((q) => q.id === primaryChildId)
        : undefined;
    const childValue =
      childQuestion != null ? editAnswers[childQuestion.id] : undefined;

    const resolveItemName = (qId: number, val: unknown): string | null => {
      const detail = questionDetails[qId] as Record<string, unknown> | undefined;
      const opts: unknown[] =
        (detail?.options as unknown[]) ??
        (detail?.items as unknown[]) ??
        (detail?.data as { options?: unknown[] })?.options ??
        (detail?.data as { items?: unknown[] })?.items ??
        (Array.isArray(detail?.data) ? (detail?.data as unknown[]) : []) ??
        [];
      if (!Array.isArray(opts) || val == null) return null;
      const match = findOptionMatchingStoredValue(opts, val);
      return (match?.name as string | undefined) ?? null;
    };

    const isOnline = await checkConnectivity();

    if (isOnline) {
      try {
        if (isDependent) {
          const parentValue =
            typeof rawVal === "object" && rawVal !== null && !Array.isArray(rawVal)
              ? String(
                  (rawVal as { _main?: unknown })._main ??
                    (rawVal as { value?: unknown }).value ??
                    JSON.stringify(rawVal),
                )
              : String(rawVal ?? "");

          const body: {
            value: string;
            child:
              | null
              | { question_id: number; answer_value: string };
          } = {
            value: parentValue,
            child:
              childQuestion != null &&
              childValue != null &&
              !isSurveyAnswerEmpty(childValue)
                ? {
                    question_id: childQuestion.id,
                    answer_value: String(childValue),
                  }
                : null,
          };

          await apiFetch(`/questions-dependent-list/${answerId}`, {
            method: "PUT",
            body: JSON.stringify(body),
          });
          await deleteAnswerUpdate(answerId);

          setAnswers((prev) => {
            const next = { ...prev, [editingQuestion.id]: rawVal };
            const childIdsInEdit = editQuestions
              .filter((q) => q.id !== editingQuestion.id)
              .map((q) => q.id);
            for (const cid of childIdsInEdit) {
              if (requiredChildIds.includes(cid)) {
                const cv = editAnswers[cid];
                if (!isSurveyAnswerEmpty(cv)) next[cid] = cv;
                else delete next[cid];
              } else {
                delete next[cid];
              }
            }
            return next;
          });
          setItemNames((prev) => {
            const next = { ...prev };
            delete next[editingQuestion.id];
            const childIdsInEdit = editQuestions
              .filter((q) => q.id !== editingQuestion.id)
              .map((q) => q.id);
            for (const cid of childIdsInEdit) {
              if (requiredChildIds.includes(cid)) {
                const cv = editAnswers[cid];
                const name = !isSurveyAnswerEmpty(cv)
                  ? resolveItemName(cid, cv)
                  : null;
                if (name) next[cid] = name;
                else delete next[cid];
              } else {
                delete next[cid];
              }
            }
            return next;
          });
          setPendingQuestionIds((prev) => {
            const next = new Set(prev);
            next.delete(editingQuestion.id);
            for (const cid of requiredChildIds) next.delete(cid);
            return next;
          });
        } else if (isMultiple && surveyId) {
          const values = Array.isArray(rawVal)
            ? rawVal.map((v: unknown) => ({ answer_value: String(v ?? "") }))
            : [{ answer_value: String(rawVal ?? "") }];
          await updateMultipleAnswers(editingQuestion.id, surveyId, values);
          await deleteAnswerUpdate(answerId);
          setAnswers((prev) => ({ ...prev, [editingQuestion.id]: rawVal }));
          setItemNames((prev) => {
            const next = { ...prev };
            delete next[editingQuestion.id];
            return next;
          });
          setPendingQuestionIds((prev) => {
            const next = new Set(prev);
            next.delete(editingQuestion.id);
            return next;
          });
        } else {
          const newValue =
            typeof rawVal === "object" &&
            rawVal !== null &&
            !Array.isArray(rawVal)
              ? String(
                  (rawVal as { _main?: unknown })._main ??
                    (rawVal as { value?: unknown }).value ??
                    JSON.stringify(rawVal),
                )
              : String(rawVal ?? "");
          await apiFetch(`/surveys/update-answer/${answerId}`, {
            method: "PUT",
            body: JSON.stringify({ value: newValue }),
          });
          await deleteAnswerUpdate(answerId);
          setAnswers((prev) => ({ ...prev, [editingQuestion.id]: rawVal }));
          setItemNames((prev) => {
            const next = { ...prev };
            delete next[editingQuestion.id];
            return next;
          });
          setPendingQuestionIds((prev) => {
            const next = new Set(prev);
            next.delete(editingQuestion.id);
            return next;
          });
        }

        setShowSheet(false);
        setEditingQuestion(null);
        setEditQuestions([]);
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
      const compId = activeComponent?.id ?? 0;
      const userId = currentUserId ?? 0;

      const editSerializationCtx = getPrimaryDependentChildSerializationContext(
        typeName,
        detailParent,
        rawVal,
        editAnswers as Record<number, unknown>,
        editingQuestion,
      );

      const proposedStored = isDependent
        ? serializePersonalOfflineUpsert({
            question: editingQuestion,
            typeName,
            rawVal,
            primaryChildQuestionId:
              editSerializationCtx.primaryChildQuestionId,
            rawChildVal: editSerializationCtx.rawChildVal,
          })
        : serializeCharacterizationOfflineUpsert(rawVal);

      const baselineRow = baselineAnswersRef.current;
      const qId = editingQuestion.id;
      const hasServerBaselineForQuestion = Object.prototype.hasOwnProperty.call(
        baselineRow,
        qId,
      );

      if (hasServerBaselineForQuestion) {
        const baselineRaw = baselineRow[qId];
        const baselineSerializationCtx = getPrimaryDependentChildSerializationContext(
          typeName,
          detailParent,
          baselineRaw,
          baselineRow as Record<number, unknown>,
          editingQuestion,
        );
        const baselineStored = isDependent
          ? serializePersonalOfflineUpsert({
              question: editingQuestion,
              typeName,
              rawVal: baselineRaw,
              primaryChildQuestionId:
                baselineSerializationCtx.primaryChildQuestionId,
              rawChildVal: baselineSerializationCtx.rawChildVal,
            })
          : serializeCharacterizationOfflineUpsert(baselineRaw);

        if (
          offlinePendingValuesAreEquivalent({
            proposed: proposedStored,
            baseline: baselineStored,
            isCommaMultiselect:
              editingQuestion.multiple === true &&
              typeName !== "dependent_list",
          })
        ) {
          await deleteAnswerUpdate(answerId);
          const baseAnswers = baselineAnswersRef.current as Record<number, unknown>;
          const baseNames = baselineItemNamesRef.current;
          setAnswers((prev) => {
            const next = { ...prev };
            for (const q of editQuestions) {
              const id = q.id;
              if (Object.prototype.hasOwnProperty.call(baseAnswers, id)) {
                next[id] = baseAnswers[id];
              } else {
                delete next[id];
              }
            }
            return next;
          });
          setItemNames((prev) => {
            const next = { ...prev };
            for (const q of editQuestions) {
              const id = q.id;
              if (Object.prototype.hasOwnProperty.call(baseNames, id)) {
                next[id] = baseNames[id] as string | string[] | null;
              } else {
                delete next[id];
              }
            }
            return next;
          });
          setPendingQuestionIds((prev) => {
            const next = new Set(prev);
            for (const q of editQuestions) next.delete(q.id);
            return next;
          });
          useSyncStore.getState().refreshStatus();
          setShowSheet(false);
          setEditingQuestion(null);
          setEditQuestions([]);
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
        question_id: qId,
        user_id: userId,
        intervention_method_id: CHARACTERIZATION_INTERVENTION_METHOD_ID,
      });

      useSyncStore.getState().refreshStatus();

      if (isDependent) {
        setAnswers((prev) => {
          const next = { ...prev, [editingQuestion.id]: rawVal };
          const childIdsInEdit = editQuestions
            .filter((q) => q.id !== editingQuestion.id)
            .map((q) => q.id);
          for (const cid of childIdsInEdit) {
            if (requiredChildIds.includes(cid)) {
              const cv = editAnswers[cid];
              if (!isSurveyAnswerEmpty(cv)) next[cid] = cv;
              else delete next[cid];
            } else {
              delete next[cid];
            }
          }
          return next;
        });
        setItemNames((prev) => {
          const next = { ...prev };
          delete next[editingQuestion.id];
          const childIdsInEdit = editQuestions
            .filter((q) => q.id !== editingQuestion.id)
            .map((q) => q.id);
          for (const cid of childIdsInEdit) {
            if (requiredChildIds.includes(cid)) {
              const cv = editAnswers[cid];
              const name = !isSurveyAnswerEmpty(cv)
                ? resolveItemName(cid, cv)
                : null;
              if (name) next[cid] = name;
              else delete next[cid];
            } else {
              delete next[cid];
            }
          }
          return next;
        });
        setPendingQuestionIds((prev) => new Set([...prev, editingQuestion.id]));
      } else {
        setAnswers((prev) => ({ ...prev, [qId]: rawVal }));
        setItemNames((prev) => {
          const next = { ...prev };
          delete next[qId];
          return next;
        });
        setPendingQuestionIds((prev) => new Set([...prev, qId]));
      }

      setShowSheet(false);
      setEditingQuestion(null);
      setEditQuestions([]);
      showAlert({
        title: "Sin internet",
        message: "La edición se guardó localmente y se enviará al sincronizar.",
        type: "warning",
      });
    }
  }, [
    editingQuestion,
    editQuestions,
    editAnswers,
    answerIds,
    surveyIds,
    activeComponent,
    producerId,
    projectId,
    currentUserId,
    showAlert,
    getCanonicalTypeName,
    questionDetails,
    updateMultipleAnswers,
    localQuestions,
  ]);

  if (loadingComponents) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a7a3a" />
        <ThemedText style={styles.loadingText}>Cargando...</ThemedText>
      </View>
    );
  }

  if (!activeComponent) {
    return (
      <View style={styles.center}>
        <Layers size={responsiveFont(48)} color="#11181C" />
        <ThemedText style={styles.emptyText}>
          No hay componentes de caracterización disponibles
        </ThemedText>
      </View>
    );
  }

  // Still loading answers or resolving display values — show spinner
  if (loadingAnswers || (!showSheet && Object.keys(answers).length > 0 && savedAnswers.length === 0)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a7a3a" />
        <ThemedText style={styles.loadingText}>Cargando respuestas...</ThemedText>
      </View>
    );
  }

  // No survey yet — show intro screen with apply/re-apply button
  if (!hasSurvey && savedAnswers.length === 0) {
    return (
      <View style={styles.introContainer}>
        <View style={styles.introIconContainer}>
          <ClipboardList size={responsiveFont(48)} color="#1a7a3a" />
        </View>
        <ThemedText type="defaultSemiBold" style={styles.introTitle}>
          Caracterización del Usuario
        </ThemedText>
        <ThemedText style={styles.introDescription}>
          {methodAlreadyApplied
            ? "Este método ya fue aplicado. Puede editar las respuestas guardadas a continuación."
            : "Aplique la encuesta de caracterización para registrar la información detallada del usuario según los componentes establecidos."}
        </ThemedText>
        <TouchableOpacity
          style={styles.applyButton}
          activeOpacity={0.8}
          onPress={handleApply}
        >
          <ClipboardList size={responsiveFont(20)} color="#ffffff" />
          <ThemedText
            lightColor="#ffffff"
            darkColor="#ffffff"
            type="defaultSemiBold"
            style={styles.applyButtonText}
          >
            {methodAlreadyApplied ? "Ver / Editar Respuestas" : "Aplicar Caracterización"}
          </ThemedText>
        </TouchableOpacity>

        <SurveyBottomSheet
          visible={showSheet}
          onClose={handleCloseSheet}
          title={activeComponent.name}
          questions={localQuestions.length > 0 ? localQuestions : storeQuestions}
          answers={answers}
          onAnswerChange={handleAnswerChange}
          onSave={handleSave}
          getTypeName={getCanonicalTypeName}
          loading={loadingQuestions}
        />
      </View>
    );
  }

  // Survey exists — show answers with edit buttons
  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Answers section */}
        <View style={styles.answersSection}>
          <ThemedText type="defaultSemiBold" style={styles.answersSectionTitle}>
            Respuestas
          </ThemedText>

          {savedAnswers.length > 0 ? (
            savedAnswers.map((item) => (
              <View
                key={item.questionId}
                style={[styles.answerCard, item.isPending && styles.answerCardPending]}
              >
                <View style={styles.answerHeader}>
                  <ThemedText style={styles.answerQuestion}>
                    {item.questionName}
                  </ThemedText>
                  <View style={styles.answerHeaderRight}>
                    {item.isPending && (
                      <View style={styles.pendingBadge}>
                        <ThemedText style={styles.pendingBadgeText}>PENDIENTE</ThemedText>
                      </View>
                    )}
                    {answerIds[item.questionId] != null && (
                      <TouchableOpacity
                        style={[styles.editButton, item.isPending && styles.editButtonPending]}
                        onPress={() => handleEditPress(item.questionId)}
                        activeOpacity={0.7}
                      >
                        <Pencil size={responsiveFont(16)} color={item.isPending ? "#92400e" : "#1a7a3a"} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <View style={[styles.answerValueContainer, item.isPending && styles.answerValueContainerPending]}>
                  <ThemedText style={[styles.answerValue, item.isPending && styles.answerValuePending]}>
                    {item.displayValue}
                  </ThemedText>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.noAnswersContainer}>
              <FileQuestion size={responsiveFont(36)} color="#11181C" />
              <ThemedText style={styles.noAnswersText}>
                Aún no se han registrado respuestas de caracterización
              </ThemedText>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Edit single answer bottom sheet */}
      {editingQuestion && (
        <SurveyBottomSheet
          visible={showSheet}
          onClose={handleCloseSheet}
          title={editingQuestion.description ?? editingQuestion.name ?? "Editar respuesta"}
          questions={editQuestions.length > 0 ? editQuestions : [editingQuestion]}
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
  introContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: verticalScale(16),
    paddingHorizontal: widthScale(20),
  },
  introIconContainer: {
    width: widthScale(80),
    height: widthScale(80),
    borderRadius: widthScale(40),
    backgroundColor: "rgba(26, 122, 58, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  introTitle: {
    fontSize: responsiveFont(19),
    textAlign: "center",
  },
  introDescription: {
    fontSize: responsiveFont(17),
    textAlign: "center",
    lineHeight: responsiveFont(22),
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
    marginTop: verticalScale(8),
  },
  applyButtonText: {
    fontSize: responsiveFont(17),
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: verticalScale(12),
    paddingHorizontal: widthScale(4),
    paddingBottom: verticalScale(120),
  },
  answersSection: {
    marginTop: verticalScale(4),
  },
  answersSectionTitle: {
    fontSize: responsiveFont(17),
    marginBottom: verticalScale(12),
    color: "#1a7a3a",
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
  answerQuestion: {
    flex: 1,
    fontSize: responsiveFont(15),
    fontWeight: "600",
    marginBottom: verticalScale(8),
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
