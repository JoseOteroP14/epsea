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
import { apiFetch } from "@/utils/api";
import {
    getAnswers,
    saveAnswersBatch,
} from "@/utils/database/repositories/answer-repository";
import { enqueue } from "@/utils/database/repositories/sync-repository";
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
}

function resolveDisplayValue(
  rawValue: any,
  questionId: number,
  questionDetails: Record<number, any>,
  getCanonicalTypeName: (typeId: number) => string,
  questionTypeId: number,
): string {
  if (rawValue == null || rawValue === "") return "";

  // Handle arrays (multi-select)
  if (Array.isArray(rawValue)) {
    const parts = rawValue
      .map((v) =>
        resolveDisplayValue(
          v,
          questionId,
          questionDetails,
          getCanonicalTypeName,
          questionTypeId,
        ),
      )
      .filter(Boolean);
    return parts.join(", ");
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
    if (Array.isArray(options)) {
      const numVal = Number(rawValue);
      const match = options.find(
        (o: any) =>
          o.id === numVal ||
          o.id === rawValue ||
          o.name === rawValue ||
          o.value === rawValue,
      );
      if (match?.name) return match.name;
    }
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
    if (Array.isArray(items)) {
      const numVal = Number(mainVal);
      const match = items.find(
        (o: any) => o.id === numVal || o.id === mainVal || o.name === mainVal,
      );
      if (match?.name) return match.name;
    }
    return String(mainVal);
  }

  if (typeName === "bool") {
    return rawValue === true || rawValue === "true" ? "SI" : "NO";
  }

  if (
    rawValue === true ||
    rawValue === "true" ||
    rawValue === false ||
    rawValue === "false"
  ) {
    return rawValue === true || rawValue === "true" ? "SI" : "NO";
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
    getPersonalInfoComponent,
    getCanonicalTypeName,
  } = useCharacterizationStore();

  const currentUserId = useAuthStore((state) => state.user?.user_id);
  const { showAlert } = useAlert();

  const [showSheet, setShowSheet] = useState(false);
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [answerIds, setAnswerIds] = useState<Record<number, number>>({});
  const [hasSurvey, setHasSurvey] = useState(false);
  const [savedAnswers, setSavedAnswers] = useState<DisplayAnswer[]>([]);
  const [loadingAnswers, setLoadingAnswers] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Local copy of questions (survives tab switches)
  const [localQuestions, setLocalQuestions] = useState<Question[]>([]);
  const hasFetchedQuestions = useRef(false);
  const requestedDetailsRef = useRef(new Set<number>());

  // Edit mode
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editAnswers, setEditAnswers] = useState<Record<number, any>>({});

  // Snapshot of answers before opening sheet, used to restore on close without save
  const answersSnapshotRef = useRef<Record<number, any>>({});

  // Accordion: track which parent cards have their children expanded
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());

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

  // Load answers: first from API, then overlay local pending answers
  useEffect(() => {
    if (!activeComponent || !producerId || !projectId || !currentUserId) return;

    const pid = Number(producerId);
    const projId = Number(projectId);

    setLoadingAnswers(true);
    (async () => {
      const merged: Record<number, any> = {};
      const ids: Record<number, number> = {};
      let foundRemote = false;

      // 1. Fetch from API (server truth)
      try {
        const remote = await fetchSurveyResults(
          projId,
          pid,
          PERSONAL_INFO_INTERVENTION_METHOD_ID,
        );
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
        }
        foundRemote = remote.length > 0;
      } catch (e) {
        console.error("Failed to fetch remote survey results:", e);
      }

      // 2. Overlay local SQLite answers (pending upload take precedence)
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
              continue;
            }
          } catch {}
          merged[a.question_id] = a.value;
        }
      } catch (e) {
        console.error("Failed to load local answers:", e);
      }

      setAnswers(merged);
      setAnswerIds(ids);
      setHasSurvey(foundRemote);
      setLoadingAnswers(false);
    })();
  }, [activeComponent, producerId, projectId, currentUserId, fetchSurveyResults, refreshKey]);

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
        ),
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
  }, [localQuestions, answers, questionDetails, getCanonicalTypeName, showSheet]);

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
        showAlert({
          title: "Sin internet",
          message:
            "Las respuestas se guardaron localmente y se enviarán al sincronizar.",
          type: "warning",
        });
      }

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

      setEditingQuestion(question);
      setEditAnswers({ [questionId]: answers[questionId] });
      setShowSheet(true);
    },
    [localQuestions, answers],
  );

  const handleEditSave = useCallback(async () => {
    if (!editingQuestion) return;
    const answerId = answerIds[editingQuestion.id];
    const rawVal = editAnswers[editingQuestion.id];

    try {
      const newValue = Array.isArray(rawVal)
        ? rawVal.join(",")
        : String(rawVal ?? "");
      await updateSurveyAnswer(answerId, newValue);
      setAnswers((prev) => ({ ...prev, [editingQuestion.id]: rawVal }));

      setShowSheet(false);
      setEditingQuestion(null);
      showAlert({ title: "Actualizado", message: "La respuesta se actualizó correctamente.", type: "success" });
    } catch (error) {
      console.error("Failed to update answer:", error);
      showAlert({ title: "Error", message: "No se pudo actualizar la respuesta.", type: "error" });
    }
  }, [
    editingQuestion,
    editAnswers,
    answerIds,
    updateSurveyAnswer,
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

  if (loadingAnswers || (!showSheet && Object.keys(answers).length > 0 && savedAnswers.length === 0)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a7a3a" />
        <ThemedText style={styles.loadingText}>Cargando respuestas...</ThemedText>
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
          Registre la información personal del usuario según los campos
          establecidos.
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
            Registrar Información
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
        <View style={styles.answersSection}>
          <ThemedText type="defaultSemiBold" style={styles.answersSectionTitle}>
            Respuestas
          </ThemedText>

          {savedAnswers.length > 0 ? (
            savedAnswers.map((item, index) => (
              <View key={index} style={styles.answerCard}>
                <View style={styles.answerHeader}>
                  <ThemedText style={styles.answerQuestion}>
                    {item.questionName}
                  </ThemedText>
                  {answerIds[item.questionId] != null && (
                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={() => handleEditPress(item.questionId)}
                      activeOpacity={0.7}
                    >
                      <Pencil size={responsiveFont(16)} color="#1a7a3a" />
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.answerValueContainer}>
                  <ThemedText style={styles.answerValue}>
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
                        <ChevronDown size={responsiveFont(16)} color="#1a7a3a" />
                      )}
                    </TouchableOpacity>

                    {expandedCards.has(item.questionId) &&
                      item.children.map((child, childIdx) => (
                        <View key={childIdx} style={styles.childAnswerCard}>
                          <View style={styles.answerHeader}>
                            <ThemedText style={styles.childAnswerQuestion}>
                              {child.questionName}
                            </ThemedText>
                            {answerIds[child.questionId] != null && (
                              <TouchableOpacity
                                style={styles.editButton}
                                onPress={() => handleEditPress(child.questionId)}
                                activeOpacity={0.7}
                              >
                                <Pencil size={responsiveFont(14)} color="#1a7a3a" />
                              </TouchableOpacity>
                            )}
                          </View>
                          <View style={styles.childAnswerValueContainer}>
                            <ThemedText style={styles.childAnswerValue}>
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
  answerHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: widthScale(8),
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
  answerValueContainer: {
    backgroundColor: "rgba(26, 122, 58, 0.12)",
    borderRadius: widthScale(8),
    paddingVertical: verticalScale(10),
    paddingHorizontal: widthScale(12),
  },
  answerValue: {
    fontSize: responsiveFont(16),
    fontWeight: "500",
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
  childAnswerValue: {
    fontSize: responsiveFont(15),
    fontWeight: "500",
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
