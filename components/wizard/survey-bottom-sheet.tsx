import { ThemedText } from "@/components/themed-text";
import { QuestionWizard } from "@/components/wizard/question-wizard";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import type { Question } from "@/schemas/characterization";

interface SurveyBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  questions: Question[];
  answers: Record<number, any>;
  onAnswerChange: (questionId: number, value: any) => void;
  onSave?: () => void;
  getTypeName: (typeId: number) => string;
  loading?: boolean;
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
}: SurveyBottomSheetProps) {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ["92%"], []);

  useEffect(() => {
    if (visible) {
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [visible]);

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
            <ThemedText
              type="defaultSemiBold"
              style={styles.sheetTitle}
              lightColor="#333"
              darkColor="#333"
              numberOfLines={2}
            >
              {title}
            </ThemedText>
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <X size={responsiveFont(20)} color="#666" />
          </TouchableOpacity>
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
              questions={questions}
              answers={answers}
              onAnswerChange={onAnswerChange}
              onCancel={onClose}
              onSave={onSave}
              getTypeName={getTypeName}
              title={title}
              ScrollViewComponent={BottomSheetScrollView}
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
    backgroundcolor: "#11181C",
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
  closeButton: {
    width: widthScale(36),
    height: widthScale(36),
    borderRadius: widthScale(18),
    backgroundColor: "rgba(0,0,0,0.05)",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: widthScale(12),
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
