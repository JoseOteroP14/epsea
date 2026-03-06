import { ThemedText } from "@/components/themed-text";
import { QuestionRenderer } from "@/components/question-renderer";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  type ComponentType,
} from "react-native";
import { ScrollView as GHScrollView } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { Question } from "@/schemas/characterization";

interface QuestionWizardProps {
  questions: Question[];
  answers: Record<number, any>;
  onAnswerChange: (questionId: number, value: any) => void;
  onCancel: () => void;
  onSave?: () => void;
  getTypeName: (typeId: number) => string;
  title?: string;
  ScrollViewComponent?: ComponentType<any>;
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
}: QuestionWizardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const pagerRef = useRef<GHScrollView>(null);
  const progressWidth = useSharedValue(0);

  const totalQuestions = questions.length;
  const currentQuestion = questions[currentIndex];

  const answeredCount = useMemo(
    () =>
      questions.filter((q) => {
        const val = answers[q.id];
        return val !== undefined && val !== null && val !== "";
      }).length,
    [questions, answers],
  );

  // Update progress bar
  const progressPercent =
    totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
  progressWidth.value = withTiming(progressPercent, { duration: 300 });

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const goTo = useCallback(
    (index: number) => {
      if (index >= 0 && index < totalQuestions) {
        setCurrentIndex(index);
        // Scroll pager to make the number visible
        pagerRef.current?.scrollTo({
          x: Math.max(0, index * widthScale(46) - widthScale(120)),
          animated: true,
        });
      }
    },
    [totalQuestions],
  );

  const goNext = useCallback(() => {
    goTo(currentIndex + 1);
  }, [currentIndex, goTo]);

  const goPrev = useCallback(() => {
    goTo(currentIndex - 1);
  }, [currentIndex, goTo]);

  const isFirst = currentIndex === 0;
  const isLast = currentIndex === totalQuestions - 1;

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
          onChange={onAnswerChange}
        />
        {currentQuestion.is_required && (
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
          {questions.map((q, index) => {
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
                  {q.id}
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
              style={styles.saveButton}
              onPress={onSave}
              activeOpacity={0.7}
            >
              <ThemedText style={styles.saveButtonText}>Guardar</ThemedText>
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

          <TouchableOpacity
            style={[styles.navButton, isLast && styles.navButtonDisabled]}
            onPress={goNext}
            disabled={isLast}
            activeOpacity={0.7}
          >
            <ThemedText
              style={[
                styles.navButtonText,
                isLast && styles.navButtonTextDisabled,
              ]}
            >
              Siguiente
            </ThemedText>
            <ChevronRight
              size={responsiveFont(18)}
              color={isLast ? "#ccc" : "#1a7a3a"}
            />
          </TouchableOpacity>
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
  saveButtonText: {
    fontSize: responsiveFont(17),
    color: "#ffffff",
    fontWeight: "600",
  },
});
