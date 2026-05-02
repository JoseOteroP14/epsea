import { ThemedText } from "@/components/themed-text";
import { useAlert } from "@/components/ui/custom-alert";
import { NativeDatePicker } from "@/components/ui/native-date-picker";
import { SurveyBottomSheet } from "@/components/wizard/survey-bottom-sheet";
import {
    ACTIVITY_IDS,
    ACTIVITY_TYPE_LABELS,
    ACTIVITY_TYPES,
    createEmptyAgriculturalForm,
    createEmptyAquacultureForm,
    createEmptyFishingForm,
    createEmptyForestForm,
    createEmptyLivestockForm,
    LIVESTOCK_UNIT_MAP,
    SPECIES_ACTIVITY_ID,
    UNIT_ID_TO_NAME,
    UNIT_NAME_TO_ID,
    type ActivityType,
    type AgriculturalLineForm,
    type AquacultureLineForm,
    type AssistantItem,
    type ExistingAgriculturalLine,
    type ExistingAquacultureLine,
    type ExistingFishingLine,
    type ExistingForestLine,
    type ExistingLivestockLine,
    type FishingLineForm,
    type ForestLineForm,
    type LivestockLineForm,
    type ProductiveLine,
    type UnitOfMeasureItem,
} from "@/constants/productive-lines-questions";
import { checkConnectivity } from "@/hooks/use-network";
import type { Question } from "@/schemas/characterization";
import { useAuthStore } from "@/store/useAuthStore";
import {
    PRODUCTIVE_LINES_INTERVENTION_METHOD_ID,
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

interface ProductiveLinesTabProps {
  producerId: string;
  projectId?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function getLineName(lineId: number, lineOptions: ProductiveLine[]): string {
  return lineOptions.find((l) => l.id === lineId)?.name ?? "";
}

function getAssistantName(id: number, items: AssistantItem[]): string {
  return items.find((i) => i.id === id)?.name ?? `#${id}`;
}

// ── Badge config ──────────────────────────────────────────────────────────────

const CAROUSEL_PADDING = widthScale(10);
const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_WIDTH = Math.min(SCREEN_WIDTH * 0.75, widthScale(280));
const TAB_BAR_RESERVED = verticalScale(82);

type AllActivityType = 'agricola' | 'pecuaria' | 'forestal' | 'pesca' | 'acuicola';

type PagerViewProps = {
  children: React.ReactNode;
  style?: any;
  initialPage?: number;
};

const PagerViewImpl: React.ComponentType<any> | null = (() => {
  try {
    const module = require("react-native-pager-view");
    return module?.default ?? module;
  } catch {
    return null;
  }
})();

function PagerViewCompat({ children, style, initialPage = 0 }: PagerViewProps) {
  if (PagerViewImpl) {
    const Component = PagerViewImpl;
    return (
      <Component style={style} initialPage={initialPage} overdrag>
        {children}
      </Component>
    );
  }

  return (
    <ScrollView
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      style={style}
      contentContainerStyle={styles.pagerFallbackContainer}
    >
      {React.Children.map(children, (child, index) => (
        <View key={index} style={styles.pagerFallbackPage}>
          {child}
        </View>
      ))}
    </ScrollView>
  );
}

const ACTIVITY_BADGE_CONFIG: Record<AllActivityType, { label: string; color: string; bg: string }> = {
  agricola: { label: "Agrícola", color: "#1a7a3a", bg: "rgba(26,122,58,0.12)" },
  pecuaria: { label: "Pecuaria", color: "#c45e00", bg: "rgba(196,94,0,0.12)" },
  forestal: { label: "Forestal", color: "#2d6a4f", bg: "rgba(45,106,79,0.12)" },
  pesca:    { label: "Pesca",    color: "#0077b6", bg: "rgba(0,119,182,0.12)" },
  acuicola: { label: "Acuícola", color: "#00796b", bg: "rgba(0,121,107,0.12)" },
} as const;

// ── ExistingLineCard ──────────────────────────────────────────────────────────

function ExistingLineCard({
  lineName,
  activityType,
  fields,
}: {
  lineName: string;
  activityType: AllActivityType;
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

interface UnifiedLineItem {
  key: string;
  type: AllActivityType;
  lineName: string;
  fields: { label: string; value: string }[];
}

// ── AgriculturalForm ──────────────────────────────────────────────────────────

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
        <ThemedText style={styles.questionLabel}>A. Línea productiva principal</ThemedText>
        <TouchableOpacity style={styles.listSelector} onPress={onSelectLine} activeOpacity={0.8}>
          <ThemedText style={form.line_name ? styles.listSelectorText : styles.listSelectorPlaceholder}>
            {form.line_name || "Seleccionar..."}
          </ThemedText>
          <ChevronDown size={responsiveFont(16)} color="#1a7a3a" />
        </TouchableOpacity>
      </View>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>
          B. ¿Cuál es el área destinada a esta línea productiva en metros cuadrados?
        </ThemedText>
        <TextInput style={styles.textInput} value={form.area} onChangeText={(v) => onChange("area", v)} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="rgba(17, 24, 28, 0.4)" />
      </View>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>C. ¿Cuántas cosechas al año obtiene?</ThemedText>
        <TextInput style={styles.textInput} value={form.harvests} onChangeText={(v) => onChange("harvests", v)} keyboardType="number-pad" placeholder="0" placeholderTextColor="rgba(17, 24, 28, 0.4)" />
      </View>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>D. ¿Cuál es la producción promedio en kilogramos?</ThemedText>
        <TextInput style={styles.textInput} value={form.production} onChangeText={(v) => onChange("production", v)} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="rgba(17, 24, 28, 0.4)" />
      </View>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>E. Fecha de siembra del cultivo</ThemedText>
        <NativeDatePicker value={form.date} onChange={(v) => onChange("date", v)} />
      </View>
    </View>
  );
}

// ── LivestockForm ─────────────────────────────────────────────────────────────

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
  const unitConfig = form.line_name ? LIVESTOCK_UNIT_MAP[form.line_name] : undefined;
  return (
    <View style={styles.lineForm}>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>A. Línea productiva principal</ThemedText>
        <TouchableOpacity style={styles.listSelector} onPress={onSelectLine} activeOpacity={0.8}>
          <ThemedText style={form.line_name ? styles.listSelectorText : styles.listSelectorPlaceholder}>
            {form.line_name || "Seleccionar..."}
          </ThemedText>
          <ChevronDown size={responsiveFont(16)} color="#1a7a3a" />
        </TouchableOpacity>
      </View>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>
          B. ¿Cuál es el área destinada a esta línea productiva en metros cuadrados?
        </ThemedText>
        <TextInput style={styles.textInput} value={form.area} onChangeText={(v) => onChange("area", v)} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="rgba(17, 24, 28, 0.4)" />
      </View>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>C. ¿Cuántos ciclos productivos obtiene al año?</ThemedText>
        <TextInput style={styles.textInput} value={form.cycles} onChangeText={(v) => onChange("cycles", v)} keyboardType="number-pad" placeholder="0" placeholderTextColor="rgba(17, 24, 28, 0.4)" />
      </View>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>D. Producción promedio</ThemedText>
        {!unitConfig ? (
          <View style={[styles.textInput, styles.fixedValueContainer]}>
            <ThemedText style={styles.fixedValuePlaceholder}>Seleccione primero una línea productiva</ThemedText>
          </View>
        ) : unitConfig.mode === "fixed" ? (
          <View style={[styles.textInput, styles.fixedValueContainer]}>
            <ThemedText style={styles.fixedValueText}>{unitConfig.value}</ThemedText>
          </View>
        ) : (
          <TouchableOpacity style={styles.listSelector} onPress={onSelectUnit} activeOpacity={0.8}>
            <ThemedText style={form.unit_of_measure ? styles.listSelectorText : styles.listSelectorPlaceholder}>
              {form.unit_of_measure || "Seleccionar..."}
            </ThemedText>
            <ChevronDown size={responsiveFont(16)} color="#1a7a3a" />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>E. Cantidad producción promedio</ThemedText>
        <TextInput style={styles.textInput} value={form.production} onChangeText={(v) => onChange("production", v)} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="rgba(17, 24, 28, 0.4)" />
      </View>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>F. Fecha de inicio de la producción</ThemedText>
        <NativeDatePicker value={form.date} onChange={(v) => onChange("date", v)} />
      </View>
    </View>
  );
}

// ── ForestForm ────────────────────────────────────────────────────────────────

function ForestForm({
  form,
  onSelectLine,
  onSelectUnit,
  onChange,
}: {
  form: ForestLineForm;
  onSelectLine: () => void;
  onSelectUnit: () => void;
  onChange: (key: keyof ForestLineForm, value: string) => void;
}) {
  return (
    <View style={styles.lineForm}>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>A. Especie forestal cultivada</ThemedText>
        <TouchableOpacity style={styles.listSelector} onPress={onSelectLine} activeOpacity={0.8}>
          <ThemedText style={form.line_name ? styles.listSelectorText : styles.listSelectorPlaceholder}>
            {form.line_name || "Seleccionar..."}
          </ThemedText>
          <ChevronDown size={responsiveFont(16)} color="#1a7a3a" />
        </TouchableOpacity>
      </View>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>
          B. ¿Cuál es el área destinada a esta línea productiva en metros cuadrados?
        </ThemedText>
        <TextInput style={styles.textInput} value={form.area} onChangeText={(v) => onChange("area", v)} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="rgba(17, 24, 28, 0.4)" />
      </View>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>C. Ciclo de cosecha o aprovechamiento (años)</ThemedText>
        <TextInput style={styles.textInput} value={form.cycles} onChangeText={(v) => onChange("cycles", v)} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="rgba(17, 24, 28, 0.4)" />
      </View>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>D. Producción estimada por ciclo</ThemedText>
        {!form.line_name ? (
          <View style={[styles.textInput, styles.fixedValueContainer]}>
            <ThemedText style={styles.fixedValuePlaceholder}>Seleccione primero la especie (A)</ThemedText>
          </View>
        ) : form.unit_of_measure_name ? (
          <View style={[styles.textInput, styles.fixedValueContainer]}>
            <ThemedText style={styles.fixedValueText}>{form.unit_of_measure_name}</ThemedText>
          </View>
        ) : (
          <TouchableOpacity style={styles.listSelector} onPress={onSelectUnit} activeOpacity={0.8}>
            <ThemedText style={styles.listSelectorPlaceholder}>Seleccionar unidad...</ThemedText>
            <ChevronDown size={responsiveFont(16)} color="#1a7a3a" />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>E. Cantidad producción estimada por ciclo</ThemedText>
        <TextInput style={styles.textInput} value={form.production} onChangeText={(v) => onChange("production", v)} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="rgba(17, 24, 28, 0.4)" />
      </View>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>F. Fecha de inicio de la producción</ThemedText>
        <NativeDatePicker value={form.date} onChange={(v) => onChange("date", v)} />
      </View>
    </View>
  );
}

// ── FishingForm ───────────────────────────────────────────────────────────────

function FishingForm({
  form,
  onSelectType,
  onSelectArea,
  onSelectSpecies,
  onChange,
}: {
  form: FishingLineForm;
  onSelectType: () => void;
  onSelectArea: () => void;
  onSelectSpecies: () => void;
  onChange: (key: Exclude<keyof FishingLineForm, 'species'>, value: string) => void;
}) {
  return (
    <View style={styles.lineForm}>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>A. Tipo de pesca</ThemedText>
        <TouchableOpacity style={styles.listSelector} onPress={onSelectType} activeOpacity={0.8}>
          <ThemedText style={form.type_name ? styles.listSelectorText : styles.listSelectorPlaceholder}>
            {form.type_name || "Seleccionar..."}
          </ThemedText>
          <ChevronDown size={responsiveFont(16)} color="#1a7a3a" />
        </TouchableOpacity>
      </View>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>B. Zona de pesca</ThemedText>
        <TouchableOpacity style={styles.listSelector} onPress={onSelectArea} activeOpacity={0.8}>
          <ThemedText style={form.fishing_area_name ? styles.listSelectorText : styles.listSelectorPlaceholder}>
            {form.fishing_area_name || "Seleccionar..."}
          </ThemedText>
          <ChevronDown size={responsiveFont(16)} color="#1a7a3a" />
        </TouchableOpacity>
      </View>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>C. Especies</ThemedText>
        <TouchableOpacity style={styles.listSelector} onPress={onSelectSpecies} activeOpacity={0.8}>
          <ThemedText
            style={form.species.length > 0 ? styles.listSelectorText : styles.listSelectorPlaceholder}
            numberOfLines={1}
          >
            {form.species.length > 0 ? form.species.map((s) => s.name).join(", ") : "Seleccionar especies..."}
          </ThemedText>
          <ChevronDown size={responsiveFont(16)} color="#1a7a3a" />
        </TouchableOpacity>
      </View>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>D. Peso (kg) promedio de captura por jornada</ThemedText>
        <TextInput style={styles.textInput} value={form.weight} onChangeText={(v) => onChange("weight", v)} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="rgba(17, 24, 28, 0.4)" />
      </View>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>E. Fecha de inicio de la producción</ThemedText>
        <NativeDatePicker value={form.date} onChange={(v) => onChange("date", v)} />
      </View>
    </View>
  );
}

// ── AquacultureForm ───────────────────────────────────────────────────────────

function AquacultureForm({
  form,
  onSelectType,
  onSelectSpecies,
  onSelectCroppingArea,
  onChange,
}: {
  form: AquacultureLineForm;
  onSelectType: () => void;
  onSelectSpecies: () => void;
  onSelectCroppingArea: () => void;
  onChange: (key: Exclude<keyof AquacultureLineForm, 'species'>, value: string) => void;
}) {
  return (
    <View style={styles.lineForm}>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>A. Tipo de sistema</ThemedText>
        <TouchableOpacity style={styles.listSelector} onPress={onSelectType} activeOpacity={0.8}>
          <ThemedText style={form.type_name ? styles.listSelectorText : styles.listSelectorPlaceholder}>
            {form.type_name || "Seleccionar..."}
          </ThemedText>
          <ChevronDown size={responsiveFont(16)} color="#1a7a3a" />
        </TouchableOpacity>
      </View>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>B. Especies</ThemedText>
        <TouchableOpacity style={styles.listSelector} onPress={onSelectSpecies} activeOpacity={0.8}>
          <ThemedText
            style={form.species.length > 0 ? styles.listSelectorText : styles.listSelectorPlaceholder}
            numberOfLines={1}
          >
            {form.species.length > 0 ? form.species.map((s) => s.name).join(", ") : "Seleccionar especies..."}
          </ThemedText>
          <ChevronDown size={responsiveFont(16)} color="#1a7a3a" />
        </TouchableOpacity>
      </View>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>C. Unidad de sistema de cultivo</ThemedText>
        <TouchableOpacity style={styles.listSelector} onPress={onSelectCroppingArea} activeOpacity={0.8}>
          <ThemedText style={form.area_crop_name ? styles.listSelectorText : styles.listSelectorPlaceholder}>
            {form.area_crop_name || "Seleccionar..."}
          </ThemedText>
          <ChevronDown size={responsiveFont(16)} color="#1a7a3a" />
        </TouchableOpacity>
      </View>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>D. Área de sistema de cultivo</ThemedText>
        <TextInput style={styles.textInput} value={form.area_value_crop} onChangeText={(v) => onChange("area_value_crop", v)} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="rgba(17, 24, 28, 0.4)" />
      </View>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>E. Número de animales</ThemedText>
        <TextInput style={styles.textInput} value={form.number_of_animals} onChangeText={(v) => onChange("number_of_animals", v)} keyboardType="number-pad" placeholder="0" placeholderTextColor="rgba(17, 24, 28, 0.4)" />
      </View>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>F. ¿Cuántos ciclos productivos obtiene al año?</ThemedText>
        <TextInput style={styles.textInput} value={form.cycles} onChangeText={(v) => onChange("cycles", v)} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="rgba(17, 24, 28, 0.4)" />
      </View>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>G. Producción promedio por ciclo (kg)</ThemedText>
        <TextInput style={styles.textInput} value={form.production} onChangeText={(v) => onChange("production", v)} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="rgba(17, 24, 28, 0.4)" />
      </View>
      <View style={styles.questionBlock}>
        <ThemedText style={styles.questionLabel}>H. Fecha de siembra</ThemedText>
        <NativeDatePicker value={form.date} onChange={(v) => onChange("date", v)} />
      </View>
    </View>
  );
}

// ── ProductiveLinesTab ────────────────────────────────────────────────────────

type AssistantPickerContext = 'fishing_type' | 'fishing_area' | 'aquaculture_type' | 'cropping_area' | null;

export function ProductiveLinesTab({ producerId, projectId }: ProductiveLinesTabProps) {
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
  const [complementaryAnswers, setComplementaryAnswers] = useState<Record<number, any>>({});
  const [localComplementaryQuestions, setLocalComplementaryQuestions] = useState<Question[]>([]);
  const hasFetchedComplementaryQuestions = useRef(false);

  // Line options for the picker (agricola/pecuaria/forestal)
  const [lineOptions, setLineOptions] = useState<ProductiveLine[]>([]);
  const [allLineOptions, setAllLineOptions] = useState<ProductiveLine[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Assistants (pesca / acuicola)
  const [typesOfFishing, setTypesOfFishing] = useState<AssistantItem[]>([]);
  const [fishingAreas, setFishingAreas] = useState<AssistantItem[]>([]);
  const [aquacultureTypes, setAquacultureTypes] = useState<AssistantItem[]>([]);
  const [croppingSystemAreas, setCroppingSystemAreas] = useState<AssistantItem[]>([]);
  const [speciesLines, setSpeciesLines] = useState<ProductiveLine[]>([]);

  // Forest unit picker
  const [forestUnitOptions, setForestUnitOptions] = useState<UnitOfMeasureItem[]>([]);
  const [showForestUnitPicker, setShowForestUnitPicker] = useState(false);

  // Existing lines
  const [existingAgriLines, setExistingAgriLines] = useState<ExistingAgriculturalLine[]>([]);
  const [existingLivestockLines, setExistingLivestockLines] = useState<ExistingLivestockLine[]>([]);
  const [existingForestLines, setExistingForestLines] = useState<ExistingForestLine[]>([]);
  const [existingFishingLines, setExistingFishingLines] = useState<ExistingFishingLine[]>([]);
  const [existingAquacultureLines, setExistingAquacultureLines] = useState<ExistingAquacultureLine[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(true);

  // Form state
  const [lineCountInput, setLineCountInput] = useState("1");
  const [agriFormLines, setAgriFormLines] = useState<AgriculturalLineForm[]>([]);
  const [livestockFormLines, setLivestockFormLines] = useState<LivestockLineForm[]>([]);
  const [forestFormLines, setForestFormLines] = useState<ForestLineForm[]>([]);
  const [fishingFormLines, setFishingFormLines] = useState<FishingLineForm[]>([]);
  const [aquacultureFormLines, setAquacultureFormLines] = useState<AquacultureLineForm[]>([]);
  const [activeLineIndex, setActiveLineIndex] = useState(0);
  const [showSheet, setShowSheet] = useState(false);
  const [saving, setSaving] = useState(false);

  // Picker state
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showLinePicker, setShowLinePicker] = useState(false);
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [showAssistantPicker, setShowAssistantPicker] = useState(false);
  const [assistantPickerContext, setAssistantPickerContext] = useState<AssistantPickerContext>(null);
  const [showSpeciesPicker, setShowSpeciesPicker] = useState(false);
  const [lineSearchQuery, setLineSearchQuery] = useState("");
  const [speciesSearchQuery, setSpeciesSearchQuery] = useState("");

  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const tabScrollRef = useRef<GHScrollView>(null);
  const snapPoints = useMemo(() => ["92%"], []);
  const [pagerHeight, setPagerHeight] = useState(verticalScale(252));

  const productiveLinesComponent = getProductiveLinesComponent();

  useEffect(() => {
    if (components.length === 0) fetchComponents();
    fetchQuestionTypes();
  }, [components.length, fetchComponents, fetchQuestionTypes]);

  useEffect(() => {
    if (!productiveLinesComponent || hasFetchedComplementaryQuestions.current) return;
    hasFetchedComplementaryQuestions.current = true;
    fetchQuestions(productiveLinesComponent.id);
  }, [productiveLinesComponent, fetchQuestions]);

  useEffect(() => {
    if (storeQuestions.length > 0 && productiveLinesComponent && storeQuestions[0]?.component_id === productiveLinesComponent.id) {
      setLocalComplementaryQuestions(storeQuestions);
    }
  }, [storeQuestions, productiveLinesComponent]);

  useEffect(() => {
    if (!productiveLinesComponent || !producerId || !projectId || !currentUserId) return;
    let cancelled = false;
    const pid = Number(producerId);
    const projId = Number(projectId);
    (async () => {
      const merged: Record<number, any> = {};
      try {
        const remote = await fetchSurveyResults(projId, pid, PRODUCTIVE_LINES_INTERVENTION_METHOD_ID);
        for (const item of remote) {
          if (merged[item.question_id] !== undefined) {
            merged[item.question_id] = Array.isArray(merged[item.question_id])
              ? [...merged[item.question_id], item.answer_value]
              : [merged[item.question_id], item.answer_value];
          } else {
            merged[item.question_id] = item.answer_value;
          }
        }
      } catch {}
      try {
        const local = await getAnswers(pid, projId, productiveLinesComponent.id, currentUserId);
        for (const answer of local) {
          try {
            const parsed = JSON.parse(answer.value ?? "");
            if (Array.isArray(parsed)) { merged[answer.question_id] = parsed; continue; }
          } catch {}
          merged[answer.question_id] = answer.value;
        }
      } catch {}
      if (!cancelled) setComplementaryAnswers(merged);
    })();
    return () => { cancelled = true; };
  }, [productiveLinesComponent, producerId, projectId, currentUserId, fetchSurveyResults]);

  // Fetch line options when activity type changes (skip pesca/acuicola)
  useEffect(() => {
    if (activityType === "pesca" || activityType === "acuicola") {
      setLineOptions([]);
      return;
    }
    let cancelled = false;
    setLoadingOptions(true);
    apiFetch<{ data: ProductiveLine[] }>(`/productive-lines/activity/${ACTIVITY_IDS[activityType]}`)
      .then((res) => { if (!cancelled) setLineOptions(res.data ?? []); })
      .catch(() => { if (!cancelled) setLineOptions([]); })
      .finally(() => { if (!cancelled) setLoadingOptions(false); });
    return () => { cancelled = true; };
  }, [activityType]);

  // Fetch all line options for carousel name resolution (agricola + pecuaria + forestal)
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<{ data: ProductiveLine[] }>(`/productive-lines/activity/${ACTIVITY_IDS.agricola}`),
      apiFetch<{ data: ProductiveLine[] }>(`/productive-lines/activity/${ACTIVITY_IDS.pecuaria}`),
      apiFetch<{ data: ProductiveLine[] }>(`/productive-lines/activity/${ACTIVITY_IDS.forestal}`),
    ])
      .then(([agriRes, pecRes, forestRes]) => {
        if (!cancelled) setAllLineOptions([...(agriRes.data ?? []), ...(pecRes.data ?? []), ...(forestRes.data ?? [])]);
      })
      .catch(() => { if (!cancelled) setAllLineOptions([]); });
    return () => { cancelled = true; };
  }, []);

  // Fetch assistants and species lines on mount
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<{ data: AssistantItem[] }>("/assistants/types-of-fishing"),
      apiFetch<{ data: AssistantItem[] }>("/assistants/fishing-areas"),
      apiFetch<{ data: AssistantItem[] }>("/assistants/aquaculture-types-of-system"),
      apiFetch<{ data: AssistantItem[] }>("/assistants/area-of-cropping-system"),
      apiFetch<{ data: ProductiveLine[] }>(`/productive-lines/activity/${SPECIES_ACTIVITY_ID}`),
    ])
      .then(([fishing, areas, aquaculture, cropping, species]) => {
        if (!cancelled) {
          setTypesOfFishing(fishing.data ?? []);
          setFishingAreas(areas.data ?? []);
          setAquacultureTypes(aquaculture.data ?? []);
          setCroppingSystemAreas(cropping.data ?? []);
          setSpeciesLines(species.data ?? []);
        }
      })
      .catch((err) => console.error("Failed to fetch assistants:", err));
    return () => { cancelled = true; };
  }, []);

  // Fetch existing lines on mount
  useEffect(() => {
    if (!producerId || !projectId) { setLoadingExisting(false); return; }
    let cancelled = false;
    setLoadingExisting(true);

    const fetch = <T,>(url: string, setter: (v: T[]) => void) =>
      apiFetch<{ data: T[] }>(url)
        .then((res) => { if (!cancelled) setter(res.data ?? []); })
        .catch(() => { if (!cancelled) setter([]); });

    Promise.all([
      fetch<ExistingAgriculturalLine>(`/agricultural-lines/producer/${producerId}/project/${projectId}`, setExistingAgriLines),
      fetch<ExistingLivestockLine>(`/livestock-lines/producer/${producerId}/project/${projectId}`, setExistingLivestockLines),
      fetch<ExistingForestLine>(`/forest-lines/producer/${producerId}/project/${projectId}`, setExistingForestLines),
      fetch<ExistingFishingLine>(`/fishing-lines/producer/${producerId}/project/${projectId}`, setExistingFishingLines),
      fetch<ExistingAquacultureLine>(`/aquaculture-lines/producer/${producerId}/project/${projectId}`, setExistingAquacultureLines),
    ]).finally(() => { if (!cancelled) setLoadingExisting(false); });

    return () => { cancelled = true; };
  }, [producerId, projectId]);

  // Control bottom sheet
  useEffect(() => {
    if (showSheet) bottomSheetRef.current?.present();
    else bottomSheetRef.current?.dismiss();
  }, [showSheet]);

  const handleSheetChanges = useCallback((index: number) => {
    if (index === -1) setShowSheet(false);
  }, []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />
    ),
    [],
  );

  const handleTypeChange = useCallback(
    (newType: ActivityType) => {
      setShowTypePicker(false);
      if (newType === activityType) return;
      const hasUnsaved =
        activityType === "agricola" ? agriFormLines.length > 0
        : activityType === "pecuaria" ? livestockFormLines.length > 0
        : activityType === "forestal" ? forestFormLines.length > 0
        : activityType === "pesca" ? fishingFormLines.length > 0
        : aquacultureFormLines.length > 0;

      const doChange = () => {
        setActivityType(newType);
        setAgriFormLines([]);
        setLivestockFormLines([]);
        setForestFormLines([]);
        setFishingFormLines([]);
        setAquacultureFormLines([]);
        setActiveLineIndex(0);
      };

      if (hasUnsaved) {
        showAlert({
          title: "Cambiar tipo",
          message: "Cambiar el tipo eliminará las líneas en el formulario. ¿Desea continuar?",
          type: "warning",
          buttons: [
            { text: "Cancelar", style: "cancel" },
            { text: "Continuar", style: "destructive", onPress: doChange },
          ],
        });
      } else {
        doChange();
      }
    },
    [activityType, agriFormLines, livestockFormLines, forestFormLines, fishingFormLines, aquacultureFormLines, showAlert],
  );

  const handleCreate = useCallback(() => {
    const count = Math.max(1, Math.min(99, parseInt(lineCountInput) || 1));
    setLineCountInput(String(count));
    if (activityType === "agricola") setAgriFormLines(Array.from({ length: count }, createEmptyAgriculturalForm));
    else if (activityType === "pecuaria") setLivestockFormLines(Array.from({ length: count }, createEmptyLivestockForm));
    else if (activityType === "forestal") setForestFormLines(Array.from({ length: count }, createEmptyForestForm));
    else if (activityType === "pesca") setFishingFormLines(Array.from({ length: count }, createEmptyFishingForm));
    else setAquacultureFormLines(Array.from({ length: count }, createEmptyAquacultureForm));
    setActiveLineIndex(0);
    setShowSheet(true);
  }, [lineCountInput, activityType]);

  // ── Change handlers ────────────────────────────────────────────────────────

  const handleAgriChange = useCallback((idx: number, key: keyof AgriculturalLineForm, value: string) => {
    setAgriFormLines((prev) => { const c = [...prev]; c[idx] = { ...c[idx], [key]: value }; return c; });
  }, []);

  const handleLivestockChange = useCallback((idx: number, key: keyof LivestockLineForm, value: string) => {
    setLivestockFormLines((prev) => {
      const c = [...prev];
      c[idx] = { ...c[idx], [key]: value };
      if (key === "line_name") {
        const unitCfg = LIVESTOCK_UNIT_MAP[value];
        c[idx].unit_of_measure = unitCfg?.mode === "fixed" ? unitCfg.value! : "";
      }
      return c;
    });
  }, []);

  const handleForestChange = useCallback((idx: number, key: keyof ForestLineForm, value: string) => {
    setForestFormLines((prev) => { const c = [...prev]; c[idx] = { ...c[idx], [key]: value }; return c; });
  }, []);

  const handleFishingChange = useCallback((idx: number, key: Exclude<keyof FishingLineForm, 'species'>, value: string) => {
    setFishingFormLines((prev) => { const c = [...prev]; c[idx] = { ...c[idx], [key]: value }; return c; });
  }, []);

  const handleAquacultureChange = useCallback((idx: number, key: Exclude<keyof AquacultureLineForm, 'species'>, value: string) => {
    setAquacultureFormLines((prev) => { const c = [...prev]; c[idx] = { ...c[idx], [key]: value }; return c; });
  }, []);

  const handleToggleSpecies = useCallback((species: { line_id: number; name: string }) => {
    const toggle = (current: { line_id: number; name: string }[]) => {
      const exists = current.some((s) => s.line_id === species.line_id);
      return exists ? current.filter((s) => s.line_id !== species.line_id) : [...current, species];
    };
    if (activityType === "pesca") {
      setFishingFormLines((prev) => {
        const c = [...prev];
        c[activeLineIndex] = { ...c[activeLineIndex], species: toggle(c[activeLineIndex].species) };
        return c;
      });
    } else if (activityType === "acuicola") {
      setAquacultureFormLines((prev) => {
        const c = [...prev];
        c[activeLineIndex] = { ...c[activeLineIndex], species: toggle(c[activeLineIndex].species) };
        return c;
      });
    }
  }, [activityType, activeLineIndex]);

  // ── Line/unit selection ────────────────────────────────────────────────────

  const handleSelectLine = useCallback(async (line: ProductiveLine) => {
    setShowLinePicker(false);
    setLineSearchQuery("");
    if (activityType === "agricola") {
      handleAgriChange(activeLineIndex, "line_id", String(line.id));
      handleAgriChange(activeLineIndex, "line_name", line.name);
    } else if (activityType === "pecuaria") {
      handleLivestockChange(activeLineIndex, "line_id", String(line.id));
      handleLivestockChange(activeLineIndex, "line_name", line.name);
    } else if (activityType === "forestal") {
      const idx = activeLineIndex;
      handleForestChange(idx, "line_id", String(line.id));
      handleForestChange(idx, "line_name", line.name);
      handleForestChange(idx, "unit_of_measure_id", "");
      handleForestChange(idx, "unit_of_measure_name", "");
      try {
        const res = await apiFetch<{ data: UnitOfMeasureItem[] }>(`/unit-of-measure/${line.id}`);
        const units = res.data ?? [];
        if (units.length === 1) {
          handleForestChange(idx, "unit_of_measure_id", String(units[0].unit_id));
          handleForestChange(idx, "unit_of_measure_name", units[0].unit_of_measure_name);
        } else if (units.length > 1) {
          setForestUnitOptions(units);
          setShowForestUnitPicker(true);
        }
      } catch (e) {
        console.error("Failed to fetch forest units:", e);
      }
    }
  }, [activityType, activeLineIndex, handleAgriChange, handleLivestockChange, handleForestChange]);

  const handleSelectUnit = useCallback((unit: string) => {
    setShowUnitPicker(false);
    handleLivestockChange(activeLineIndex, "unit_of_measure", unit);
  }, [activeLineIndex, handleLivestockChange]);

  const handleSelectForestUnit = useCallback((unit: UnitOfMeasureItem) => {
    setShowForestUnitPicker(false);
    handleForestChange(activeLineIndex, "unit_of_measure_id", String(unit.unit_id));
    handleForestChange(activeLineIndex, "unit_of_measure_name", unit.unit_of_measure_name);
  }, [activeLineIndex, handleForestChange]);

  const handleAssistantSelect = useCallback((item: AssistantItem) => {
    setShowAssistantPicker(false);
    if (activityType === "pesca") {
      if (assistantPickerContext === "fishing_type") {
        setFishingFormLines((prev) => { const c = [...prev]; c[activeLineIndex] = { ...c[activeLineIndex], type_id: String(item.id), type_name: item.name }; return c; });
      } else if (assistantPickerContext === "fishing_area") {
        setFishingFormLines((prev) => { const c = [...prev]; c[activeLineIndex] = { ...c[activeLineIndex], fishing_area_id: String(item.id), fishing_area_name: item.name }; return c; });
      }
    } else if (activityType === "acuicola") {
      if (assistantPickerContext === "aquaculture_type") {
        setAquacultureFormLines((prev) => { const c = [...prev]; c[activeLineIndex] = { ...c[activeLineIndex], type_id: String(item.id), type_name: item.name }; return c; });
      } else if (assistantPickerContext === "cropping_area") {
        setAquacultureFormLines((prev) => { const c = [...prev]; c[activeLineIndex] = { ...c[activeLineIndex], area_crop_id: String(item.id), area_crop_name: item.name }; return c; });
      }
    }
    setAssistantPickerContext(null);
  }, [activityType, activeLineIndex, assistantPickerContext]);

  const openAssistantPicker = useCallback((ctx: AssistantPickerContext) => {
    setAssistantPickerContext(ctx);
    setShowAssistantPicker(true);
  }, []);

  // ── Save ───────────────────────────────────────────────────────────────────

  const refreshLines = useCallback(async (type: ActivityType) => {
    if (!producerId || !projectId) return;
    try {
      if (type === "agricola") {
        const r = await apiFetch<{ data: ExistingAgriculturalLine[] }>(`/agricultural-lines/producer/${producerId}/project/${projectId}`);
        setExistingAgriLines(r.data ?? []);
      } else if (type === "pecuaria") {
        const r = await apiFetch<{ data: ExistingLivestockLine[] }>(`/livestock-lines/producer/${producerId}/project/${projectId}`);
        setExistingLivestockLines(r.data ?? []);
      } else if (type === "forestal") {
        const r = await apiFetch<{ data: ExistingForestLine[] }>(`/forest-lines/producer/${producerId}/project/${projectId}`);
        setExistingForestLines(r.data ?? []);
      } else if (type === "pesca") {
        const r = await apiFetch<{ data: ExistingFishingLine[] }>(`/fishing-lines/producer/${producerId}/project/${projectId}`);
        setExistingFishingLines(r.data ?? []);
      } else if (type === "acuicola") {
        const r = await apiFetch<{ data: ExistingAquacultureLine[] }>(`/aquaculture-lines/producer/${producerId}/project/${projectId}`);
        setExistingAquacultureLines(r.data ?? []);
      }
    } catch {}
  }, [producerId, projectId]);

  const handleSave = useCallback(async () => {
    if (!producerId || !projectId) return;
    setSaving(true);
    try {
      if (activityType === "agricola") {
        const lines = agriFormLines.filter((f) => f.line_id).map((f) => ({
          producer_id: Number(producerId), project_id: Number(projectId),
          line_id: Number(f.line_id), area: parseFloat(f.area) || 0,
          harvests: parseInt(f.harvests) || 0, production: parseFloat(f.production) || 0,
          date: formatDateForApi(f.date),
        }));
        if (!lines.length) { showAlert({ title: "Error", message: "Debe seleccionar al menos una línea productiva.", type: "error" }); return; }
        await apiFetch("/agricultural-lines/bulk", { method: "POST", body: JSON.stringify({ lines }) });

      } else if (activityType === "pecuaria") {
        const lines = livestockFormLines.filter((f) => f.line_id).map((f) => {
          const unitName = f.unit_of_measure || LIVESTOCK_UNIT_MAP[f.line_name]?.value || "";
          return {
            producer_id: Number(producerId), project_id: Number(projectId),
            line_id: Number(f.line_id), unit_of_measure_id: UNIT_NAME_TO_ID[unitName] ?? 0,
            area: parseFloat(f.area) || 0, cycles: parseInt(f.cycles) || 0,
            production: parseFloat(f.production) || 0, date: formatDateForApi(f.date),
          };
        });
        if (!lines.length) { showAlert({ title: "Error", message: "Debe seleccionar al menos una línea productiva.", type: "error" }); return; }
        await apiFetch("/livestock-lines/bulk", { method: "POST", body: JSON.stringify({ lines }) });

      } else if (activityType === "forestal") {
        const lines = forestFormLines.filter((f) => f.line_id && f.unit_of_measure_id).map((f) => ({
          producer_id: Number(producerId), project_id: Number(projectId),
          line_id: Number(f.line_id), unit_of_measure_id: parseInt(f.unit_of_measure_id) || 0,
          area: parseFloat(f.area) || 0, cycles: parseFloat(f.cycles) || 0,
          production: parseFloat(f.production) || 0, date: formatDateForApi(f.date),
        }));
        if (!lines.length) { showAlert({ title: "Error", message: "Debe seleccionar al menos una especie forestal.", type: "error" }); return; }
        await apiFetch("/forest-lines/bulk", { method: "POST", body: JSON.stringify({ lines }) });

      } else if (activityType === "pesca") {
        const lines = fishingFormLines.filter((f) => f.type_id && f.fishing_area_id && f.species.length > 0).map((f) => ({
          producer_id: Number(producerId), project_id: Number(projectId),
          type_id: parseInt(f.type_id) || 0, fishing_area_id: parseInt(f.fishing_area_id) || 0,
          weight: parseFloat(f.weight) || 0, date: formatDateForApi(f.date),
          lines: f.species.map((s) => ({ line_id: s.line_id })),
        }));
        if (!lines.length) { showAlert({ title: "Error", message: "Debe completar al menos una línea de pesca con tipo, zona y especies.", type: "error" }); return; }
        await apiFetch("/fishing-lines/bulk", { method: "POST", body: JSON.stringify({ lines }) });

      } else if (activityType === "acuicola") {
        const lines = aquacultureFormLines.filter((f) => f.type_id && f.area_crop_id && f.species.length > 0).map((f) => ({
          producer_id: Number(producerId), project_id: Number(projectId),
          type_id: parseInt(f.type_id) || 0, area_crop_id: parseInt(f.area_crop_id) || 0,
          area_value_crop: parseFloat(f.area_value_crop) || 0,
          number_of_animals: parseInt(f.number_of_animals) || 0,
          cycles: parseFloat(f.cycles) || 0, production: parseFloat(f.production) || 0,
          date: formatDateForApi(f.date),
          lines: f.species.map((s) => ({ line_id: s.line_id })),
        }));
        if (!lines.length) { showAlert({ title: "Error", message: "Debe completar al menos una línea acuícola con tipo, especies y unidad de cultivo.", type: "error" }); return; }
        await apiFetch("/aquaculture-lines/bulk", { method: "POST", body: JSON.stringify({ lines }) });
      }

      setShowSheet(false);
      setAgriFormLines([]); setLivestockFormLines([]); setForestFormLines([]);
      setFishingFormLines([]); setAquacultureFormLines([]);
      showAlert({ title: "Guardado", message: "Las líneas productivas se guardaron correctamente.", type: "success" });
      refreshLines(activityType);

    } catch (e: any) {
      console.error("Failed to save productive lines:", e);
      showAlert({ title: "Error", message: e?.message ?? "No se pudieron guardar las líneas productivas.", type: "error" });
    } finally {
      setSaving(false);
    }
  }, [producerId, projectId, activityType, agriFormLines, livestockFormLines, forestFormLines, fishingFormLines, aquacultureFormLines, showAlert, refreshLines]);

  const handleOpenComplementarySheet = useCallback(() => {
    if (!productiveLinesComponent) {
      showAlert({ title: "Sin componente", message: "No se encontró el componente de Líneas Productivas.", type: "error" });
      return;
    }
    fetchQuestions(productiveLinesComponent.id);
    setShowComplementarySheet(true);
  }, [productiveLinesComponent, fetchQuestions, showAlert]);

  const handleComplementaryAnswerChange = useCallback((questionId: number, value: any) => {
    setComplementaryAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const handleCarouselCardLayout = useCallback((event: LayoutChangeEvent) => {
    const cardHeight = event.nativeEvent.layout.height;
    const requiredHeight = cardHeight + verticalScale(12);
    setPagerHeight((prev) => (requiredHeight > prev ? requiredHeight : prev));
  }, []);

  const handleSaveComplementary = useCallback(async () => {
    if (!productiveLinesComponent || !producerId || !projectId || !currentUserId) return;
    const pid = Number(producerId), projId = Number(projectId), userId = currentUserId;
    const answerEntries = Object.entries(complementaryAnswers).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      if (value == null) return false;
      return String(value).trim() !== "";
    });
    if (!answerEntries.length) {
      showAlert({ title: "Sin respuestas", message: "Debe diligenciar al menos una respuesta.", type: "warning" });
      return;
    }
    try {
      const answerRows = answerEntries.map(([questionId, value]) => ({
        producer_id: pid, project_id: projId, component_id: productiveLinesComponent.id,
        question_id: Number(questionId), user_id: userId,
        value: Array.isArray(value) ? JSON.stringify(value) : typeof value === "object" && value !== null ? JSON.stringify(value) : String(value),
      }));
      const syncAnswers: ({ question_id: number; answer_value: string } | { question_id: number; answers: { answer_value: string }[] })[] = [];
      for (const row of answerRows) {
        try {
          const parsed = JSON.parse(row.value ?? "");
          if (Array.isArray(parsed)) { syncAnswers.push({ question_id: row.question_id, answers: parsed.map((e) => ({ answer_value: String(e) })) }); continue; }
        } catch {}
        syncAnswers.push({ question_id: row.question_id, answer_value: row.value ?? "" });
      }
      const payload = { project_id: projId, intervention_method_id: PRODUCTIVE_LINES_INTERVENTION_METHOD_ID, producer_id: pid, created_at: new Date().toISOString().split("T")[0], answers: syncAnswers };
      const isOnline = await checkConnectivity();
      if (isOnline) {
        await apiFetch("/surveys", { method: "POST", body: JSON.stringify(payload) });
      } else {
        await saveAnswersBatch(answerRows);
        await enqueue("survey_answers", `${pid}-${projId}-${productiveLinesComponent.id}-${userId}`, payload, userId);
      }
      setShowComplementarySheet(false);
      showAlert({ title: isOnline ? "Guardado" : "Sin internet", message: isOnline ? "Los datos complementarios se guardaron correctamente." : "Los datos se guardaron localmente y se enviarán al sincronizar.", type: isOnline ? "success" : "warning" });
    } catch {
      showAlert({ title: "Error", message: "No se pudieron guardar los datos complementarios.", type: "error" });
    }
  }, [complementaryAnswers, productiveLinesComponent, producerId, projectId, currentUserId, showAlert]);

  // ── Derived data ───────────────────────────────────────────────────────────

  const formLines = useMemo(() => {
    if (activityType === "agricola") return agriFormLines;
    if (activityType === "pecuaria") return livestockFormLines;
    if (activityType === "forestal") return forestFormLines;
    if (activityType === "pesca") return fishingFormLines;
    return aquacultureFormLines;
  }, [activityType, agriFormLines, livestockFormLines, forestFormLines, fishingFormLines, aquacultureFormLines]);

  const unifiedLines = useMemo<UnifiedLineItem[]>(() => {
    const agri = existingAgriLines.map((l) => ({
      key: `agri-${l.id}`, type: "agricola" as const,
      lineName: l.line?.name ?? getLineName(l.line_id, allLineOptions),
      fields: [
        { label: "Área (m²)", value: String(l.area) },
        { label: "Cosechas/año", value: String(l.harvests) },
        { label: "Producción (kg)", value: String(l.production) },
        { label: "Fecha de siembra", value: formatDateForDisplay(l.date) },
      ],
    }));
    const livestock = existingLivestockLines.map((l) => ({
      key: `livestock-${l.id}`, type: "pecuaria" as const,
      lineName: l.line?.name ?? getLineName(l.line_id, allLineOptions),
      fields: [
        { label: "Área (m²)", value: String(l.area) },
        { label: "Ciclos/año", value: String(l.cycles) },
        { label: "Prod. promedio", value: UNIT_ID_TO_NAME[l.unit_of_measure_id] ?? `Unidad #${l.unit_of_measure_id}` },
        { label: "Cantidad", value: String(l.production) },
        { label: "Fecha de inicio", value: formatDateForDisplay(l.date) },
      ],
    }));
    const forest = existingForestLines.map((l) => ({
      key: `forest-${l.id}`, type: "forestal" as const,
      lineName: l.line?.name ?? getLineName(l.line_id, allLineOptions),
      fields: [
        { label: "Área (m²)", value: String(l.area) },
        { label: "Ciclo cosecha (años)", value: String(l.cycles) },
        { label: "Cant. prod. estimada", value: String(l.production) },
        { label: "Fecha de inicio", value: formatDateForDisplay(l.date) },
      ],
    }));
    const fishing = existingFishingLines.map((l) => ({
      key: `fishing-${l.id}`, type: "pesca" as const,
      lineName: l.type_name ?? getAssistantName(l.type_id, typesOfFishing),
      fields: [
        { label: "Zona de pesca", value: l.fishing_area_name ?? getAssistantName(l.fishing_area_id ?? 0, fishingAreas) },
        { label: "Peso captura (kg)", value: String(l.weight) },
        { label: "Fecha", value: formatDateForDisplay(l.date) },
      ],
    }));
    const aquaculture = existingAquacultureLines.map((l) => ({
      key: `aqua-${l.id}`, type: "acuicola" as const,
      lineName: l.type_system_name ?? getAssistantName(l.type_id, aquacultureTypes),
      fields: [
        { label: "Nº animales", value: String(l.number_of_animals) },
        { label: "Ciclos/año", value: String(l.cycles) },
        { label: "Prod./ciclo (kg)", value: String(l.production) },
        { label: "Fecha de siembra", value: formatDateForDisplay(l.date) },
      ],
    }));
    return [...agri, ...livestock, ...forest, ...fishing, ...aquaculture];
  }, [existingAgriLines, existingLivestockLines, existingForestLines, existingFishingLines, existingAquacultureLines, allLineOptions, typesOfFishing, fishingAreas, aquacultureTypes]);

  const filteredLineOptions = useMemo(() => {
    if (!lineSearchQuery.trim()) return lineOptions;
    const q = lineSearchQuery.toLowerCase();
    return lineOptions.filter((l) => l.name.toLowerCase().includes(q));
  }, [lineOptions, lineSearchQuery]);

  const filteredSpeciesOptions = useMemo(() => {
    if (!speciesSearchQuery.trim()) return speciesLines;
    const q = speciesSearchQuery.toLowerCase();
    return speciesLines.filter((l) => l.name.toLowerCase().includes(q));
  }, [speciesLines, speciesSearchQuery]);

  const currentUnitOptions = useMemo(() => {
    if (activityType !== "pecuaria" || !livestockFormLines[activeLineIndex]) return [];
    const cfg = LIVESTOCK_UNIT_MAP[livestockFormLines[activeLineIndex].line_name];
    return cfg?.mode === "select" ? (cfg.options ?? []) : [];
  }, [activityType, livestockFormLines, activeLineIndex]);

  const currentSpecies = useMemo(() => {
    if (activityType === "pesca") return fishingFormLines[activeLineIndex]?.species ?? [];
    if (activityType === "acuicola") return aquacultureFormLines[activeLineIndex]?.species ?? [];
    return [];
  }, [activityType, fishingFormLines, aquacultureFormLines, activeLineIndex]);

  const assistantPickerConfig = useMemo(() => {
    switch (assistantPickerContext) {
      case "fishing_type":    return { title: "Tipo de pesca", options: typesOfFishing };
      case "fishing_area":    return { title: "Zona de pesca", options: fishingAreas };
      case "aquaculture_type": return { title: "Tipo de sistema", options: aquacultureTypes };
      case "cropping_area":   return { title: "Unidad de sistema de cultivo", options: croppingSystemAreas };
      default: return { title: "", options: [] };
    }
  }, [assistantPickerContext, typesOfFishing, fishingAreas, aquacultureTypes, croppingSystemAreas]);

  // ── Render ─────────────────────────────────────────────────────────────────

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
      {/* Config card */}
      <View style={styles.configSection}>
        <View style={styles.configCard}>
          <ThemedText type="defaultSemiBold" style={styles.configTitle}>Configuración</ThemedText>
          <View style={styles.configRow}>
            <View style={styles.configField}>
              <ThemedText style={styles.fieldLabel}>Tipo de actividad</ThemedText>
              <TouchableOpacity style={styles.typeSelector} onPress={() => setShowTypePicker(true)} activeOpacity={0.8}>
                <ThemedText style={styles.typeSelectorText}>{ACTIVITY_TYPE_LABELS[activityType]}</ThemedText>
                <ChevronDown size={responsiveFont(14)} color="#1a7a3a" />
              </TouchableOpacity>
            </View>
            <View style={styles.configFieldSmall}>
              <ThemedText style={styles.fieldLabel}>Líneas</ThemedText>
              <TextInput style={styles.countInput} value={lineCountInput} onChangeText={setLineCountInput} keyboardType="number-pad" maxLength={2} placeholder="1" placeholderTextColor="rgba(17, 24, 28, 0.4)" />
            </View>
          </View>
          <TouchableOpacity style={styles.createButton} onPress={handleCreate} activeOpacity={0.8}>
            <Plus size={responsiveFont(18)} color="#fff" />
            <ThemedText lightColor="#fff" darkColor="#fff" type="defaultSemiBold" style={styles.createButtonText}>Crear líneas</ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      {/* Carousel */}
      {unifiedLines.length > 0 ? (
        <View style={styles.carouselContainer}>
          <View style={styles.carouselHeader}>
            <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>Líneas productivas</ThemedText>
          </View>
          <PagerViewCompat style={[styles.pagerView, { height: pagerHeight }]} initialPage={0}>
            {unifiedLines.map((item) => (
              <View key={item.key} style={styles.pagerPage} collapsable={false}>
                <View style={styles.carouselCardWrapper} onLayout={handleCarouselCardLayout}>
                  <ExistingLineCard lineName={item.lineName} activityType={item.type} fields={item.fields} />
                </View>
              </View>
            ))}
          </PagerViewCompat>
          <TouchableOpacity style={styles.complementaryButton} onPress={handleOpenComplementarySheet} activeOpacity={0.8}>
            <ClipboardList size={responsiveFont(18)} color="#fff" />
            <ThemedText lightColor="#fff" darkColor="#fff" type="defaultSemiBold" style={styles.complementaryButtonText}>Datos complementarios</ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        formLines.length === 0 && (
          <View style={styles.emptyState}>
            <Sprout size={responsiveFont(40)} color="rgba(26,122,58,0.3)" />
            <ThemedText style={styles.emptyStateText}>No hay líneas productivas registradas</ThemedText>
            <ThemedText style={styles.emptyStateSubtext}>Use el botón "Crear líneas" para agregar nuevas líneas productivas.</ThemedText>
          </View>
        )
      )}

      {/* ── Type picker Modal ── */}
      <Modal visible={showTypePicker} transparent animationType="fade" onRequestClose={() => setShowTypePicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowTypePicker(false)}>
          <View style={styles.pickerContainer}>
            <ThemedText type="defaultSemiBold" style={styles.pickerTitle}>Tipo de actividad</ThemedText>
            {ACTIVITY_TYPES.map((type) => (
              <TouchableOpacity key={type} style={[styles.pickerOption, activityType === type && styles.pickerOptionSelected]} onPress={() => handleTypeChange(type)} activeOpacity={0.8}>
                <ThemedText style={[styles.pickerOptionText, activityType === type && styles.pickerOptionTextSelected]}>{ACTIVITY_TYPE_LABELS[type]}</ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Line picker Modal (agricola / pecuaria / forestal) ── */}
      <Modal visible={showLinePicker} transparent animationType="fade" onRequestClose={() => { setShowLinePicker(false); setLineSearchQuery(""); }}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { setShowLinePicker(false); setLineSearchQuery(""); }}>
          <View style={styles.linePickerContainer} onStartShouldSetResponder={() => true}>
            <ThemedText type="defaultSemiBold" style={styles.pickerTitle}>
              {activityType === "forestal" ? "Especie forestal" : "Línea productiva"}
            </ThemedText>
            <View style={styles.searchBox}>
              <Search size={responsiveFont(16)} color="#999" />
              <TextInput style={styles.searchInput} value={lineSearchQuery} onChangeText={setLineSearchQuery} placeholder="Buscar..." placeholderTextColor="rgba(17, 24, 28, 0.4)" autoCorrect={false} />
            </View>
            {loadingOptions ? (
              <ActivityIndicator size="small" color="#1a7a3a" style={{ marginVertical: verticalScale(20) }} />
            ) : (
              <ScrollView style={styles.linePickerScroll} keyboardShouldPersistTaps="handled">
                {filteredLineOptions.map((line) => (
                  <TouchableOpacity key={line.id} style={styles.pickerOption} onPress={() => handleSelectLine(line)} activeOpacity={0.8}>
                    <ThemedText style={styles.pickerOptionText}>{line.name}</ThemedText>
                  </TouchableOpacity>
                ))}
                {filteredLineOptions.length === 0 && <ThemedText style={styles.emptySearchText}>Sin resultados</ThemedText>}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Livestock unit picker Modal ── */}
      <Modal visible={showUnitPicker} transparent animationType="fade" onRequestClose={() => setShowUnitPicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowUnitPicker(false)}>
          <View style={styles.pickerContainer}>
            <ThemedText type="defaultSemiBold" style={styles.pickerTitle}>Producción promedio</ThemedText>
            {currentUnitOptions.map((unit) => {
              const selected = livestockFormLines[activeLineIndex]?.unit_of_measure === unit;
              return (
                <TouchableOpacity key={unit} style={[styles.pickerOption, selected && styles.pickerOptionSelected]} onPress={() => handleSelectUnit(unit)} activeOpacity={0.8}>
                  <ThemedText style={[styles.pickerOptionText, selected && styles.pickerOptionTextSelected]}>{unit}</ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Forest unit picker Modal ── */}
      <Modal visible={showForestUnitPicker} transparent animationType="fade" onRequestClose={() => setShowForestUnitPicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowForestUnitPicker(false)}>
          <View style={styles.pickerContainer}>
            <ThemedText type="defaultSemiBold" style={styles.pickerTitle}>Unidad de producción</ThemedText>
            {forestUnitOptions.map((unit) => {
              const selected = forestFormLines[activeLineIndex]?.unit_of_measure_id === String(unit.unit_id);
              return (
                <TouchableOpacity key={unit.id} style={[styles.pickerOption, selected && styles.pickerOptionSelected]} onPress={() => handleSelectForestUnit(unit)} activeOpacity={0.8}>
                  <ThemedText style={[styles.pickerOptionText, selected && styles.pickerOptionTextSelected]}>{unit.unit_of_measure_name}</ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Assistant picker Modal (single select) ── */}
      <Modal visible={showAssistantPicker} transparent animationType="fade" onRequestClose={() => setShowAssistantPicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAssistantPicker(false)}>
          <View style={styles.linePickerContainer} onStartShouldSetResponder={() => true}>
            <ThemedText type="defaultSemiBold" style={styles.pickerTitle}>{assistantPickerConfig.title}</ThemedText>
            <ScrollView style={styles.linePickerScroll} keyboardShouldPersistTaps="handled">
              {assistantPickerConfig.options.map((item) => (
                <TouchableOpacity key={item.id} style={styles.pickerOption} onPress={() => handleAssistantSelect(item)} activeOpacity={0.8}>
                  <ThemedText style={styles.pickerOptionText}>{item.name}</ThemedText>
                </TouchableOpacity>
              ))}
              {assistantPickerConfig.options.length === 0 && <ThemedText style={styles.emptySearchText}>Sin opciones disponibles</ThemedText>}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Species multi-select Modal ── */}
      <Modal visible={showSpeciesPicker} transparent animationType="fade" onRequestClose={() => { setShowSpeciesPicker(false); setSpeciesSearchQuery(""); }}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { setShowSpeciesPicker(false); setSpeciesSearchQuery(""); }}>
          <View style={styles.linePickerContainer} onStartShouldSetResponder={() => true}>
            <ThemedText type="defaultSemiBold" style={styles.pickerTitle}>Especies</ThemedText>
            <View style={styles.searchBox}>
              <Search size={responsiveFont(16)} color="#999" />
              <TextInput style={styles.searchInput} value={speciesSearchQuery} onChangeText={setSpeciesSearchQuery} placeholder="Buscar especie..." placeholderTextColor="rgba(17, 24, 28, 0.4)" autoCorrect={false} />
            </View>
            <ScrollView style={styles.linePickerScroll} keyboardShouldPersistTaps="handled">
              {filteredSpeciesOptions.map((sp) => {
                const isSelected = currentSpecies.some((s) => s.line_id === sp.id);
                return (
                  <TouchableOpacity key={sp.id} style={styles.speciesPickerOption} onPress={() => handleToggleSpecies({ line_id: sp.id, name: sp.name })} activeOpacity={0.8}>
                    <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                      {isSelected && <ThemedText lightColor="#fff" darkColor="#fff" style={styles.checkmark}>✓</ThemedText>}
                    </View>
                    <ThemedText style={styles.pickerOptionText}>{sp.name}</ThemedText>
                  </TouchableOpacity>
                );
              })}
              {filteredSpeciesOptions.length === 0 && <ThemedText style={styles.emptySearchText}>Sin resultados</ThemedText>}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Bottom Sheet ── */}
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
        <View style={styles.sheetHeader}>
          <ThemedText type="defaultSemiBold" style={styles.sheetTitle} lightColor="#333" darkColor="#333" numberOfLines={1}>
            {ACTIVITY_TYPE_LABELS[activityType]}
          </ThemedText>
          <TouchableOpacity style={styles.closeButton} onPress={() => setShowSheet(false)} activeOpacity={0.7}>
            <X size={responsiveFont(20)} color="#666" />
          </TouchableOpacity>
        </View>

        <GHScrollView ref={tabScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow} style={styles.tabsScroll}>
          {formLines.map((_, i) => (
            <TouchableOpacity key={i} style={[styles.lineTab, activeLineIndex === i && styles.lineTabActive]}
              onPress={() => { setActiveLineIndex(i); tabScrollRef.current?.scrollTo({ x: Math.max(0, i * widthScale(84) - widthScale(100)), animated: true }); }}
              activeOpacity={0.8}
            >
              <ThemedText lightColor={activeLineIndex === i ? "#fff" : "#555"} darkColor={activeLineIndex === i ? "#fff" : "#aaa"} style={styles.lineTabText}>Línea {i + 1}</ThemedText>
            </TouchableOpacity>
          ))}
        </GHScrollView>

        <BottomSheetScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
          {activityType === "agricola" && agriFormLines[activeLineIndex] && (
            <AgriculturalForm form={agriFormLines[activeLineIndex]} onSelectLine={() => setShowLinePicker(true)} onChange={(key, value) => handleAgriChange(activeLineIndex, key, value)} />
          )}
          {activityType === "pecuaria" && livestockFormLines[activeLineIndex] && (
            <LivestockForm form={livestockFormLines[activeLineIndex]} onSelectLine={() => setShowLinePicker(true)} onSelectUnit={() => setShowUnitPicker(true)} onChange={(key, value) => handleLivestockChange(activeLineIndex, key, value)} />
          )}
          {activityType === "forestal" && forestFormLines[activeLineIndex] && (
            <ForestForm form={forestFormLines[activeLineIndex]} onSelectLine={() => setShowLinePicker(true)} onSelectUnit={() => setShowForestUnitPicker(true)} onChange={(key, value) => handleForestChange(activeLineIndex, key, value)} />
          )}
          {activityType === "pesca" && fishingFormLines[activeLineIndex] && (
            <FishingForm
              form={fishingFormLines[activeLineIndex]}
              onSelectType={() => openAssistantPicker("fishing_type")}
              onSelectArea={() => openAssistantPicker("fishing_area")}
              onSelectSpecies={() => setShowSpeciesPicker(true)}
              onChange={(key, value) => handleFishingChange(activeLineIndex, key, value)}
            />
          )}
          {activityType === "acuicola" && aquacultureFormLines[activeLineIndex] && (
            <AquacultureForm
              form={aquacultureFormLines[activeLineIndex]}
              onSelectType={() => openAssistantPicker("aquaculture_type")}
              onSelectSpecies={() => setShowSpeciesPicker(true)}
              onSelectCroppingArea={() => openAssistantPicker("cropping_area")}
              onChange={(key, value) => handleAquacultureChange(activeLineIndex, key, value)}
            />
          )}

          <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving} activeOpacity={0.8}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : (
              <ThemedText lightColor="#fff" darkColor="#fff" type="defaultSemiBold" style={styles.saveButtonText}>Guardar</ThemedText>
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
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: verticalScale(12) },
  loadingText: { fontSize: responsiveFont(17) },
  configSection: { paddingHorizontal: CAROUSEL_PADDING, paddingTop: verticalScale(8), paddingBottom: verticalScale(8) },
  configCard: { backgroundColor: "#fff", borderRadius: widthScale(12), padding: widthScale(12), gap: verticalScale(8), shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  configTitle: { fontSize: responsiveFont(15), color: "#1a7a3a", textTransform: "uppercase", letterSpacing: 0.5 },
  configRow: { flexDirection: "row", alignItems: "flex-end", gap: widthScale(10) },
  configField: { flex: 1, gap: verticalScale(3) },
  configFieldSmall: { width: widthScale(70), gap: verticalScale(3) },
  fieldLabel: { fontSize: responsiveFont(13), color: "#555" },
  countInput: { height: verticalScale(38), borderWidth: 1.5, borderColor: "#e0e0e0", borderRadius: widthScale(8), paddingHorizontal: widthScale(10), fontSize: responsiveFont(15), textAlign: "center", color: "#333", backgroundColor: "#fafafa" },
  typeSelector: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: verticalScale(38), borderWidth: 1.5, borderColor: "#e0e0e0", borderRadius: widthScale(8), paddingHorizontal: widthScale(12), backgroundColor: "#fafafa" },
  typeSelectorText: { fontSize: responsiveFont(15), color: "#333" },
  createButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#1a7a3a", paddingVertical: verticalScale(10), borderRadius: widthScale(10), gap: widthScale(8) },
  createButtonText: { fontSize: responsiveFont(15) },
  carouselContainer: { flex: 1, marginBottom: TAB_BAR_RESERVED, gap: verticalScale(6) },
  carouselHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: CAROUSEL_PADDING },
  sectionTitle: { fontSize: responsiveFont(15), color: "#333" },
  pagerView: { flexGrow: 0 },
  pagerPage: { flex: 1, alignItems: "center", justifyContent: "flex-start", paddingTop: verticalScale(4) },
  pagerFallbackContainer: { alignItems: "stretch" },
  pagerFallbackPage: { width: SCREEN_WIDTH, alignItems: "center", justifyContent: "flex-start", paddingTop: verticalScale(4) },
  carouselCardWrapper: { width: CARD_WIDTH },
  complementaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#1a7a3a", borderRadius: widthScale(10), marginHorizontal: CAROUSEL_PADDING, marginTop: verticalScale(14), marginBottom: verticalScale(4), paddingVertical: verticalScale(10), gap: widthScale(8) },
  complementaryButtonText: { fontSize: responsiveFont(15) },
  existingCard: { backgroundColor: "#fff", borderRadius: widthScale(10), padding: widthScale(12), gap: verticalScale(8), shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  existingCardHeader: { flexDirection: "row", alignItems: "center", gap: widthScale(8), paddingBottom: verticalScale(4), borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
  existingCardTitle: { flex: 1, fontSize: responsiveFont(18), color: "#1a7a3a" },
  activityBadge: { paddingHorizontal: widthScale(8), paddingVertical: verticalScale(2), borderRadius: widthScale(6) },
  activityBadgeText: { fontSize: responsiveFont(13), fontWeight: "700" },
  existingCardGrid: { flexDirection: "row", flexWrap: "wrap", gap: verticalScale(8) },
  existingCardCell: { width: "48%", gap: verticalScale(2) },
  existingCardLabel: { fontSize: responsiveFont(15), color: "#666" },
  existingCardValue: { fontSize: responsiveFont(17), color: "#333", fontWeight: "600" },
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: verticalScale(40), gap: verticalScale(10) },
  emptyStateText: { fontSize: responsiveFont(16), color: "#555", fontWeight: "600" },
  emptyStateSubtext: { fontSize: responsiveFont(14), color: "#888", textAlign: "center", paddingHorizontal: widthScale(20) },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center", paddingHorizontal: widthScale(24) },
  pickerContainer: { width: "100%", backgroundColor: "#fff", borderRadius: widthScale(16), padding: widthScale(16), gap: verticalScale(4) },
  linePickerContainer: { width: "100%", maxHeight: "70%", backgroundColor: "#fff", borderRadius: widthScale(16), padding: widthScale(16), gap: verticalScale(8) },
  linePickerScroll: { maxHeight: verticalScale(400) },
  searchBox: { flexDirection: "row", alignItems: "center", gap: widthScale(8), borderWidth: 1.5, borderColor: "#e0e0e0", borderRadius: widthScale(8), paddingHorizontal: widthScale(10), backgroundColor: "#fafafa" },
  searchInput: { flex: 1, height: verticalScale(38), fontSize: responsiveFont(15), color: "#333" },
  emptySearchText: { textAlign: "center", fontSize: responsiveFont(14), color: "#888", paddingVertical: verticalScale(16) },
  pickerTitle: { fontSize: responsiveFont(16), color: "#333", marginBottom: verticalScale(8), textAlign: "center" },
  pickerOption: { paddingVertical: verticalScale(11), paddingHorizontal: widthScale(14), borderRadius: widthScale(8) },
  pickerOptionSelected: { backgroundColor: "#1a7a3a" },
  pickerOptionText: { fontSize: responsiveFont(15), color: "#333" },
  pickerOptionTextSelected: { color: "#fff", fontWeight: "600" },
  speciesPickerOption: { flexDirection: "row", alignItems: "center", paddingVertical: verticalScale(10), paddingHorizontal: widthScale(14), borderRadius: widthScale(8), gap: widthScale(10) },
  checkbox: { width: widthScale(20), height: widthScale(20), borderRadius: widthScale(4), borderWidth: 2, borderColor: "#ccc", justifyContent: "center", alignItems: "center" },
  checkboxSelected: { backgroundColor: "#1a7a3a", borderColor: "#1a7a3a" },
  checkmark: { fontSize: responsiveFont(13), fontWeight: "700" },
  sheetBackground: { backgroundColor: "#f4fbf7", borderTopLeftRadius: widthScale(24), borderTopRightRadius: widthScale(24) },
  handleIndicator: { backgroundColor: "#11181C", width: widthScale(40) },
  sheetHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: widthScale(16), paddingTop: verticalScale(4), paddingBottom: verticalScale(12), borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" },
  sheetTitle: { flex: 1, fontSize: responsiveFont(20) },
  closeButton: { width: widthScale(36), height: widthScale(36), borderRadius: widthScale(18), backgroundColor: "rgba(0,0,0,0.05)", justifyContent: "center", alignItems: "center", marginLeft: widthScale(12) },
  tabsScroll: { borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" },
  tabsRow: { paddingHorizontal: widthScale(12), paddingVertical: verticalScale(8), gap: widthScale(8), flexDirection: "row", alignItems: "center" },
  lineTab: { paddingVertical: verticalScale(6), paddingHorizontal: widthScale(14), borderRadius: widthScale(20), backgroundColor: "#e8e8e8" },
  lineTabActive: { backgroundColor: "#1a7a3a" },
  lineTabText: { fontSize: responsiveFont(14), fontWeight: "600" },
  formContent: { paddingHorizontal: widthScale(16), paddingTop: verticalScale(12), paddingBottom: verticalScale(32), gap: verticalScale(4) },
  lineForm: { gap: verticalScale(16) },
  questionBlock: { gap: verticalScale(6) },
  questionLabel: { fontSize: responsiveFont(15), fontWeight: "600", color: "#333" },
  textInput: { borderWidth: 1.5, borderColor: "#ddd", borderRadius: widthScale(8), paddingVertical: verticalScale(10), paddingHorizontal: widthScale(12), fontSize: responsiveFont(15), color: "#333", backgroundColor: "#fff" },
  listSelector: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1.5, borderColor: "#ddd", borderRadius: widthScale(8), paddingVertical: verticalScale(10), paddingHorizontal: widthScale(12), backgroundColor: "#fff" },
  listSelectorText: { flex: 1, fontSize: responsiveFont(15), color: "#333" },
  listSelectorPlaceholder: { flex: 1, fontSize: responsiveFont(15), color: "rgba(17, 24, 28, 0.4)" },
  fixedValueContainer: { justifyContent: "center", backgroundColor: "#f0f7f2", borderColor: "#b7d8c4" },
  fixedValueText: { fontSize: responsiveFont(15), color: "#1a7a3a", fontWeight: "600" },
  fixedValuePlaceholder: { fontSize: responsiveFont(14), color: "#999", fontStyle: "italic" },
  saveButton: { backgroundColor: "#1a7a3a", paddingVertical: verticalScale(14), borderRadius: widthScale(10), alignItems: "center", marginTop: verticalScale(20) },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: responsiveFont(16) },
});
