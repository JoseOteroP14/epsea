import { ThemedText } from "@/components/themed-text";
import { VisitPhotoSlots } from "@/components/producer/visit-photo-slots";
import { AccentedText } from "@/components/ui/accented-text";
import { useAlert } from "@/components/ui/custom-alert";
import { InfoPopover } from "@/components/ui/info-popover";
import { checkConnectivity } from "@/hooks/use-network";
import { useProducerFormDraft } from "@/hooks/use-producer-form-draft";
import { useVisitRemotePhotoUris } from "@/hooks/use-visit-remote-photo-uris";
import { useAuthStore } from "@/store/useAuthStore";
import {
    VISIT_INTERVENTION_METHOD_ID,
    useCharacterizationStore,
} from "@/store/useCharacterizationStore";
import { useProducerStore } from "@/store/useProducerStore";
import { apiFetch } from "@/utils/api";
import { API_BASE_URL } from "@/utils/api-config";
import {
    getObjectivesForEventAndLine,
    objectiveItemsToSpecificLines,
    readProductionLineId,
    VISIT_OBJECTIVE_EVENT_IDS,
} from "@/utils/agro-objectives";
import {
    markInterventionMethodApplied,
} from "@/utils/database/repositories/producer-intervention-repository";
import {
  getVisitServerCacheRaw,
  upsertVisitServerCache,
} from "@/utils/database/repositories/server-extensionist-cache-repository";
import {
    enqueueVisit1,
    getPendingLocalVisit1,
    parseVisit1QueuePhotosColumn,
    type Visit1Payload,
} from "@/utils/database/repositories/visit1-repository";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import { getStoredToken } from "@/utils/secure-storage";
import {
  ImageOptimizationError,
  optimizeImageToWebp,
} from "@/utils/optimize-image";
import { invalidateVisitImageCache } from "@/utils/visit-image-cache";
import { persistLocalVisitPhotoSlots } from "@/utils/visit-offline-photos";
import {
    BottomSheetBackdrop,
    BottomSheetModal,
    BottomSheetScrollView,
    type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import * as ImagePicker from "expo-image-picker";
import {
    CalendarCheck,
    Camera,
    Check,
    ChevronDown,
    ChevronUp,
    ClipboardList,
    ListTodo,
    MapPin,
    MessageSquare,
    Save,
    Stethoscope,
    Target,
    Users,
    X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

// ─── Types ──────────────────────────────────────────────────────────────────

interface VisitTabProps {
  producerId: string;
  projectId?: string;
}

interface VisitImage {
  id: number;
  filename: string;
}

interface Visit1Response {
  id: number;
  project_id: number;
  producer_id: number;
  objetive: string;
  diagnosis: string;
  recommendations: string;
  observations: string;
  compliance_recommendation_id: number;
  compliance_recommendation_name?: string;
  registration_date: string;
  attendance_id: number;
  attendance_name: string | null;
  option_attendance_name?: string;
  origin: string;
  lat?: string | null;
  lng?: string | null;
  masl?: number | null;
  commitments?: string | null;
  attendance_identification?: string | null;
  created_by?: number;
  updated_by?: number;
  created_at?: string;
  updated_at?: string;
  images: VisitImage[];
}

interface LocalPhoto {
  uri: string;
  fileName: string;
  type: string;
}

// ─── Attendance options ─────────────────────────────────────────────────────

const ATTENDANCE_OPTIONS = [
  { id: "1", label: "Usuario Productor" },
  { id: "2", label: "Trabajador UP" },
  { id: "3", label: "Persona núcleo familiar" },
  { id: "4", label: "Otro" },
] as const;

// ─── Section config ─────────────────────────────────────────────────────────

type SectionKey =
  | "location"
  | "objective"
  | "diagnosis"
  | "recommendations"
  | "commitments"
  | "observations"
  | "photos"
  | "attendance";

interface SectionConfig {
  key: SectionKey;
  label: string;
  shortLabel: string;
  sectionNum: string;
  icon: typeof Target;
  color: string;
  info?: string;
}

const SECTIONS: SectionConfig[] = [
  {
    key: "location",
    label: "Ubicación Geográfica y ASNM",
    shortLabel: "Ubicación",
    sectionNum: "2",
    icon: MapPin,
    color: "#7c3aed",
    info: "Ingrese las coordenadas geográficas y la altura sobre el nivel del mar (ASNM) del predio visitado.",
  },
  {
    key: "objective",
    label: "Objetivos Específicos del Acompañamiento",
    shortLabel: "Objetivos",
    sectionNum: "5.0",
    icon: Target,
    color: "#1a7a3a",
    info: "Los objetivos específicos del acompañamiento se cargan automáticamente según la línea productiva principal del productor.",
  },
  {
    key: "diagnosis",
    label: "Diagnóstico visita",
    shortLabel: "Diagnóstico",
    sectionNum: "5.1",
    icon: Stethoscope,
    color: "#0284c7",
    info: "Para generar el diagnóstico inicial técnico productivo del sistema, usted deberá realizar un recorrido total de la Unidad Productiva, que le permita identificar los problemas críticos relevantes y/o ventajas y oportunidades.",
  },
  {
    key: "recommendations",
    label: "Recomendaciones Generales",
    shortLabel: "Recomend.",
    sectionNum: "5.2.1",
    icon: ClipboardList,
    color: "#0284c7",
    info: "Plantee recomendaciones técnicas de acuerdo al diagnóstico inicial encontrado en la unidad productiva. Deberán ser recomendaciones profesionales, relevantes y en procura de mejorar los aspectos de la extensión del usuario a intervenir y adaptadas a las condiciones del sistema productivo.",
  },
  {
    key: "commitments",
    label: "Compromisos",
    shortLabel: "Comprom.",
    sectionNum: "5.2.2",
    icon: ListTodo,
    color: "#0284c7",
    info: "Redacte compromisos puntuales, de manera clara, acordes a los objetivos específicos del acompañamiento (si aplican), medibles y realizables dentro del tiempo del acompañamiento.",
  },
  {
    key: "observations",
    label: "Observaciones visita",
    shortLabel: "Observac.",
    sectionNum: "5.4",
    icon: MessageSquare,
    color: "#0284c7",
    info: "Describa, si aplica, cualquier otra situación particular que considere relevante para la realización del acompañamiento, o para dejar trazabilidad de las evidencias del mismo.",
  },
  {
    key: "photos",
    label: "Registro Fotográfico",
    shortLabel: "Fotos",
    sectionNum: "5.5",
    icon: Camera,
    color: "#059669",
    info: "Seleccione hasta 3 fotografías de la visita. Tomar mínimo 3 fotos con su respectiva marca de agua (lugar, georreferenciación, ASNM, fecha, hora). Foto 1: Panorámica del predio y el usuario. Foto 2: Donde se vea al usuario en su actividad productiva principal. Foto 3: Donde se vea al usuario junto con el extensionista.",
  },
  {
    key: "attendance",
    label: "Datos del Acompañamiento",
    shortLabel: "Acompañ.",
    sectionNum: "6",
    icon: Users,
    color: "#d97706",
    info: "Registre la fecha, hora y la persona que atendió el acompañamiento.",
  },
];

interface Visit1FormDraft {
  lat: string;
  lng: string;
  masl: string;
  diagnosis: string;
  recommendations: string;
  commitments: string;
  observations: string;
  attendanceId: string;
  attendanceName: string;
  attendanceIdentification: string;
  registrationDate: string;
  registrationTime: string;
  localPhotos: (LocalPhoto | null)[];
  existingImages: (VisitImage | null)[];
  pendingImageDeletions: number[];
  expandedSections: SectionKey[];
}

/** Misma redacción que Visit1Dialog.vue (objetivo general fijo). */
const VISIT1_GENERAL_OBJECTIVE_FIXED =
  "Realizar caracterización y clasificación del usuario, así como un diagnóstico integral de la unidad productiva agropecuaria.";

const COORDINATE_REGEX = /^-?\d*\.?\d*$/;

function isValidCoordinate(value: string): boolean {
  return COORDINATE_REGEX.test(value.trim());
}


// ─── API Helpers ────────────────────────────────────────────────────────────

const BASE_URL = API_BASE_URL;

async function getVisit1(
  projectId: number,
  producerId: number,
): Promise<Visit1Response | null> {
  try {
    const res = await apiFetch<{ code: string; data: Visit1Response }>(
      `/visit-1/project/${projectId}/producer/${producerId}`,
    );
    return res?.data ?? null;
  } catch {
    return null;
  }
}

async function createVisit1(payload: Visit1Payload): Promise<Visit1Response> {
  const res = await apiFetch<{ data: Visit1Response }>("/visit-1", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res?.data ?? (res as any);
}

async function createVisit1WithImages(
  payload: Visit1Payload,
  photos: LocalPhoto[],
): Promise<Visit1Response> {
  const token = await getStoredToken();
  const formData = new FormData();
  formData.append("project_id", String(payload.project_id));
  formData.append("producer_id", String(payload.producer_id));
  formData.append("objetive", payload.objetive);
  formData.append("diagnosis", payload.diagnosis);
  formData.append("recommendations", payload.recommendations);
  formData.append("observations", payload.observations);
  formData.append("compliance_recommendation_id", String(payload.compliance_recommendation_id));
  formData.append("registration_date", payload.registration_date);
  formData.append("attendance_id", String(payload.attendance_id));
  formData.append("attendance_name", payload.attendance_name ?? "");
  formData.append("origin", payload.origin);
  formData.append("lat", (payload.lat ?? "").trim());
  formData.append("lng", (payload.lng ?? "").trim());
  formData.append(
    "masl",
    payload.masl != null && Number.isFinite(payload.masl) ? String(payload.masl) : "",
  );
  formData.append("commitments", (payload.commitments ?? "").trim());
  formData.append(
    "attendance_identification",
    (payload.attendance_identification ?? "").trim(),
  );

  for (const photo of photos) {
    formData.append("images", {
      uri: photo.uri,
      name: photo.fileName,
      type: photo.type,
    } as any);
  }

  const response = await fetch(`${BASE_URL}/visit-1`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.message || `Error ${response.status}`);
  }

  const raw = await response.json();
  return raw?.data ?? raw;
}

async function updateVisit1(
  id: number,
  payload: Visit1Payload,
): Promise<Visit1Response> {
  const res = await apiFetch<{ data: Visit1Response }>(`/visit-1/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return res?.data ?? (res as any);
}

async function uploadVisitImages(
  visitId: number,
  photos: LocalPhoto[],
): Promise<void> {
  const token = await getStoredToken();
  const formData = new FormData();
  for (const photo of photos) {
    formData.append("images", {
      uri: photo.uri,
      name: photo.fileName,
      type: photo.type,
    } as any);
  }

  const response = await fetch(`${BASE_URL}/visit-1/${visitId}/images`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Error al subir imágenes");
  }
}

async function deleteVisitImage(imageId: number): Promise<void> {
  await apiFetch(`/visit-1/images/${imageId}`, { method: "DELETE" });
  await invalidateVisitImageCache("visit1", imageId);
}

// ─── Date helpers ───────────────────────────────────────────────────────────

function todayString(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseRegistrationParts(iso: string | undefined): { date: string; time: string } {
  if (!iso?.trim()) return { date: todayString(), time: "09:00:00" };
  const m = iso.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/);
  if (m?.[1] && m[2]) {
    const t = m[2].length === 5 ? `${m[2]}:00` : m[2];
    return { date: m[1], time: t };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) {
    return { date: iso.trim(), time: "09:00:00" };
  }
  return { date: todayString(), time: "09:00:00" };
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  const months = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  const monthName = months[Number(m) - 1] ?? m;
  return `${d} de ${monthName} de ${y}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function VisitTab({ producerId, projectId }: VisitTabProps) {
  const { showAlert } = useAlert();

  // Bottom sheet ref
  const sheetRef = useRef<BottomSheetModal>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetSnapPoints = useMemo(() => ["94%"], []);

  // Form state
  /** Objetivos específicos del catálogo (GET /objetives/… o SQLite). */
  const [catalogSpecificLines, setCatalogSpecificLines] = useState<string[]>([]);
  /** `objetive` guardado en la visita remota/caché (edición). */
  const [savedVisitObjetive, setSavedVisitObjetive] = useState("");
  /** Si hay cola offline, se conserva el `objetive` congelado al guardar. */
  const [objectiveFromOfflineQueue, setObjectiveFromOfflineQueue] = useState<string | null>(null);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [masl, setMasl] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [commitments, setCommitments] = useState("");
  const [observations, setObservations] = useState("");
  const [attendanceId, setAttendanceId] = useState("");
  const [attendanceName, setAttendanceName] = useState("");
  const [attendanceIdentification, setAttendanceIdentification] = useState("");
  const [registrationDate, setRegistrationDate] = useState(todayString());
  const [registrationTime, setRegistrationTime] = useState("09:00:00");

  // Photos: local picks + existing server images
  const [localPhotos, setLocalPhotos] = useState<(LocalPhoto | null)[]>([null, null, null]);
  const [existingImages, setExistingImages] = useState<(VisitImage | null)[]>([null, null, null]);
  const [pendingImageDeletions, setPendingImageDeletions] = useState<number[]>([]);
  const {
    sources: remotePreviewSources,
    loading: remotePreviewsLoading,
    imageIds: remoteImageIds,
  } = useVisitRemotePhotoUris("visit1", existingImages);
  /** Tras sync se limpian localPhotos; se conserva URI local para preview si el remoto falla. */
  const [localFallbackUris, setLocalFallbackUris] = useState<(string | null)[]>([
    null,
    null,
    null,
  ]);

  // UI state — colapsadas por defecto al abrir el bottom sheet
  const [expandedSections, setExpandedSections] = useState<Set<SectionKey>>(
    () => new Set(),
  );
  const [showAttendanceDropdown, setShowAttendanceDropdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [existingVisitId, setExistingVisitId] = useState<number | null>(null);
  const [deletingPhotoIndex, setDeletingPhotoIndex] = useState<number | null>(null);
  const [methodAlreadyApplied, setMethodAlreadyApplied] = useState(false);
  const [objectivesApiLoading, setObjectivesApiLoading] = useState(false);

  const { saveDraft, readDraft, clearDraft } = useProducerFormDraft<Visit1FormDraft>({
    producerId,
    projectId,
    scope: "visit1",
  });
  const [draftHydrated, setDraftHydrated] = useState(false);
  const skipNextPersistRef = useRef(false);

  const scrollRef = useRef<ScrollView>(null);
  const authUser = useAuthStore((s) => s.user);
  const producerDetail = useProducerStore((s) => s.producerDetail);

  // ── Bottom sheet handlers ───────────────────────────────────────────

  const openSheet = useCallback(() => {
    setExpandedSections(new Set());
    sheetRef.current?.present();
    setSheetOpen(true);
  }, []);

  const handleSheetChange = useCallback((index: number) => {
    if (index === -1) setSheetOpen(false);
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

  // ── Section completion ──────────────────────────────────────────────────

  /** Líneas de objetivos específicos mostradas (misma lógica que `availableObjectives` en Visit1Dialog.vue). */
  const specificObjectiveLines = useMemo(() => {
    if (objectiveFromOfflineQueue != null) {
      return objectiveFromOfflineQueue
        .split(/\r?\n/)
        .map((t) => t.trim())
        .filter(Boolean);
    }
    if (isEditMode && savedVisitObjetive.trim()) {
      return savedVisitObjetive
        .split(/\r?\n/)
        .map((t) => t.trim())
        .filter(Boolean);
    }
    return catalogSpecificLines;
  }, [
    objectiveFromOfflineQueue,
    isEditMode,
    savedVisitObjetive,
    catalogSpecificLines,
  ]);

  const objetiveForPayload = useMemo(
    () => specificObjectiveLines.join("\n"),
    [specificObjectiveLines],
  );

  const sectionStatus = useMemo(() => {
    const hasPhotos =
      localPhotos.some((p) => p !== null) ||
      existingImages.some((img) => img !== null);
    const attendanceComplete =
      !!attendanceId && (attendanceId === "1" || !!attendanceName.trim());
    const locationStarted =
      !!lat.trim() || !!lng.trim() || !!masl.trim();

    return {
      location: locationStarted,
      objective: specificObjectiveLines.length > 0,
      diagnosis: !!diagnosis.trim(),
      recommendations: !!recommendations.trim(),
      commitments: !!commitments.trim(),
      observations: !!observations.trim(),
      photos: hasPhotos,
      attendance: attendanceComplete,
    };
  }, [
    lat,
    lng,
    masl,
    specificObjectiveLines,
    diagnosis,
    recommendations,
    commitments,
    observations,
    localPhotos,
    existingImages,
    attendanceId,
    attendanceName,
  ]);

  // ── Load existing visit ─────────────────────────────────────────────────

  useEffect(() => {
    if (!producerId || !projectId) return;

    let cancelled = false;
    setDraftHydrated(false);
    (async () => {
      setLoading(true);
      setCatalogSpecificLines([]);
      setSavedVisitObjetive("");
      setObjectiveFromOfflineQueue(null);
      setLat("");
      setLng("");
      setMasl("");
      setCommitments("");
      setAttendanceIdentification("");
      setRegistrationTime("09:00:00");
      setRegistrationDate(todayString());
      try {
        const userId = authUser?.user_id ?? 0;
        const pendingLocal =
          userId > 0
            ? await getPendingLocalVisit1(
                Number(producerId),
                Number(projectId),
                userId,
              )
            : null;
        if (cancelled) return;

        if (pendingLocal) {
          const payload: Visit1Payload = JSON.parse(pendingLocal.payload);
          const parsedPhotos = parseVisit1QueuePhotosColumn(pendingLocal.photos);
          const remoteVid = parsedPhotos.remote_visit_1_id;
          const hasRemote = remoteVid != null;
          setIsEditMode(hasRemote);
          setExistingVisitId(hasRemote ? remoteVid : null);
          setObjectiveFromOfflineQueue(payload.objetive || "");
          setDiagnosis(payload.diagnosis || "");
          setRecommendations(payload.recommendations || "");
          setCommitments(payload.commitments ?? "");
          setObservations(payload.observations || "");
          setAttendanceId(payload.attendance_id ? String(payload.attendance_id) : "");
          setAttendanceName(payload.attendance_name || "");
          setAttendanceIdentification(payload.attendance_identification ?? "");
          setLat(payload.lat != null ? String(payload.lat) : "");
          setLng(payload.lng != null ? String(payload.lng) : "");
          setMasl(
            payload.masl != null && Number.isFinite(payload.masl)
              ? String(payload.masl)
              : "",
          );
          if (payload.registration_date) {
            const { date, time } = parseRegistrationParts(payload.registration_date);
            setRegistrationDate(date);
            setRegistrationTime(time);
          }
          setLocalPhotos(parsedPhotos.photoSlots);
          setExistingImages(parsedPhotos.remoteImageSlots);
          setPendingImageDeletions(parsedPhotos.pendingImageDeletions);
        } else {
          setObjectiveFromOfflineQueue(null);
          setPendingImageDeletions([]);
          let data: Visit1Response | null = null;
          const online = await checkConnectivity();
          if (online) {
            try {
              data = await getVisit1(Number(projectId), Number(producerId));
              if (data && userId > 0 && data.id != null) {
                try {
                  await upsertVisitServerCache({
                    userId,
                    producerId: Number(producerId),
                    projectId: Number(projectId),
                    kind: "visit1",
                    jsonPayload: JSON.stringify(data),
                  });
                } catch (e) {
                  console.warn("visit1 server cache persist failed:", e);
                }
              }
            } catch {
              data = null;
            }
          }
          if (
            !data &&
            userId > 0 &&
            !cancelled
          ) {
            const raw = await getVisitServerCacheRaw(
              "visit1",
              Number(producerId),
              Number(projectId),
              userId,
            );
            if (raw) {
              try {
                data = JSON.parse(raw) as Visit1Response;
              } catch {
                data = null;
              }
            }
          }
          if (cancelled) return;

          if (data) {
            setIsEditMode(true);
            setExistingVisitId(data.id);
            setSavedVisitObjetive(data.objetive || "");
            setDiagnosis(data.diagnosis || "");
            setRecommendations(data.recommendations || "");
            setCommitments(data.commitments ?? "");
            setObservations(data.observations || "");
            setAttendanceId(data.attendance_id ? String(data.attendance_id) : "");
            setAttendanceName(data.attendance_name || "");
            setAttendanceIdentification(data.attendance_identification ?? "");
            setLat(data.lat != null ? String(data.lat) : "");
            setLng(data.lng != null ? String(data.lng) : "");
            setMasl(
              data.masl != null && Number.isFinite(Number(data.masl))
                ? String(data.masl)
                : "",
            );
            if (data.registration_date) {
              const { date, time } = parseRegistrationParts(data.registration_date);
              setRegistrationDate(date);
              setRegistrationTime(time);
            }

            const imgs = data.images ?? [];
            const newExisting: (VisitImage | null)[] = [null, null, null];
            imgs.slice(0, 3).forEach((img, i) => {
              newExisting[i] = img;
            });
            setExistingImages(newExisting);
          } else {
            setIsEditMode(false);
            setExistingVisitId(null);
            setSavedVisitObjetive("");
            setDiagnosis("");
            setRecommendations("");
            setCommitments("");
            setObservations("");
            setAttendanceId("");
            setAttendanceName("");
            setAttendanceIdentification("");
            setLat("");
            setLng("");
            setMasl("");
            setLocalPhotos([null, null, null]);
            setExistingImages([null, null, null]);
            setPendingImageDeletions([]);
          }
        }

        // Restore in-memory draft after API/queue hydrate (new + edit).
        const draft = readDraft();
        if (draft && !cancelled) {
          setLat(draft.lat);
          setLng(draft.lng);
          setMasl(draft.masl);
          setDiagnosis(draft.diagnosis);
          setRecommendations(draft.recommendations);
          setCommitments(draft.commitments);
          setObservations(draft.observations);
          setAttendanceId(draft.attendanceId);
          setAttendanceName(draft.attendanceName);
          setAttendanceIdentification(draft.attendanceIdentification);
          setRegistrationDate(draft.registrationDate);
          setRegistrationTime(draft.registrationTime);
          if (Array.isArray(draft.localPhotos)) {
            setLocalPhotos([
              draft.localPhotos[0] ?? null,
              draft.localPhotos[1] ?? null,
              draft.localPhotos[2] ?? null,
            ]);
          }
          if (Array.isArray(draft.existingImages)) {
            setExistingImages([
              draft.existingImages[0] ?? null,
              draft.existingImages[1] ?? null,
              draft.existingImages[2] ?? null,
            ]);
          }
          if (Array.isArray(draft.pendingImageDeletions)) {
            setPendingImageDeletions(draft.pendingImageDeletions);
          }
          // expandedSections: siempre colapsadas al abrir; no restaurar del draft
        }
      } catch (err) {
        console.warn("No se pudo consultar visita existente:", err);
      } finally {
        if (!cancelled) {
          skipNextPersistRef.current = true;
          setDraftHydrated(true);
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [producerId, projectId, authUser, readDraft]);

  // Persist in-memory draft on form edits (after load + hydrate).
  useEffect(() => {
    if (loading || !draftHydrated) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    saveDraft({
      lat,
      lng,
      masl,
      diagnosis,
      recommendations,
      commitments,
      observations,
      attendanceId,
      attendanceName,
      attendanceIdentification,
      registrationDate,
      registrationTime,
      localPhotos,
      existingImages,
      pendingImageDeletions,
      expandedSections: Array.from(expandedSections),
    });
  }, [
    loading,
    draftHydrated,
    lat,
    lng,
    masl,
    diagnosis,
    recommendations,
    commitments,
    observations,
    attendanceId,
    attendanceName,
    attendanceIdentification,
    registrationDate,
    registrationTime,
    localPhotos,
    existingImages,
    pendingImageDeletions,
    expandedSections,
    saveDraft,
  ]);

  // Check if method already applied (for apply/re-apply guard)
  useEffect(() => {
    if (!producerId || !projectId) return;
    const pid = Number(producerId);
    const projId = Number(projectId);
    (async () => {
      const applied = await useCharacterizationStore.getState().hasInterventionMethodApplied(
        pid,
        projId,
        VISIT_INTERVENTION_METHOD_ID,
      );
      setMethodAlreadyApplied(applied);
    })();
  }, [producerId, projectId]);

  /** Objetivos del catálogo GET …/event/4/line/:id (Visita 1). También en edición (no pisa texto ya guardado). */
  useEffect(() => {
    if (!producerId || !projectId || loading) return;

    const lineId = readProductionLineId(
      producerDetail as { production_line_id?: number | null } | null,
    );
    if (lineId == null) return;

    let cancelled = false;
    setObjectivesApiLoading(true);

    void (async () => {
      const items = await getObjectivesForEventAndLine(
        VISIT_OBJECTIVE_EVENT_IDS.visit1,
        lineId,
      );
      if (cancelled) return;
      setObjectivesApiLoading(false);

      if (items == null || items.length === 0) {
        if (!cancelled) setCatalogSpecificLines([]);
        return;
      }

      const specifics = objectiveItemsToSpecificLines(items);
      if (!cancelled) setCatalogSpecificLines(specifics);
    })();

    return () => {
      cancelled = true;
      setObjectivesApiLoading(false);
    };
  }, [producerId, projectId, producerDetail, loading]);

  // ── Toggle section ──────────────────────────────────────────────────────

  const toggleSection = useCallback((key: SectionKey) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ── Photo handling ──────────────────────────────────────────────────────

  const applyOptimizedPhoto = useCallback(async (
    index: number,
    asset: { uri: string; fileName?: string | null; width?: number; height?: number },
  ) => {
    try {
      const optimized = await optimizeImageToWebp({
        uri: asset.uri,
        fileName: asset.fileName || `photo_${Date.now()}.jpg`,
        width: asset.width,
        height: asset.height,
      });
      const photo: LocalPhoto = {
        uri: optimized.uri,
        fileName: optimized.fileName,
        type: optimized.type,
      };

      const existing = existingImages[index];
      if (existing) {
        const online = await checkConnectivity();
        if (online) {
          try {
            await deleteVisitImage(existing.id);
          } catch {
            setPendingImageDeletions((prev) =>
              prev.includes(existing.id) ? prev : [...prev, existing.id],
            );
          }
        } else {
          setPendingImageDeletions((prev) =>
            prev.includes(existing.id) ? prev : [...prev, existing.id],
          );
        }
        setExistingImages((prev) => {
          const n = [...prev];
          n[index] = null;
          return n;
        });
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
  }, [existingImages, showAlert]);

  const pickImage = useCallback(async (index: number) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showAlert({ title: "Permisos", message: "Se necesitan permisos para acceder a la galería.", type: "warning" });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
    });

    if (result.canceled || !result.assets?.[0]) return;

    await applyOptimizedPhoto(index, result.assets[0]);
  }, [applyOptimizedPhoto, showAlert]);

  const takePhoto = useCallback(async (index: number) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      showAlert({ title: "Permisos", message: "Se necesitan permisos para acceder a la cámara.", type: "warning" });
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ quality: 1 });

    if (result.canceled || !result.assets?.[0]) return;

    await applyOptimizedPhoto(index, result.assets[0]);
  }, [applyOptimizedPhoto, showAlert]);

  const showPhotoOptions = useCallback((index: number) => {
    showAlert({
      title: "Agregar imagen",
      message: "Seleccione una opción",
      type: "info",
      buttons: [
        { text: "Cámara", onPress: () => takePhoto(index) },
        { text: "Galería", onPress: () => pickImage(index) },
      ],
    });
  }, [pickImage, takePhoto]);

  const removePhoto = useCallback(async (index: number) => {
    const existing = existingImages[index];
    if (existing) {
      setDeletingPhotoIndex(index);
      const online = await checkConnectivity();
      if (online) {
        try {
          await deleteVisitImage(existing.id);
        } catch {
          showAlert({ title: "Error", message: "No se pudo eliminar la imagen", type: "error" });
          setDeletingPhotoIndex(null);
          return;
        }
      } else {
        setPendingImageDeletions((prev) =>
          prev.includes(existing.id) ? prev : [...prev, existing.id],
        );
      }
      setExistingImages((prev) => {
        const n = [...prev];
        n[index] = null;
        return n;
      });
      setDeletingPhotoIndex(null);
    }
    setLocalPhotos((prev) => {
      const n = [...prev];
      n[index] = null;
      return n;
    });
  }, [existingImages, showAlert]);

  // ── Save ──────────────────────────────────────────────────────────────

const handleSave = useCallback(async () => {
    if (!isValidCoordinate(lat)) {
      showAlert({
        title: "Coordenadas",
        message:
          "Revise latitud: solo números 0-9, un guion inicial y un punto como máximo.",
        type: "warning",
      });
      return;
    }
    if (!isValidCoordinate(lng)) {
      showAlert({
        title: "Coordenadas",
        message:
          "Revise longitud: solo números 0-9, un guion inicial y un punto como máximo.",
        type: "warning",
      });
      return;
    }
    if (!masl.trim()) {
      showAlert({
        title: "Campo requerido",
        message: "Ingrese la altura sobre el nivel del mar (ASNM).",
        type: "warning",
      });
      return;
    }
    const lineId = readProductionLineId(
      producerDetail as { production_line_id?: number | null } | null,
    );
    if (!objetiveForPayload.trim()) {
      showAlert({
        title: "Campo requerido",
        message:
          lineId == null
            ? "Falta el id de línea productiva principal del productor; no se pueden cargar los objetivos."
            : "No hay objetivos específicos disponibles para esta línea y visita. Descargue datos con conexión o sincronice.",
        type: "warning",
      });
      return;
    }
    if (!diagnosis.trim()) {
      showAlert({ title: "Campo requerido", message: "Ingrese el diagnóstico de la visita.", type: "warning" });
      return;
    }
    if (!recommendations.trim()) {
      showAlert({
        title: "Campo requerido",
        message: "Ingrese las recomendaciones generales.",
        type: "warning",
      });
      return;
    }
    if (!attendanceId) {
      showAlert({ title: "Campo requerido", message: "Seleccione quién atiende el acompañamiento.", type: "warning" });
      return;
    }
    if (attendanceId !== "1" && !attendanceName.trim()) {
      showAlert({ title: "Campo requerido", message: "Ingrese el nombre de la persona que atiene.", type: "warning" });
      return;
    }
    if (
      attendanceId !== "1" &&
      attendanceIdentification.trim() &&
      !/^\d+$/.test(attendanceIdentification.trim())
    ) {
      showAlert({
        title: "Identificación",
        message: "El número de identificación solo debe contener dígitos (0-9).",
        type: "warning",
      });
      return;
    }

    const maslNum = Number(masl.trim());
    const regDate = `${registrationDate} ${registrationTime.trim() || "09:00:00"}`;

    setSaving(true);
    try {
      const payload: Visit1Payload = {
        project_id: Number(projectId),
        producer_id: Number(producerId),
        objetive: objetiveForPayload.trim(),
        diagnosis: diagnosis.trim(),
        recommendations: recommendations.trim(),
        observations: observations.trim(),
        compliance_recommendation_id: 3,
        registration_date: regDate,
        attendance_id: Number(attendanceId),
        attendance_name: attendanceId !== "1" ? attendanceName.trim() : null,
        origin: "app",
        lat: lat.trim() || null,
        lng: lng.trim() || null,
        masl: Number.isFinite(maslNum) ? maslNum : null,
        commitments: commitments.trim() || null,
        attendance_identification:
          attendanceId !== "1"
            ? attendanceIdentification.trim() || null
            : null,
      };

      const newPhotos = localPhotos.filter((p): p is LocalPhoto => p !== null);
      const isOnline = await checkConnectivity();
      const userId = authUser?.user_id ?? 0;

      if (isOnline) {
        if (isEditMode && existingVisitId) {
          await updateVisit1(existingVisitId, payload);
          setSavedVisitObjetive(payload.objetive);
          for (const imgId of pendingImageDeletions) {
            try {
              await deleteVisitImage(imgId);
            } catch {
              /* se reintentará en próxima sync si queda en cola */
            }
          }
          if (newPhotos.length > 0) {
            try {
              await uploadVisitImages(existingVisitId, newPhotos);
            } catch {
              showAlert({ title: "Aviso", message: "La visita se actualizó pero hubo un error al subir las fotos.", type: "warning" });
            }
          }
          // Refetch images so slots match server
          try {
            const fresh = await getVisit1(Number(projectId), Number(producerId));
            if (fresh) {
              const newExisting: (VisitImage | null)[] = [null, null, null];
              (fresh.images ?? []).slice(0, 3).forEach((img, i) => {
                newExisting[i] = img;
              });
              setExistingImages(newExisting);
              if (userId > 0) {
                await upsertVisitServerCache({
                  userId,
                  producerId: Number(producerId),
                  projectId: Number(projectId),
                  kind: "visit1",
                  jsonPayload: JSON.stringify(fresh),
                });
              }
            }
          } catch {
            /* ignore */
          }
          setPendingImageDeletions([]);
          showAlert({ title: "Éxito", message: "Visita 1 actualizada exitosamente.", type: "success" });
        } else {
          let result: Visit1Response;
          if (newPhotos.length > 0) {
            result = await createVisit1WithImages(payload, newPhotos);
          } else {
            result = await createVisit1(payload);
          }
          setExistingVisitId(result?.id ?? null);
          setIsEditMode(true);
          if (result?.objetive != null) setSavedVisitObjetive(result.objetive);
          const newExisting: (VisitImage | null)[] = [null, null, null];
          (result?.images ?? []).slice(0, 3).forEach((img, i) => {
            newExisting[i] = img;
          });
          setExistingImages(newExisting);
          setPendingImageDeletions([]);
          showAlert({ title: "Éxito", message: "Visita 1 guardada exitosamente.", type: "success" });
        }
        setLocalFallbackUris(localPhotos.map((p) => p?.uri ?? null));
        setLocalPhotos([null, null, null]);
      } else {
        const visitUuid = `${userId}-${producerId}-${projectId}-visit1-offline`;
        const remoteForQueue =
          isEditMode && existingVisitId != null && Number.isFinite(existingVisitId)
            ? existingVisitId
            : null;
        const persistedSlots = await persistLocalVisitPhotoSlots(localPhotos, {
          kind: "visit1",
          userId,
          producerId: Number(producerId),
          projectId: Number(projectId),
        });
        const photosForQueue = persistedSlots.filter(
          (p): p is LocalPhoto => p !== null,
        );
        await enqueueVisit1(
          visitUuid,
          payload,
          photosForQueue,
          userId,
          remoteForQueue,
          {
            photoSlots: persistedSlots,
            remoteImageSlots: existingImages,
            pendingImageDeletions,
          },
        );
        await markInterventionMethodApplied(
          Number(producerId),
          Number(projectId),
          VISIT_INTERVENTION_METHOD_ID,
          userId,
        );
        setMethodAlreadyApplied(true);
        if (remoteForQueue != null) {
          setIsEditMode(true);
          setExistingVisitId(remoteForQueue);
        } else {
          setIsEditMode(false);
          setExistingVisitId(null);
        }
        setLocalPhotos(persistedSlots);
        showAlert({
          title: "Sin internet",
          message: "La visita se guardó localmente y se enviará al sincronizar.",
          type: "warning",
        });
      }
      skipNextPersistRef.current = true;
      clearDraft();
    } catch (error) {
      console.error("Error al guardar visita 1:", error);
      showAlert({
        title: "Error",
        message: error instanceof Error ? error.message : "No se pudo guardar la visita.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }, [
    lat,
    lng,
    masl,
    objetiveForPayload,
    producerDetail,
    diagnosis,
    recommendations,
    commitments,
    observations,
    attendanceId,
    attendanceName,
    attendanceIdentification,
    registrationDate,
    registrationTime,
    producerId,
    projectId,
    localPhotos,
    isEditMode,
    existingVisitId,
    existingImages,
    pendingImageDeletions,
    showAlert,
    authUser,
    clearDraft,
  ]);

  // ── Render: section header ────────────────────────────────────────────

  const renderSectionHeader = useCallback(
    (section: SectionConfig, isDone: boolean) => {
      const isExpanded = expandedSections.has(section.key);
      const Icon = section.icon;

      return (
        <View style={styles.sectionHeader}>
          <TouchableOpacity
            style={styles.sectionHeaderPressable}
            onPress={() => toggleSection(section.key)}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.sectionBadge,
                { backgroundColor: isDone ? "rgba(26,122,58,0.12)" : `${section.color}15` },
              ]}
            >
              {isDone ? (
                <Check size={responsiveFont(14)} color="#1a7a3a" />
              ) : (
                <Icon size={responsiveFont(14)} color={section.color} />
              )}
            </View>
            <View style={styles.sectionHeaderText}>
              <AccentedText type="defaultSemiBold" style={styles.sectionTitle}>
                {`${section.sectionNum}. ${section.label}`}
              </AccentedText>
            </View>
            {isExpanded ? (
              <ChevronUp size={responsiveFont(18)} color="#999" />
            ) : (
              <ChevronDown size={responsiveFont(18)} color="#999" />
            )}
          </TouchableOpacity>
          {section.info ? (
            <InfoPopover
              title={section.shortLabel}
              content={section.info}
              iconSize={16}
              iconColor={section.color}
            />
          ) : null}
        </View>
      );
    },
    [expandedSections, toggleSection],
  );

  // ── Render: text section content ──────────────────────────────────────

  const renderTextSection = useCallback(
    (
      sectionKey: SectionKey,
      value: string,
      onChangeText: (t: string) => void,
      placeholder: string,
      topContent?: React.ReactNode,
    ) => {
      if (!expandedSections.has(sectionKey)) return null;
      return (
        <View style={styles.sectionContent}>
          {topContent}
          <TextInput
            style={styles.textArea}
            value={value}
            onChangeText={onChangeText}
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

  const mainProductiveLineName = useMemo(() => {
    const d = producerDetail as { production_line?: { name?: string } } | null;
    return (d?.production_line?.name ?? "").trim();
  }, [producerDetail]);

  const renderLocationContent = useCallback(() => {
    if (!expandedSections.has("location")) return null;
    return (
      <View style={styles.sectionContent}>
        <ThemedText style={styles.fieldLabel}>Latitud</ThemedText>
        <TextInput
          style={styles.textInput}
          value={lat}
          onChangeText={setLat}
          placeholder="Ej: 8.7489"
          placeholderTextColor="#aaa"
          keyboardType="numeric"
        />
        <ThemedText style={[styles.fieldLabel, { marginTop: verticalScale(10) }]}>Longitud</ThemedText>
        <TextInput
          style={styles.textInput}
          value={lng}
          onChangeText={setLng}
          placeholder="Ej: -75.8814"
          placeholderTextColor="#aaa"
          keyboardType="numeric"
        />
        <ThemedText style={[styles.fieldLabel, { marginTop: verticalScale(10) }]}>ASNM (metros)</ThemedText>
        <TextInput
          style={styles.textInput}
          value={masl}
          onChangeText={setMasl}
          placeholder="Ej: 150"
          placeholderTextColor="#aaa"
          keyboardType="number-pad"
        />
      </View>
    );
  }, [expandedSections, lat, lng, masl]);

  const renderObjectiveContent = useCallback(() => {
    if (!expandedSections.has("objective")) return null;
    const lineHint = mainProductiveLineName
      ? ` (${mainProductiveLineName})`
      : "";
    return (
      <View style={styles.sectionContent}>
        {objectivesApiLoading ? (
          <View style={styles.objectivesLoadingRow}>
            <ActivityIndicator size="small" color="#1a7a3a" />
            <ThemedText style={styles.objectivesLoadingText}>
              Cargando objetivos desde el servidor…
            </ThemedText>
          </View>
        ) : null}
        <View style={styles.generalObjectiveBox}>
          <ThemedText style={styles.generalObjectiveLabel}>Objetivo General (fijo)</ThemedText>
          <ThemedText style={styles.generalObjectiveText}>{VISIT1_GENERAL_OBJECTIVE_FIXED}</ThemedText>
        </View>
        {specificObjectiveLines.length > 0 ? (
          <View style={styles.objectivesReadonlyPanel}>
            {specificObjectiveLines.map((obj, idx) => (
              <View key={`${idx}-${obj.slice(0, 24)}`}>
                {idx > 0 ? <View style={styles.objectivesReadonlySeparator} /> : null}
                <ThemedText style={styles.objectivesReadonlyParagraph}>
                  <ThemedText style={styles.objectivesReadonlyIndex}>{idx + 1}. </ThemedText>
                  {obj}
                </ThemedText>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.objectivesEmptyPanel}>
            <ThemedText style={styles.objectivesEmptyText}>
              {`No hay objetivos configurados para la línea productiva principal${lineHint}.`}
            </ThemedText>
          </View>
        )}
        {specificObjectiveLines.length > 0 ? (
          <ThemedText style={styles.objectivesFooterNote}>
            {isEditMode
              ? `Objetivos específicos registrados en esta visita${lineHint ? ` (${mainProductiveLineName})` : ""}.`
              : `Se cargaron ${specificObjectiveLines.length} objetivo${specificObjectiveLines.length === 1 ? "" : "s"}${lineHint ? ` para ${mainProductiveLineName}` : ""}.`}
          </ThemedText>
        ) : null}
      </View>
    );
  }, [
    expandedSections,
    objectivesApiLoading,
    specificObjectiveLines,
    mainProductiveLineName,
    isEditMode,
  ]);

  // ── Render: photo slots ───────────────────────────────────────────────

  const photoSlotModels = useMemo(
    () =>
      [0, 1, 2].map((index) => {
        const localPhoto = localPhotos[index];
        const existingImg = existingImages[index];
        const hasPhoto = localPhoto !== null || existingImg !== null;
        const remoteSource = existingImg ? remotePreviewSources[index] ?? null : null;
        const fallbackUri = existingImg ? localFallbackUris[index] ?? null : null;
        const displaySource = localPhoto?.uri ?? fallbackUri ?? remoteSource;
        const usingRemote =
          !localPhoto?.uri && !fallbackUri && remoteSource != null;
        return {
          displaySource,
          label: localPhoto?.fileName ?? existingImg?.filename ?? `Foto ${index + 1}`,
          hasPhoto,
          isDeleting: deletingPhotoIndex === index,
          isLoadingPreview:
            !!existingImg &&
            !localPhoto &&
            !displaySource &&
            remotePreviewsLoading,
          remoteKind: usingRemote ? ("visit1" as const) : undefined,
          remoteImageId: usingRemote ? remoteImageIds[index] : null,
        };
      }),
    [
      localPhotos,
      existingImages,
      remotePreviewSources,
      remoteImageIds,
      localFallbackUris,
      remotePreviewsLoading,
      deletingPhotoIndex,
    ],
  );

  // ── Render: attendance content ────────────────────────────────────────

  const renderAttendanceContent = useCallback(() => {
    if (!expandedSections.has("attendance")) return null;

    const selectedOption = ATTENDANCE_OPTIONS.find((o) => o.id === attendanceId);

    return (
      <View style={styles.sectionContent}>
        <View style={styles.fieldRow}>
          <View style={styles.fieldHalf}>
            <ThemedText style={styles.fieldLabel}>Fecha de registro</ThemedText>
            <TextInput
              style={styles.textInput}
              value={registrationDate}
              onChangeText={setRegistrationDate}
              placeholder="AAAA-MM-DD"
              placeholderTextColor="#aaa"
            />
            <ThemedText style={styles.fieldHintSmall}>
              Mostrada también como: {formatDisplayDate(registrationDate)}
            </ThemedText>
          </View>
          <View style={styles.fieldHalf}>
            <ThemedText style={styles.fieldLabel}>Hora de registro</ThemedText>
            <TextInput
              style={styles.textInput}
              value={registrationTime}
              onChangeText={setRegistrationTime}
              placeholder="09:00:00"
              placeholderTextColor="#aaa"
            />
          </View>
        </View>

        <View style={styles.fieldRow}>
          <View style={styles.fieldHalf}>
            <ThemedText style={styles.fieldLabel}>Origen registro</ThemedText>
            <View style={styles.originBadge}>
              <ThemedText style={styles.originBadgeText}>App</ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.separator} />

        <ThemedText type="defaultSemiBold" style={styles.attendanceTitle}>
          Nombre Persona quien atiende el Acompañamiento
        </ThemedText>

        <TouchableOpacity
          style={styles.dropdown}
          onPress={() => setShowAttendanceDropdown(!showAttendanceDropdown)}
          activeOpacity={0.7}
        >
          <ThemedText
            style={[styles.dropdownText, !attendanceId && styles.dropdownPlaceholder]}
          >
            {selectedOption?.label ?? "Seleccione una opción"}
          </ThemedText>
          <ChevronDown size={responsiveFont(16)} color="#999" />
        </TouchableOpacity>

        {showAttendanceDropdown && (
          <View style={styles.dropdownOptions}>
            {ATTENDANCE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.dropdownOption,
                  attendanceId === opt.id && styles.dropdownOptionActive,
                ]}
                onPress={() => {
                  setAttendanceId(opt.id);
                  setShowAttendanceDropdown(false);
                  if (opt.id === "1") {
                    setAttendanceName("");
                    setAttendanceIdentification("");
                  }
                }}
              >
                <ThemedText
                  style={[
                    styles.dropdownOptionText,
                    attendanceId === opt.id && styles.dropdownOptionTextActive,
                  ]}
                >
                  {opt.label}
                </ThemedText>
                {attendanceId === opt.id && (
                  <Check size={responsiveFont(14)} color="#1a7a3a" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {attendanceId && attendanceId !== "1" && (
          <View style={styles.conditionalField}>
            <View style={styles.conditionalIndicator} />
            <View style={styles.conditionalContent}>
              <ThemedText style={styles.fieldLabel}>
                {attendanceId === "4"
                  ? "Especifique el nombre"
                  : `Nombre del ${selectedOption?.label ?? ""}`}
              </ThemedText>
              <ThemedText style={styles.fieldHintSmall}>
                Solo se habilita si selecciona una opción diferente a Usuario Productor.
                Ejemplo: Rosa María Perez López (Hija), Martin Rojas González (Vecino)
              </ThemedText>
              <TextInput
                style={styles.textInput}
                value={attendanceName}
                onChangeText={setAttendanceName}
                placeholder="Nombre completo y parentesco. Ej: Rosa María Perez López (Hija)"
                placeholderTextColor="#aaa"
              />
              <ThemedText style={[styles.fieldLabel, { marginTop: verticalScale(12) }]}>
                Número de identificación de quien atiende
              </ThemedText>
              <TextInput
                style={styles.textInput}
                value={attendanceIdentification}
                onChangeText={setAttendanceIdentification}
                placeholder="Número de documento de identidad (solo dígitos si aplica)"
                placeholderTextColor="#aaa"
                keyboardType="number-pad"
              />
            </View>
          </View>
        )}
      </View>
    );
  }, [
    expandedSections,
    registrationDate,
    registrationTime,
    attendanceId,
    attendanceName,
    attendanceIdentification,
    showAttendanceDropdown,
  ]);

  // ── Loading state ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a7a3a" />
        <ThemedText style={styles.loadingText}>
          Consultando datos de la visita...
        </ThemedText>
      </View>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────

  const completedCount = Object.values(sectionStatus).filter(Boolean).length;
  const totalSections = SECTIONS.length;

  return (
    <View style={styles.container}>
      {/* Summary card — always visible */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <CalendarCheck size={responsiveFont(24)} color="#1a7a3a" />
          <View style={styles.summaryHeaderText}>
            <ThemedText type="defaultSemiBold" style={styles.summaryTitle}>
              {isEditMode ? "Visita 1 registrada" : "Visita 1"}
            </ThemedText>
            <ThemedText style={styles.summarySubtitle}>
              Formulario de enfoque técnico productivo y acompañamiento
            </ThemedText>
          </View>
        </View>

        {/* Progress indicator */}
        <View style={styles.summaryProgressRow}>
          <View style={styles.summaryProgressTrack}>
            <View
              style={[
                styles.summaryProgressFill,
                { width: `${(completedCount / totalSections) * 100}%` },
              ]}
            />
          </View>
          <ThemedText style={styles.summaryProgressLabel}>
            {completedCount}/{totalSections} secciones
          </ThemedText>
        </View>

        {/* Open sheet button */}
        <TouchableOpacity
          style={styles.openSheetButton}
          onPress={openSheet}
          activeOpacity={0.8}
        >
          <ClipboardList size={responsiveFont(20)} color="#fff" />
          <ThemedText style={styles.openSheetButtonText}>
            {isEditMode ? "Editar formulario" : "Diligenciar formulario"}
          </ThemedText>
        </TouchableOpacity>

      </View>

      {/* Bottom Sheet with the full form */}
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
        {/* Sheet header */}
        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <ThemedText
              type="defaultSemiBold"
              style={styles.sheetTitle}
              lightColor="#333"
              darkColor="#333"
            >
              {isEditMode ? "Editar Visita 1" : "Aplicar Visita 1"}
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

        {/* Sheet body */}
        <BottomSheetScrollView
          contentContainerStyle={styles.sheetScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.section}>
            {renderSectionHeader(
              SECTIONS.find((s) => s.key === "location")!,
              sectionStatus.location,
            )}
            {renderLocationContent()}
          </View>

          <View style={styles.section}>
            {renderSectionHeader(
              SECTIONS.find((s) => s.key === "objective")!,
              sectionStatus.objective,
            )}
            {renderObjectiveContent()}
          </View>

          <View style={styles.section}>
            {renderSectionHeader(
              SECTIONS.find((s) => s.key === "diagnosis")!,
              sectionStatus.diagnosis,
            )}
            {renderTextSection(
              "diagnosis",
              diagnosis,
              setDiagnosis,
              "Describa detalladamente el diagnóstico técnico inicial del sistema productivo, teniendo en cuenta cada uno de los objetivos específicos del acompañamiento definidos por la EPSEA Universidad de Córdoba. Resalte puntualmente las principales fortalezas y problemáticas de la línea principal a atender.",
            )}
          </View>

          <View style={styles.section}>
            {renderSectionHeader(
              SECTIONS.find((s) => s.key === "recommendations")!,
              sectionStatus.recommendations,
            )}
            {renderTextSection(
              "recommendations",
              recommendations,
              setRecommendations,
              "Plantee estas recomendaciones técnicas de acuerdo al diagnóstico inicial encontrado en la unidad productiva. Redacte recomendaciones profesionales, relevantes y en procura de mejorar los aspectos de la extensión del usuario a intervenir y adaptadas a las condiciones del sistema productivo.",
            )}
          </View>

          <View style={styles.section}>
            {renderSectionHeader(
              SECTIONS.find((s) => s.key === "commitments")!,
              sectionStatus.commitments,
            )}
            {renderTextSection(
              "commitments",
              commitments,
              setCommitments,
              "Redacte compromisos puntuales, de manera clara, acordes a los objetivos específicos del acompañamiento (si aplican), medibles y realizables dentro del tiempo del acompañamiento.",
            )}
          </View>

          <View style={styles.section}>
            {renderSectionHeader(
              SECTIONS.find((s) => s.key === "observations")!,
              sectionStatus.observations,
            )}
            {renderTextSection(
              "observations",
              observations,
              setObservations,
              "Describa aquí, si aplica, cualquier otra situación particular que considere relevante para la realización del acompañamiento, o para dejar trazabilidad de las evidencias del mismo.",
            )}
          </View>

          <View style={styles.section}>
            {renderSectionHeader(
              SECTIONS.find((s) => s.key === "photos")!,
              sectionStatus.photos,
            )}
            {expandedSections.has("photos") && (
              <View style={styles.sectionContent}>
                <VisitPhotoSlots
                  slots={photoSlotModels}
                  onAdd={showPhotoOptions}
                  onRemove={removePhoto}
                  showAlert={showAlert}
                />
              </View>
            )}
          </View>

          <View style={styles.section}>
            {renderSectionHeader(
              SECTIONS.find((s) => s.key === "attendance")!,
              sectionStatus.attendance,
            )}
            {renderAttendanceContent()}
          </View>

          {/* Save button */}
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
                  ? "Actualizar Visita"
                  : "Guardar Visita"}
            </ThemedText>
          </TouchableOpacity>

          <View style={{ height: verticalScale(32) }} />
        </BottomSheetScrollView>
      </BottomSheetModal>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: verticalScale(12),
    paddingHorizontal: widthScale(4),
  },

  // Summary card
  summaryCard: {
    backgroundColor: "#fff",
    borderRadius: widthScale(14),
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    padding: widthScale(18),
    gap: verticalScale(14),
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: widthScale(12),
  },
  summaryHeaderText: {
    flex: 1,
  },
  summaryTitle: {
    fontSize: responsiveFont(20),
  },
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

  // Bottom sheet
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
  sheetTitle: {
    fontSize: responsiveFont(22),
  },
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

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: verticalScale(12),
  },
  loadingText: {
    fontSize: responsiveFont(15),
    color: "#666",
  },

  // Sections
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
    gap: widthScale(8),
  },
  sectionHeaderPressable: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: widthScale(10),
  },
  sectionBadge: {
    width: widthScale(28),
    height: widthScale(28),
    borderRadius: widthScale(14),
    justifyContent: "center",
    alignItems: "center",
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: responsiveFont(16),
    lineHeight: responsiveFont(20),
  },
  sectionSubtitle: {
    fontSize: responsiveFont(13),
    color: "#999",
    lineHeight: responsiveFont(16),
  },
  sectionContent: {
    paddingHorizontal: widthScale(14),
    paddingBottom: verticalScale(14),
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  sectionHint: {
    fontSize: responsiveFont(14),
    color: "#666",
    lineHeight: responsiveFont(19),
    marginTop: verticalScale(10),
    marginBottom: verticalScale(8),
  },
  objectivesLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: widthScale(10),
    marginBottom: verticalScale(8),
  },
  objectivesLoadingText: {
    fontSize: responsiveFont(13),
    color: "#555",
  },
  generalObjectiveBox: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    borderRadius: widthScale(8),
    paddingHorizontal: widthScale(12),
    paddingVertical: verticalScale(10),
    marginBottom: verticalScale(10),
  },
  generalObjectiveLabel: {
    fontSize: responsiveFont(10),
    fontWeight: "700",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: verticalScale(4),
  },
  generalObjectiveText: {
    fontSize: responsiveFont(13),
    color: "#555",
    lineHeight: responsiveFont(19),
  },
  objectivesReadonlyPanel: {
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    borderRadius: widthScale(8),
    paddingHorizontal: widthScale(12),
    paddingVertical: verticalScale(12),
  },
  objectivesEmptyPanel: {
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.35)",
    borderStyle: "dashed",
    borderRadius: widthScale(8),
    paddingHorizontal: widthScale(12),
    paddingVertical: verticalScale(18),
  },
  objectivesEmptyText: {
    fontSize: responsiveFont(14),
    color: "#92400e",
    textAlign: "center",
    lineHeight: responsiveFont(20),
  },
  objectivesReadonlySeparator: {
    height: 1,
    backgroundColor: "rgba(0,0,0,0.1)",
    marginVertical: verticalScale(14),
  },
  objectivesReadonlyParagraph: {
    fontSize: responsiveFont(15),
    color: "#222",
    lineHeight: responsiveFont(22),
  },
  objectivesReadonlyIndex: {
    fontSize: responsiveFont(15),
    fontWeight: "700",
    color: "#666",
  },
  objectivesFooterNote: {
    fontSize: responsiveFont(11),
    color: "#666",
    lineHeight: responsiveFont(16),
    marginTop: verticalScale(8),
  },
  photoHintItalic: {
    fontStyle: "italic",
    marginTop: verticalScale(4),
  },

  // Text areas
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
  // Photos
  photosGrid: {
    flexDirection: "row",
    gap: widthScale(10),
  },
  photoSlot: {
    flex: 1,
    aspectRatio: 4 / 3,
    borderRadius: widthScale(8),
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    backgroundColor: "#f0f0f0",
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  photoRemoveBtn: {
    position: "absolute",
    top: widthScale(4),
    right: widthScale(4),
    width: widthScale(24),
    height: widthScale(24),
    borderRadius: widthScale(12),
    backgroundColor: "rgba(220,38,38,0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  photoLabel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: widthScale(6),
    paddingVertical: verticalScale(2),
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

  // Attendance section
  fieldRow: {
    flexDirection: "row",
    gap: widthScale(12),
    marginTop: verticalScale(10),
  },
  fieldHalf: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: responsiveFont(13),
    fontWeight: "700",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: verticalScale(4),
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
  originBadge: {
    backgroundColor: "rgba(26,122,58,0.1)",
    borderRadius: widthScale(6),
    paddingHorizontal: widthScale(12),
    paddingVertical: verticalScale(8),
    alignSelf: "flex-start",
  },
  originBadgeText: {
    fontSize: responsiveFont(15),
    fontWeight: "600",
    color: "#1a7a3a",
  },
  separator: {
    height: 1,
    backgroundColor: "rgba(0,0,0,0.08)",
    marginVertical: verticalScale(12),
  },
  attendanceTitle: {
    fontSize: responsiveFont(16),
    marginBottom: verticalScale(8),
  },
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
  dropdownText: {
    fontSize: responsiveFont(16),
    color: "#333",
  },
  dropdownPlaceholder: {
    color: "#aaa",
  },
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
  dropdownOptionText: {
    fontSize: responsiveFont(16),
    color: "#333",
  },
  dropdownOptionTextActive: {
    color: "#1a7a3a",
    fontWeight: "600",
  },
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
  conditionalContent: {
    flex: 1,
  },
  fieldHintSmall: {
    fontSize: responsiveFont(12),
    color: "#999",
    marginBottom: verticalScale(6),
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

  // Save button
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: widthScale(8),
    backgroundColor: "#1a7a3a",
    borderRadius: widthScale(10),
    paddingVertical: verticalScale(14),
    marginTop: verticalScale(8),
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: responsiveFont(17),
    fontWeight: "700",
    color: "#fff",
  },

});
