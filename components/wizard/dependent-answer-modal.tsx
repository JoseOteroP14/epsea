import { QuestionRenderer } from "@/components/question-renderer";
import { ThemedText } from "@/components/themed-text";
import type { Question } from "@/schemas/characterization";
import { useCharacterizationStore } from "@/store/useCharacterizationStore";
import { apiFetch } from "@/utils/api";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import {
    BottomSheetBackdrop,
    BottomSheetModal,
    BottomSheetScrollView,
    type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";

interface DependentAnswerModalProps {
  visible: boolean;
  onClose: () => void;
  /** The child question ID to fetch and render */
  childQuestionId: number;
  /** Current answer value for the child question (if any) */
  value: any;
  /** Called when user confirms their answer */
  onSave: (childQuestionId: number, value: any) => void;
  /** Get canonical type name from question_type_id */
  getTypeName: (typeId: number) => string;
}

export function DependentAnswerModal({
  visible,
  onClose,
  childQuestionId,
  value,
  onSave,
  getTypeName,
}: DependentAnswerModalProps) {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ["70%"], []);

  const { questionDetails, fetchQuestionDetail } = useCharacterizationStore();

  const [childQuestion, setChildQuestion] = useState<Question | null>(null);
  const [loading, setLoading] = useState(true);
  const [localValue, setLocalValue] = useState<any>(value);

  // Sync external value
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Fetch the child question metadata
  useEffect(() => {
    if (!visible || !childQuestionId) return;
    setLoading(true);
    (async () => {
      try {
        const response = await apiFetch<any>(`/questions/${childQuestionId}`, {
          method: "GET",
        });
        const q = response?.data ?? response;
        setChildQuestion(q);
        // Fetch detail for the question type
        if (q) {
          const typeName = getTypeName(q.question_type_id);
          if (!questionDetails[childQuestionId]) {
            fetchQuestionDetail(childQuestionId, typeName);
          }
        }
      } catch (e) {
        console.error("Failed to fetch child question:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [visible, childQuestionId, getTypeName, fetchQuestionDetail, questionDetails]);

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

  const handleChange = useCallback((_questionId: number, val: any) => {
    setLocalValue(val);
  }, []);

  const handleSave = useCallback(() => {
    onSave(childQuestionId, localValue);
  }, [childQuestionId, localValue, onSave]);

  const typeName = childQuestion ? getTypeName(childQuestion.question_type_id) : "text";

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
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.titleArea}>
            <ThemedText
              type="defaultSemiBold"
              style={styles.title}
              lightColor="#333"
              darkColor="#333"
              numberOfLines={2}
            >
              {childQuestion?.description ?? childQuestion?.name ?? "Pregunta dependiente"}
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
        <BottomSheetScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#1a7a3a" />
              <ThemedText style={styles.loadingText}>
                Cargando pregunta...
              </ThemedText>
            </View>
          ) : childQuestion ? (
            <QuestionRenderer
              question={childQuestion}
              typeName={typeName}
              value={localValue}
              onChange={handleChange}
            />
          ) : (
            <View style={styles.center}>
              <ThemedText style={styles.loadingText}>
                No se pudo cargar la pregunta
              </ThemedText>
            </View>
          )}
        </BottomSheetScrollView>

        {/* Save button */}
        {!loading && childQuestion && (
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSave}
              activeOpacity={0.7}
            >
              <ThemedText style={styles.saveButtonText}>Guardar</ThemedText>
            </TouchableOpacity>
          </View>
        )}
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
  container: {
    flex: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: widthScale(16),
    paddingTop: verticalScale(4),
    paddingBottom: verticalScale(12),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  titleArea: {
    flex: 1,
  },
  title: {
    fontSize: responsiveFont(18),
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
  content: {
    flex: 1,
    paddingHorizontal: widthScale(16),
  },
  contentContainer: {
    paddingTop: verticalScale(12),
    paddingBottom: verticalScale(24),
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: verticalScale(12),
    paddingVertical: verticalScale(40),
  },
  loadingText: {
    fontSize: responsiveFont(15),
  },
  footer: {
    paddingHorizontal: widthScale(16),
    paddingVertical: verticalScale(12),
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
  saveButton: {
    backgroundColor: "#1a7a3a",
    paddingVertical: verticalScale(14),
    borderRadius: widthScale(12),
    alignItems: "center",
  },
  saveButtonText: {
    color: "#ffffff",
    fontSize: responsiveFont(17),
    fontWeight: "600",
  },
});
