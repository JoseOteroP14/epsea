import { ThemedText } from "@/components/themed-text";
import { AccentedText } from "@/components/ui/accented-text";
import { QuestionWizard } from "@/components/wizard/question-wizard";
import type { Question } from "@/schemas/characterization";
import { getSurveyQuestionTitle } from "@/utils/survey/question-display";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  View,
} from "react-native";

interface SurveyBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Título de respaldo (loading / sin pregunta activa). */
  title: string;
  questions: Question[];
  answers: Record<number, any>;
  onAnswerChange: (questionId: number, value: any) => void;
  onSave?: () => void;
  getTypeName: (typeId: number) => string;
  loading?: boolean;
  /** Remount token so the wizard can restore a draft step on each open. */
  wizardSessionKey?: string | number;
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
  /** Título del sheet según la pregunta activa. */
  getQuestionTitle?: (question: Question, index: number) => string;
  /** Texto de apoyo en el body (justificación de clasificación, etc.). */
  getQuestionBodyText?: (question: Question, index: number) => string | null;
  /**
   * Oculta el enunciado en el body (queda solo en el título del sheet).
   * Default true.
   */
  hideQuestionTitle?: boolean;
  /** Oculta progress bar y carousel (edición de una sola respuesta). */
  hideWizardChrome?: boolean;
}

export function SurveyBottomSheet({
  visible,
  onClose,
  title,
  questions,
  answers,
  onAnswerChange,
  onSave,
  getTypeName,
  loading,
  wizardSessionKey = 0,
  initialIndex = 0,
  onIndexChange,
  getQuestionTitle,
  getQuestionBodyText,
  hideQuestionTitle = true,
  hideWizardChrome = false,
}: SurveyBottomSheetProps) {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ["92%"], []);
  const [activeTitle, setActiveTitle] = useState(title);

  const resolveTitle = useCallback(
    (question: Question, index: number) =>
      getQuestionTitle?.(question, index) ?? getSurveyQuestionTitle(question, index),
    [getQuestionTitle],
  );

  useEffect(() => {
    if (visible) {
      bottomSheetRef.current?.present();
      const first = questions[initialIndex] ?? questions[0];
      if (first) {
        setActiveTitle(resolveTitle(first, initialIndex));
      } else {
        setActiveTitle(title);
      }
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [visible, title, questions, initialIndex, resolveTitle]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        onClose();
      }
    },
    [onClose],
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.5}
        pressBehavior="close"
      />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      backdropComponent={renderBackdrop}
      enablePanDownToClose
      enableDynamicSizing={false}
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      <View style={styles.sheetContainer}>
        {/* Header */}
        <View style={styles.sheetHeader}>
          <View style={styles.headerTitleArea}>
            <AccentedText
              type="defaultSemiBold"
              style={styles.sheetTitle}
              lightColor="#333"
              darkColor="#333"
              numberOfLines={3}
            >
              {activeTitle || title}
            </AccentedText>
          </View>
        </View>

        {/* Content */}
        <View style={styles.sheetContent}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#1a7a3a" />
              <ThemedText style={styles.loadingText}>
                Cargando preguntas...
              </ThemedText>
            </View>
          ) : questions.length === 0 ? (
            <View style={styles.center}>
              <ThemedText style={styles.emptyText}>
                No hay preguntas disponibles
              </ThemedText>
            </View>
          ) : (
            <QuestionWizard
              key={`survey-wizard-${wizardSessionKey}`}
              questions={questions}
              answers={answers}
              onAnswerChange={onAnswerChange}
              onCancel={onClose}
              onSave={onSave}
              getTypeName={getTypeName}
              title={title}
              ScrollViewComponent={BottomSheetScrollView}
              initialIndex={initialIndex}
              onIndexChange={onIndexChange}
              getQuestionTitle={resolveTitle}
              getQuestionBodyText={getQuestionBodyText}
              hideQuestionTitle={hideQuestionTitle}
              hideWizardChrome={hideWizardChrome}
              onActiveTitleChange={setActiveTitle}
            />
          )}
        </View>
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: "#f4fbf7",
    borderTopLeftRadius: widthScale(24),
    borderTopRightRadius: widthScale(24),
  },
  handleIndicator: {
    backgroundColor: "#11181C",
    width: widthScale(40),
  },
  sheetContainer: {
    flex: 1,
    overflow: "hidden",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: widthScale(16),
    paddingTop: verticalScale(4),
    paddingBottom: verticalScale(12),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  headerTitleArea: {
    flex: 1,
  },
  sheetTitle: {
    fontSize: responsiveFont(20),
  },
  sheetContent: {
    flex: 1,
    paddingHorizontal: widthScale(16),
    overflow: "hidden",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: verticalScale(1),
  },
  loadingText: {
    fontSize: responsiveFont(17),
  },
  emptyText: {
    fontSize: responsiveFont(17),
    textAlign: "center",
  },
});
