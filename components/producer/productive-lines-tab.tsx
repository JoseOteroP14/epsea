import { ThemedText } from "@/components/themed-text";
import { useAlert } from "@/components/ui/custom-alert";
import { SurveyBottomSheet } from "@/components/wizard/survey-bottom-sheet";
import {
    ACTIVITY_IDS,
    ACTIVITY_TYPE_LABELS,
    ACTIVITY_TYPES,
    createEmptyAgriculturalForm,
    createEmptyLivestockForm,
    LIVESTOCK_UNIT_MAP,
    UNIT_ID_TO_NAME,
    UNIT_NAME_TO_ID,
    type ActivityType,
    type AgriculturalLineForm,
    type ExistingAgriculturalLine,
    type ExistingLivestockLine,
    type LivestockLineForm,
    type ProductiveLine,
} from "@/constants/productive-lines-questions";
import type { Question } from "@/schemas/characterization";
import { useAuthStore } from "@/store/useAuthStore";
import {
    PRODUCTIVE_LINES_INTERVENTION_METHOD_ID,
    useCharacterizationStore,
} from "@/store/useCharacterizationStore";
import { checkConnectivity } from "@/hooks/use-network";
import { apiFetch } from "@/utils/api";
import {
    getAnswers,
    saveAnswersBatch,
} from "@/utils/database/repositories/answer-repository";
import { enqueue } from "@/utils/database/repositories/sync-repository";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import {
    BottomSheetBackdrop,
    BottomSheetModal,
    BottomSheetScrollView,
    type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { ChevronDown, ClipboardList, Plus, Search, Sprout, X } from "lucide-react-native";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
    Dimensions,
    Modal,
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
    type LayoutChangeEvent,
} from "react-native";
import { ScrollView as GHScrollView } from "react-native-gesture-handler";
import PagerView from "react-native-pager-view";

