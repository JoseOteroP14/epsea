import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { NativeDatePicker } from "@/components/ui/native-date-picker";
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
import { ChevronDown, Search } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";

interface QuestionRendererProps {
  question: Question;
  typeName: string;
  value: any;
  onChange: (questionId: number, value: any) => void;
}

const QUESTION_TYPE_ALIASES: Record<string, string> = {
  text: "text",
  texto: "text",
  date: "date",
  fecha: "date",
  bool: "bool",
  boolean: "bool",
  booleana: "bool",
  booleano: "bool",
  "si/no": "bool",
  "s\u00ed/no": "bool",
  numeric: "numeric",
  number: "numeric",
  numero: "numeric",
  numerica: "numeric",
  "num\u00e9rica": "numeric",
  numerico: "numeric",
  "num\u00e9rico": "numeric",
  list: "list",
  lista: "list",
  logica: "bool",
  "l\u00f3gica": "bool",
  logico: "bool",
  "l\u00f3gico": "bool",
  logic: "bool",
  logical: "bool",
  dependent_list: "dependent_list",
  "lista dependiente": "dependent_list",
  location: "location",
  ubicacion: "location",
  "ubicaci\u00f3n": "location",
};

function normalizeQuestionType(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase().trim();
  return QUESTION_TYPE_ALIASES[normalized] ?? null;
}

