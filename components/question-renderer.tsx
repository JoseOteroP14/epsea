import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import type {
    Department,
    Municipality,
    Question,
    QuestionBoolDetail,
    QuestionDateDetail,
    QuestionDependentListDetail,
    QuestionDependentListOption,
    QuestionListDetail,
    QuestionListOption,
    QuestionNumericDetail,
    QuestionTextDetail,
} from "@/schemas/characterization";
import { useCharacterizationStore } from "@/store/useCharacterizationStore";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

interface QuestionRendererProps {
  question: Question;
  typeName: string;
  value: any;
  onChange: (questionId: number, value: any) => void;
}

function TextQuestion({
  question,
  detail,
  value,
  onChange,
}: {
  question: Question;
  detail?: QuestionTextDetail;
  value: string;
  onChange: (id: number, val: string) => void;
}) {
  return (
    <TextInput
      style={styles.textInput}
      placeholder={detail?.placeholder ?? "Escriba su respuesta..."}
      placeholderTextColor="rgba(17, 24, 28, 0.4)"
      value={value ?? ""}
      onChangeText={(text) => onChange(question.id, text)}
      maxLength={detail?.max_length ?? undefined}
      multiline
    />
  );
}

function DateQuestion({
  question,
  value,
  onChange,
}: {
  question: Question;
  detail?: QuestionDateDetail;
  value: string;
  onChange: (id: number, val: string) => void;
}) {
  return (
    <TextInput
      style={styles.textInput}
      placeholder="AAAA-MM-DD"
      placeholderTextColor="rgba(17, 24, 28, 0.4)"
      value={value ?? ""}
      onChangeText={(text) => onChange(question.id, text)}
      keyboardType="numbers-and-punctuation"
    />
  );
}

function BoolQuestion({
  question,
  value,
  onChange,
}: {
  question: Question;
  detail?: QuestionBoolDetail;
  value: boolean;
  onChange: (id: number, val: boolean) => void;
}) {
  // Normalize: SQLite stores booleans as strings "true"/"false"
  const boolValue =
    value === true || value === "true" || value === "1" || value === 1;
  const hasValue = value != null && value !== "";

  return (
    <View style={styles.boolContainer}>
      <TouchableOpacity
        style={[styles.boolOption, hasValue && boolValue && styles.boolOptionSelected]}
        onPress={() => onChange(question.id, true)}
        activeOpacity={0.7}
      >
        <ThemedText
          style={[
            styles.boolOptionText,
            hasValue && boolValue && styles.boolOptionTextSelected,
          ]}
        >
          Sí
        </ThemedText>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.boolOption, hasValue && !boolValue && styles.boolOptionSelected]}
        onPress={() => onChange(question.id, false)}
        activeOpacity={0.7}
      >
        <ThemedText
          style={[
            styles.boolOptionText,
            hasValue && !boolValue && styles.boolOptionTextSelected,
          ]}
        >
          No
        </ThemedText>
      </TouchableOpacity>
    </View>
  );
}

function NumericQuestion({
  question,
  detail,
  value,
  onChange,
}: {
  question: Question;
  detail?: QuestionNumericDetail;
  value: string;
  onChange: (id: number, val: string) => void;
}) {
  return (
    <TextInput
      style={styles.textInput}
      placeholder={
        detail?.min_value != null && detail?.max_value != null
          ? `${detail.min_value} - ${detail.max_value}`
          : "Ingrese un número..."
      }
      placeholderTextColor="rgba(17, 24, 28, 0.4)"
      value={value ?? ""}
      onChangeText={(text) => onChange(question.id, text)}
      keyboardType="decimal-pad"
    />
  );
}

