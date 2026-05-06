import { ThemedText } from "@/components/themed-text";
import { useAlert } from "@/components/ui/custom-alert";
import { SurveyBottomSheet } from "@/components/wizard/survey-bottom-sheet";
import { checkConnectivity } from "@/hooks/use-network";
import type { Question } from "@/schemas/characterization";
import { useAuthStore } from "@/store/useAuthStore";
import {
    PERSONAL_INFO_INTERVENTION_METHOD_ID,
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
import { markInterventionMethodApplied } from "@/utils/database/repositories/producer-intervention-repository";
import { enqueue } from "@/utils/database/repositories/sync-repository";
import {
  isSurveyAnswerEmpty,
  resolveDependentChildIdsFromDetail,
} from "@/utils/survey/dependent-child-ids";
import { findOptionMatchingStoredValue } from "@/utils/survey/option-display";
import {
  getPrimaryDependentChildSerializationContext,
  offlinePendingValuesAreEquivalent,
  serializePersonalOfflineUpsert,
  snapshotServerBaselineAnswers,
} from "@/utils/survey/offline-new-value-serializers";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import {
    ChevronDown,
    ChevronUp,
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

interface PersonalInfoTabProps {
  producerId: string;
  projectId?: string;
}

interface DisplayAnswer {
  questionId: number;
  questionName: string;
  displayValue: string;
  children?: DisplayAnswer[];
  isPending?: boolean;
}

function resolveDisplayValue(
  rawValue: any,
  questionId: number,
  questionDetails: Record<number, any>,
  getCanonicalTypeName: (typeId: number) => string,
  questionTypeId: number,
  itemName: string | string[] | null,
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

  const typeName = getCanonicalTypeName(questionTypeId);

  // If item_name is available, prefer it over the raw value
  if (itemName && typeof itemName === "string" && itemName !== "") {
    return itemName;
  }

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

  if (typeName === "dependent_list") {
    const detail = questionDetails[questionId] as any;
    const items: any[] =
      detail?.items ??
      detail?.options ??
      detail?.data?.items ??
      detail?.data?.options ??
      detail?.data ??
      [];
    const mainVal =
      typeof rawValue === "object" && rawValue?._main != null
        ? rawValue._main
        : rawValue;
    const match = findOptionMatchingStoredValue(items, mainVal);
    if (match?.name) return match.name;
    return String(mainVal ?? "");
  }

  if (typeName === "bool") {
    return (rawValue === true || rawValue === "true" || rawValue === 1 || rawValue === "1") ? "SI" : "NO";
  }

  return String(rawValue);
}

export function PersonalInfoTab({
  producerId,
  projectId,
}: PersonalInfoTabProps) {
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
    getPersonalInfoComponent,
    getCanonicalTypeName,
    hasInterventionMethodApplied,
  } = useCharacterizationStore();

  const currentUserId = useAuthStore((state) => state.user?.user_id);
  const { showAlert } = useAlert();

  const [showSheet, setShowSheet] = useState(false);
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [answerIds, setAnswerIds] = useState<Record<number, number>>({});
  const [surveyIds, setSurveyIds] = useState<Record<number, number>>({});
  const [itemNames, setItemNames] = useState<
    Record<number, string | string[] | null>
  >({});
  const [hasSurvey, setHasSurvey] = useState(false);
  const [savedAnswers, setSavedAnswers] = useState<DisplayAnswer[]>([]);
  const [loadingAnswers, setLoadingAnswers] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [methodAlreadyApplied, setMethodAlreadyApplied] = useState(false);

  // Local copy of questions (survives tab switches)
  const [localQuestions, setLocalQuestions] = useState<Question[]>([]);
  const hasFetchedQuestions = useRef(false);
  const requestedDetailsRef = useRef(new Set<number>());

  // Edit mode
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editQuestions, setEditQuestions] = useState<Question[]>([]);
  const [editAnswers, setEditAnswers] = useState<Record<number, any>>({});

  // Snapshot of answers before opening sheet, used to restore on close without save
  const answersSnapshotRef = useRef<Record<number, any>>({});

  /** Answers + item_names tal como vinieron del remoto antes de overlays locales pendientes */
  const baselineAnswersRef = useRef<Record<number, unknown>>({});
  const baselineItemNamesRef = useRef<Record<number, string | string[] | null>>({});
  /** Evita pisar baseline con `{}` cuando se reabre la pestaña offline sin cache SQLite. */
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

  // Accordion: track which parent cards have their children expanded
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [pendingQuestionIds, setPendingQuestionIds] = useState<Set<number>>(
    new Set(),
  );

  useEffect(() => {
    if (components.length === 0) {
      fetchComponents();
    }
    fetchQuestionTypes();
  }, [components.length, fetchComponents, fetchQuestionTypes]);

  const activeComponent = getPersonalInfoComponent();

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

      const baselineScopeKey = `${pid}-${projId}-${PERSONAL_INFO_INTERVENTION_METHOD_ID}`;
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
          PERSONAL_INFO_INTERVENTION_METHOD_ID,
        );
        remoteSurveyRowCount = remote.length;
        for (const item of remote) {
          // Accumulate multiple answers for the same question (multi-select)
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
          // Prefer item_name when available, accumulate for multi-select
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

      // Solo cuando hay datos remotos/recién descargados: actualizar baseline.
      // Si no, conservar ref (reaperturas offline sin filas en survey_results locales).
      if (remoteSurveyRowCount > 0) {
        const serverBaselineSnap = snapshotServerBaselineAnswers(
          merged,
          iNames,
        );
        baselineAnswersRef.current = serverBaselineSnap.baselineAnswers;
        baselineItemNamesRef.current = serverBaselineSnap.baselineItemNames;
      }

      // 2. Overlay local SQLite answers (pending upload take precedence) — always available offline
      const pendingIds = new Set<number>();
      try {
        const local = await getAnswers(
          pid,
          projId,
          activeComponent.id,
          currentUserId,
        );
        for (const a of local) {
          // Try to restore JSON array stored for multi-select
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
          PERSONAL_INFO_INTERVENTION_METHOD_ID,
        );
        for (const upd of updates) {
          let usedParsed = false;
          try {
            const parsed = JSON.parse(upd.new_value ?? "");
            if (
              Array.isArray(parsed) ||
              (parsed && typeof parsed === "object")
            ) {
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
      setPendingQuestionIds(pendingIds);
      setHasSurvey(foundRemote);
      setLoadingAnswers(false);
    })();
  }, [
    activeComponent,
    producerId,
    projectId,
    currentUserId,
    fetchSurveyResults,
    refreshKey,
  ]);

  // Check if method already applied (for apply/re-apply guard)
  useEffect(() => {
    if (!producerId || !projectId || !currentUserId) return;
    const pid = Number(producerId);
    const projId = Number(projectId);
    (async () => {
      const applied = await hasInterventionMethodApplied(
        pid,
        projId,
        PERSONAL_INFO_INTERVENTION_METHOD_ID,
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

  // Build display answers with nesting for dependent questions
  useEffect(() => {
    // Don't recompute while sheet is open to avoid unmounting the sheet
    if (showSheet) return;
    if (localQuestions.length === 0 || Object.keys(answers).length === 0) {
      setSavedAnswers([]);
      return;
    }

    // Build parent-child map from questions
    const childToParent = new Map<number, number>();
    for (const q of localQuestions) {
      if (q.question_parent_id != null) {
        childToParent.set(q.id, q.question_parent_id);
      }
    }

    // Build all display answers keyed by question id
    const allAnswers = new Map<number, DisplayAnswer>();
    localQuestions.forEach((q, index) => {
      const rawValue = answers[q.id];
      if (
        rawValue == null ||
        rawValue === "" ||
        (Array.isArray(rawValue) && rawValue.length === 0)
      )
        return;
      allAnswers.set(q.id, {
        questionId: q.id,
        questionName: `${index + 1}. ${q.description ?? q.name ?? "Pregunta"}`,
        displayValue: resolveDisplayValue(
          rawValue,
          q.id,
          questionDetails,
          getCanonicalTypeName,
          q.question_type_id,
          itemNames[q.id] ?? null,
        ),
        isPending: pendingQuestionIds.has(q.id),
      });
    });

    // Separate into top-level and children; attach children to parents
    const display: DisplayAnswer[] = [];
    for (const [qId, answer] of allAnswers) {
      const parentId = childToParent.get(qId);
      if (parentId != null) {
        const parent = allAnswers.get(parentId);
        if (parent) {
          if (!parent.children) parent.children = [];
          parent.children.push(answer);
        }
      } else {
        display.push(answer);
      }
    }

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
    if (!activeComponent) return;
    setEditingQuestion(null);
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

  const handleEditAnswerChange = useCallback(
    (questionId: number, value: any) => {
      setEditAnswers((prev) => {
        if (value === undefined) {
          if (prev[questionId] === undefined) return prev;
          const next = { ...prev };
          delete next[questionId];
          return next;
        }
        return { ...prev, [questionId]: value };
      });
    },
    [],
  );

  // Save new survey (apply mode)
  const handleSave = useCallback(async () => {
    if (!activeComponent || !producerId || !projectId || !currentUserId) return;

    const pid = Number(producerId);
    const projId = Number(projectId);
    const compId = activeComponent.id;
    const userId = currentUserId;

    try {
      // Build SQLite rows — multi-select stored as JSON string (single row per question)
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
        intervention_method_id: PERSONAL_INFO_INTERVENTION_METHOD_ID,
        producer_id: pid,
        created_at: new Date().toISOString().split("T")[0],
        answers: syncAnswers,
      };

      const isOnline = await checkConnectivity();

      if (isOnline) {
        await apiFetch("/surveys", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        await markInterventionMethodApplied(
          pid,
          projId,
          PERSONAL_INFO_INTERVENTION_METHOD_ID,
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
        await markInterventionMethodApplied(
          pid,
          projId,
          PERSONAL_INFO_INTERVENTION_METHOD_ID,
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
      showAlert({
        title: "Error",
        message: "No se pudieron guardar las respuestas.",
        type: "error",
      });
    }
  }, [
    answers,
    activeComponent,
    producerId,
    projectId,
    currentUserId,
    showAlert,
  ]);

  // Edit single answer — for dependent_list parents, also include child questions
  const handleEditPress = useCallback(
    (questionId: number) => {
      const question = localQuestions.find((q) => q.id === questionId);
      if (!question) return;

      const typeName = getCanonicalTypeName(question.question_type_id);
      let questionsForEdit: Question[] = [question];

      if (typeName === "dependent_list") {
        const detail = questionDetails[question.id] as any;
        const items: any[] =
          detail?.items ??
          detail?.options ??
          detail?.data?.items ??
          detail?.data?.options ??
          detail?.data ??
          [];
        const childIds = new Set<number>();
        if (Array.isArray(items)) {
          for (const opt of items) {
            if (opt?.other_question_id) childIds.add(Number(opt.other_question_id));
          }
        }
        const childQuestions = localQuestions.filter((q) => childIds.has(q.id));
        questionsForEdit = [question, ...childQuestions];
      }

      const initialAnswers: Record<number, any> = {};
      for (const q of questionsForEdit) {
        if (answers[q.id] !== undefined) {
          initialAnswers[q.id] = answers[q.id];
        }
      }

      setEditingQuestion(question);
      setEditQuestions(questionsForEdit);
      setEditAnswers(initialAnswers);
      setShowSheet(true);
    },
    [localQuestions, answers, getCanonicalTypeName, questionDetails],
  );

  const handleEditSave = useCallback(async () => {
    if (!editingQuestion) return;
    const answerId = answerIds[editingQuestion.id];
    const surveyId = surveyIds[editingQuestion.id];
    const rawVal = editAnswers[editingQuestion.id];
    const isMultiple = editingQuestion.multiple === true;
    const typeName = getCanonicalTypeName(editingQuestion.question_type_id);
    const isDependent = typeName === "dependent_list";

    const detailParent = questionDetails[editingQuestion.id];
    const requiredChildIds = isDependent
      ? resolveDependentChildIdsFromDetail(detailParent, rawVal)
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

    // API actual acepta un `child` por PUT; la primera hija activa según la selección.
    const primaryChildId =
      requiredChildIds.length > 0 ? requiredChildIds[0] : undefined;
    const childQuestion =
      primaryChildId != null
        ? editQuestions.find((q) => q.id === primaryChildId) ??
          localQuestions.find((q) => q.id === primaryChildId)
        : undefined;
    const childValue =
      childQuestion != null ? editAnswers[childQuestion.id] : undefined;

    const resolveItemName = (qId: number, val: any): string | null => {
      const detail = questionDetails[qId] as any;
      const opts: any[] =
        detail?.options ?? detail?.items ?? detail?.data?.options ?? detail?.data?.items ?? detail?.data ?? [];
      if (!Array.isArray(opts) || val == null) return null;
      const match = findOptionMatchingStoredValue(opts, val);
      return match?.name ?? null;
    };

    const isOnline = await checkConnectivity();

    if (isOnline) {
      try {
        if (isDependent) {
          const parentValue =
            typeof rawVal === "object" && rawVal !== null && !Array.isArray(rawVal)
              ? String(rawVal._main ?? rawVal.value ?? JSON.stringify(rawVal))
              : String(rawVal ?? "");

          const body: any = { value: parentValue };
          if (childQuestion && childValue != null) {
            body.child = {
              question_id: childQuestion.id,
              answer_value: String(childValue),
            };
          }

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
            ? rawVal.map((v: any) => ({ answer_value: String(v) }))
            : [{ answer_value: String(rawVal ?? "") }];
          await updateMultipleAnswers(editingQuestion.id, surveyId, values);
          await deleteAnswerUpdate(answerId);
          setAnswers((prev) => ({ ...prev, [editingQuestion.id]: rawVal }));
          setItemNames((prev) => { const next = { ...prev }; delete next[editingQuestion.id]; return next; });
          setPendingQuestionIds((prev) => { const next = new Set(prev); next.delete(editingQuestion.id); return next; });
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
          await deleteAnswerUpdate(answerId);
          setAnswers((prev) => ({ ...prev, [editingQuestion.id]: rawVal }));
          setItemNames((prev) => { const next = { ...prev }; delete next[editingQuestion.id]; return next; });
          setPendingQuestionIds((prev) => { const next = new Set(prev); next.delete(editingQuestion.id); return next; });
        }

        setShowSheet(false);
        setEditingQuestion(null);
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
      );

      const proposedStored = serializePersonalOfflineUpsert({
        question: editingQuestion,
        typeName,
        rawVal,
        primaryChildQuestionId: editSerializationCtx.primaryChildQuestionId,
        rawChildVal: editSerializationCtx.rawChildVal,
      });

      const baselineRow = baselineAnswersRef.current;
      const hasServerBaselineForQuestion = Object.prototype.hasOwnProperty.call(
        baselineRow,
        editingQuestion.id,
      );

      if (hasServerBaselineForQuestion) {
        const baselineRaw = baselineRow[editingQuestion.id];
        const baseSerializationCtx = getPrimaryDependentChildSerializationContext(
          typeName,
          detailParent,
          baselineRaw,
          baselineRow as Record<number, unknown>,
        );
        const baselineStored = serializePersonalOfflineUpsert({
          question: editingQuestion,
          typeName,
          rawVal: baselineRaw,
          primaryChildQuestionId: baseSerializationCtx.primaryChildQuestionId,
          rawChildVal: baseSerializationCtx.rawChildVal,
        });

        if (
          offlinePendingValuesAreEquivalent({
            proposed: proposedStored,
            baseline: baselineStored,
            isCommaMultiselect:
              editingQuestion.multiple === true && typeName !== "dependent_list",
          })
        ) {
          await deleteAnswerUpdate(answerId);
          const baseAnswers = baselineAnswersRef.current as Record<number, any>;
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
        question_id: editingQuestion.id,
        user_id: userId,
        intervention_method_id: PERSONAL_INFO_INTERVENTION_METHOD_ID,
      });

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
        setAnswers((prev) => ({ ...prev, [editingQuestion.id]: rawVal }));
        setItemNames((prev) => {
          const next = { ...prev };
          delete next[editingQuestion.id];
          return next;
        });
        setPendingQuestionIds((prev) => new Set([...prev, editingQuestion.id]));
      }

      useSyncStore.getState().refreshStatus();
      setShowSheet(false);
      setEditingQuestion(null);
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
          No hay componentes de información personal disponibles
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

  // No survey yet — show intro screen
  if (!hasSurvey && savedAnswers.length === 0) {
    return (
      <View style={styles.introContainer}>
        <View style={styles.introIconContainer}>
          <ClipboardList size={responsiveFont(48)} color="#1a7a3a" />
        </View>
        <ThemedText type="defaultSemiBold" style={styles.introTitle}>
          Información Personal del Usuario
        </ThemedText>
        <ThemedText style={styles.introDescription}>
          {methodAlreadyApplied
            ? "Este método ya fue aplicado. Puede editar las respuestas guardadas a continuación."
            : "Registre la información personal del usuario según los campos establecidos."}
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
            {methodAlreadyApplied
              ? "Ver / Editar Respuestas"
              : "Registrar Información"}
          </ThemedText>
        </TouchableOpacity>

        <SurveyBottomSheet
          visible={showSheet}
          onClose={handleCloseSheet}
          title={activeComponent.name}
          questions={
            localQuestions.length > 0 ? localQuestions : storeQuestions
          }
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
        <View style={styles.answersSection}>
          <ThemedText type="defaultSemiBold" style={styles.answersSectionTitle}>
            Respuestas
          </ThemedText>

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
                    {answerIds[item.questionId] != null && (
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

                {/* Nested child answers (accordion) */}
                {item.children && item.children.length > 0 && (
                  <>
                    <TouchableOpacity
                      style={styles.accordionToggle}
                      onPress={() => {
                        setExpandedCards((prev) => {
                          const next = new Set(prev);
                          if (next.has(item.questionId)) {
                            next.delete(item.questionId);
                          } else {
                            next.add(item.questionId);
                          }
                          return next;
                        });
                      }}
                      activeOpacity={0.7}
                    >
                      <ThemedText style={styles.accordionToggleText}>
                        {expandedCards.has(item.questionId)
                          ? "Ocultar subpreguntas"
                          : `Ver ${item.children.length} subpregunta${item.children.length > 1 ? "s" : ""}`}
                      </ThemedText>
                      {expandedCards.has(item.questionId) ? (
                        <ChevronUp size={responsiveFont(16)} color="#1a7a3a" />
                      ) : (
                        <ChevronDown
                          size={responsiveFont(16)}
                          color="#1a7a3a"
                        />
                      )}
                    </TouchableOpacity>

                    {expandedCards.has(item.questionId) &&
                      item.children.map((child, childIdx) => (
                        <View
                          key={childIdx}
                          style={[
                            styles.childAnswerCard,
                            child.isPending && styles.childAnswerCardPending,
                          ]}
                        >
                          <View style={styles.answerHeader}>
                            <ThemedText style={styles.childAnswerQuestion}>
                              {child.questionName}
                            </ThemedText>
                            <View style={styles.answerHeaderRight}>
                              {child.isPending && (
                                <View style={styles.pendingBadge}>
                                  <ThemedText style={styles.pendingBadgeText}>
                                    PENDIENTE
                                  </ThemedText>
                                </View>
                              )}
                              {answerIds[child.questionId] != null && (
                                <TouchableOpacity
                                  style={[
                                    styles.editButton,
                                    child.isPending && styles.editButtonPending,
                                  ]}
                                  onPress={() =>
                                    handleEditPress(child.questionId)
                                  }
                                  activeOpacity={0.7}
                                >
                                  <Pencil
                                    size={responsiveFont(14)}
                                    color={
                                      child.isPending ? "#92400e" : "#1a7a3a"
                                    }
                                  />
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                          <View
                            style={[
                              styles.childAnswerValueContainer,
                              child.isPending &&
                                styles.childAnswerValueContainerPending,
                            ]}
                          >
                            <ThemedText
                              style={[
                                styles.childAnswerValue,
                                child.isPending &&
                                  styles.childAnswerValuePending,
                              ]}
                            >
                              {child.displayValue}
                            </ThemedText>
                          </View>
                        </View>
                      ))}
                  </>
                )}
              </View>
            ))
          ) : (
            <View style={styles.noAnswersContainer}>
              <FileQuestion size={responsiveFont(36)} color="#11181C" />
              <ThemedText style={styles.noAnswersText}>
                Aún no se ha registrado información personal
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
          title={
            editingQuestion.description ??
            editingQuestion.name ??
            "Editar respuesta"
          }
          questions={editQuestions}
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
  accordionToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: widthScale(4),
    marginTop: verticalScale(10),
    paddingVertical: verticalScale(8),
  },
  accordionToggleText: {
    fontSize: responsiveFont(13),
    color: "#1a7a3a",
    fontWeight: "600",
  },
  childAnswerCard: {
    marginTop: verticalScale(10),
    paddingVertical: verticalScale(8),
    paddingHorizontal: widthScale(12),
    backgroundColor: "rgba(26, 122, 58, 0.04)",
    borderRadius: widthScale(8),
  },
  childAnswerCardPending: {
    backgroundColor: "#fffbeb",
    borderWidth: 1.5,
    borderColor: "#f59e0b",
  },
  childAnswerQuestion: {
    flex: 1,
    fontSize: responsiveFont(14),
    fontWeight: "600",
    marginBottom: verticalScale(6),
    color: "#555",
  },
  childAnswerValueContainer: {
    backgroundColor: "rgba(26, 122, 58, 0.08)",
    borderRadius: widthScale(6),
    paddingVertical: verticalScale(8),
    paddingHorizontal: widthScale(10),
  },
  childAnswerValueContainerPending: {
    backgroundColor: "rgba(245, 158, 11, 0.12)",
  },
  childAnswerValue: {
    fontSize: responsiveFont(15),
    fontWeight: "500",
  },
  childAnswerValuePending: {
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
