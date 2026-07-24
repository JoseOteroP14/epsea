import { ClassificationTab } from "@/components/producer/classification-tab";
import { ThemedText } from "@/components/themed-text";
import { useAlert } from "@/components/ui/custom-alert";
import { checkConnectivity } from "@/hooks/use-network";
import { useProducerFormDraft } from "@/hooks/use-producer-form-draft";
import {
  createEmptyVisit3Form,
  mapFormToCreatePayload,
  mapFormToUpdatePayload,
  mapResponseToForm,
  sectionAccompanimentComplete,
  sectionTechnicalFocusComplete,
  VISIT3_ASPECTS,
  VISIT3_MAX_PHOTOS,
  VISIT3_PHOTO_LABELS,
  type Visit3AspectId,
  type Visit3FormValues,
  type Visit3Response,
  type Visit3TrackingRow,
} from "@/schemas/visit3";
import { useAuthStore } from "@/store/useAuthStore";
import {
  useCharacterizationStore,
  VISIT3_CLASSIFICATION_INTERVENTION_METHOD_ID,
  VISIT3_REGISTRATION_INTERVENTION_METHOD_ID,
} from "@/store/useCharacterizationStore";
import { useProducerStore } from "@/store/useProducerStore";
import { useSyncStore } from "@/store/useSyncStore";
import {
  getObjectivesForEventAndLine,
  objectiveItemsToFormStrings,
  parseObjectiveDisplayBlocks,
  readProductionLineId,
  VISIT_OBJECTIVE_EVENT_IDS,
} from "@/utils/agro-objectives";
import { NetworkError } from "@/utils/api";
import { markInterventionMethodApplied } from "@/utils/database/repositories/producer-intervention-repository";
import {
  getVisitServerCacheRaw,
  upsertVisitServerCache,
} from "@/utils/database/repositories/server-extensionist-cache-repository";
import {
  enqueueVisit3,
  getPendingLocalVisit3,
  type Visit3LocalPhoto,
  type Visit3QueueExtras,
  type Visit3QueueTracking,
} from "@/utils/database/repositories/visit3-repository";
import {
  convertVisit3PhotosToBase64,
  generateAndPrintVisit3Pdf,
  type Visit3PdfAspectBlock,
  type Visit3PdfData,
} from "@/utils/pdf/visit3-pdf";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import {
  createMonitoringCommitment as apiCreateMonitoringCommitment,
  createVisit3 as apiCreateVisit3,
  deleteMonitoringCommitment as apiDeleteMonitoringCommitment,
  deleteVisit3Image as apiDeleteVisit3Image,
  getVisit3 as apiGetVisit3,
  updateMonitoringCommitment as apiUpdateMonitoringCommitment,
  updateVisit3 as apiUpdateVisit3,
  uploadVisit3Images as apiUploadVisit3Images,
  getVisit3ImageUrl,
} from "@/utils/visit3-service";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import {
  ImageOptimizationError,
  optimizeImageToWebp,
} from "@/utils/optimize-image";
import { persistLocalVisitPhotoSlots } from "@/utils/visit-offline-photos";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileDown,
  FileText,
  ImagePlus,
  Lock,
  MessageSquare,
  PencilLine,
  Save,
  Sparkles,
  Target,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ─── Config ─────────────────────────────────────────────────────────────

interface Visit3TabProps {
  producerId: string;
  projectId?: string;
}

const ATTENDANCE_OPTIONS = [
  { id: "1", label: "Usuario" },
  { id: "2", label: "Trabajador UP" },
  { id: "3", label: "Persona núcleo familiar" },
  { id: "4", label: "Otro" },
] as const;

type Step = "clasificacion" | "registro";

type SectionKey =
  | "attendance"
  | "objective"
  | "specific_objectives"
  | "commitment_followup"
  | "recommendations"
  | "observations"
  | "photos"
  | "aspects"
  | "extensionist";

interface SectionConfig {
  key: SectionKey;
  label: string;
  shortLabel: string;
  sectionNum: string;
  icon: typeof Target;
  color: string;
}

const SECTIONS: SectionConfig[] = [
  { key: "attendance", label: "Datos del Acompañamiento", shortLabel: "Acompañ.", sectionNum: "1", icon: Users, color: "#d97706" },
  { key: "objective", label: "Objetivo General del Acompañamiento", shortLabel: "Obj. General", sectionNum: "5", icon: Target, color: "#1a7a3a" },
  { key: "specific_objectives", label: "Objetivos Específicos", shortLabel: "Obj. Específicos", sectionNum: "5.0", icon: Target, color: "#1a7a3a" },
  { key: "commitment_followup", label: "Seguimiento a recomendaciones/compromisos", shortLabel: "Seguimiento", sectionNum: "5.1", icon: ClipboardList, color: "#0284c7" },
  { key: "recommendations", label: "Recomendaciones técnicas para la comunidad productiva", shortLabel: "Recomend.", sectionNum: "5.2", icon: FileText, color: "#0284c7" },
  { key: "observations", label: "Observaciones", shortLabel: "Observac.", sectionNum: "5.3", icon: MessageSquare, color: "#0284c7" },
  { key: "photos", label: "Registro Fotográfico", shortLabel: "Fotos", sectionNum: "5.4", icon: Camera, color: "#059669" },
  { key: "aspects", label: "Justificaciones de la Clasificación (5 aspectos)", shortLabel: "Aspectos", sectionNum: "6", icon: Sparkles, color: "#7c3aed" },
  { key: "extensionist", label: "Datos del Extensionista", shortLabel: "Extensionista", sectionNum: "7", icon: UserCheck, color: "#334155" },
];

interface Visit3FormDraft {
  form: Visit3FormValues;
  localPhotos: (Visit3LocalPhoto | null)[];
  expandedSections: SectionKey[];
  pendingImageDeletions: number[];
  pendingCommitmentDeletions: number[];
}

// ─── Helpers ────────────────────────────────────────────────────────────

function todayString(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return "";
  const cleaned = dateStr.split(" ")[0]!;
  const parts = cleaned.split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  const months = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  const monthName = months[Number(m) - 1] ?? m;
  return `${d} de ${monthName} de ${y}`;
}

// ─── Component ─────────────────────────────────────────────────────────