function ListQuestion({
  question,
  detail,
  value,
  onChange,
}: {
  question: Question;
  detail?: QuestionListDetail;
  value: any;
  onChange: (id: number, val: any) => void;
}) {
  const isMultiple = question.multiple === true;

  // Handle various API response structures for options
  const raw = detail as any;
  const options: QuestionListOption[] =
    detail?.options ??
    raw?.items ??
    raw?.data?.options ??
    raw?.data?.items ??
    raw?.data ??
    [];

  if (!Array.isArray(options) || options.length === 0) {
    return (
      <ThemedText style={styles.noOptions}>Sin opciones disponibles</ThemedText>
    );
  }

  // For multi-select, normalize value to array
  const selectedIds: (string | number)[] = isMultiple
    ? Array.isArray(value)
      ? value
      : value != null && value !== ""
        ? [value]
        : []
    : [];

  const isOptionSelected = (option: QuestionListOption): boolean => {
    if (isMultiple) {
      const numOptId = Number(option.id);
      return selectedIds.some(
        (v) =>
          v === option.id ||
          Number(v) === numOptId ||
          v === option.name ||
          v === option.value,
      );
    }
    const numValue = typeof value === "string" ? Number(value) : value;
    return (
      value === option.id ||
      numValue === option.id ||
      value === option.name ||
      value === option.value
    );
  };

  const handlePress = (option: QuestionListOption) => {
    if (isMultiple) {
      const numOptId = Number(option.id);
      const alreadySelected = selectedIds.some(
        (v) =>
          v === option.id ||
          Number(v) === numOptId ||
          v === option.name ||
          v === option.value,
      );
      const newVal = alreadySelected
        ? selectedIds.filter(
            (v) =>
              v !== option.id &&
              Number(v) !== numOptId &&
              v !== option.name &&
              v !== option.value,
          )
        : [...selectedIds, option.id];
      onChange(question.id, newVal);
    } else {
      onChange(question.id, option.id);
    }
  };

  return (
    <View style={styles.listContainer}>
      {options.map((option) => {
        const isSelected = isOptionSelected(option);
        return (
          <TouchableOpacity
            key={option.id}
            style={[styles.listOption, isSelected && styles.listOptionSelected]}
            onPress={() => handlePress(option)}
            activeOpacity={0.7}
          >
            {isMultiple && (
              <View
                style={[styles.checkbox, isSelected && styles.checkboxSelected]}
              />
            )}
            <ThemedText
              style={[
                styles.listOptionText,
                isSelected && styles.listOptionTextSelected,
              ]}
            >
              {option.name}
            </ThemedText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function LocationQuestion({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: any;
  onChange: (id: number, val: any) => void;
}) {
  const { fetchDepartments, fetchMunicipalities } = useCharacterizationStore();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [loadingMunis, setLoadingMunis] = useState(false);

  // Parse stored value: format is "department_cod|municipality_code" or just municipality_code
  useEffect(() => {
    if (value && typeof value === "string" && value.includes("|")) {
      const [deptCod] = value.split("|");
      if (deptCod && deptCod !== selectedDept) {
        setSelectedDept(deptCod);
      }
    }
  }, [value]);

  // Load departments
  useEffect(() => {
    (async () => {
      setLoadingDepts(true);
      try {
        const depts = await fetchDepartments();
        setDepartments(depts);
      } catch (e) {
        console.error("Failed to fetch departments:", e);
      } finally {
        setLoadingDepts(false);
      }
    })();
  }, [fetchDepartments]);

  // Load municipalities when department changes
  useEffect(() => {
    if (!selectedDept) {
      setMunicipalities([]);
      return;
    }
    (async () => {
      setLoadingMunis(true);
      try {
        const munis = await fetchMunicipalities(selectedDept);
        setMunicipalities(munis);
      } catch (e) {
        console.error("Failed to fetch municipalities:", e);
      } finally {
        setLoadingMunis(false);
      }
    })();
  }, [selectedDept, fetchMunicipalities]);

  const handleDeptPress = useCallback(
    (deptCod: string) => {
      setSelectedDept(deptCod);
      // Clear municipality selection when department changes
      onChange(question.id, null);
    },
    [question.id, onChange],
  );

  const handleMuniPress = useCallback(
    (muniCode: string) => {
      // Store as "department_cod|municipality_code" for full traceability
      onChange(question.id, `${selectedDept}|${muniCode}`);
    },
    [question.id, selectedDept, onChange],
  );

  const selectedMuniCode = value && typeof value === "string" && value.includes("|")
    ? value.split("|")[1]
    : null;

  if (loadingDepts) {
    return <ActivityIndicator size="small" color="#1a7a3a" style={styles.detailLoader} />;
  }

  return (
    <View style={styles.locationContainer}>
      {/* Department selector */}
      <ThemedText style={styles.locationLabel}>Departamento</ThemedText>
      <View style={styles.listContainer}>
        {departments.map((dept) => {
          const isSelected = dept.department_cod === selectedDept;
          return (
            <TouchableOpacity
              key={dept.department_cod}
              style={[styles.listOption, isSelected && styles.listOptionSelected]}
              onPress={() => handleDeptPress(dept.department_cod)}
              activeOpacity={0.7}
            >
              <ThemedText
                style={[
                  styles.listOptionText,
                  isSelected && styles.listOptionTextSelected,
                ]}
              >
                {dept.department}
              </ThemedText>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Municipality selector */}
      {selectedDept && (
        <>
          <ThemedText style={[styles.locationLabel, { marginTop: verticalScale(12) }]}>
            Municipio
          </ThemedText>
          {loadingMunis ? (
            <ActivityIndicator size="small" color="#1a7a3a" style={styles.detailLoader} />
          ) : (
            <View style={styles.listContainer}>
              {municipalities.map((muni) => {
                const isSelected = muni.municipality_code === selectedMuniCode;
                return (
                  <TouchableOpacity
                    key={muni.municipality_code}
                    style={[styles.listOption, isSelected && styles.listOptionSelected]}
                    onPress={() => handleMuniPress(muni.municipality_code)}
                    activeOpacity={0.7}
                  >
                    <ThemedText
                      style={[
                        styles.listOptionText,
                        isSelected && styles.listOptionTextSelected,
                      ]}
                    >
                      {muni.municipality}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </>
      )}
    </View>
  );
}

function DependentListQuestion({
  question,
  detail,
  value,
  onChange,
}: {
  question: Question;
  detail?: QuestionDependentListDetail;
  value: any;
  onChange: (id: number, val: any) => void;
}) {
  const {
    questionDetails,
    fetchQuestionDetail,
    getCanonicalTypeName,
    loadingQuestionDetail,
  } = useCharacterizationStore();

  const raw = detail as any;
  const items: QuestionDependentListOption[] =
    detail?.items ?? detail?.options ?? raw?.data?.items ?? raw?.data?.options ?? raw?.data ?? [];

  // Parse compound value: "selected_option_id:sub_question_id=sub_answer"
  // Or simple value for options without other_question_id
  const parsedValue: Record<string, any> = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : {};

  const mainSelection = parsedValue._main ?? value;

  const handleMainPress = useCallback(
    (option: QuestionDependentListOption) => {
      if (option.other_question_id) {
        // Store as object: { _main: optionId, [sub_question_id]: subAnswer }
        onChange(question.id, { _main: option.id });
      } else {
        onChange(question.id, option.id);
      }
    },
    [question.id, onChange],
  );

  const handleSubAnswerChange = useCallback(
    (subQuestionId: number, subValue: any) => {
      const current = typeof value === "object" && value !== null && !Array.isArray(value)
        ? value
        : { _main: value };
      onChange(question.id, { ...current, [subQuestionId]: subValue });
    },
    [question.id, value, onChange],
  );

  if (!Array.isArray(items) || items.length === 0) {
    return (
      <ThemedText style={styles.noOptions}>Sin opciones disponibles</ThemedText>
    );
  }

  // Find the currently selected option
  const mainId = typeof mainSelection === "number" ? mainSelection : Number(mainSelection);
  const selectedOption = items.find((i) => i.id === mainId);

  return (
    <View>
      <View style={styles.listContainer}>
        {items.map((option) => {
          const isSelected = option.id === mainId;
          return (
            <TouchableOpacity
              key={option.id}
              style={[styles.listOption, isSelected && styles.listOptionSelected]}
              onPress={() => handleMainPress(option)}
              activeOpacity={0.7}
            >
              <ThemedText
                style={[
                  styles.listOptionText,
                  isSelected && styles.listOptionTextSelected,
                ]}
              >
                {option.name}
              </ThemedText>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Render dependent sub-question if selected option has other_question_id */}
      {selectedOption?.other_question_id && (
        <DependentSubQuestion
          parentQuestionId={question.id}
          subQuestionId={selectedOption.other_question_id}
          value={parsedValue[selectedOption.other_question_id]}
          onChange={handleSubAnswerChange}
        />
      )}
    </View>
  );
}

function DependentSubQuestion({
  parentQuestionId,
  subQuestionId,
  value,
  onChange,
}: {
  parentQuestionId: number;
  subQuestionId: number;
  value: any;
  onChange: (subQuestionId: number, val: any) => void;
}) {
  const {
    questionDetails,
    fetchQuestionDetail,
    getCanonicalTypeName,
    loadingQuestionDetail,
  } = useCharacterizationStore();

  const [subQuestion, setSubQuestion] = useState<Question | null>(null);
  const [loadingSub, setLoadingSub] = useState(true);

  // Fetch the sub-question metadata
  useEffect(() => {
    (async () => {
      setLoadingSub(true);
      try {
        const { apiFetch } = await import("@/utils/api");
        const response = await apiFetch<any>(`/questions/${subQuestionId}`, {
          method: "GET",
        });
        const q = response?.data ?? response;
        setSubQuestion(q);
        // Fetch its detail too
        if (q) {
          const typeName = getCanonicalTypeName(q.question_type_id);
          if (!questionDetails[subQuestionId]) {
            fetchQuestionDetail(subQuestionId, typeName);
          }
        }
      } catch (e) {
        console.error("Failed to fetch sub-question:", e);
      } finally {
        setLoadingSub(false);
      }
    })();
  }, [subQuestionId, getCanonicalTypeName, fetchQuestionDetail, questionDetails]);

  if (loadingSub || !subQuestion) {
    return (
      <View style={styles.subQuestionContainer}>
        <ActivityIndicator size="small" color="#1a7a3a" style={styles.detailLoader} />
      </View>
    );
  }

  const typeName = getCanonicalTypeName(subQuestion.question_type_id);

  return (
    <View style={styles.subQuestionContainer}>
      <QuestionRenderer
        question={subQuestion}
        typeName={typeName}
        value={value}
        onChange={(_, val) => onChange(subQuestionId, val)}
      />
    </View>
  );
}

export function QuestionRenderer({
  question,
  typeName,
  value,
  onChange,
}: QuestionRendererProps) {
  const { questionDetails, fetchQuestionDetail, loadingQuestionDetail } =
    useCharacterizationStore();

  const normalizedType = typeName.toLowerCase();
  const detail = questionDetails[question.id];

  // Detect boolean-like values when type resolution falls back to "text"
  const effectiveType =
    normalizedType === "text" &&
    (value === true || value === "true" || value === false || value === "false")
      ? "bool"
      : normalizedType;

  useEffect(() => {
    if (!detail) {
      fetchQuestionDetail(question.id, effectiveType);
    }
  }, [question.id, effectiveType, detail, fetchQuestionDetail]);

  const renderInput = () => {
    if (!detail && loadingQuestionDetail) {
      return (
        <ActivityIndicator
          size="small"
          color="#1a7a3a"
          style={styles.detailLoader}
        />
      );
    }

    switch (effectiveType) {
      case "text":
        return (
          <TextQuestion
            question={question}
            detail={detail as QuestionTextDetail}
            value={value}
            onChange={onChange}
          />
        );
      case "date":
        return (
          <DateQuestion
            question={question}
            detail={detail as QuestionDateDetail}
            value={value}
            onChange={onChange}
          />
        );
      case "bool":
        return (
          <BoolQuestion
            question={question}
            detail={detail as QuestionBoolDetail}
            value={value}
            onChange={onChange}
          />
        );
      case "numeric":
        return (
          <NumericQuestion
            question={question}
            detail={detail as QuestionNumericDetail}
            value={value}
            onChange={onChange}
          />
        );
      case "list":
        return (
          <ListQuestion
            question={question}
            detail={detail as QuestionListDetail}
            value={value}
            onChange={onChange}
          />
        );
      case "location":
        return (
          <LocationQuestion
            question={question}
            value={value}
            onChange={onChange}
          />
        );
      case "dependent_list":
        return (
          <DependentListQuestion
            question={question}
            detail={detail as QuestionDependentListDetail}
            value={value}
            onChange={onChange}
          />
        );
      default:
        return (
          <TextQuestion question={question} value={value} onChange={onChange} />
        );
    }
  };

  return (
    <ThemedView style={styles.questionCard}>
      <View style={styles.questionHeader}>
        <View style={styles.questionTitleContainer}>
          <ThemedText style={styles.questionName}>{question.name}</ThemedText>
          {question.description && (
            <ThemedText style={styles.questionDescription}>
              {question.description}
            </ThemedText>
          )}
        </View>
        {question.is_required && (
          <ThemedText style={styles.requiredBadge}>*</ThemedText>
        )}
      </View>
      {renderInput()}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  questionCard: {
    padding: widthScale(16),
    borderRadius: widthScale(12),
    marginBottom: verticalScale(8),
  },
  questionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: verticalScale(14),
    gap: widthScale(8),
  },
  questionTitleContainer: {
    flex: 1,
  },
  questionName: {
    fontSize: responsiveFont(22),
    fontWeight: "600",
    lineHeight: responsiveFont(28),
  },
  questionDescription: {
    fontSize: responsiveFont(17),
    marginTop: verticalScale(8),
    lineHeight: responsiveFont(24),
  },
  requiredBadge: {
    color: "#e74c3c",
    fontSize: responsiveFont(18),
    fontWeight: "700",
    lineHeight: responsiveFont(20),
  },
  textInput: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    borderRadius: widthScale(8),
    paddingHorizontal: widthScale(12),
    paddingVertical: verticalScale(10),
    fontSize: responsiveFont(17),
    color: "#333",
    minHeight: verticalScale(42),
  },
  boolContainer: {
    flexDirection: "row",
    gap: widthScale(10),
  },
  boolOption: {
    flex: 1,
    paddingVertical: verticalScale(12),
    borderRadius: widthScale(8),
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    alignItems: "center",
  },
  boolOptionSelected: {
    borderColor: "#1a7a3a",
    backgroundColor: "rgba(26, 122, 58, 0.08)",
  },
  boolOptionText: {
    fontSize: responsiveFont(17),
    fontWeight: "500",
  },
  boolOptionTextSelected: {
    color: "#1a7a3a",
    fontWeight: "600",
  },
  listContainer: {
    gap: verticalScale(6),
  },
  listOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: widthScale(12),
    paddingVertical: verticalScale(10),
    borderRadius: widthScale(8),
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  checkbox: {
    width: widthScale(18),
    height: widthScale(18),
    borderRadius: widthScale(3),
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.2)",
    marginRight: widthScale(10),
    flexShrink: 0,
  },
  checkboxSelected: {
    borderColor: "#1a7a3a",
    backgroundColor: "#1a7a3a",
  },
  listOptionSelected: {
    borderColor: "#1a7a3a",
    backgroundColor: "rgba(26, 122, 58, 0.08)",
  },
  listOptionText: {
    fontSize: responsiveFont(17),
  },
  listOptionTextSelected: {
    color: "#1a7a3a",
    fontWeight: "600",
  },
  noOptions: {
    fontSize: responsiveFont(17),
    fontStyle: "italic",
  },
  detailLoader: {
    paddingVertical: verticalScale(10),
  },
  locationContainer: {
    gap: verticalScale(4),
  },
  locationLabel: {
    fontSize: responsiveFont(15),
    fontWeight: "600",
    marginBottom: verticalScale(4),
  },
  subQuestionContainer: {
    marginTop: verticalScale(12),
    paddingLeft: widthScale(12),
    borderLeftWidth: 2,
    borderLeftColor: "rgba(26, 122, 58, 0.2)",
  },
});
