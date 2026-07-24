import { QuestionRenderer } from "@/components/question-renderer";
import { ThemedText } from "@/components/themed-text";
import type { Question } from "@/schemas/characterization";
import { useCharacterizationStore } from "@/store/useCharacterizationStore";
import {
  getEffectiveDependentListItems,
  isSurveyAnswerEmpty,
  resolveDependentChildIdsFromDetail,
} from "@/utils/survey/dependent-child-ids";
import { isQuestionRequired } from "@/utils/survey/question-required";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { ScrollView as GHScrollView } from "react-native-gesture-handler";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";

interface QuestionWizardProps {
  questions: Question[];
  answers: Record<number, any>;
  onAnswerChange: (questionId: number, value: any) => void;
  onCancel: () => void;
  onSave?: () => void;
  getTypeName: (typeId: number) => string;
  title?: string;
  ScrollViewComponent?: ComponentType<any>;
  /** Restore step when reopening a draft sheet. */
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
}

export function QuestionWizard({
  questions,
  answers,
  onAnswerChange,
  onCancel,
  onSave,
  getTypeName,
  title,
  ScrollViewComponent = ScrollView,
  initialIndex = 0,
  onIndexChange,
}: QuestionWizardProps) {
  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.max(0, initialIndex),
  );
  const pagerRef = useRef<GHScrollView>(null);
  const progressWidth = useSharedValue(0);
  const { questionDetails, fetchQuestionDetail } = useCharacterizationStore();

  const questionById = useMemo(
    () => new Map(questions.map((q) => [q.id, q])),
    [questions],
  );

  React.useEffect(() => {
    for (const q of questions) {
      const typeName = getTypeName(q.question_type_id);
      if (typeName !== "dependent_list") continue;
      if (questionDetails[q.id] == null) {
        fetchQuestionDetail(q.id, typeName);
      }
    }
  }, [questions, questionDetails, getTypeName, fetchQuestionDetail]);

  const resolveDependentChildIds = useCallback(
    (questionId: number, value: any): number[] => {
      const detail = questionDetails[questionId];
      const q = questionById.get(questionId);
      return resolveDependentChildIdsFromDetail(detail, value, q);
    },
    [questionDetails, questionById],
  );

  const dependentChildIds = useMemo(() => {
    const ids = new Set<number>();

    for (const q of questions) {
      if (q.question_parent_id != null) {
        ids.add(q.id);
      }
    }

    for (const q of questions) {
      const typeName = getTypeName(q.question_type_id);
      if (typeName !== "dependent_list") continue;

      const detail = questionDetails[q.id];
      const items = getEffectiveDependentListItems(detail, q);

      for (const option of items) {
        if (option?.other_question_id) {
          ids.add(Number(option.other_question_id));
        }
      }
    }

    return ids;
  }, [questions, questionDetails, getTypeName]);

  const visibleQuestions = useMemo(() => {
    const baseQuestions = questions.filter((q) => !dependentChildIds.has(q.id));
    const result: Question[] = [];
    const inserted = new Set<number>();

    const insertQuestionWithDependents = (question: Question) => {
      if (inserted.has(question.id)) return;

      inserted.add(question.id);
      result.push(question);

      const typeName = getTypeName(question.question_type_id);
      if (typeName !== "dependent_list") return;

      const childIds = resolveDependentChildIds(question.id, answers[question.id]);
      for (const childId of childIds) {
        if (!childId || inserted.has(childId)) continue;
        const childQuestion = questionById.get(childId);
        if (childQuestion) {
          insertQuestionWithDependents(childQuestion);
        }
      }
    };

    for (const q of baseQuestions) {
      insertQuestionWithDependents(q);
    }

    return result;
  }, [questions, answers, getTypeName, questionById, resolveDependentChildIds, dependentChildIds]);

  /** Block Guardar when a lista dependiente opción exige hija y aún no tiene respuesta. */
  const dependentChildrenIncomplete = useMemo(() => {
    for (const q of visibleQuestions) {
      const typeName = getTypeName(q.question_type_id);
      if (typeName !== "dependent_list") continue;
      const detail = questionDetails[q.id];
      const childIds = resolveDependentChildIdsFromDetail(detail, answers[q.id], q);
      for (const cid of childIds) {
        if (isSurveyAnswerEmpty(answers[cid])) return true;
      }
    }
    return false;
  }, [visibleQuestions, answers, questionDetails, getTypeName]);

  /** Todas las preguntas visibles marcadas como obligatorias deben tener respuesta para Guardar. */
  const requiredFieldsIncomplete = useMemo(() => {
    for (const q of visibleQuestions) {
      if (!isQuestionRequired(q)) continue;
      if (isSurveyAnswerEmpty(answers[q.id])) return true;
    }
    return false;
  }, [visibleQuestions, answers]);

  const saveBlocked =
    dependentChildrenIncomplete || requiredFieldsIncomplete;

  const handleAnswerChange = useCallback(
    (questionId: number, value: any) => {
      const question = questionById.get(questionId);
      if (!question) {
        onAnswerChange(questionId, value);
        return;
      }

      const typeName = getTypeName(question.question_type_id);
      if (typeName === "dependent_list") {
        const previousChildIds = resolveDependentChildIds(
          questionId,
          answers[questionId],
        );
        const nextChildIds = resolveDependentChildIds(questionId, value);

        const clearDependentBranch = (
          childQuestionId: number,
          visited: Set<number>,
        ) => {
          if (visited.has(childQuestionId)) return;
          visited.add(childQuestionId);

          onAnswerChange(childQuestionId, undefined);

          const childQuestion = questionById.get(childQuestionId);
          if (!childQuestion) return;

          const childTypeName = getTypeName(childQuestion.question_type_id);
          if (childTypeName !== "dependent_list") return;

          const nestedChildIds = resolveDependentChildIds(
            childQuestionId,
            answers[childQuestionId],
          );

          for (const nestedChildId of nestedChildIds) {
            clearDependentBranch(nestedChildId, visited);
          }
        };

        const visited = new Set<number>();
        for (const childId of previousChildIds) {
          if (!nextChildIds.includes(childId)) {
            clearDependentBranch(childId, visited);
          }
        }
      }

      onAnswerChange(questionId, value);
    },
    [questionById, getTypeName, resolveDependentChildIds, answers, onAnswerChange],
  );

  const totalQuestions = visibleQuestions.length;
  const currentQuestion = visibleQuestions[currentIndex];

  const currentRequiredBlocksNext = useMemo(() => {
    if (!currentQuestion) return false;
    return (
      isQuestionRequired(currentQuestion) &&
      isSurveyAnswerEmpty(answers[currentQuestion.id])
    );
  }, [currentQuestion, answers]);

  const answeredCount = useMemo(
    () =>
      visibleQuestions.filter((q) => {
        const val = answers[q.id];
        return val !== undefined && val !== null && val !== "";
      }).length,
    [visibleQuestions, answers],
  );

  // Update progress bar
  const progressPercent =
    totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
  useEffect(() => {
    progressWidth.value = withTiming(progressPercent, { duration: 300 });
  }, [progressPercent]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const goTo = useCallback(
    (index: number) => {
      if (index >= 0 && index < totalQuestions) {
        setCurrentIndex(index);
        onIndexChange?.(index);
        // Scroll pager to make the number visible
        pagerRef.current?.scrollTo({
          x: Math.max(0, index * widthScale(46) - widthScale(120)),
          animated: true,
        });
      }
    },
    [totalQuestions, onIndexChange],
  );

  const goNext = useCallback(() => {
    goTo(currentIndex + 1);
  }, [currentIndex, goTo]);

  const goPrev = useCallback(() => {
    goTo(currentIndex - 1);
  }, [currentIndex, goTo]);

  const isFirst = currentIndex === 0;
  const isLast = currentIndex === totalQuestions - 1;

  React.useEffect(() => {
    if (currentIndex >= totalQuestions && totalQuestions > 0) {
      setCurrentIndex(totalQuestions - 1);
    }
  }, [currentIndex, totalQuestions]);

  if (!currentQuestion) return null;

  return (
    <View style={styles.container}>
      {/* Question content - scrolleable */}
      <ScrollViewComponent
        style={styles.questionArea}
        contentContainerStyle={styles.questionAreaContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        <QuestionRenderer
          key={currentQuestion.id}
          question={currentQuestion}
          typeName={getTypeName(currentQuestion.question_type_id)}
          value={answers[currentQuestion.id]}
          onChange={handleAnswerChange}
        />
        {isQuestionRequired(currentQuestion) && (
          <ThemedText style={styles.requiredHint}>Campo obligatorio</ThemedText>
        )}
      </ScrollViewComponent>

      {/* Bottom controls — always visible */}
      <View style={styles.bottomControls}>
        {/* Numbered page indicators */}
        <GHScrollView
          ref={pagerRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pagerContent}
          style={styles.pagerScroll}
          nestedScrollEnabled
        >
          {visibleQuestions.map((q, index) => {
            const isCurrent = index === currentIndex;
            const isAnswered =
              answers[q.id] !== undefined &&
              answers[q.id] !== null &&
              answers[q.id] !== "";

            return (
              <TouchableOpacity
                key={q.id}
                style={[
                  styles.pageBox,
                  isCurrent && styles.pageBoxCurrent,
                  !isCurrent && isAnswered && styles.pageBoxAnswered,
                ]}
                onPress={() => goTo(index)}
                activeOpacity={0.7}
              >
                <ThemedText
                  style={[
                    styles.pageBoxText,
                    isCurrent && styles.pageBoxTextCurrent,
                    !isCurrent && isAnswered && styles.pageBoxTextAnswered,
                  ]}
                >
                  {index + 1}
                </ThemedText>
              </TouchableOpacity>
            );
          })}
        </GHScrollView>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, progressStyle]} />
        </View>

        {/* Navigation row */}
        <View style={styles.navRow}>
          <TouchableOpacity
            style={[styles.navButton, isFirst && styles.navButtonDisabled]}
            onPress={goPrev}
            disabled={isFirst}
            activeOpacity={0.7}
          >
            <ChevronLeft
              size={responsiveFont(18)}
              color={isFirst ? "#ccc" : "#1a7a3a"}
            />
            <ThemedText
              style={[
                styles.navButtonText,
                isFirst && styles.navButtonTextDisabled,
              ]}
            >
              Anterior
            </ThemedText>
          </TouchableOpacity>

          {onSave ? (
            <TouchableOpacity
              style={[
                styles.saveButton,
                saveBlocked && styles.saveButtonDisabled,
              ]}
              onPress={onSave}
              disabled={saveBlocked}
              activeOpacity={0.7}
            >
              <ThemedText
                style={[
                  styles.saveButtonText,
                  saveBlocked && styles.saveButtonTextDisabled,
                ]}
              >
                Guardar
              </ThemedText>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <ThemedText style={styles.cancelButtonText}>Cancelar</ThemedText>
            </TouchableOpacity>
          )}

          {isLast ? (
            <View style={styles.navEndSpacer} />
          ) : (
            <TouchableOpacity
              style={[
                styles.navButton,
                currentRequiredBlocksNext && styles.navButtonDisabled,
              ]}
              onPress={goNext}
              disabled={currentRequiredBlocksNext}
              activeOpacity={0.7}
            >
              <ThemedText
                style={[
                  styles.navButtonText,
                  currentRequiredBlocksNext && styles.navButtonTextDisabled,
                ]}
              >
                Siguiente
              </ThemedText>
              <ChevronRight
                size={responsiveFont(18)}
                color={currentRequiredBlocksNext ? "#ccc" : "#1a7a3a"}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
  },
  questionArea: {
    flex: 1,
    minHeight: 0,
  },
  questionAreaContent: {
    paddingTop: 0,
    paddingBottom: verticalScale(16),
    flexGrow: 0,
  },
  wizardTitle: {
    fontSize: responsiveFont(17),
    color: "#1a7a3a",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: verticalScale(8),
    paddingHorizontal: widthScale(4),
  },
  requiredHint: {
    fontSize: responsiveFont(17),
    color: "#e74c3c",
    marginTop: verticalScale(8),
    paddingHorizontal: widthScale(4),
  },
  bottomControls: {
    flexShrink: 0,
  },
  pagerScroll: {
    maxHeight: verticalScale(44),
    marginBottom: verticalScale(8),
    flexShrink: 0,
  },
  pagerContent: {
    gap: widthScale(6),
    paddingHorizontal: widthScale(2),
  },
  pageBox: {
    minWidth: widthScale(36),
    height: widthScale(36),
    paddingHorizontal: widthScale(4),
    borderRadius: widthScale(8),
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  pageBoxCurrent: {
    backgroundColor: "#1a7a3a",
    borderColor: "#1a7a3a",
  },
  pageBoxAnswered: {
    borderColor: "#1a7a3a",
  },
  pageBoxText: {
    fontSize: responsiveFont(17),
    fontWeight: "600",
    color: "rgba(0,0,0,0.4)",
  },
  pageBoxTextCurrent: {
    color: "#fff",
  },
  pageBoxTextAnswered: {
    color: "#1a7a3a",
  },
  progressTrack: {
    height: verticalScale(4),
    backgroundColor: "rgba(0,0,0,0.06)",
    borderRadius: 2,
    marginBottom: verticalScale(12),
    overflow: "hidden",
    flexShrink: 0,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#1a7a3a",
    borderRadius: 2,
  },
  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: verticalScale(8),
    flexShrink: 0,
  },
  navButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: widthScale(4),
    paddingVertical: verticalScale(10),
    paddingHorizontal: widthScale(8),
  },
  /** Misma huella que el botón Siguiente + icono para no descentrar la fila en la última pregunta. */
  navEndSpacer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: verticalScale(10),
    paddingHorizontal: widthScale(8),
    minWidth: widthScale(100),
  },
  navButtonDisabled: {
  },
  navButtonText: {
    fontSize: responsiveFont(17),
    color: "#1a7a3a",
    fontWeight: "500",
  },
  navButtonTextDisabled: {
    color: "#11181C",
  },
  cancelButton: {
    paddingVertical: verticalScale(10),
    paddingHorizontal: widthScale(16),
    borderRadius: widthScale(8),
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  cancelButtonText: {
    fontSize: responsiveFont(17),
    color: "rgba(0,0,0,0.5)",
  },
  saveButton: {
    paddingVertical: verticalScale(10),
    paddingHorizontal: widthScale(20),
    borderRadius: widthScale(8),
    backgroundColor: "#1a7a3a",
  },
  saveButtonDisabled: {
    backgroundColor: "rgba(26, 122, 58, 0.35)",
  },
  saveButtonText: {
    fontSize: responsiveFont(17),
    color: "#ffffff",
    fontWeight: "600",
  },
  saveButtonTextDisabled: {
    color: "rgba(255,255,255,0.85)",
  },
});