export function Visit3Tab({ producerId, projectId }: Visit3TabProps) {
  const { showAlert } = useAlert();

  const authUser = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const producerDetail = useProducerStore((s) => s.producerDetail);
  const isUploading = useSyncStore((s) => s.isUploading);

  // Steps
  const [activeStep, setActiveStep] = useState<Step>("clasificacion");
  const [classificationCompleted, setClassificationCompleted] = useState(false);
  const [checkingClassification, setCheckingClassification] = useState(true);

  // Sheets
  const sheetRef = useRef<BottomSheetModal>(null);
  const sheetSnapPoints = useMemo(() => ["94%"], []);

  // Form state
  const [form, setForm] = useState<Visit3FormValues>(() => createEmptyVisit3Form());
  const [existingVisitId, setExistingVisitId] = useState<number | null>(null);
  const [existingImages, setExistingImages] = useState<
    ({ id: number; filename?: string } | null)[]
  >([null, null, null]);
  const [localPhotos, setLocalPhotos] = useState<(Visit3LocalPhoto | null)[]>([
    null,
    null,
    null,
  ]);
  const [pendingImageDeletions, setPendingImageDeletions] = useState<number[]>([]);
  const [pendingCommitmentDeletions, setPendingCommitmentDeletions] = useState<
    number[]
  >([]);

  // Gate
  const [visit2Exists, setVisit2Exists] = useState<boolean | null>(null);
  const [visit2Raw, setVisit2Raw] = useState<{
    recommendations_commitments?: string | null;
    monitoring_commitments?: { id?: number; activity?: string }[];
  } | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<SectionKey>>(
    new Set(["attendance"]),
  );
  const [showAttendanceDropdown, setShowAttendanceDropdown] = useState(false);
  const [objectivesApiLoading, setObjectivesApiLoading] = useState(false);
  const [deletingPhotoIndex, setDeletingPhotoIndex] = useState<number | null>(
    null,
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const prevUploadingRef = useRef(false);

  const { saveDraft, readDraft, clearDraft } = useProducerFormDraft<Visit3FormDraft>({
    producerId,
    projectId,
    scope: "visit3",
  });
  const [draftHydrated, setDraftHydrated] = useState(false);
  const skipNextPersistRef = useRef(false);

  // Refresh when upload cycle finishes
  useEffect(() => {
    if (prevUploadingRef.current && !isUploading) {
      setRefreshKey((k) => k + 1);
    }
    prevUploadingRef.current = isUploading;
  }, [isUploading]);

  // ── Check Visita 2 exists (gate) ────────────────────────────────────────
  useEffect(() => {
    if (!producerId || !projectId) return;
    let cancelled = false;
    (async () => {
      const uid = authUser?.user_id ?? 0;
      const pid = Number(producerId);
      const projId = Number(projectId);

      let visit2: unknown = null;
      try {
        const online = await checkConnectivity();
        if (online) {
          const { apiFetch } = await import("@/utils/api");
          const res = await apiFetch<{ data: unknown }>(
            `/visit-2/project/${projId}/producer/${pid}`,
          );
          visit2 = res?.data ?? null;
        }
      } catch {
        visit2 = null;
      }
      if (!visit2 && uid > 0) {
        const raw = await getVisitServerCacheRaw("visit2", pid, projId, uid);
        if (raw) {
          try {
            visit2 = JSON.parse(raw);
          } catch {
            visit2 = null;
          }
        }
      }
      if (cancelled) return;
      const hasVisit2 =
        !!visit2 && typeof visit2 === "object" && (visit2 as any)?.id != null;
      setVisit2Exists(hasVisit2);
      setVisit2Raw(hasVisit2 ? (visit2 as any) : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [producerId, projectId, authUser?.user_id, refreshKey]);

  // ── Check Classification (method 9) applied ────────────────────────────
  useEffect(() => {
    if (!producerId || !projectId || !authUser?.user_id) return;
    let cancelled = false;
    (async () => {
      setCheckingClassification(true);
      const pid = Number(producerId);
      const projId = Number(projectId);
      const applied = await useCharacterizationStore
        .getState()
        .hasInterventionMethodApplied(
          pid,
          projId,
          VISIT3_CLASSIFICATION_INTERVENTION_METHOD_ID,
        );
      if (!cancelled) {
        setClassificationCompleted(applied);
        setCheckingClassification(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [producerId, projectId, authUser?.user_id, refreshKey]);

  // ── Load existing Visit 3 ──────────────────────────────────────────────
  useEffect(() => {
    if (!producerId || !projectId) return;
    let cancelled = false;
    setDraftHydrated(false);
    (async () => {
      setLoading(true);
      try {
        const uid = authUser?.user_id ?? 0;
        const pid = Number(producerId);
        const projId = Number(projectId);

        const online = await checkConnectivity();
        let data: Visit3Response | null = null;

        const pendingLocal = uid > 0
          ? await getPendingLocalVisit3(pid, projId, uid)
          : null;

        // Priorizar pendiente local (borrador o edición sin sincronizar).
        if (pendingLocal) {
          try {
            const extras = JSON.parse(pendingLocal.photos ?? "{}") as Visit3QueueExtras;
            if (extras.update_payload) {
              const parsedForm = mapResponseToForm({
                id: extras.remote_visit_3_id ?? 0,
                project_id: extras.update_payload.project_id,
                producer_id: extras.update_payload.producer_id,
                registration_date: extras.update_payload.registration_date,
                origin: extras.update_payload.origin,
                attendance_id: extras.update_payload.attendance_id,
                attendance_identification:
                  extras.update_payload.attendance_identification,
                attendance_name: extras.update_payload.attendance_name,
                general_objective: extras.update_payload.general_objective,
                specific_objectives: extras.update_payload.specific_objectives,
                technical_recommendations:
                  extras.update_payload.technical_recommendations,
                observations: extras.update_payload.observations,
                aspect_1_justification:
                  extras.update_payload.aspect_1_justification,
                aspect_2_justification:
                  extras.update_payload.aspect_2_justification,
                aspect_3_justification:
                  extras.update_payload.aspect_3_justification,
                aspect_4_justification:
                  extras.update_payload.aspect_4_justification,
                aspect_5_justification:
                  extras.update_payload.aspect_5_justification,
                images: [],
                monitoring_commitments: extras.trackings.map((t) => ({
                  id: t.id,
                  activity: t.activity,
                  percentage_compliance: t.percentage_compliance,
                  appropriation_in_field: t.appropriation_in_field,
                })),
              });
              if (!cancelled) {
                setForm(parsedForm);
                setExistingVisitId(extras.remote_visit_3_id ?? null);
                setIsEditMode(extras.remote_visit_3_id != null);
              }
            } else {
              const payload = JSON.parse(pendingLocal.payload);
              const parsedForm = createEmptyVisit3Form();
              const [d, t] = String(payload.registration_date ?? "").split(" ");
              parsedForm.registration_date = d ?? "";
              parsedForm.registration_time = t || "09:00:00";
              parsedForm.attendance_id = String(payload.attendance_id ?? "");
              parsedForm.attendance_name = payload.attendance_name ?? "";
              parsedForm.attendance_identification =
                payload.attendance_identification ?? "";
              parsedForm.usuario_acepta_servicio = "si";
              parsedForm.general_objective = payload.general_objective ?? "";
              parsedForm.specific_objectives = payload.specific_objectives ?? "";
              parsedForm.technical_recommendations =
                payload.technical_recommendations ?? "";
              parsedForm.observations = payload.observations ?? "";
              parsedForm.aspect_justifications.aspecto1 =
                payload.aspect_1_justification ?? "";
              parsedForm.aspect_justifications.aspecto2 =
                payload.aspect_2_justification ?? "";
              parsedForm.aspect_justifications.aspecto3 =
                payload.aspect_3_justification ?? "";
              parsedForm.aspect_justifications.aspecto4 =
                payload.aspect_4_justification ?? "";
              parsedForm.aspect_justifications.aspecto5 =
                payload.aspect_5_justification ?? "";
              parsedForm.commitments_tracking = (extras.trackings ?? []).map(
                (t) => ({
                  id: t.id,
                  activity: t.activity ?? "",
                  percentage_compliance:
                    t.percentage_compliance != null
                      ? String(t.percentage_compliance)
                      : "",
                  appropriation_in_field: t.appropriation_in_field ?? "",
                }),
              );
              if (!cancelled) {
                setForm(parsedForm);
                setExistingVisitId(extras.remote_visit_3_id ?? null);
                setIsEditMode(extras.remote_visit_3_id != null);
              }
            }
            if (!cancelled) {
              setLocalPhotos([
                extras.photos?.[0] ?? null,
                extras.photos?.[1] ?? null,
                extras.photos?.[2] ?? null,
              ]);
              setPendingImageDeletions(extras.pendingImageDeletions ?? []);
              setPendingCommitmentDeletions(
                extras.pendingCommitmentDeletions ?? [],
              );
            }
          } catch (e) {
            console.warn("No se pudo hidratar Visita 3 desde cola local:", e);
          }
        } else {
          if (online) {
            try {
              data = await apiGetVisit3(projId, pid);
              if (data && uid > 0) {
                await upsertVisitServerCache({
                  userId: uid,
                  producerId: pid,
                  projectId: projId,
                  kind: "visit3",
                  jsonPayload: JSON.stringify(data),
                });
              }
            } catch (e) {
              if (e instanceof NetworkError) data = null;
            }
          }
          if (!data && uid > 0) {
            const raw = await getVisitServerCacheRaw("visit3", pid, projId, uid);
            if (raw) {
              try {
                data = JSON.parse(raw) as Visit3Response;
              } catch {
                data = null;
              }
            }
          }
          if (cancelled) return;
          if (data) {
            setForm(mapResponseToForm(data));
            setExistingVisitId(data.id);
            setIsEditMode(true);
            const imgs = (data.images ?? []).slice(0, VISIT3_MAX_PHOTOS);
            const nextImgs: (typeof existingImages)[number][] = [null, null, null];
            imgs.forEach((img, i) => {
              nextImgs[i] = { id: img.id, filename: img.filename };
            });
            setExistingImages(nextImgs);
            setLocalPhotos([null, null, null]);
          } else {
            const empty = createEmptyVisit3Form();
            empty.registration_date = todayString();
            setForm(empty);
            setExistingVisitId(null);
            setIsEditMode(false);
            setExistingImages([null, null, null]);
            setLocalPhotos([null, null, null]);
          }
          setPendingImageDeletions([]);
          setPendingCommitmentDeletions([]);
        }

        // Restore in-memory draft after API/queue hydrate (new + edit).
        const draft = readDraft();
        if (draft && !cancelled) {
          if (draft.form) setForm(draft.form);
          if (Array.isArray(draft.localPhotos)) {
            setLocalPhotos([
              draft.localPhotos[0] ?? null,
              draft.localPhotos[1] ?? null,
              draft.localPhotos[2] ?? null,
            ]);
          }
          if (Array.isArray(draft.expandedSections)) {
            setExpandedSections(new Set(draft.expandedSections));
          }
          if (Array.isArray(draft.pendingImageDeletions)) {
            setPendingImageDeletions(draft.pendingImageDeletions);
          }
          if (Array.isArray(draft.pendingCommitmentDeletions)) {
            setPendingCommitmentDeletions(draft.pendingCommitmentDeletions);
          }
        }
      } catch (e) {
        console.warn("No se pudo consultar Visita 3 existente:", e);
      } finally {
        if (!cancelled) {
          skipNextPersistRef.current = true;
          setDraftHydrated(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [producerId, projectId, authUser?.user_id, refreshKey, readDraft]);

  // Persist in-memory draft on form edits (after load + hydrate).
  useEffect(() => {
    if (loading || !draftHydrated) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    saveDraft({
      form,
      localPhotos,
      expandedSections: Array.from(expandedSections),
      pendingImageDeletions,
      pendingCommitmentDeletions,
    });
  }, [
    loading,
    draftHydrated,
    form,
    localPhotos,
    expandedSections,
    pendingImageDeletions,
    pendingCommitmentDeletions,
    saveDraft,
  ]);

  // ── Load objectives for event 6 ────────────────────────────────────────
  useEffect(() => {
    if (!producerId || !projectId || loading) return;
    const lineId = readProductionLineId(
      producerDetail as { production_line_id?: number | null } | null,
    );
    if (lineId == null) return;
    let cancelled = false;
    setObjectivesApiLoading(true);
    (async () => {
      const items = await getObjectivesForEventAndLine(
        VISIT_OBJECTIVE_EVENT_IDS.visit3,
        lineId,
      );
      if (cancelled) return;
      setObjectivesApiLoading(false);
      if (!items || items.length === 0) return;
      const { general, specific } = objectiveItemsToFormStrings(items);
      setForm((prev) => ({
        ...prev,
        general_objective: prev.general_objective.trim() || general,
        specific_objectives: prev.specific_objectives.trim() || specific,
      }));
    })();
    return () => {
      cancelled = true;
      setObjectivesApiLoading(false);
    };
  }, [producerId, projectId, producerDetail, loading]);

  // ── Prefill commitments from Visita 2 for new entries ─────────────────
  useEffect(() => {
    if (isEditMode || !visit2Raw) return;
    if (form.commitments_tracking.length > 0) return;
    const rows: Visit3TrackingRow[] = [];
    // Prefer server monitoring_commitments (already curated by Visita 2 dialog).
    const remoteMc = visit2Raw.monitoring_commitments ?? [];
    if (Array.isArray(remoteMc) && remoteMc.length > 0) {
      for (const c of remoteMc) {
        const activity = String(c.activity ?? "").trim();
        if (!activity) continue;
        rows.push({
          activity,
          percentage_compliance: "",
          appropriation_in_field: "",
        });
      }
    } else {
      // Fallback: parse recommendations_commitments plaintext
      const raw = String(visit2Raw.recommendations_commitments ?? "").trim();
      if (raw) {
        for (const line of raw
          .split(/\r?\n/)
          .map((s) =>
            s.replace(/^\s*(?:[\u2022•]|[-*]|\d+\.)\s+/, "").trim(),
          )
          .filter(Boolean)) {
          rows.push({
            activity: line,
            percentage_compliance: "",
            appropriation_in_field: "",
          });
        }
      }
    }
    if (rows.length > 0) {
      setForm((prev) => ({ ...prev, commitments_tracking: rows }));
    }
  }, [isEditMode, visit2Raw, form.commitments_tracking.length]);

  // ── Section status ─────────────────────────────────────────────────────
  const sectionStatus = useMemo(() => {
    const hasPhotos =
      localPhotos.some((p) => p !== null) ||
      existingImages.some((p) => p !== null);
    return {
      attendance: sectionAccompanimentComplete(form),
      objective: !!form.general_objective.trim(),
      specific_objectives: !!form.specific_objectives.trim(),
      commitment_followup:
        form.commitments_tracking.length === 0 ||
        form.commitments_tracking.every(
          (r) =>
            r.percentage_compliance.trim() !== "" &&
            r.appropriation_in_field.trim() !== "",
        ),
      recommendations: !!form.technical_recommendations.trim(),
      observations: !!form.observations.trim(),
      photos: hasPhotos,
      aspects: Object.values(form.aspect_justifications).every(
        (v) => (v ?? "").trim().length > 0,
      ),
      extensionist: true,
    };
  }, [form, localPhotos, existingImages]);

  const completedCount = Object.values(sectionStatus).filter(Boolean).length;

  // ── Sheet handlers ─────────────────────────────────────────────────────
  const openSheet = useCallback(() => {
    sheetRef.current?.present();
  }, []);

  const handleSheetChange = useCallback((_index: number) => {
    // no-op — kept for future analytics or keyboard hooks
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

  const toggleSection = useCallback((key: SectionKey) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ── Photo handling ────────────────────────────────────────────────────

  const clearExistingImageSlot = useCallback((index: number) => {
    setExistingImages((prev) => {
      const n = [...prev];
      n[index] = null;
      return n;
    });
  }, []);

  const applyOptimizedPhoto = useCallback(
    async (
      index: number,
      asset: { uri: string; fileName?: string | null; width?: number; height?: number },
    ) => {
      try {
        const optimized = await optimizeImageToWebp({
          uri: asset.uri,
          fileName: asset.fileName || `visit3_${Date.now()}_${index}.jpg`,
          width: asset.width,
          height: asset.height,
        });
        const photo: Visit3LocalPhoto = {
          uri: optimized.uri,
          fileName: optimized.fileName,
          type: optimized.type,
        };
        if (existingImages[index]) {
          try {
            await apiDeleteVisit3Image(existingImages[index]!.id);
          } catch {
            /* se reemplaza en UI; si falla el DELETE se reintenta al sincronizar */
            setPendingImageDeletions((prev) => {
              const id = existingImages[index]!.id;
              return prev.includes(id) ? prev : [...prev, id];
            });
          }
          clearExistingImageSlot(index);
        }
        setLocalPhotos((prev) => {
          const n = [...prev];
          n[index] = photo;
          return n;
        });
      } catch (e) {
        const message =
          e instanceof ImageOptimizationError
            ? e.message
            : "No se pudo optimizar la imagen. Intente con otro archivo.";
        showAlert({
          title:
            e instanceof ImageOptimizationError
              ? "Imagen demasiado grande"
              : "Error al optimizar",
          message,
          type: "warning",
        });
      }
    },
    [clearExistingImageSlot, existingImages, showAlert],
  );

  const pickImage = useCallback(
    async (index: number) => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        showAlert({
          title: "Permisos",
          message: "Se necesitan permisos para acceder a la galería.",
          type: "warning",
        });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]) return;
      await applyOptimizedPhoto(index, result.assets[0]);
    },
    [applyOptimizedPhoto, showAlert],
  );

  const takePhoto = useCallback(
    async (index: number) => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        showAlert({
          title: "Permisos",
          message: "Se necesitan permisos para acceder a la cámara.",
          type: "warning",
        });
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 1 });
      if (result.canceled || !result.assets?.[0]) return;
      await applyOptimizedPhoto(index, result.assets[0]);
    },
    [applyOptimizedPhoto, showAlert],
  );

  const showPhotoOptions = useCallback(
    (index: number) => {
      showAlert({
        title: "Agregar imagen",
        message: "Seleccione una opción",
        type: "info",
        buttons: [
          { text: "Cámara", onPress: () => takePhoto(index) },
          { text: "Galería", onPress: () => pickImage(index) },
        ],
      });
    },
    [pickImage, showAlert, takePhoto],
  );

  const removePhoto = useCallback(
    async (index: number) => {
      const existing = existingImages[index];
      if (existing) {
        setDeletingPhotoIndex(index);
        const online = await checkConnectivity();
        if (online) {
          try {
            await apiDeleteVisit3Image(existing.id);
          } catch {
            showAlert({
              title: "Error",
              message: "No se pudo eliminar la imagen",
              type: "error",
            });
            setDeletingPhotoIndex(null);
            return;
          }
        } else {
          setPendingImageDeletions((prev) =>
            prev.includes(existing.id) ? prev : [...prev, existing.id],
          );
        }
        clearExistingImageSlot(index);
        setDeletingPhotoIndex(null);
      }
      setLocalPhotos((prev) => {
        const n = [...prev];
        n[index] = null;
        return n;
      });
    },
    [clearExistingImageSlot, existingImages, showAlert],
  );

  // ── Form mutation helpers ─────────────────────────────────────────────

  const setField = useCallback(
    <K extends keyof Visit3FormValues>(key: K, value: Visit3FormValues[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const setAspectJustification = useCallback(
    (id: Visit3AspectId, value: string) => {
      setForm((prev) => ({
        ...prev,
        aspect_justifications: { ...prev.aspect_justifications, [id]: value },
      }));
    },
    [],
  );

  const updateCommitment = useCallback(
    (index: number, patch: Partial<Visit3TrackingRow>) => {
      setForm((prev) => {
        const rows = [...prev.commitments_tracking];
        const current = rows[index];
        if (!current) return prev;
        rows[index] = { ...current, ...patch };
        return { ...prev, commitments_tracking: rows };
      });
    },
    [],
  );

  const removeCommitment = useCallback((index: number) => {
    setForm((prev) => {
      const row = prev.commitments_tracking[index];
      const rows = prev.commitments_tracking.filter((_, i) => i !== index);
      if (row?.id != null) {
        setPendingCommitmentDeletions((d) =>
          d.includes(row.id!) ? d : [...d, row.id!],
        );
      }
      return { ...prev, commitments_tracking: rows };
    });
  }, []);

  const addCommitment = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      commitments_tracking: [
        ...prev.commitments_tracking,
        { activity: "", percentage_compliance: "", appropriation_in_field: "" },
      ],
    }));
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────

  const validateForm = useCallback((): string | null => {
    if (!sectionAccompanimentComplete(form))
      return "Complete los datos del acompañamiento (fecha, hora y quién atiende).";
    if (!form.technical_recommendations.trim())
      return "Ingrese recomendaciones técnicas para la comunidad productiva.";
    if (!sectionTechnicalFocusComplete(form))
      return "Complete las cinco justificaciones de los aspectos.";
    if (
      form.commitments_tracking.some(
        (r) =>
          r.activity.trim() !== "" &&
          (r.percentage_compliance.trim() === "" ||
            r.appropriation_in_field.trim() === ""),
      )
    ) {
      return "Complete el porcentaje y apropiación de cada seguimiento agregado.";
    }
    const totalPhotos =
      localPhotos.filter(Boolean).length + existingImages.filter(Boolean).length;
    if (!isEditMode && totalPhotos === 0)
      return "Debe adjuntar al menos una fotografía al crear la Visita 3.";
    return null;
  }, [form, localPhotos, existingImages, isEditMode]);

  const collectPhotosForSave = useCallback(
    (): Visit3LocalPhoto[] =>
      localPhotos.filter(
        (p): p is Visit3LocalPhoto => p !== null && !!p.uri,
      ),
    [localPhotos],
  );

  const collectTrackings = useCallback(
    (): Visit3QueueTracking[] =>
      form.commitments_tracking
        .filter(
          (r) =>
            r.activity.trim() ||
            r.appropriation_in_field.trim() ||
            r.percentage_compliance.trim(),
        )
        .map((r) => ({
          id: r.id,
          activity: r.activity.trim(),
          percentage_compliance:
            Number(r.percentage_compliance.replace(/[^0-9]/g, "")) || 0,
          appropriation_in_field: r.appropriation_in_field.trim(),
        })),
    [form.commitments_tracking],
  );

  const handleSave = useCallback(async () => {
    if (!producerId || !projectId || !authUser?.user_id) return;
    const err = validateForm();
    if (err) {
      showAlert({ title: "Campo requerido", message: err, type: "warning" });
      return;
    }
    setSaving(true);
    const pid = Number(producerId);
    const projId = Number(projectId);
    const userId = authUser.user_id;
    const meta = { projectId: projId, producerId: pid };

    const photos = collectPhotosForSave();
    const trackings = collectTrackings();

    const isOnline = await checkConnectivity();

    try {
      if (isOnline && !existingVisitId) {
        const createPayload = mapFormToCreatePayload(form, meta);
        const { visit, conflictExisting } = await apiCreateVisit3(
          createPayload,
          photos,
        );
        let created = visit;
        if (!created && conflictExisting) {
          // Backend responded 409 → convertir a update
          const updatePayload = mapFormToUpdatePayload(form, meta);
          created = await apiUpdateVisit3(conflictExisting.id, updatePayload);
          for (const t of trackings) {
            if (t.id != null) {
              await apiUpdateMonitoringCommitment(t.id, {
                activity: t.activity,
                percentage_compliance: t.percentage_compliance,
                appropriation_in_field: t.appropriation_in_field,
              });
            } else if (t.activity.trim()) {
              await apiCreateMonitoringCommitment(conflictExisting.id, {
                activity: t.activity,
                percentage_compliance: t.percentage_compliance,
                appropriation_in_field: t.appropriation_in_field,
              });
            }
          }
          if (photos.length > 0) {
            await apiUploadVisit3Images(conflictExisting.id, photos);
          }
          setExistingVisitId(conflictExisting.id);
          setIsEditMode(true);
        }
        await markInterventionMethodApplied(
          pid,
          projId,
          VISIT3_REGISTRATION_INTERVENTION_METHOD_ID,
          userId,
        );
        if (created) {
          await upsertVisitServerCache({
            userId,
            producerId: pid,
            projectId: projId,
            kind: "visit3",
            jsonPayload: JSON.stringify(created),
          });
          setExistingVisitId(created.id);
          setIsEditMode(true);
        }
        setLocalPhotos([null, null, null]);
        showAlert({
          title: "Guardado",
          message: "La Visita 3 se registró correctamente.",
          type: "success",
        });
      } else if (isOnline && existingVisitId) {
        const updatePayload = mapFormToUpdatePayload(form, meta);
        await apiUpdateVisit3(existingVisitId, updatePayload);
        for (const imgId of pendingImageDeletions) {
          try {
            await apiDeleteVisit3Image(imgId);
          } catch {
            /* ignore, se reintentará */
          }
        }
        for (const cid of pendingCommitmentDeletions) {
          try {
            await apiDeleteMonitoringCommitment(cid);
          } catch {
            /* ignore */
          }
        }
        for (const t of trackings) {
          if (t.id != null) {
            await apiUpdateMonitoringCommitment(t.id, {
              activity: t.activity,
              percentage_compliance: t.percentage_compliance,
              appropriation_in_field: t.appropriation_in_field,
            });
          } else if (t.activity.trim()) {
            await apiCreateMonitoringCommitment(existingVisitId, {
              activity: t.activity,
              percentage_compliance: t.percentage_compliance,
              appropriation_in_field: t.appropriation_in_field,
            });
          }
        }
        if (photos.length > 0) {
          await apiUploadVisit3Images(existingVisitId, photos);
        }
        await markInterventionMethodApplied(
          pid,
          projId,
          VISIT3_REGISTRATION_INTERVENTION_METHOD_ID,
          userId,
        );
        // Refetch after deletes/uploads so cache and slots match the server
        let fresh: Visit3Response | null = null;
        try {
          fresh = await apiGetVisit3(projId, pid);
        } catch {
          fresh = null;
        }
        if (fresh) {
          setForm(mapResponseToForm(fresh));
          setExistingVisitId(fresh.id);
          const imgs = (fresh.images ?? []).slice(0, VISIT3_MAX_PHOTOS);
          const nextImgs: (typeof existingImages)[number][] = [null, null, null];
          imgs.forEach((img, i) => {
            nextImgs[i] = { id: img.id, filename: img.filename };
          });
          setExistingImages(nextImgs);
          await upsertVisitServerCache({
            userId,
            producerId: pid,
            projectId: projId,
            kind: "visit3",
            jsonPayload: JSON.stringify(fresh),
          });
        } else {
          setExistingImages([null, null, null]);
        }
        setPendingImageDeletions([]);
        setPendingCommitmentDeletions([]);
        setLocalPhotos([null, null, null]);
        showAlert({
          title: "Actualizado",
          message: "La Visita 3 se actualizó correctamente.",
          type: "success",
        });
      } else {
        const visitUuid = `visit3-${pid}-${projId}-${userId}`;
        const persistedSlots = await persistLocalVisitPhotoSlots(localPhotos, {
          kind: "visit3",
          userId,
          producerId: pid,
          projectId: projId,
        });
        const photosForQueue = persistedSlots.filter(
          (p): p is Visit3LocalPhoto => p !== null && !!p.uri,
        );
        const extras: Visit3QueueExtras = {
          photos: photosForQueue,
          keepRemoteImages: existingImages
            .filter((i): i is { id: number } => i !== null)
            .map((i) => i.id),
          pendingImageDeletions,
          pendingCommitmentDeletions,
          trackings,
          remote_visit_3_id: existingVisitId,
          ...(existingVisitId
            ? { update_payload: mapFormToUpdatePayload(form, meta) }
            : {}),
        };
        const payload = existingVisitId
          ? mapFormToUpdatePayload(form, meta)
          : mapFormToCreatePayload(form, meta);
        await enqueueVisit3({ visitUuid, payload, extras, userId });
        await markInterventionMethodApplied(
          pid,
          projId,
          VISIT3_REGISTRATION_INTERVENTION_METHOD_ID,
          userId,
        );
        setLocalPhotos(persistedSlots);
        useSyncStore.getState().refreshStatus();
        showAlert({
          title: "Sin internet",
          message:
            "La Visita 3 se guardó localmente y se enviará al sincronizar.",
          type: "warning",
        });
      }
      skipNextPersistRef.current = true;
      clearDraft();
      setRefreshKey((k) => k + 1);
      sheetRef.current?.dismiss();
    } catch (e) {
      showAlert({
        title: "Error",
        message:
          e instanceof Error ? e.message : "No se pudo guardar la Visita 3.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }, [
    producerId,
    projectId,
    authUser,
    validateForm,
    showAlert,
    form,
    existingVisitId,
    existingImages,
    pendingImageDeletions,
    pendingCommitmentDeletions,
    collectPhotosForSave,
    collectTrackings,
    localPhotos,
    clearDraft,
  ]);

  // ── PDF ────────────────────────────────────────────────────────────────

  const [generatingPdf, setGeneratingPdf] = useState(false);

  const handleGeneratePdf = useCallback(async () => {
    setGeneratingPdf(true);
    try {
      const photoBase64Uris = await convertVisit3PhotosToBase64(
        localPhotos,
        existingImages,
        token,
      );

      const fullName = producerDetail
        ? [
            producerDetail.first_name,
            producerDetail.middle_name,
            producerDetail.first_surname,
            producerDetail.last_surname,
          ]
            .filter(Boolean)
            .join(" ")
        : "";

      const hora =
        form.registration_time.trim().length >= 5
          ? form.registration_time.trim().slice(0, 5)
          : form.registration_time.trim();

      const aspects: Visit3PdfAspectBlock[] = VISIT3_ASPECTS.map((aspect) => ({
        id: aspect.id,
        number: aspect.number,
        title: aspect.title,
        rows: Array.from({ length: aspect.itemCount }, (_, idx) => ({
          number: aspect.startNumber + idx,
          description: "—",
          initialValue: "",
          finalValue: "",
        })),
        justification: form.aspect_justifications[aspect.id] ?? "",
      }));

      const pdfData: Visit3PdfData = {
        fechaRegistro: formatDisplayDate(form.registration_date),
        horaRegistro: hora,
        nombrePersonaAtiende: form.attendance_name,
        attendanceId: Number(form.attendance_id) || 0,
        nombreCompletoUsuario: fullName,
        tipoDocumento: (producerDetail as any)?.document_type?.name ?? "",
        numeroIdentificacion: producerDetail?.identification ?? "",
        numeroTelefonico: (producerDetail as any)?.phone ?? "",
        nombreDelPredio: "",
        asnm: "",
        departamento: (producerDetail as any)?.municipality?.department_name ?? "",
        municipio: (producerDetail as any)?.municipality?.name ?? "",
        corregimientoVereda: "",
        lineaProductivaPrincipal: "",
        lineaProductivaSecundaria: "",
        areaTotalEnProduccion: "",
        objetivoGeneral: form.general_objective,
        objetivosEspecificos: form.specific_objectives,
        recomendacionesComunidad: form.technical_recommendations,
        observaciones: form.observations,
        commitmentsTracking: form.commitments_tracking.map((r) => ({
          activity: r.activity,
          percentage: r.percentage_compliance,
          appropriation: r.appropriation_in_field,
        })),
        photoBase64Uris,
        aspects,
        overallInitial: null,
        overallFinal: null,
        nombreExtensionista:
          authUser?.first_name && authUser?.last_name
            ? `${authUser.first_name} ${authUser.last_name}`
            : (authUser?.username ?? ""),
        identificacionExtensionista: String(authUser?.user_id ?? ""),
        perfilProfesional: "",
      };

      await generateAndPrintVisit3Pdf(pdfData);
    } catch (e) {
      if (e instanceof Error && e.message.includes("cancelled")) return;
      showAlert({
        title: "Error",
        message: "No se pudo generar el PDF de la Visita 3.",
        type: "error",
      });
    } finally {
      setGeneratingPdf(false);
    }
  }, [
    form,
    localPhotos,
    existingImages,
    token,
    producerDetail,
    authUser,
    showAlert,
  ]);

  // ── Render helpers ─────────────────────────────────────────────────────

  const renderSectionHeader = useCallback(
    (config: SectionConfig, complete: boolean) => {
      const expanded = expandedSections.has(config.key);
      const Icon = config.icon;
      return (
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => toggleSection(config.key)}
          activeOpacity={0.7}
        >
          <View style={[styles.sectionBadge, { backgroundColor: config.color }]}>
            <Icon size={responsiveFont(15)} color="#fff" />
          </View>
          <View style={styles.sectionHeaderText}>
            <ThemedText
              type="defaultSemiBold"
              style={styles.sectionTitle}
              lightColor="#222"
              darkColor="#222"
            >
              {config.sectionNum}. {config.label}
            </ThemedText>
            <ThemedText style={styles.sectionSubtitle}>
              {complete ? "Completada" : "Pendiente"}
            </ThemedText>
          </View>
          {complete ? (
            <CheckCircle2 size={responsiveFont(18)} color="#1a7a3a" />
          ) : (
            <AlertTriangle size={responsiveFont(16)} color="#f59e0b" />
          )}
          <ThemedText style={styles.expandCaret}>
            {expanded ? "▲" : "▼"}
          </ThemedText>
        </TouchableOpacity>
      );
    },
    [expandedSections, toggleSection],
  );

  const renderReadOnlyObjectives = useCallback(
    (
      key: SectionKey,
      raw: string,
      mode: "double" | "line",
      hint: string,
      emptyLabel: string,
    ) => {
      if (!expandedSections.has(key)) return null;
      const blocks = parseObjectiveDisplayBlocks(raw, mode);
      return (
        <View style={styles.sectionContent}>
          <ThemedText style={styles.sectionHint}>{hint}</ThemedText>
          {objectivesApiLoading && (
            <View style={styles.objectivesLoadingRow}>
              <ActivityIndicator size="small" color="#1a7a3a" />
              <ThemedText style={styles.objectivesLoadingText}>
                Consultando objetivos…
              </ThemedText>
            </View>
          )}
          <View style={styles.objectivesReadonlyPanel}>
            {blocks.length === 0 ? (
              <ThemedText style={styles.objectivesReadonlyEmpty}>
                {emptyLabel}
              </ThemedText>
            ) : (
              blocks.map((block, i) => (
                <View key={i}>
                  {i > 0 && <View style={styles.objectivesReadonlySeparator} />}
                  <ThemedText style={styles.objectivesReadonlyParagraph}>
                    {mode === "line" && (
                      <ThemedText style={styles.objectivesReadonlyIndex}>
                        {`${i + 1}. `}
                      </ThemedText>
                    )}
                    {block}
                  </ThemedText>
                </View>
              ))
            )}
          </View>
        </View>
      );
    },
    [expandedSections, objectivesApiLoading],
  );

  const renderTextArea = useCallback(
    (
      key: SectionKey,
      value: string,
      onChange: (v: string) => void,
      placeholder: string,
      hint?: string,
    ) => {
      if (!expandedSections.has(key)) return null;
      return (
        <View style={styles.sectionContent}>
          {hint && <ThemedText style={styles.sectionHint}>{hint}</ThemedText>}
          <TextInput
            style={styles.textArea}
            value={value}
            onChangeText={onChange}
            placeholder={placeholder}
            placeholderTextColor="#aaa"
            multiline
            textAlignVertical="top"
            numberOfLines={4}
          />
        </View>
      );
    },
    [expandedSections],
  );

  const renderPhotoSlot = useCallback(
    (index: number) => {
      const local = localPhotos[index];
      const existing = existingImages[index];
      const isDeleting = deletingPhotoIndex === index;
      const hasPhoto = local !== null || existing !== null;

      if (hasPhoto) {
        const uri = local?.uri ?? (existing ? getVisit3ImageUrl(existing.id) : "");
        return (
          <View key={index} style={styles.photoSlot}>
            <ExpoImage
              source={{
                uri,
                ...(existing && token && !local
                  ? { headers: { Authorization: `Bearer ${token}` } }
                  : {}),
              }}
              style={styles.photoImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              pointerEvents="none"
            />
            <TouchableOpacity
              style={styles.photoRemoveBtn}
              onPress={() => removePhoto(index)}
              activeOpacity={0.7}
              disabled={isDeleting}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <X size={responsiveFont(14)} color="#fff" />
              )}
            </TouchableOpacity>
            <View style={styles.photoLabel} pointerEvents="none">
              <ThemedText style={styles.photoLabelText} numberOfLines={1}>
                {local?.fileName ?? `Foto ${index + 1}`}
              </ThemedText>
            </View>
          </View>
        );
      }
      return (
        <TouchableOpacity
          key={index}
          style={styles.photoSlotEmpty}
          onPress={() => showPhotoOptions(index)}
          activeOpacity={0.7}
        >
          <ImagePlus size={responsiveFont(24)} color="rgba(0,0,0,0.2)" />
          <ThemedText style={styles.photoSlotEmptyText}>
            Imagen {index + 1}
          </ThemedText>
        </TouchableOpacity>
      );
    },
    [
      localPhotos,
      existingImages,
      deletingPhotoIndex,
      token,
      removePhoto,
      showPhotoOptions,
    ],
  );

  // ── Gate rendering ─────────────────────────────────────────────────────

  if (loading || visit2Exists === null || checkingClassification) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a7a3a" />
        <ThemedText style={styles.loadingText}>
          Cargando Visita 3...
        </ThemedText>
      </View>
    );
  }

  if (visit2Exists === false) {
    return (
      <View style={styles.center}>
        <Lock size={responsiveFont(44)} color="#f59e0b" />
        <ThemedText type="defaultSemiBold" style={styles.gateTitle}>
          Visita 3 bloqueada
        </ThemedText>
        <ThemedText style={styles.gateSubtitle}>
          Debe registrarse primero la Visita 2 para habilitar la clasificación
          y el registro de la Visita 3.
        </ThemedText>
      </View>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Step selector */}
      <View style={styles.stepper}>
        <TouchableOpacity
          style={[styles.stepTab, activeStep === "clasificacion" && styles.stepTabActive]}
          onPress={() => setActiveStep("clasificacion")}
          activeOpacity={0.75}
        >
          <View style={styles.stepBadgeRow}>
            <View
              style={[
                styles.stepBadge,
                classificationCompleted && styles.stepBadgeDone,
              ]}
            >
              {classificationCompleted ? (
                <CheckCircle2 size={responsiveFont(14)} color="#fff" />
              ) : (
                <ThemedText style={styles.stepBadgeText}>1</ThemedText>
              )}
            </View>
            <ThemedText
              type="defaultSemiBold"
              style={[
                styles.stepLabel,
                activeStep === "clasificacion" && styles.stepLabelActive,
              ]}
            >
              Clasificación
            </ThemedText>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.stepTab,
            activeStep === "registro" && styles.stepTabActive,
            !classificationCompleted && styles.stepTabDisabled,
          ]}
          onPress={() => {
            if (!classificationCompleted) {
              showAlert({
                title: "Complete primero la clasificación",
                message:
                  "Debe responder la clasificación antes de registrar la Visita 3.",
                type: "warning",
              });
              return;
            }
            setActiveStep("registro");
          }}
          activeOpacity={0.75}
        >
          <View style={styles.stepBadgeRow}>
            <View
              style={[
                styles.stepBadge,
                isEditMode && styles.stepBadgeDone,
                !classificationCompleted && styles.stepBadgeDisabled,
              ]}
            >
              {isEditMode ? (
                <CheckCircle2 size={responsiveFont(14)} color="#fff" />
              ) : (
                <ThemedText style={styles.stepBadgeText}>2</ThemedText>
              )}
            </View>
            <ThemedText
              type="defaultSemiBold"
              style={[
                styles.stepLabel,
                activeStep === "registro" && styles.stepLabelActive,
              ]}
            >
              Registro
            </ThemedText>
          </View>
        </TouchableOpacity>
      </View>

      {activeStep === "clasificacion" ? (
        <ClassificationTab
          producerId={producerId}
          projectId={projectId}
          interventionMethodId={VISIT3_CLASSIFICATION_INTERVENTION_METHOD_ID}
          applyButtonLabel="Aplicar clasificación de Visita 3"
          applyButtonLabelApplied="Ver / Editar clasificación de Visita 3"
          sheetTitle="Clasificación — Visita 3"
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      ) : (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Summary card */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <ClipboardCheck size={responsiveFont(24)} color="#1a7a3a" />
              <View style={styles.summaryHeaderText}>
                <ThemedText type="defaultSemiBold" style={styles.summaryTitle}>
                  {isEditMode ? "Visita 3 registrada" : "Visita 3"}
                </ThemedText>
                <ThemedText style={styles.summarySubtitle}>
                  Ficha de acompañamiento — Ley 1876
                </ThemedText>
              </View>
            </View>

            <View style={styles.summaryProgressRow}>
              <View style={styles.summaryProgressTrack}>
                <View
                  style={[
                    styles.summaryProgressFill,
                    { width: `${(completedCount / SECTIONS.length) * 100}%` },
                  ]}
                />
              </View>
              <ThemedText style={styles.summaryProgressLabel}>
                {completedCount}/{SECTIONS.length} secciones
              </ThemedText>
            </View>

            <TouchableOpacity
              style={styles.openSheetButton}
              onPress={openSheet}
              activeOpacity={0.85}
            >
              <PencilLine size={responsiveFont(20)} color="#fff" />
              <ThemedText style={styles.openSheetButtonText}>
                {isEditMode
                  ? "Editar Visita 3"
                  : "Diligenciar Visita 3"}
              </ThemedText>
            </TouchableOpacity>

            {isEditMode && (
              <TouchableOpacity
                style={[
                  styles.pdfButton,
                  generatingPdf && styles.saveButtonDisabled,
                ]}
                onPress={handleGeneratePdf}
                disabled={generatingPdf}
                activeOpacity={0.85}
              >
                {generatingPdf ? (
                  <ActivityIndicator size="small" color="#1a7a3a" />
                ) : (
                  <FileDown size={responsiveFont(18)} color="#1a7a3a" />
                )}
                <ThemedText style={styles.pdfButtonText}>
                  {generatingPdf ? "Generando PDF..." : "Generar PDF"}
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>

          {isEditMode && form.registration_date && (
            <View style={styles.summaryMetaCard}>
              <ThemedText style={styles.summaryMetaLabel}>
                Fecha del acompañamiento
              </ThemedText>
              <ThemedText type="defaultSemiBold" style={styles.summaryMetaValue}>
                {formatDisplayDate(form.registration_date)}
              </ThemedText>
              {form.attendance_name.trim() ? (
                <ThemedText style={styles.summaryMetaSub}>
                  Quien atiende: {form.attendance_name}
                </ThemedText>
              ) : null}
            </View>
          )}
        </ScrollView>
      )}

      {/* Bottom Sheet - Registration form */}
      <BottomSheetModal
        ref={sheetRef}
        index={0}
        snapPoints={sheetSnapPoints}
        onChange={handleSheetChange}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        enableDynamicSizing={false}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
      >
        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <ThemedText
              type="defaultSemiBold"
              style={styles.sheetTitle}
              lightColor="#333"
              darkColor="#333"
            >
              {isEditMode ? "Editar Visita 3" : "Aplicar Visita 3"}
            </ThemedText>
          </View>
          <TouchableOpacity
            style={styles.sheetCloseBtn}
            onPress={() => sheetRef.current?.dismiss()}
            activeOpacity={0.7}
          >
            <X size={responsiveFont(20)} color="#666" />
          </TouchableOpacity>
        </View>

        <BottomSheetScrollView
          contentContainerStyle={styles.sheetScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Attendance section */}
          <View style={styles.section}>
            {renderSectionHeader(SECTIONS[0]!, sectionStatus.attendance)}
            {expandedSections.has("attendance") && (
              <View style={styles.sectionContent}>
                <View style={styles.fieldRow}>
                  <View style={styles.fieldHalf}>
                    <ThemedText style={styles.fieldLabel}>Fecha de registro</ThemedText>
                    <TextInput
                      style={styles.textInput}
                      value={form.registration_date}
                      onChangeText={(v) => setField("registration_date", v)}
                      placeholder="AAAA-MM-DD"
                      placeholderTextColor="#aaa"
                    />
                    <ThemedText style={styles.fieldHintSmall}>
                      Mostrada también como: {formatDisplayDate(form.registration_date)}
                    </ThemedText>
                  </View>
                  <View style={styles.fieldHalf}>
                    <ThemedText style={styles.fieldLabel}>Hora de registro</ThemedText>
                    <TextInput
                      style={styles.textInput}
                      value={form.registration_time}
                      onChangeText={(v) => setField("registration_time", v)}
                      placeholder="09:00:00"
                      placeholderTextColor="#aaa"
                    />
                  </View>
                </View>

                <ThemedText style={styles.fieldLabel}>
                  ¿El productor acepta el servicio?
                </ThemedText>
                <View style={styles.acceptRow}>
                  {[
                    { id: "si", label: "Sí" },
                    { id: "no", label: "No" },
                  ].map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        styles.acceptChip,
                        form.usuario_acepta_servicio === opt.id &&
                          styles.acceptChipActive,
                      ]}
                      onPress={() =>
                        setField("usuario_acepta_servicio", opt.id)
                      }
                      activeOpacity={0.7}
                    >
                      <ThemedText
                        style={[
                          styles.acceptChipText,
                          form.usuario_acepta_servicio === opt.id &&
                            styles.acceptChipTextActive,
                        ]}
                      >
                        {opt.label}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.separator} />

                <ThemedText style={styles.fieldLabel}>
                  Nombre persona que atiende
                </ThemedText>
                <TouchableOpacity
                  style={styles.dropdown}
                  onPress={() => setShowAttendanceDropdown((v) => !v)}
                  activeOpacity={0.7}
                >
                  <ThemedText
                    style={[
                      styles.dropdownText,
                      !form.attendance_id && styles.dropdownPlaceholder,
                    ]}
                  >
                    {ATTENDANCE_OPTIONS.find((o) => o.id === form.attendance_id)
                      ?.label ?? "Seleccione..."}
                  </ThemedText>
                </TouchableOpacity>
                {showAttendanceDropdown && (
                  <View style={styles.dropdownOptions}>
                    {ATTENDANCE_OPTIONS.map((opt) => {
                      const active = form.attendance_id === opt.id;
                      return (
                        <TouchableOpacity
                          key={opt.id}
                          style={[
                            styles.dropdownOption,
                            active && styles.dropdownOptionActive,
                          ]}
                          onPress={() => {
                            setField("attendance_id", opt.id);
                            setShowAttendanceDropdown(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <ThemedText
                            style={[
                              styles.dropdownOptionText,
                              active && styles.dropdownOptionTextActive,
                            ]}
                          >
                            {opt.label}
                          </ThemedText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {form.attendance_id && form.attendance_id !== "1" && (
                  <View style={styles.conditionalField}>
                    <View style={styles.conditionalIndicator} />
                    <View style={styles.conditionalContent}>
                      <ThemedText style={styles.fieldLabel}>
                        Nombre completo
                      </ThemedText>
                      <TextInput
                        style={styles.textInput}
                        value={form.attendance_name}
                        onChangeText={(v) => setField("attendance_name", v)}
                        placeholder="Nombre del acompañante"
                        placeholderTextColor="#aaa"
                      />
                      <ThemedText
                        style={[styles.fieldLabel, { marginTop: verticalScale(10) }]}
                      >
                        Documento de identidad
                      </ThemedText>
                      <TextInput
                        style={styles.textInput}
                        value={form.attendance_identification}
                        onChangeText={(v) =>
                          setField("attendance_identification", v)
                        }
                        placeholder="Número de documento"
                        placeholderTextColor="#aaa"
                        keyboardType="number-pad"
                      />
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Objectives (read-only) */}
          <View style={styles.section}>
            {renderSectionHeader(SECTIONS[1]!, sectionStatus.objective)}
            {renderReadOnlyObjectives(
              "objective",
              form.general_objective,
              "double",
              "Solo lectura. Objetivos «Generales» definidos por el servidor para el evento Visita 3 (evento 6) y la línea productiva principal.",
              "Sin objetivo general cargado para esta línea.",
            )}
          </View>

          <View style={styles.section}>
            {renderSectionHeader(SECTIONS[2]!, sectionStatus.specific_objectives)}
            {renderReadOnlyObjectives(
              "specific_objectives",
              form.specific_objectives,
              "line",
              "Solo lectura. Objetivos «Específicos» del catálogo (evento Visita 3, línea principal).",
              "No hay objetivos específicos configurados para esta línea.",
            )}
          </View>

          {/* Section 5.1 — Follow-up */}
          <View style={styles.section}>
            {renderSectionHeader(SECTIONS[3]!, sectionStatus.commitment_followup)}
            {expandedSections.has("commitment_followup") && (
              <View style={styles.sectionContent}>
                <ThemedText style={styles.sectionHint}>
                  Complete el porcentaje y apropiación de cada recomendación o
                  compromiso proveniente de la Visita 2.
                </ThemedText>
                {form.commitments_tracking.length === 0 ? (
                  <ThemedText style={styles.commitmentsEmptyText}>
                    Sin recomendaciones/compromisos registrados en la Visita 2.
                  </ThemedText>
                ) : (
                  form.commitments_tracking.map((row, idx) => (
                    <View key={idx} style={styles.trackingCard}>
                      <View style={styles.trackingHeader}>
                        <ThemedText
                          type="defaultSemiBold"
                          style={styles.trackingActivity}
                        >
                          {row.activity || `Actividad ${idx + 1}`}
                        </ThemedText>
                        <TouchableOpacity
                          onPress={() => removeCommitment(idx)}
                          activeOpacity={0.7}
                          style={styles.trackingRemoveBtn}
                        >
                          <Trash2 size={responsiveFont(14)} color="#dc2626" />
                        </TouchableOpacity>
                      </View>
                      <ThemedText style={styles.fieldLabel}>
                        % Cumplimiento (0–100)
                      </ThemedText>
                      <TextInput
                        style={styles.textInput}
                        value={row.percentage_compliance}
                        onChangeText={(v) =>
                          updateCommitment(idx, {
                            percentage_compliance: v.replace(/[^\d]/g, ""),
                          })
                        }
                        placeholder="0"
                        placeholderTextColor="#aaa"
                        keyboardType="number-pad"
                      />
                      <ThemedText
                        style={[styles.fieldLabel, { marginTop: verticalScale(10) }]}
                      >
                        Apropiación en campo
                      </ThemedText>
                      <TextInput
                        style={styles.textArea}
                        value={row.appropriation_in_field}
                        onChangeText={(v) =>
                          updateCommitment(idx, { appropriation_in_field: v })
                        }
                        placeholder="Describa la apropiación en el predio..."
                        placeholderTextColor="#aaa"
                        multiline
                        textAlignVertical="top"
                        numberOfLines={4}
                      />
                    </View>
                  ))
                )}
                <TouchableOpacity
                  style={styles.addTrackingBtn}
                  onPress={addCommitment}
                  activeOpacity={0.8}
                >
                  <ThemedText style={styles.addTrackingBtnText}>
                    + Agregar seguimiento
                  </ThemedText>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Recommendations */}
          <View style={styles.section}>
            {renderSectionHeader(SECTIONS[4]!, sectionStatus.recommendations)}
            {renderTextArea(
              "recommendations",
              form.technical_recommendations,
              (v) => setField("technical_recommendations", v),
              "Plantee recomendaciones técnicas específicas...",
              "Recomendaciones formuladas en esta visita, dirigidas a la comunidad productiva.",
            )}
          </View>

          {/* Observations */}
          <View style={styles.section}>
            {renderSectionHeader(SECTIONS[5]!, sectionStatus.observations)}
            {renderTextArea(
              "observations",
              form.observations,
              (v) => setField("observations", v),
              "Ingrese observaciones generales de la visita...",
            )}
          </View>

          {/* Photos */}
          <View style={styles.section}>
            {renderSectionHeader(SECTIONS[6]!, sectionStatus.photos)}
            {expandedSections.has("photos") && (
              <View style={styles.sectionContent}>
                <ThemedText style={styles.sectionHint}>
                  Arrastre o seleccione hasta {VISIT3_MAX_PHOTOS} fotografías de la visita.
                </ThemedText>
                <ThemedText style={[styles.sectionHint, styles.photoHintItalic]}>
                  Tomar mínimo {VISIT3_MAX_PHOTOS} fotos con su respectiva marca de agua
                  (lugar, georreferenciación, ASNM, fecha, hora).{" "}
                  {VISIT3_PHOTO_LABELS.join(". ")}.
                </ThemedText>
                <View style={styles.photosGrid}>
                  {[0, 1, 2].map(renderPhotoSlot)}
                </View>
              </View>
            )}
          </View>

          {/* Aspects (5 justifications) */}
          <View style={styles.section}>
            {renderSectionHeader(SECTIONS[7]!, sectionStatus.aspects)}
            {expandedSections.has("aspects") && (
              <View style={styles.sectionContent}>
                <ThemedText style={styles.sectionHint}>
                  Justifique la calificación asignada en cada aspecto. Cada
                  bloque agrupa los ítems evaluados en la clasificación.
                </ThemedText>
                {VISIT3_ASPECTS.map((aspect) => (
                  <View key={aspect.id} style={styles.aspectCard}>
                    <ThemedText
                      type="defaultSemiBold"
                      style={styles.aspectTitle}
                    >
                      {aspect.title}
                    </ThemedText>
                    <ThemedText style={styles.aspectItems}>
                      Ítems {aspect.startNumber}–
                      {aspect.startNumber + aspect.itemCount - 1}
                    </ThemedText>
                    <TextInput
                      style={styles.textArea}
                      value={form.aspect_justifications[aspect.id]}
                      onChangeText={(v) => setAspectJustification(aspect.id, v)}
                      placeholder={`Justificación del ${aspect.title.split(":")[0]}...`}
                      placeholderTextColor="#aaa"
                      multiline
                      textAlignVertical="top"
                      numberOfLines={4}
                    />
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Extensionista (read-only) */}
          <View style={styles.section}>
            {renderSectionHeader(SECTIONS[8]!, sectionStatus.extensionist)}
            {expandedSections.has("extensionist") && (
              <View style={styles.sectionContent}>
                <ThemedText style={styles.sectionHint}>
                  Información del profesional que realiza la visita.
                </ThemedText>
                <View style={styles.readonlyField}>
                  <ThemedText style={styles.readonlyFieldText}>
                    {authUser?.first_name && authUser?.last_name
                      ? `${authUser.first_name} ${authUser.last_name}`
                      : authUser?.username ?? "Extensionista"}
                  </ThemedText>
                </View>
              </View>
            )}
          </View>

          {/* Save */}
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Save size={responsiveFont(20)} color="#fff" />
            )}
            <ThemedText style={styles.saveButtonText}>
              {saving
                ? "Guardando..."
                : isEditMode
                  ? "Actualizar Visita 3"
                  : "Guardar Visita 3"}
            </ThemedText>
          </TouchableOpacity>

          <View style={{ height: verticalScale(32) }} />
        </BottomSheetScrollView>
      </BottomSheetModal>
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
    paddingHorizontal: widthScale(24),
  },
  loadingText: { fontSize: responsiveFont(15), color: "#666" },
  gateTitle: {
    fontSize: responsiveFont(18),
    color: "#111",
    textAlign: "center",
  },
  gateSubtitle: {
    fontSize: responsiveFont(14),
    color: "#666",
    textAlign: "center",
    lineHeight: responsiveFont(20),
  },
  scrollArea: { flex: 1 },
  scrollContent: {
    paddingHorizontal: widthScale(4),
    paddingTop: verticalScale(12),
    paddingBottom: verticalScale(120),
  },

  // Stepper
  stepper: {
    flexDirection: "row",
    gap: widthScale(8),
    paddingHorizontal: widthScale(4),
    paddingVertical: verticalScale(6),
  },
  stepTab: {
    flex: 1,
    paddingVertical: verticalScale(6),
    paddingHorizontal: widthScale(10),
    borderRadius: widthScale(10),
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepTabActive: {
    borderColor: "#1a7a3a",
    backgroundColor: "rgba(26,122,58,0.06)",
  },
  stepTabDisabled: { opacity: 0.6 },
  stepBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: widthScale(8),
  },
  stepBadge: {
    width: widthScale(22),
    height: widthScale(22),
    borderRadius: widthScale(11),
    backgroundColor: "#94a3b8",
    justifyContent: "center",
    alignItems: "center",
  },
  stepBadgeDone: { backgroundColor: "#1a7a3a" },
  stepBadgeDisabled: { backgroundColor: "#cbd5e1" },
  stepBadgeText: {
    fontSize: responsiveFont(11),
    color: "#fff",
    fontWeight: "700",
  },
  stepLabel: { fontSize: responsiveFont(13), color: "#334155" },
  stepLabelActive: { color: "#1a7a3a" },

  // Summary
  summaryCard: {
    backgroundColor: "#fff",
    borderRadius: widthScale(14),
    padding: widthScale(16),
    marginBottom: verticalScale(10),
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    gap: verticalScale(12),
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: widthScale(12),
  },
  summaryHeaderText: { flex: 1 },
  summaryTitle: { fontSize: responsiveFont(20) },
  summarySubtitle: {
    fontSize: responsiveFont(14),
    color: "#666",
    marginTop: verticalScale(2),
  },
  summaryProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: widthScale(10),
  },
  summaryProgressTrack: {
    flex: 1,
    height: verticalScale(6),
    backgroundColor: "rgba(0,0,0,0.06)",
    borderRadius: 3,
    overflow: "hidden",
  },
  summaryProgressFill: {
    height: "100%",
    backgroundColor: "#1a7a3a",
    borderRadius: 3,
  },
  summaryProgressLabel: {
    fontSize: responsiveFont(13),
    color: "#666",
    fontWeight: "500",
  },
  openSheetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: widthScale(10),
    backgroundColor: "#1a7a3a",
    borderRadius: widthScale(12),
    paddingVertical: verticalScale(14),
  },
  openSheetButtonText: {
    fontSize: responsiveFont(17),
    fontWeight: "700",
    color: "#fff",
  },
  pdfButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: widthScale(8),
    borderRadius: widthScale(12),
    paddingVertical: verticalScale(12),
    borderWidth: 1,
    borderColor: "#1a7a3a",
    backgroundColor: "rgba(26,122,58,0.06)",
  },
  pdfButtonText: {
    fontSize: responsiveFont(15),
    fontWeight: "700",
    color: "#1a7a3a",
  },
  summaryMetaCard: {
    backgroundColor: "#fff",
    borderRadius: widthScale(10),
    padding: widthScale(14),
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  summaryMetaLabel: {
    fontSize: responsiveFont(12),
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  summaryMetaValue: {
    fontSize: responsiveFont(15),
    color: "#111",
    marginTop: verticalScale(4),
  },
  summaryMetaSub: {
    fontSize: responsiveFont(13),
    color: "#666",
    marginTop: verticalScale(2),
  },

  // Sheet
  sheetBackground: {
    backgroundColor: "#f4fbf7",
    borderTopLeftRadius: widthScale(24),
    borderTopRightRadius: widthScale(24),
  },
  sheetHandle: {
    backgroundColor: "#11181C",
    width: widthScale(40),
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: widthScale(18),
    paddingTop: verticalScale(4),
    paddingBottom: verticalScale(12),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  sheetTitle: { fontSize: responsiveFont(22) },
  sheetCloseBtn: {
    width: widthScale(36),
    height: widthScale(36),
    borderRadius: widthScale(18),
    backgroundColor: "rgba(0,0,0,0.05)",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: widthScale(12),
  },
  sheetScrollContent: {
    paddingVertical: verticalScale(12),
    paddingHorizontal: widthScale(14),
  },

  // Section
  section: {
    backgroundColor: "#fff",
    borderRadius: widthScale(10),
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    marginBottom: verticalScale(8),
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: widthScale(14),
    paddingVertical: verticalScale(12),
    gap: widthScale(10),
  },
  sectionBadge: {
    width: widthScale(28),
    height: widthScale(28),
    borderRadius: widthScale(14),
    justifyContent: "center",
    alignItems: "center",
  },
  sectionHeaderText: { flex: 1 },
  sectionTitle: {
    fontSize: responsiveFont(15),
    lineHeight: responsiveFont(19),
  },
  sectionSubtitle: {
    fontSize: responsiveFont(12),
    color: "#999",
    lineHeight: responsiveFont(15),
  },
  expandCaret: {
    fontSize: responsiveFont(10),
    color: "#94a3b8",
    marginLeft: widthScale(6),
  },
  sectionContent: {
    paddingHorizontal: widthScale(14),
    paddingBottom: verticalScale(14),
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  sectionHint: {
    fontSize: responsiveFont(13),
    color: "#666",
    lineHeight: responsiveFont(18),
    marginTop: verticalScale(10),
    marginBottom: verticalScale(8),
  },

  // Fields
  fieldRow: {
    flexDirection: "row",
    gap: widthScale(12),
    marginTop: verticalScale(10),
  },
  fieldHalf: { flex: 1 },
  fieldLabel: {
    fontSize: responsiveFont(13),
    fontWeight: "700",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: verticalScale(4),
  },
  fieldHintSmall: {
    fontSize: responsiveFont(12),
    color: "#999",
    marginTop: verticalScale(4),
  },
  textInput: {
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    borderRadius: widthScale(8),
    paddingHorizontal: widthScale(12),
    paddingVertical: verticalScale(8),
    fontSize: responsiveFont(16),
    color: "#333",
  },
  textArea: {
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    borderRadius: widthScale(8),
    paddingHorizontal: widthScale(12),
    paddingVertical: verticalScale(10),
    fontSize: responsiveFont(16),
    minHeight: verticalScale(110),
    color: "#333",
    lineHeight: responsiveFont(22),
  },
  readonlyField: {
    flexDirection: "row",
    alignItems: "center",
    gap: widthScale(6),
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    borderRadius: widthScale(8),
    paddingHorizontal: widthScale(10),
    paddingVertical: verticalScale(8),
  },
  readonlyFieldText: {
    fontSize: responsiveFont(15),
    color: "#333",
    flex: 1,
  },
  separator: {
    height: 1,
    backgroundColor: "rgba(0,0,0,0.08)",
    marginVertical: verticalScale(12),
  },

  // Accept row
  acceptRow: { flexDirection: "row", gap: widthScale(8) },
  acceptChip: {
    flex: 1,
    paddingVertical: verticalScale(10),
    borderRadius: widthScale(10),
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  acceptChipActive: {
    borderColor: "#1a7a3a",
    backgroundColor: "rgba(26,122,58,0.08)",
  },
  acceptChipText: { fontSize: responsiveFont(14), color: "#334155" },
  acceptChipTextActive: { color: "#1a7a3a", fontWeight: "700" },

  // Dropdown
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    borderRadius: widthScale(8),
    paddingHorizontal: widthScale(12),
    paddingVertical: verticalScale(10),
  },
  dropdownText: { fontSize: responsiveFont(15), color: "#333" },
  dropdownPlaceholder: { color: "#aaa" },
  dropdownOptions: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    borderRadius: widthScale(8),
    marginTop: verticalScale(4),
    overflow: "hidden",
  },
  dropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: widthScale(14),
    paddingVertical: verticalScale(10),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  dropdownOptionActive: {
    backgroundColor: "rgba(26,122,58,0.06)",
  },
  dropdownOptionText: { fontSize: responsiveFont(15), color: "#333" },
  dropdownOptionTextActive: { color: "#1a7a3a", fontWeight: "600" },
  conditionalField: {
    flexDirection: "row",
    marginTop: verticalScale(12),
    gap: widthScale(10),
  },
  conditionalIndicator: {
    width: 2,
    backgroundColor: "rgba(26,122,58,0.3)",
    borderRadius: 1,
  },
  conditionalContent: { flex: 1 },

  // Objectives readonly
  objectivesLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: widthScale(10),
    marginBottom: verticalScale(8),
  },
  objectivesLoadingText: { fontSize: responsiveFont(13), color: "#555" },
  objectivesReadonlyPanel: {
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    borderRadius: widthScale(8),
    paddingHorizontal: widthScale(12),
    paddingVertical: verticalScale(12),
  },
  objectivesReadonlyEmpty: {
    fontSize: responsiveFont(14),
    color: "#888",
    textAlign: "center",
    lineHeight: responsiveFont(20),
    fontStyle: "italic",
  },
  objectivesReadonlySeparator: {
    height: 1,
    backgroundColor: "rgba(0,0,0,0.1)",
    marginVertical: verticalScale(14),
  },
  objectivesReadonlyParagraph: {
    fontSize: responsiveFont(14),
    color: "#222",
    lineHeight: responsiveFont(21),
  },
  objectivesReadonlyIndex: {
    fontSize: responsiveFont(14),
    fontWeight: "700",
    color: "#666",
  },

  // Tracking
  commitmentsEmptyText: {
    fontSize: responsiveFont(14),
    color: "#888",
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: verticalScale(10),
  },
  trackingCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    borderRadius: widthScale(10),
    padding: widthScale(12),
    marginBottom: verticalScale(10),
  },
  trackingHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: widthScale(10),
    marginBottom: verticalScale(8),
  },
  trackingActivity: {
    flex: 1,
    fontSize: responsiveFont(14),
    color: "#222",
    lineHeight: responsiveFont(19),
  },
  trackingRemoveBtn: {
    width: widthScale(28),
    height: widthScale(28),
    borderRadius: widthScale(14),
    backgroundColor: "rgba(220,38,38,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  addTrackingBtn: {
    paddingVertical: verticalScale(10),
    paddingHorizontal: widthScale(14),
    borderRadius: widthScale(10),
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(26,122,58,0.4)",
    backgroundColor: "rgba(26,122,58,0.05)",
    alignItems: "center",
    marginTop: verticalScale(4),
  },
  addTrackingBtnText: {
    fontSize: responsiveFont(14),
    color: "#1a7a3a",
    fontWeight: "700",
  },

  // Photos
  photoHintItalic: {
    fontStyle: "italic",
    marginTop: verticalScale(4),
  },
  photosGrid: { flexDirection: "row", gap: widthScale(10) },
  photoSlot: {
    flex: 1,
    aspectRatio: 4 / 3,
    borderRadius: widthScale(8),
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    backgroundColor: "#f0f0f0",
  },
  photoImage: { width: "100%", height: "100%" },
  photoRemoveBtn: {
    position: "absolute",
    top: widthScale(4),
    right: widthScale(4),
    width: widthScale(26),
    height: widthScale(26),
    borderRadius: widthScale(13),
    backgroundColor: "rgba(220,38,38,0.9)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
    elevation: 3,
  },
  photoLabel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: widthScale(6),
    paddingVertical: verticalScale(2),
    zIndex: 1,
  },
  photoLabelText: {
    fontSize: responsiveFont(9),
    color: "#fff",
    textAlign: "center",
  },
  photoSlotEmpty: {
    flex: 1,
    aspectRatio: 4 / 3,
    borderRadius: widthScale(8),
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(0,0,0,0.12)",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.02)",
    gap: verticalScale(4),
  },
  photoSlotEmptyText: {
    fontSize: responsiveFont(10),
    color: "rgba(0,0,0,0.3)",
  },

  // Aspects
  aspectCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    borderRadius: widthScale(10),
    padding: widthScale(12),
    marginBottom: verticalScale(10),
    gap: verticalScale(6),
  },
  aspectTitle: {
    fontSize: responsiveFont(14),
    color: "#111",
    lineHeight: responsiveFont(19),
  },
  aspectItems: { fontSize: responsiveFont(12), color: "#666" },

  // Save
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: widthScale(10),
    backgroundColor: "#1a7a3a",
    borderRadius: widthScale(12),
    paddingVertical: verticalScale(14),
    marginTop: verticalScale(6),
  },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: {
    fontSize: responsiveFont(17),
    fontWeight: "700",
    color: "#fff",
  },
});
