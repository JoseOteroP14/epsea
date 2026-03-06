import { ThemedText } from "@/components/themed-text";
import { SurveyBottomSheet } from "@/components/wizard/survey-bottom-sheet";
import type { Question } from "@/schemas/characterization";
import { useAuthStore } from "@/store/useAuthStore";
import {
    CLASSIFICATION_INTERVENTION_METHOD_ID,
    useCharacterizationStore,
} from "@/store/useCharacterizationStore";
import {
    getAnswers,
    saveAnswersBatch,
} from "@/utils/database/repositories/answer-repository";
import { enqueue } from "@/utils/database/repositories/sync-repository";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import {
    ClipboardCheck,
    FileQuestion,
    Layers,
    Pencil,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";

interface ClassificationTabProps {
  producerId: string;
  projectId?: string;
}

interface DisplayAnswer {
  questionId: number;
  questionName: string;
  displayValue: string;
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

  if (typeName === "bool") {
    return rawValue === true || rawValue === "true" ? "Sí" : "No";
  }

  // Fallback: detect boolean-like values even if questionTypes aren't loaded yet
  if (rawValue === true || rawValue === "true" || rawValue === false || rawValue === "false") {
    return rawValue === true || rawValue === "true" ? "Sí" : "No";
  }

  return String(rawValue);
}

export function ClassificationTab({
  producerId,
  projectId,
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
    getClassificationComponent,
    getCanonicalTypeName,
  } = useCharacterizationStore();

  const currentUserId = useAuthStore((state) => state.user?.user_id);

  const [showSheet, setShowSheet] = useState(false);
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [answerIds, setAnswerIds] = useState<Record<number, number>>({});
  const [hasSurvey, setHasSurvey] = useState(false);
  const [savedAnswers, setSavedAnswers] = useState<DisplayAnswer[]>([]);
  const [loadingAnswers, setLoadingAnswers] = useState(true);

  // Local copy of classification questions (survives tab switches)
  const [localQuestions, setLocalQuestions] = useState<Question[]>([]);
  const hasFetchedQuestions = useRef(false);
  const requestedDetailsRef = useRef(new Set<number>());

  // Edit mode
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editAnswers, setEditAnswers] = useState<Record<number, any>>({});

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
    if (!classificationComponent || !producerId || !projectId || !currentUserId) return;

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
          CLASSIFICATION_INTERVENTION_METHOD_ID,
        );
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
          classificationComponent.id,
          currentUserId,
        );
        for (const a of local) {
          // Restore JSON array stored for multi-select
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
  }, [classificationComponent, producerId, projectId, currentUserId, fetchSurveyResults]);

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

  // Build display answers
  useEffect(() => {
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
        ),
      });
    });
    setSavedAnswers(display);
  }, [localQuestions, answers, questionDetails, getCanonicalTypeName]);

  const handleApply = useCallback(() => {
    if (!classificationComponent) return;
    setEditingQuestion(null);
    fetchQuestions(classificationComponent.id);
    setShowSheet(true);
  }, [classificationComponent, fetchQuestions]);

  const handleCloseSheet = useCallback(() => {
    setShowSheet(false);
    setEditingQuestion(null);
  }, []);

  const handleAnswerChange = useCallback((questionId: number, value: any) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const handleEditAnswerChange = useCallback((questionId: number, value: any) => {
    setEditAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  // Save new survey (apply mode)
  const handleSave = useCallback(async () => {
    if (!classificationComponent || !producerId || !projectId || !currentUserId) return;

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
        value: Array.isArray(value)
          ? JSON.stringify(value)
          : value != null
            ? String(value)
            : null,
      }));

      await saveAnswersBatch(answerRows);

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

      await enqueue(
        "survey_answers",
        `${pid}-${projId}-${CLASSIFICATION_INTERVENTION_METHOD_ID}-${userId}`,
        {
          project_id: projId,
          intervention_method_id: CLASSIFICATION_INTERVENTION_METHOD_ID,
          producer_id: pid,
          created_at: new Date().toISOString().split("T")[0],
          answers: syncAnswers,
        },
        userId,
      );

      setShowSheet(false);
      setHasSurvey(true);
      Alert.alert("Guardado", "Las respuestas se guardaron localmente.");
    } catch (error) {
      console.error("Failed to save answers:", error);
      Alert.alert("Error", "No se pudieron guardar las respuestas.");
    }
  }, [answers, classificationComponent, producerId, projectId, currentUserId]);

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
    const newValue = String(editAnswers[editingQuestion.id] ?? "");

    try {
      await updateSurveyAnswer(answerId, newValue);
      setAnswers((prev) => ({ ...prev, [editingQuestion.id]: newValue }));
      setShowSheet(false);
      setEditingQuestion(null);
      Alert.alert("Actualizado", "La respuesta se actualizó correctamente.");
    } catch (error) {
      console.error("Failed to update answer:", error);
      Alert.alert("Error", "No se pudo actualizar la respuesta.");
    }
  }, [editingQuestion, editAnswers, answerIds, updateSurveyAnswer]);

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

  if (loadingAnswers || (Object.keys(answers).length > 0 && savedAnswers.length === 0)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a7a3a" />
        <ThemedText style={styles.loadingText}>Cargando respuestas...</ThemedText>
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
        {!hasSurvey && savedAnswers.length === 0 && (
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
              Aplicar Clasificación
            </ThemedText>
          </TouchableOpacity>
        )}

        {/* Answers section */}
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
          title={classificationComponent.name}
          questions={localQuestions.length > 0 ? localQuestions : storeQuestions}
          answers={answers}
          onAnswerChange={handleAnswerChange}
          onSave={handleSave}
          getTypeName={getCanonicalTypeName}
          loading={loadingQuestions}
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
    borderLeftWidth: 3,
    borderLeftColor: "#1a7a3a",
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