function inferQuestionTypeFromMetadata(question: Question): string | null {
  const raw = question as Record<string, unknown>;
  const rawQuestionType =
    raw.question_type && typeof raw.question_type === "object"
      ? (raw.question_type as Record<string, unknown>)
      : null;
  const rawQuestionTypeAlt =
    raw.questionType && typeof raw.questionType === "object"
      ? (raw.questionType as Record<string, unknown>)
      : null;

  const candidates: unknown[] = [
    raw.type,
    raw.question_type_name,
    raw.questionTypeName,
    raw.question_type,
    rawQuestionType?.type,
    rawQuestionType?.name,
    raw.questionType,
    rawQuestionTypeAlt?.type,
    rawQuestionTypeAlt?.name,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeQuestionType(candidate);
    if (normalized) return normalized;
  }

  return null;
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
  // Internal format for NativeDatePicker is dd/mm/yyyy
  // The store uses yyyy-mm-dd, so convert on both ends
  function toDisplay(yyyymmdd: string): string {
    if (!yyyymmdd) return "";
    const parts = yyyymmdd.split("-");
    if (parts.length !== 3) return yyyymmdd;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  function toApi(ddmmyyyy: string): string {
    if (!ddmmyyyy) return "";
    const parts = ddmmyyyy.split("/");
    if (parts.length !== 3) return ddmmyyyy;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  return (
    <NativeDatePicker
      value={toDisplay(value ?? "")}
      onChange={(ddmmyyyy) => onChange(question.id, toApi(ddmmyyyy))}
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
    const optValue = String(option.value ?? option.id);
    if (isMultiple) {
      return selectedIds.some((v) => String(v) === optValue);
    }
    return String(value) === optValue;
  };

  const handlePress = (option: QuestionListOption) => {
    const optValue = String(option.value ?? option.id);
    if (isMultiple) {
      const alreadySelected = selectedIds.some((v) => String(v) === optValue);
      const newVal = alreadySelected
        ? selectedIds.filter((v) => String(v) !== optValue)
        : [...selectedIds, optValue];
      onChange(question.id, newVal);
    } else {
      onChange(question.id, optValue);
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
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [selectedMuni, setSelectedMuni] = useState<Municipality | null>(null);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [loadingMunis, setLoadingMunis] = useState(false);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [showMuniModal, setShowMuniModal] = useState(false);
  const [deptSearch, setDeptSearch] = useState("");
  const [muniSearch, setMuniSearch] = useState("");

  // Parse stored value: "department_cod|municipality_code|municipality_name|department_name"
  useEffect(() => {
    if (value && typeof value === "string" && value.includes("|")) {
      const parts = value.split("|");
      const deptCod = parts[0];
      const muniCode = parts[1];
      const muniName = parts[2] ?? "";
      const deptName = parts[3] ?? "";
      if (deptCod && !selectedDept) {
        setSelectedDept({ department_cod: deptCod, department: deptName });
      }
      if (muniCode && !selectedMuni) {
        setSelectedMuni({
          municipality_code: muniCode,
          municipality: muniName,
          department_cod: deptCod,
          department: deptName,
        });
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
        // If we have a saved value, update names from fresh data
        if (value && typeof value === "string" && value.includes("|")) {
          const deptCod = value.split("|")[0];
          const match = depts.find((d) => d.department_cod === deptCod);
          if (match) setSelectedDept(match);
        }
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
        const munis = await fetchMunicipalities(selectedDept.department_cod);
        setMunicipalities(munis);
        // If we have a saved value, update names from fresh data
        if (value && typeof value === "string" && value.includes("|")) {
          const muniCode = value.split("|")[1];
          const match = munis.find((m) => m.municipality_code === muniCode);
          if (match) setSelectedMuni(match);
        }
      } catch (e) {
        console.error("Failed to fetch municipalities:", e);
      } finally {
        setLoadingMunis(false);
      }
    })();
  }, [selectedDept?.department_cod, fetchMunicipalities]);

  const handleDeptSelect = useCallback(
    (dept: Department) => {
      setSelectedDept(dept);
      setSelectedMuni(null);
      setShowDeptModal(false);
      setDeptSearch("");
      // Clear municipality selection when department changes
      onChange(question.id, null);
    },
    [question.id, onChange],
  );

  const handleMuniSelect = useCallback(
    (muni: Municipality) => {
      setSelectedMuni(muni);
      setShowMuniModal(false);
      setMuniSearch("");
      // Store as "department_cod|municipality_code|municipality_name|department_name"
      const deptName = selectedDept?.department ?? muni.department ?? "";
      onChange(
        question.id,
        `${muni.department_cod}|${muni.municipality_code}|${muni.municipality}|${deptName}`,
      );
    },
    [question.id, selectedDept, onChange],
  );

  const filteredDepts = useMemo(() => {
    if (!deptSearch.trim()) return departments;
    const q = deptSearch.toLowerCase();
    return departments.filter((d) => d.department.toLowerCase().includes(q));
  }, [departments, deptSearch]);

  const filteredMunis = useMemo(() => {
    if (!muniSearch.trim()) return municipalities;
    const q = muniSearch.toLowerCase();
    return municipalities.filter((m) => m.municipality.toLowerCase().includes(q));
  }, [municipalities, muniSearch]);

  if (loadingDepts) {
    return <ActivityIndicator size="small" color="#1a7a3a" style={styles.detailLoader} />;
  }

  return (
    <View style={styles.locationContainer}>
      {/* Department select */}
      <ThemedText style={styles.locationLabel}>Departamento</ThemedText>
      <TouchableOpacity
        style={styles.locationSelector}
        onPress={() => setShowDeptModal(true)}
        activeOpacity={0.8}
      >
        <ThemedText
          style={selectedDept ? styles.locationSelectorText : styles.locationSelectorPlaceholder}
          numberOfLines={1}
        >
          {selectedDept?.department ?? "Seleccionar departamento..."}
        </ThemedText>
        <ChevronDown size={responsiveFont(16)} color="#1a7a3a" />
      </TouchableOpacity>

      {/* Municipality select */}
      <ThemedText style={[styles.locationLabel, { marginTop: verticalScale(12) }]}>
        Municipio
      </ThemedText>
      {!selectedDept ? (
        <View style={[styles.locationSelector, { opacity: 0.5 }]}>
          <ThemedText style={styles.locationSelectorPlaceholder} numberOfLines={1}>
            Seleccione primero un departamento
          </ThemedText>
        </View>
      ) : loadingMunis ? (
        <ActivityIndicator size="small" color="#1a7a3a" style={styles.detailLoader} />
      ) : (
        <TouchableOpacity
          style={styles.locationSelector}
          onPress={() => setShowMuniModal(true)}
          activeOpacity={0.8}
        >
          <ThemedText
            style={selectedMuni ? styles.locationSelectorText : styles.locationSelectorPlaceholder}
            numberOfLines={1}
          >
            {selectedMuni?.municipality ?? "Seleccionar municipio..."}
          </ThemedText>
          <ChevronDown size={responsiveFont(16)} color="#1a7a3a" />
        </TouchableOpacity>
      )}

      {/* Selected display */}
      {selectedMuni && selectedDept && (
        <View style={styles.locationResultContainer}>
          <ThemedText style={styles.locationResultText}>
            {selectedMuni.municipality.toUpperCase()}-{selectedDept.department.toUpperCase()}
          </ThemedText>
        </View>
      )}

      {/* Department popover Modal */}
      <Modal visible={showDeptModal} transparent animationType="fade" onRequestClose={() => setShowDeptModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowDeptModal(false)}>
          <View style={styles.locationModalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.locationModalContent}>
                <ThemedText type="defaultSemiBold" style={styles.locationModalTitle}>
                  Seleccionar Departamento
                </ThemedText>
                <View style={styles.locationSearchContainer}>
                  <Search size={responsiveFont(16)} color="#999" />
                  <TextInput
                    style={styles.locationSearchInput}
                    placeholder="Buscar departamento..."
                    placeholderTextColor="rgba(17,24,28,0.4)"
                    value={deptSearch}
                    onChangeText={setDeptSearch}
                    autoFocus
                  />
                </View>
                <FlatList
                  data={filteredDepts}
                  keyExtractor={(item) => item.department_cod}
                  style={styles.locationModalList}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => {
                    const isSelected = item.department_cod === selectedDept?.department_cod;
                    return (
                      <TouchableOpacity
                        style={[styles.locationModalOption, isSelected && styles.locationModalOptionSelected]}
                        onPress={() => handleDeptSelect(item)}
                        activeOpacity={0.7}
                      >
                        <ThemedText
                          style={[styles.locationModalOptionText, isSelected && styles.locationModalOptionTextSelected]}
                        >
                          {item.department}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  }}
                  ListEmptyComponent={
                    <ThemedText style={styles.locationModalEmpty}>No se encontraron resultados</ThemedText>
                  }
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Municipality popover Modal */}
      <Modal visible={showMuniModal} transparent animationType="fade" onRequestClose={() => setShowMuniModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowMuniModal(false)}>
          <View style={styles.locationModalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.locationModalContent}>
                <ThemedText type="defaultSemiBold" style={styles.locationModalTitle}>
                  Seleccionar Municipio
                </ThemedText>
                <View style={styles.locationSearchContainer}>
                  <Search size={responsiveFont(16)} color="#999" />
                  <TextInput
                    style={styles.locationSearchInput}
                    placeholder="Buscar municipio..."
                    placeholderTextColor="rgba(17,24,28,0.4)"
                    value={muniSearch}
                    onChangeText={setMuniSearch}
                    autoFocus
                  />
                </View>
                <FlatList
                  data={filteredMunis}
                  keyExtractor={(item) => item.municipality_code}
                  style={styles.locationModalList}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => {
                    const isSelected = item.municipality_code === selectedMuni?.municipality_code;
                    return (
                      <TouchableOpacity
                        style={[styles.locationModalOption, isSelected && styles.locationModalOptionSelected]}
                        onPress={() => handleMuniSelect(item)}
                        activeOpacity={0.7}
                      >
                        <ThemedText
                          style={[styles.locationModalOptionText, isSelected && styles.locationModalOptionTextSelected]}
                        >
                          {item.municipality}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  }}
                  ListEmptyComponent={
                    <ThemedText style={styles.locationModalEmpty}>No se encontraron resultados</ThemedText>
                  }
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
  const raw = detail as any;
  const items: QuestionDependentListOption[] =
    detail?.items ?? detail?.options ?? raw?.data?.items ?? raw?.data?.options ?? raw?.data ?? [];

  const mainSelection =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? value._main
      : value;

  const handleMainPress = useCallback(
    (option: QuestionDependentListOption) => {
      const optValue = String(option.value ?? option.id);
      onChange(question.id, optValue);
    },
    [question.id, onChange],
  );

  if (!Array.isArray(items) || items.length === 0) {
    return (
      <ThemedText style={styles.noOptions}>Sin opciones disponibles</ThemedText>
    );
  }

  return (
    <View>
      <View style={styles.listContainer}>
        {items.map((option) => {
          const optValue = option.value != null ? String(option.value) : String(option.id);
          const isSelected = mainSelection != null && String(mainSelection) === optValue;
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

  const normalizedType = normalizeQuestionType(typeName) ?? "text";
  const inferredType = inferQuestionTypeFromMetadata(question);
  const detail = questionDetails[question.id];

  // Recover the renderer type from question metadata when typeId lookup falls back to text.
  const valueLooksBoolean =
    value === true || value === "true" || value === false || value === "false";

  // Detect boolean-like values when type resolution falls back to text.
  const effectiveType =
    normalizedType === "text"
      ? inferredType ?? (valueLooksBoolean ? "bool" : "text")
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
  locationSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    borderRadius: widthScale(8),
    paddingHorizontal: widthScale(12),
    paddingVertical: verticalScale(12),
    backgroundColor: "#fff",
  },
  locationSelectorText: {
    flex: 1,
    fontSize: responsiveFont(16),
    color: "#333",
  },
  locationSelectorPlaceholder: {
    flex: 1,
    fontSize: responsiveFont(16),
    color: "rgba(17,24,28,0.4)",
  },
  locationResultContainer: {
    marginTop: verticalScale(10),
    backgroundColor: "rgba(26, 122, 58, 0.1)",
    borderRadius: widthScale(8),
    paddingVertical: verticalScale(10),
    paddingHorizontal: widthScale(12),
    borderLeftWidth: 3,
    borderLeftColor: "#1a7a3a",
  },
  locationResultText: {
    fontSize: responsiveFont(16),
    fontWeight: "600",
    color: "#1a7a3a",
  },
  locationModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: widthScale(20),
  },
  locationModalContent: {
    backgroundColor: "#fff",
    borderRadius: widthScale(16),
    width: "100%",
    maxHeight: "70%",
    overflow: "hidden",
  },
  locationModalTitle: {
    fontSize: responsiveFont(18),
    textAlign: "center",
    paddingVertical: verticalScale(14),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  locationSearchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: widthScale(8),
    paddingHorizontal: widthScale(14),
    paddingVertical: verticalScale(8),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  locationSearchInput: {
    flex: 1,
    fontSize: responsiveFont(15),
    color: "#333",
    paddingVertical: verticalScale(4),
  },
  locationModalList: {
    maxHeight: verticalScale(350),
  },
  locationModalOption: {
    paddingHorizontal: widthScale(16),
    paddingVertical: verticalScale(12),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.04)",
  },
  locationModalOptionSelected: {
    backgroundColor: "rgba(26, 122, 58, 0.08)",
  },
  locationModalOptionText: {
    fontSize: responsiveFont(16),
  },
  locationModalOptionTextSelected: {
    color: "#1a7a3a",
    fontWeight: "600",
  },
  locationModalEmpty: {
    fontSize: responsiveFont(15),
    textAlign: "center",
    paddingVertical: verticalScale(24),
    color: "#999",
  },
  subQuestionContainer: {
    marginTop: verticalScale(12),
    paddingLeft: widthScale(12),
    borderLeftWidth: 2,
    borderLeftColor: "rgba(26, 122, 58, 0.2)",
  },
});