interface ProductiveLinesTabProps {
  producerId: string;
  projectId?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDateForApi(ddmmyyyy: string): string {
  const parts = ddmmyyyy.split("/");
  if (parts.length !== 3) return ddmmyyyy;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function formatDateForDisplay(yyyymmdd: string): string {
  if (!yyyymmdd) return "";
  const parts = yyyymmdd.split("-");
  if (parts.length !== 3) return yyyymmdd;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function getLineName(
  lineId: number,
  lineOptions: ProductiveLine[],
): string {
  return lineOptions.find((l) => l.id === lineId)?.name ?? "";
}

// ── ExistingLineCard ─────────────────────────────────────────────────────────

const CAROUSEL_PADDING = widthScale(10);
const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_WIDTH = Math.min(SCREEN_WIDTH * 0.75, widthScale(280));
// Keep a compact breathing room so content does not stick to main tab bar.
const TAB_BAR_RESERVED = verticalScale(82);

const ACTIVITY_BADGE_CONFIG = {
  agricola: { label: "Agrícola", color: "#1a7a3a", bg: "rgba(26,122,58,0.12)" },
  pecuaria: { label: "Pecuaria", color: "#c45e00", bg: "rgba(196,94,0,0.12)" },
} as const;

function ExistingLineCard({
  lineName,
  activityType,
  fields,
}: {
  lineName: string;
  activityType: "agricola" | "pecuaria";
  fields: { label: string; value: string }[];
}) {
  const badge = ACTIVITY_BADGE_CONFIG[activityType];
  return (
    <View style={styles.existingCard}>
      <View style={styles.existingCardHeader}>
        <Sprout size={responsiveFont(16)} color={badge.color} />
        <ThemedText
          type="defaultSemiBold"
          style={[styles.existingCardTitle, { color: badge.color }]}
          numberOfLines={1}
        >
          {lineName}
        </ThemedText>
        <View style={[styles.activityBadge, { backgroundColor: badge.bg }]}>
          <ThemedText style={[styles.activityBadgeText, { color: badge.color }]}>
            {badge.label}
          </ThemedText>
        </View>
      </View>
      <View style={styles.existingCardGrid}>
        {fields.map((f, i) => (
          <View key={i} style={styles.existingCardCell}>
            <ThemedText style={styles.existingCardLabel}>{f.label}</ThemedText>
            <ThemedText style={styles.existingCardValue}>{f.value}</ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── LinesCarousel removed — unified carousel is rendered inline ──────────────

interface UnifiedLineItem {
  key: string;
  type: "agricola" | "pecuaria";
  lineName: string;
  fields: { label: string; value: string }[];
}

// ── AgriculturalForm ─────────────────────────────────────────────────────────

function AgriculturalForm({
  form,
  onSelectLine,
  onChange,
}: {
  form: AgriculturalLineForm;
  onSelectLine: () => void;
  onChange: (key: keyof AgriculturalLineForm, value: string) => void;
}) {
  return (
    <View style={styles.lineForm}>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>
          A. Línea productiva principal
        </ThemedText>
        <TouchableOpacity
          style={styles.listSelector}
          onPress={onSelectLine}
          activeOpacity={0.8}
        >
          <ThemedText
            style={
              form.line_name
                ? styles.listSelectorText
                : styles.listSelectorPlaceholder
            }
          >
            {form.line_name || "Seleccionar..."}
          </ThemedText>
          <ChevronDown size={responsiveFont(16)} color="#1a7a3a" />
        </TouchableOpacity>
      </View>

      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>
          B. ¿Cuál es el área destinada a esta línea productiva en metros
          cuadrados?
        </ThemedText>
        <TextInput
          style={styles.textInput}
          value={form.area}
          onChangeText={(v) => onChange("area", v)}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor="rgba(17, 24, 28, 0.4)"
        />
      </View>

      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>
          C. ¿Cuántas cosechas al año obtiene?
        </ThemedText>
        <TextInput
          style={styles.textInput}
          value={form.harvests}
          onChangeText={(v) => onChange("harvests", v)}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor="rgba(17, 24, 28, 0.4)"
        />
      </View>

      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>
          D. ¿Cuál es la producción promedio en kilogramos?
        </ThemedText>
        <TextInput
          style={styles.textInput}
          value={form.production}
          onChangeText={(v) => onChange("production", v)}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor="rgba(17, 24, 28, 0.4)"
        />
      </View>

      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>
          E. Fecha de siembra del cultivo
        </ThemedText>
        <TextInput
          style={styles.textInput}
          value={form.date}
          onChangeText={(v) => onChange("date", v)}
          placeholder="dd/mm/aaaa"
          placeholderTextColor="rgba(17, 24, 28, 0.4)"
          keyboardType="numbers-and-punctuation"
        />
      </View>
    </View>
  );
}

// ── LivestockForm ────────────────────────────────────────────────────────────

function LivestockForm({
  form,
  onSelectLine,
  onSelectUnit,
  onChange,
}: {
  form: LivestockLineForm;
  onSelectLine: () => void;
  onSelectUnit: () => void;
  onChange: (key: keyof LivestockLineForm, value: string) => void;
}) {
  const unitConfig = form.line_name
    ? LIVESTOCK_UNIT_MAP[form.line_name]
    : undefined;

  return (
    <View style={styles.lineForm}>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>
          A. Línea productiva principal
        </ThemedText>
        <TouchableOpacity
          style={styles.listSelector}
          onPress={onSelectLine}
          activeOpacity={0.8}
        >
          <ThemedText
            style={
              form.line_name
                ? styles.listSelectorText
                : styles.listSelectorPlaceholder
            }
          >
            {form.line_name || "Seleccionar..."}
          </ThemedText>
          <ChevronDown size={responsiveFont(16)} color="#1a7a3a" />
        </TouchableOpacity>
      </View>

      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>
          B. ¿Cuál es el área destinada a esta línea productiva en metros
          cuadrados?
        </ThemedText>
        <TextInput
          style={styles.textInput}
          value={form.area}
          onChangeText={(v) => onChange("area", v)}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor="rgba(17, 24, 28, 0.4)"
        />
      </View>

      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>
          C. ¿Cuántos ciclos productivos obtiene al año?
        </ThemedText>
        <TextInput
          style={styles.textInput}
          value={form.cycles}
          onChangeText={(v) => onChange("cycles", v)}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor="rgba(17, 24, 28, 0.4)"
        />
      </View>

      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>
          D. Producción promedio
        </ThemedText>
        {!unitConfig ? (
          <View style={[styles.textInput, styles.fixedValueContainer]}>
            <ThemedText style={styles.fixedValuePlaceholder}>
              Seleccione primero una línea productiva
            </ThemedText>
          </View>
        ) : unitConfig.mode === "fixed" ? (
          <View style={[styles.textInput, styles.fixedValueContainer]}>
            <ThemedText style={styles.fixedValueText}>
              {unitConfig.value}
            </ThemedText>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.listSelector}
            onPress={onSelectUnit}
            activeOpacity={0.8}
          >
            <ThemedText
              style={
                form.unit_of_measure
                  ? styles.listSelectorText
                  : styles.listSelectorPlaceholder
              }
            >
              {form.unit_of_measure || "Seleccionar..."}
            </ThemedText>
            <ChevronDown size={responsiveFont(16)} color="#1a7a3a" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>
          E. Cantidad producción promedio
        </ThemedText>
        <TextInput
          style={styles.textInput}
          value={form.production}
          onChangeText={(v) => onChange("production", v)}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor="rgba(17, 24, 28, 0.4)"
        />
      </View>

      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>
          F. Fecha de inicio de la producción
        </ThemedText>
        <TextInput
          style={styles.textInput}
          value={form.date}
          onChangeText={(v) => onChange("date", v)}
          placeholder="dd/mm/aaaa"
          placeholderTextColor="rgba(17, 24, 28, 0.4)"
          keyboardType="numbers-and-punctuation"
        />
      </View>
    </View>
  );
}

// ── ProductiveLinesTab ────────────────────────────────────────────────────────

export function ProductiveLinesTab({
  producerId,
  projectId,
}: ProductiveLinesTabProps) {
  const [activityType, setActivityType] = useState<ActivityType>("agricola");
  const { showAlert } = useAlert();
  const currentUserId = useAuthStore((state) => state.user?.user_id);
  const {
    components,
    questions: storeQuestions,
    loadingQuestions,
    fetchComponents,
    fetchQuestions,
    fetchQuestionTypes,
    fetchSurveyResults,
    getProductiveLinesComponent,
    getCanonicalTypeName,
  } = useCharacterizationStore();

  const [showComplementarySheet, setShowComplementarySheet] = useState(false);
  const [complementaryAnswers, setComplementaryAnswers] = useState<
    Record<number, any>
  >({});
  const [localComplementaryQuestions, setLocalComplementaryQuestions] =
    useState<Question[]>([]);
  const hasFetchedComplementaryQuestions = useRef(false);

  const [lineOptions, setLineOptions] = useState<ProductiveLine[]>([]);
  const [allLineOptions, setAllLineOptions] = useState<ProductiveLine[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Existing lines from API
  const [existingAgriLines, setExistingAgriLines] = useState<
    ExistingAgriculturalLine[]
  >([]);
  const [existingLivestockLines, setExistingLivestockLines] = useState<
    ExistingLivestockLine[]
  >([]);
  const [loadingExisting, setLoadingExisting] = useState(true);

  // Form state
  const [lineCountInput, setLineCountInput] = useState("1");
  const [agriFormLines, setAgriFormLines] = useState<AgriculturalLineForm[]>(
    [],
  );
  const [livestockFormLines, setLivestockFormLines] = useState<
    LivestockLineForm[]
  >([]);
  const [activeLineIndex, setActiveLineIndex] = useState(0);
  const [showSheet, setShowSheet] = useState(false);
  const [saving, setSaving] = useState(false);

  // Picker state
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showLinePicker, setShowLinePicker] = useState(false);
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [lineSearchQuery, setLineSearchQuery] = useState("");

  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const tabScrollRef = useRef<GHScrollView>(null);
  const snapPoints = useMemo(() => ["92%"], []);
  const [pagerHeight, setPagerHeight] = useState(verticalScale(252));

  const productiveLinesComponent = getProductiveLinesComponent();

  useEffect(() => {
    if (components.length === 0) {
      fetchComponents();
    }
    fetchQuestionTypes();
  }, [components.length, fetchComponents, fetchQuestionTypes]);

  useEffect(() => {
    if (!productiveLinesComponent || hasFetchedComplementaryQuestions.current) {
      return;
    }
    hasFetchedComplementaryQuestions.current = true;
    fetchQuestions(productiveLinesComponent.id);
  }, [productiveLinesComponent, fetchQuestions]);

  useEffect(() => {
    if (
      storeQuestions.length > 0 &&
      productiveLinesComponent &&
      storeQuestions[0]?.component_id === productiveLinesComponent.id
    ) {
      setLocalComplementaryQuestions(storeQuestions);
    }
  }, [storeQuestions, productiveLinesComponent]);

  useEffect(() => {
    if (
      !productiveLinesComponent ||
      !producerId ||
      !projectId ||
      !currentUserId
    ) {
      return;
    }

    let cancelled = false;
    const pid = Number(producerId);
    const projId = Number(projectId);

    (async () => {
      const merged: Record<number, any> = {};

      try {
        const remote = await fetchSurveyResults(
          projId,
          pid,
          PRODUCTIVE_LINES_INTERVENTION_METHOD_ID,
        );
        for (const item of remote) {
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
        }
      } catch (error) {
        console.error(
          "Failed to fetch remote productive-lines complementary answers:",
          error,
        );
      }

      try {
        const local = await getAnswers(
          pid,
          projId,
          productiveLinesComponent.id,
          currentUserId,
        );
        for (const answer of local) {
          try {
            const parsed = JSON.parse(answer.value ?? "");
            if (Array.isArray(parsed)) {
              merged[answer.question_id] = parsed;
              continue;
            }
          } catch {}
          merged[answer.question_id] = answer.value;
        }
      } catch (error) {
        console.error(
          "Failed to load local productive-lines complementary answers:",
          error,
        );
      }

      if (!cancelled) {
        setComplementaryAnswers(merged);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    productiveLinesComponent,
    producerId,
    projectId,
    currentUserId,
    fetchSurveyResults,
  ]);

  // Fetch line options when activity type changes
  useEffect(() => {
    let cancelled = false;
    setLoadingOptions(true);
    const activityId = ACTIVITY_IDS[activityType];
    apiFetch<{ data: ProductiveLine[] }>(
      `/productive-lines/activity/${activityId}`,
    )
      .then((res) => {
        if (!cancelled) setLineOptions(res.data ?? []);
      })
      .catch((err) => {
        console.error("Failed to fetch productive lines:", err);
        if (!cancelled) setLineOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activityType]);

  // Fetch ALL line options once (both types) for resolving names in carousel
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<{ data: ProductiveLine[] }>(`/productive-lines/activity/${ACTIVITY_IDS.agricola}`),
      apiFetch<{ data: ProductiveLine[] }>(`/productive-lines/activity/${ACTIVITY_IDS.pecuaria}`),
    ])
      .then(([agriRes, pecRes]) => {
        if (!cancelled) setAllLineOptions([...(agriRes.data ?? []), ...(pecRes.data ?? [])]);
      })
      .catch(() => {
        if (!cancelled) setAllLineOptions([]);
      });
    return () => { cancelled = true; };
  }, []);

  // Fetch existing lines on mount
  useEffect(() => {
    if (!producerId || !projectId) {
      setLoadingExisting(false);
      return;
    }
    let cancelled = false;
    setLoadingExisting(true);

    const fetchAgri = apiFetch<{ data: ExistingAgriculturalLine[] }>(
      `/agricultural-lines/producer/${producerId}/project/${projectId}`,
    )
      .then((res) => {
        if (!cancelled) setExistingAgriLines(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setExistingAgriLines([]);
      });

    const fetchLivestock = apiFetch<{ data: ExistingLivestockLine[] }>(
      `/livestock-lines/producer/${producerId}/project/${projectId}`,
    )
      .then((res) => {
        if (!cancelled) setExistingLivestockLines(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setExistingLivestockLines([]);
      });

    Promise.all([fetchAgri, fetchLivestock]).finally(() => {
      if (!cancelled) setLoadingExisting(false);
    });

    return () => {
      cancelled = true;
    };
  }, [producerId, projectId]);

  // Control bottom sheet
  useEffect(() => {
    if (showSheet) {
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [showSheet]);

  const handleSheetChanges = useCallback((index: number) => {
    if (index === -1) setShowSheet(false);
  }, []);

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

  const handleTypeChange = useCallback(
    (newType: ActivityType) => {
      setShowTypePicker(false);
      if (newType === activityType) return;
      const currentForms =
        activityType === "agricola" ? agriFormLines : livestockFormLines;
      if (currentForms.length > 0) {
        showAlert({
          title: "Cambiar tipo",
          message: "Cambiar el tipo eliminará las líneas en el formulario. ¿Desea continuar?",
          type: "warning",
          buttons: [
            { text: "Cancelar", style: "cancel" },
            {
              text: "Continuar",
              style: "destructive",
              onPress: () => {
                setActivityType(newType);
                setAgriFormLines([]);
                setLivestockFormLines([]);
                setActiveLineIndex(0);
              },
            },
          ],
        });
      } else {
        setActivityType(newType);
      }
    },
    [activityType, agriFormLines, livestockFormLines, showAlert],
  );

  const handleCreate = useCallback(() => {
    const count = Math.max(1, Math.min(99, parseInt(lineCountInput) || 1));
    setLineCountInput(String(count));
    if (activityType === "agricola") {
      setAgriFormLines(Array.from({ length: count }, createEmptyAgriculturalForm));
    } else {
      setLivestockFormLines(Array.from({ length: count }, createEmptyLivestockForm));
    }
    setActiveLineIndex(0);
    setShowSheet(true);
  }, [lineCountInput, activityType]);

  const handleAgriChange = useCallback(
    (idx: number, key: keyof AgriculturalLineForm, value: string) => {
      setAgriFormLines((prev) => {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], [key]: value };
        return copy;
      });
    },
    [],
  );

  const handleLivestockChange = useCallback(
    (idx: number, key: keyof LivestockLineForm, value: string) => {
      setLivestockFormLines((prev) => {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], [key]: value };
        // Reset unit when line changes
        if (key === "line_name") {
          const unitCfg = LIVESTOCK_UNIT_MAP[value];
          if (unitCfg?.mode === "fixed") {
            copy[idx].unit_of_measure = unitCfg.value!;
          } else {
            copy[idx].unit_of_measure = "";
          }
        }
        return copy;
      });
    },
    [],
  );

  const handleSelectLine = useCallback(
    (line: ProductiveLine) => {
      setShowLinePicker(false);
      setLineSearchQuery("");
      if (activityType === "agricola") {
        handleAgriChange(activeLineIndex, "line_id", String(line.id));
        handleAgriChange(activeLineIndex, "line_name", line.name);
      } else {
        handleLivestockChange(activeLineIndex, "line_id", String(line.id));
        handleLivestockChange(activeLineIndex, "line_name", line.name);
      }
    },
    [activityType, activeLineIndex, handleAgriChange, handleLivestockChange],
  );

  const handleSelectUnit = useCallback(
    (unit: string) => {
      setShowUnitPicker(false);
      handleLivestockChange(activeLineIndex, "unit_of_measure", unit);
    },
    [activeLineIndex, handleLivestockChange],
  );

  const handleSave = useCallback(async () => {
    if (!producerId || !projectId) return;
    setSaving(true);
    try {
      if (activityType === "agricola") {
        const lines = agriFormLines
          .filter((f) => f.line_id)
          .map((f) => ({
            producer_id: Number(producerId),
            project_id: Number(projectId),
            line_id: Number(f.line_id),
            area: parseFloat(f.area) || 0,
            harvests: parseInt(f.harvests) || 0,
            production: parseFloat(f.production) || 0,
            date: formatDateForApi(f.date),
          }));
        if (lines.length === 0) {
          showAlert({ title: "Error", message: "Debe seleccionar al menos una línea productiva.", type: "error" });
          setSaving(false);
          return;
        }
        await apiFetch("/agricultural-lines/bulk", {
          method: "POST",
          body: JSON.stringify({ lines }),
        });
      } else {
        const lines = livestockFormLines
          .filter((f) => f.line_id)
          .map((f) => {
            const unitName =
              f.unit_of_measure ||
              LIVESTOCK_UNIT_MAP[f.line_name]?.value ||
              "";
            return {
              producer_id: Number(producerId),
              project_id: Number(projectId),
              line_id: Number(f.line_id),
              unit_of_measure_id: UNIT_NAME_TO_ID[unitName] ?? 0,
              area: parseFloat(f.area) || 0,
              cycles: parseInt(f.cycles) || 0,
              production: parseFloat(f.production) || 0,
              date: formatDateForApi(f.date),
            };
          });
        if (lines.length === 0) {
          showAlert({ title: "Error", message: "Debe seleccionar al menos una línea productiva.", type: "error" });
          setSaving(false);
          return;
        }
        await apiFetch("/livestock-lines/bulk", {
          method: "POST",
          body: JSON.stringify({ lines }),
        });
      }

      setShowSheet(false);
      setAgriFormLines([]);
      setLivestockFormLines([]);
      showAlert(
        { title: "Guardado", message: "Las líneas productivas se guardaron correctamente.", type: "success" },
      );

      // Refresh existing lines
      if (activityType === "agricola") {
        apiFetch<{ data: ExistingAgriculturalLine[] }>(
          `/agricultural-lines/producer/${producerId}/project/${projectId}`,
        )
          .then((res) => setExistingAgriLines(res.data ?? []))
          .catch(() => {});
      } else {
        apiFetch<{ data: ExistingLivestockLine[] }>(
          `/livestock-lines/producer/${producerId}/project/${projectId}`,
        )
          .then((res) => setExistingLivestockLines(res.data ?? []))
          .catch(() => {});
      }
    } catch (e: any) {
      console.error("Failed to save productive lines:", e);
      showAlert({ title: "Error", message: e?.message ?? "No se pudieron guardar las líneas productivas.", type: "error" });
    } finally {
      setSaving(false);
    }
  }, [producerId, projectId, activityType, agriFormLines, livestockFormLines, showAlert]);

  const handleOpenComplementarySheet = useCallback(() => {
    if (!productiveLinesComponent) {
      showAlert({
        title: "Sin componente",
        message: "No se encontró el componente de Líneas Productivas.",
        type: "error",
      });
      return;
    }
    fetchQuestions(productiveLinesComponent.id);
    setShowComplementarySheet(true);
  }, [productiveLinesComponent, fetchQuestions, showAlert]);

  const handleComplementaryAnswerChange = useCallback(
    (questionId: number, value: any) => {
      setComplementaryAnswers((prev) => ({ ...prev, [questionId]: value }));
    },
    [],
  );

  const handleCarouselCardLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const cardHeight = event.nativeEvent.layout.height;
      const requiredHeight = cardHeight + verticalScale(12);
      setPagerHeight((prev) =>
        requiredHeight > prev ? requiredHeight : prev,
      );
    },
    [],
  );

  const handleSaveComplementary = useCallback(async () => {
    if (
      !productiveLinesComponent ||
      !producerId ||
      !projectId ||
      !currentUserId
    ) {
      return;
    }

    const pid = Number(producerId);
    const projId = Number(projectId);
    const userId = currentUserId;

    const answerEntries = Object.entries(complementaryAnswers).filter(
      ([, value]) => {
        if (Array.isArray(value)) return value.length > 0;
        if (value == null) return false;
        return String(value).trim() !== "";
      },
    );

    if (answerEntries.length === 0) {
      showAlert({
        title: "Sin respuestas",
        message: "Debe diligenciar al menos una respuesta para guardar.",
        type: "warning",
      });
      return;
    }

    try {
      const answerRows = answerEntries.map(([questionId, value]) => ({
        producer_id: pid,
        project_id: projId,
        component_id: productiveLinesComponent.id,
        question_id: Number(questionId),
        user_id: userId,
        value: Array.isArray(value)
          ? JSON.stringify(value)
          : typeof value === "object" && value !== null
            ? JSON.stringify(value)
            : String(value),
      }));

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
              answers: parsed.map((entry) => ({ answer_value: String(entry) })),
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
        intervention_method_id: PRODUCTIVE_LINES_INTERVENTION_METHOD_ID,
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
      } else {
        await saveAnswersBatch(answerRows);
        await enqueue(
          "survey_answers",
          `${pid}-${projId}-${PRODUCTIVE_LINES_INTERVENTION_METHOD_ID}-${userId}`,
          payload,
          userId,
        );
      }

      setShowComplementarySheet(false);
      showAlert({
        title: isOnline ? "Guardado" : "Sin internet",
        message: isOnline
          ? "Los datos complementarios se guardaron correctamente."
          : "Los datos complementarios se guardaron localmente y se enviarán al sincronizar.",
        type: isOnline ? "success" : "warning",
      });
    } catch (error) {
      console.error("Failed to save productive-lines complementary answers:", error);
      showAlert({
        title: "Error",
        message: "No se pudieron guardar los datos complementarios.",
        type: "error",
      });
    }
  }, [
    complementaryAnswers,
    productiveLinesComponent,
    producerId,
    projectId,
    currentUserId,
    showAlert,
  ]);

  const formLines =
    activityType === "agricola" ? agriFormLines : livestockFormLines;

  // ── Unified carousel data ──────────────────────────────────────────────────
  const unifiedLines = useMemo<UnifiedLineItem[]>(() => {
    const agri: UnifiedLineItem[] = existingAgriLines.map((line) => ({
      key: `agri-${line.id}`,
      type: "agricola",
      lineName: line.line?.name ?? getLineName(line.line_id, allLineOptions),
      fields: [
        { label: "Área (m²)", value: String(line.area) },
        { label: "Cosechas/año", value: String(line.harvests) },
        { label: "Producción (kg)", value: String(line.production) },
        { label: "Fecha de siembra", value: formatDateForDisplay(line.date) },
      ],
    }));
    const livestock: UnifiedLineItem[] = existingLivestockLines.map((line) => ({
      key: `livestock-${line.id}`,
      type: "pecuaria",
      lineName: line.line?.name ?? getLineName(line.line_id, allLineOptions),
      fields: [
        { label: "Área (m²)", value: String(line.area) },
        { label: "Ciclos/año", value: String(line.cycles) },
        {
          label: "Prod. promedio",
          value:
            UNIT_ID_TO_NAME[line.unit_of_measure_id] ??
            `Unidad #${line.unit_of_measure_id}`,
        },
        { label: "Cantidad", value: String(line.production) },
        { label: "Fecha de inicio", value: formatDateForDisplay(line.date) },
      ],
    }));
    return [...agri, ...livestock];
  }, [existingAgriLines, existingLivestockLines, allLineOptions]);

  const filteredLineOptions = useMemo(() => {
    if (!lineSearchQuery.trim()) return lineOptions;
    const q = lineSearchQuery.toLowerCase();
    return lineOptions.filter((l) => l.name.toLowerCase().includes(q));
  }, [lineOptions, lineSearchQuery]);

  // Current unit options for livestock picker
  const currentUnitOptions = useMemo(() => {
    if (activityType !== "pecuaria" || !livestockFormLines[activeLineIndex])
      return [];
    const lineName = livestockFormLines[activeLineIndex].line_name;
    const cfg = LIVESTOCK_UNIT_MAP[lineName];
    if (!cfg || cfg.mode !== "select") return [];
    return cfg.options ?? [];
  }, [activityType, livestockFormLines, activeLineIndex]);

  if (loadingExisting) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a7a3a" />
        <ThemedText style={styles.loadingText}>Cargando...</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Config card — fixed at top */}
      <View style={styles.configSection}>
        <View style={styles.configCard}>
          <ThemedText type="defaultSemiBold" style={styles.configTitle}>
            Configuración
          </ThemedText>

          <View style={styles.configRow}>
            <View style={styles.configField}>
              <ThemedText style={styles.fieldLabel}>Tipo de actividad</ThemedText>
              <TouchableOpacity
                style={styles.typeSelector}
                onPress={() => setShowTypePicker(true)}
                activeOpacity={0.8}
              >
                <ThemedText style={styles.typeSelectorText}>
                  {ACTIVITY_TYPE_LABELS[activityType]}
                </ThemedText>
                <ChevronDown size={responsiveFont(14)} color="#1a7a3a" />
              </TouchableOpacity>
            </View>

            <View style={styles.configFieldSmall}>
              <ThemedText style={styles.fieldLabel}>Líneas</ThemedText>
              <TextInput
                style={styles.countInput}
                value={lineCountInput}
                onChangeText={setLineCountInput}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="1"
                placeholderTextColor="rgba(17, 24, 28, 0.4)"
              />
            </View>
          </View>

          <TouchableOpacity
            style={styles.createButton}
            onPress={handleCreate}
            activeOpacity={0.8}
          >
            <Plus size={responsiveFont(18)} color="#fff" />
            <ThemedText
              lightColor="#fff"
              darkColor="#fff"
              type="defaultSemiBold"
              style={styles.createButtonText}
            >
              Crear líneas
            </ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      {/* Unified carousel — fills remaining space */}
      {unifiedLines.length > 0 ? (
        <View style={styles.carouselContainer}>
          <View style={styles.carouselHeader}>
            <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
              Líneas productivas
            </ThemedText>
          </View>
          <PagerView
            style={[styles.pagerView, { height: pagerHeight }]}
            initialPage={0}
            overdrag
          >
            {unifiedLines.map((item) => (
              <View key={item.key} style={styles.pagerPage} collapsable={false}>
                <View
                  style={styles.carouselCardWrapper}
                  onLayout={handleCarouselCardLayout}
                >
                  <ExistingLineCard lineName={item.lineName} activityType={item.type} fields={item.fields} />
                </View>
              </View>
            ))}
          </PagerView>
          <TouchableOpacity
            style={styles.complementaryButton}
            onPress={handleOpenComplementarySheet}
            activeOpacity={0.8}
          >
            <ClipboardList size={responsiveFont(18)} color="#fff" />
            <ThemedText
              lightColor="#fff"
              darkColor="#fff"
              type="defaultSemiBold"
              style={styles.complementaryButtonText}
            >
              Datos complementarios
            </ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        formLines.length === 0 && (
          <View style={styles.emptyState}>
            <Sprout size={responsiveFont(40)} color="rgba(26,122,58,0.3)" />
            <ThemedText style={styles.emptyStateText}>
              No hay líneas productivas registradas
            </ThemedText>
            <ThemedText style={styles.emptyStateSubtext}>
              Use el botón &quot;Crear líneas&quot; para agregar nuevas líneas
              productivas.
            </ThemedText>
          </View>
        )
      )}

      {/* Type picker Modal */}
      <Modal
        visible={showTypePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTypePicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowTypePicker(false)}
        >
          <View style={styles.pickerContainer}>
            <ThemedText type="defaultSemiBold" style={styles.pickerTitle}>
              Tipo de actividad
            </ThemedText>
            {ACTIVITY_TYPES.map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.pickerOption,
                  activityType === type && styles.pickerOptionSelected,
                ]}
                onPress={() => handleTypeChange(type)}
                activeOpacity={0.8}
              >
                <ThemedText
                  style={[
                    styles.pickerOptionText,
                    activityType === type && styles.pickerOptionTextSelected,
                  ]}
                >
                  {ACTIVITY_TYPE_LABELS[type]}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Line picker Modal */}
      <Modal
        visible={showLinePicker}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowLinePicker(false);
          setLineSearchQuery("");
        }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowLinePicker(false);
            setLineSearchQuery("");
          }}
        >
          <View
            style={styles.linePickerContainer}
            onStartShouldSetResponder={() => true}
          >
            <ThemedText type="defaultSemiBold" style={styles.pickerTitle}>
              Línea productiva
            </ThemedText>
            <View style={styles.searchBox}>
              <Search size={responsiveFont(16)} color="#999" />
              <TextInput
                style={styles.searchInput}
                value={lineSearchQuery}
                onChangeText={setLineSearchQuery}
                placeholder="Buscar línea..."
                placeholderTextColor="rgba(17, 24, 28, 0.4)"
                autoCorrect={false}
              />
            </View>
            {loadingOptions ? (
              <ActivityIndicator
                size="small"
                color="#1a7a3a"
                style={{ marginVertical: verticalScale(20) }}
              />
            ) : (
              <ScrollView
                style={styles.linePickerScroll}
                keyboardShouldPersistTaps="handled"
              >
                {filteredLineOptions.map((line) => (
                  <TouchableOpacity
                    key={line.id}
                    style={styles.pickerOption}
                    onPress={() => handleSelectLine(line)}
                    activeOpacity={0.8}
                  >
                    <ThemedText style={styles.pickerOptionText}>
                      {line.name}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
                {filteredLineOptions.length === 0 && (
                  <ThemedText style={styles.emptySearchText}>
                    Sin resultados
                  </ThemedText>
                )}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Unit picker Modal (livestock only) */}
      <Modal
        visible={showUnitPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUnitPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowUnitPicker(false)}
        >
          <View style={styles.pickerContainer}>
            <ThemedText type="defaultSemiBold" style={styles.pickerTitle}>
              Producción promedio
            </ThemedText>
            {currentUnitOptions.map((unit) => {
              const selected =
                livestockFormLines[activeLineIndex]?.unit_of_measure === unit;
              return (
                <TouchableOpacity
                  key={unit}
                  style={[
                    styles.pickerOption,
                    selected && styles.pickerOptionSelected,
                  ]}
                  onPress={() => handleSelectUnit(unit)}
                  activeOpacity={0.8}
                >
                  <ThemedText
                    style={[
                      styles.pickerOptionText,
                      selected && styles.pickerOptionTextSelected,
                    ]}
                  >
                    {unit}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Bottom Sheet */}
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
        {/* Sheet header */}
        <View style={styles.sheetHeader}>
          <ThemedText
            type="defaultSemiBold"
            style={styles.sheetTitle}
            lightColor="#333"
            darkColor="#333"
            numberOfLines={1}
          >
            {ACTIVITY_TYPE_LABELS[activityType]}
          </ThemedText>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setShowSheet(false)}
            activeOpacity={0.7}
          >
            <X size={responsiveFont(20)} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Line tabs */}
        <GHScrollView
          ref={tabScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
          style={styles.tabsScroll}
        >
          {formLines.map((_, i) => (
            <TouchableOpacity
              key={i}
              style={[
                styles.lineTab,
                activeLineIndex === i && styles.lineTabActive,
              ]}
              onPress={() => {
                setActiveLineIndex(i);
                tabScrollRef.current?.scrollTo({
                  x: Math.max(0, i * widthScale(84) - widthScale(100)),
                  animated: true,
                });
              }}
              activeOpacity={0.8}
            >
              <ThemedText
                lightColor={activeLineIndex === i ? "#fff" : "#555"}
                darkColor={activeLineIndex === i ? "#fff" : "#aaa"}
                style={styles.lineTabText}
              >
                Línea {i + 1}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </GHScrollView>

        {/* Form + save button */}
        <BottomSheetScrollView
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
        >
          {activityType === "agricola" && agriFormLines[activeLineIndex] && (
            <AgriculturalForm
              form={agriFormLines[activeLineIndex]}
              onSelectLine={() => setShowLinePicker(true)}
              onChange={(key, value) =>
                handleAgriChange(activeLineIndex, key, value)
              }
            />
          )}
          {activityType === "pecuaria" &&
            livestockFormLines[activeLineIndex] && (
              <LivestockForm
                form={livestockFormLines[activeLineIndex]}
                onSelectLine={() => setShowLinePicker(true)}
                onSelectUnit={() => setShowUnitPicker(true)}
                onChange={(key, value) =>
                  handleLivestockChange(activeLineIndex, key, value)
                }
              />
            )}

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <ThemedText
                lightColor="#fff"
                darkColor="#fff"
                type="defaultSemiBold"
                style={styles.saveButtonText}
              >
                Guardar
              </ThemedText>
            )}
          </TouchableOpacity>
        </BottomSheetScrollView>
      </BottomSheetModal>

      <SurveyBottomSheet
        visible={showComplementarySheet}
        onClose={() => setShowComplementarySheet(false)}
        title={productiveLinesComponent?.name ?? "LÍNEAS PRODUCTIVAS"}
        questions={localComplementaryQuestions}
        answers={complementaryAnswers}
        onAnswerChange={handleComplementaryAnswerChange}
        onSave={handleSaveComplementary}
        getTypeName={getCanonicalTypeName}
        loading={loadingQuestions}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: verticalScale(12),
  },
  loadingText: { fontSize: responsiveFont(17) },

  // Config section — fixed at top
  configSection: {
    paddingHorizontal: CAROUSEL_PADDING,
    paddingTop: verticalScale(8),
    paddingBottom: verticalScale(8),
  },

  // Config card — compact
  configCard: {
    backgroundColor: "#fff",
    borderRadius: widthScale(12),
    padding: widthScale(12),
    gap: verticalScale(8),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  configTitle: {
    fontSize: responsiveFont(15),
    color: "#1a7a3a",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  configRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: widthScale(10),
  },
  configField: {
    flex: 1,
    gap: verticalScale(3),
  },
  configFieldSmall: {
    width: widthScale(70),
    gap: verticalScale(3),
  },
  fieldLabel: {
    fontSize: responsiveFont(13),
    color: "#555",
  },
  countInput: {
    height: verticalScale(38),
    borderWidth: 1.5,
    borderColor: "#e0e0e0",
    borderRadius: widthScale(8),
    paddingHorizontal: widthScale(10),
    fontSize: responsiveFont(15),
    textAlign: "center",
    color: "#333",
    backgroundColor: "#fafafa",
  },
  typeSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: verticalScale(38),
    borderWidth: 1.5,
    borderColor: "#e0e0e0",
    borderRadius: widthScale(8),
    paddingHorizontal: widthScale(12),
    backgroundColor: "#fafafa",
  },
  typeSelectorText: {
    fontSize: responsiveFont(15),
    color: "#333",
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a7a3a",
    paddingVertical: verticalScale(10),
    borderRadius: widthScale(10),
    gap: widthScale(8),
  },
  createButtonText: { fontSize: responsiveFont(15) },

  // Carousel — fills remaining vertical space, never behind tab bar
  carouselContainer: {
    flex: 1,
    marginBottom: TAB_BAR_RESERVED,
    gap: verticalScale(6),
  },
  carouselHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: CAROUSEL_PADDING,
  },
  sectionTitle: {
    fontSize: responsiveFont(15),
    color: "#333",
  },
  pagerView: {
    flexGrow: 0,
  },
  pagerPage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: verticalScale(4),
  },
  carouselCardWrapper: {
    width: CARD_WIDTH,
  },
  complementaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a7a3a",
    borderRadius: widthScale(10),
    marginHorizontal: CAROUSEL_PADDING,
    marginTop: verticalScale(14),
    marginBottom: verticalScale(4),
    paddingVertical: verticalScale(10),
    gap: widthScale(8),
  },
  complementaryButtonText: {
    fontSize: responsiveFont(15),
  },
  existingCard: {
    backgroundColor: "#fff",
    borderRadius: widthScale(10),
    padding: widthScale(12),
    gap: verticalScale(8),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  existingCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: widthScale(8),
    paddingBottom: verticalScale(4),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  existingCardTitle: {
    flex: 1,
    fontSize: responsiveFont(18),
    color: "#1a7a3a",
  },
  activityBadge: {
    paddingHorizontal: widthScale(8),
    paddingVertical: verticalScale(2),
    borderRadius: widthScale(6),
  },
  activityBadgeText: {
    fontSize: responsiveFont(13),
    fontWeight: "700",
  },
  existingCardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: verticalScale(8),
  },
  existingCardCell: {
    width: "48%",
    gap: verticalScale(2),
  },
  existingCardLabel: {
    fontSize: responsiveFont(15),
    color: "#666",
  },
  existingCardValue: {
    fontSize: responsiveFont(17),
    color: "#333",
    fontWeight: "600",
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: verticalScale(40),
    gap: verticalScale(10),
  },
  emptyStateText: {
    fontSize: responsiveFont(16),
    color: "#555",
    fontWeight: "600",
  },
  emptyStateSubtext: {
    fontSize: responsiveFont(14),
    color: "#888",
    textAlign: "center",
    paddingHorizontal: widthScale(20),
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: widthScale(24),
  },
  pickerContainer: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: widthScale(16),
    padding: widthScale(16),
    gap: verticalScale(4),
  },
  linePickerContainer: {
    width: "100%",
    maxHeight: "70%",
    backgroundColor: "#fff",
    borderRadius: widthScale(16),
    padding: widthScale(16),
    gap: verticalScale(8),
  },
  linePickerScroll: {
    maxHeight: verticalScale(400),
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: widthScale(8),
    borderWidth: 1.5,
    borderColor: "#e0e0e0",
    borderRadius: widthScale(8),
    paddingHorizontal: widthScale(10),
    backgroundColor: "#fafafa",
  },
  searchInput: {
    flex: 1,
    height: verticalScale(38),
    fontSize: responsiveFont(15),
    color: "#333",
  },
  emptySearchText: {
    textAlign: "center",
    fontSize: responsiveFont(14),
    color: "#888",
    paddingVertical: verticalScale(16),
  },
  pickerTitle: {
    fontSize: responsiveFont(16),
    color: "#333",
    marginBottom: verticalScale(8),
    textAlign: "center",
  },
  pickerOption: {
    paddingVertical: verticalScale(11),
    paddingHorizontal: widthScale(14),
    borderRadius: widthScale(8),
  },
  pickerOptionSelected: { backgroundColor: "#1a7a3a" },
  pickerOptionText: {
    fontSize: responsiveFont(15),
    color: "#333",
  },
  pickerOptionTextSelected: { color: "#fff", fontWeight: "600" },

  // Bottom sheet
  sheetBackground: {
    backgroundColor: "#f4fbf7",
    borderTopLeftRadius: widthScale(24),
    borderTopRightRadius: widthScale(24),
  },
  handleIndicator: {
    backgroundColor: "#11181C",
    width: widthScale(40),
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
  sheetTitle: {
    flex: 1,
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

  // Line tabs
  tabsScroll: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  tabsRow: {
    paddingHorizontal: widthScale(12),
    paddingVertical: verticalScale(8),
    gap: widthScale(8),
    flexDirection: "row",
    alignItems: "center",
  },
  lineTab: {
    paddingVertical: verticalScale(6),
    paddingHorizontal: widthScale(14),
    borderRadius: widthScale(20),
    backgroundColor: "#e8e8e8",
  },
  lineTabActive: { backgroundColor: "#1a7a3a" },
  lineTabText: { fontSize: responsiveFont(14), fontWeight: "600" },

  // Form
  formContent: {
    paddingHorizontal: widthScale(16),
    paddingTop: verticalScale(12),
    paddingBottom: verticalScale(32),
    gap: verticalScale(4),
  },
  lineForm: { gap: verticalScale(16) },
  questionBlock: { gap: verticalScale(6) },
  questionLabel: {
    fontSize: responsiveFont(15),
    fontWeight: "600",
    color: "#333",
  },
  textInput: {
    borderWidth: 1.5,
    borderColor: "#ddd",
    borderRadius: widthScale(8),
    paddingVertical: verticalScale(10),
    paddingHorizontal: widthScale(12),
    fontSize: responsiveFont(15),
    color: "#333",
    backgroundColor: "#fff",
  },
  listSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderColor: "#ddd",
    borderRadius: widthScale(8),
    paddingVertical: verticalScale(10),
    paddingHorizontal: widthScale(12),
    backgroundColor: "#fff",
  },
  listSelectorText: {
    flex: 1,
    fontSize: responsiveFont(15),
    color: "#333",
  },
  listSelectorPlaceholder: {
    flex: 1,
    fontSize: responsiveFont(15),
    color: "rgba(17, 24, 28, 0.4)",
  },

  // Fixed value display (livestock unit)
  fixedValueContainer: {
    justifyContent: "center",
    backgroundColor: "#f0f7f2",
    borderColor: "#b7d8c4",
  },
  fixedValueText: {
    fontSize: responsiveFont(15),
    color: "#1a7a3a",
    fontWeight: "600",
  },
  fixedValuePlaceholder: {
    fontSize: responsiveFont(14),
    color: "#999",
    fontStyle: "italic",
  },

  // Save button
  saveButton: {
    backgroundColor: "#1a7a3a",
    paddingVertical: verticalScale(14),
    borderRadius: widthScale(10),
    alignItems: "center",
    marginTop: verticalScale(20),
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: responsiveFont(16) },
});
