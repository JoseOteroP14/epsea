import { ThemedText } from "@/components/themed-text";
import { useAlert } from "@/components/ui/custom-alert";
import { checkConnectivity } from "@/hooks/use-network";
import { useAuthStore } from "@/store/useAuthStore";
import {
    VISIT2_INTERVENTION_METHOD_ID,
    useCharacterizationStore
} from "@/store/useCharacterizationStore";
import { useProducerStore } from "@/store/useProducerStore";
import { apiFetch } from "@/utils/api";
import {
    markInterventionMethodApplied,
} from "@/utils/database/repositories/producer-intervention-repository";
import { getVisitServerCacheRaw } from "@/utils/database/repositories/server-extensionist-cache-repository";
import {
    enqueueVisit2,
    getPendingLocalVisit2,
    type LocalPhoto,
    type Visit2MonitoringCommitment,
    type Visit2Payload,
    type Visit2QueueExtras,
} from "@/utils/database/repositories/visit2-repository";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import { getStoredToken } from "@/utils/secure-storage";
import {
    BottomSheetBackdrop,
    BottomSheetModal,
    BottomSheetScrollView,
    type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import {
    Camera,
    Check,
    ChevronDown,
    ChevronUp,
    ClipboardList,
    FileText,
    ImagePlus,
    MessageSquare,
    PencilLine,
    Plus,
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

interface Visit2TabProps {
    producerId: string;
    projectId?: string;
}

interface Visit2Image {
    id: number;
    filename: string;
}

interface Visit2Response {
    id: number;
    project_id: number;
    producer_id: number;
    registration_date: string;
    origin: string;
    attendance_id: number;
    attendance_identification: string | null;
    attendance_name: string | null;
    general_objective: string;
    specific_objectives: string;
    diagnostic: string;
    recommendations_commitments: string;
    observations: string;
    images: Visit2Image[];
    monitoring_commitments: Visit2MonitoringCommitmentResponse[];
}

interface Visit2MonitoringCommitmentResponse {
    id: number;
    visit_2_id: number;
    activity: string;
    percentage_compliance: number;
    appropriation_in_field: string;
}

/** Campos de visita 1 necesarios para armar líneas seleccionables en 5.2 */
interface Visit1ForVisit2Response {
    recommendations?: string | null;
    commitments?: string | null;
}

type RecompType = "recomendaciones" | "compromisos";

interface RecompBucketState {
    selected: number[];
    percentage: Record<number, string>;
    appropriation: Record<number, string>;
}

const VISIT1_EMPTY_REC_TXT = "Sin recomendaciones registradas en la Visita 1.";
const VISIT1_EMPTY_COMP_TXT = "Sin compromisos registrados en la Visita 1.";

function emptyRecompBucket(): RecompBucketState {
    return { selected: [], percentage: {}, appropriation: {} };
}

/** Ítems de actividad desde texto de Visita 1 (líneas por ENTER u otros separadores). */
function linesFromVisit1Text(raw: string | undefined | null): string[] {
    const base = (raw ?? "").trim();
    if (!base) return [];
    if (base === VISIT1_EMPTY_REC_TXT || base === VISIT1_EMPTY_COMP_TXT) return [];

    const lines = base
        .split(/\r?\n/)
        .map((line) =>
            line
                .replace(/^\s*(?:[\u2022•]|[-*]|\d+\.)\s+/, "")
                .trim(),
        )
        .filter(Boolean);

    if (lines.length === 1 && /;|,\s/.test(lines[0]!)) {
        return lines[0]!
            .split(/\s*;\s*|,\s+/)
            .map((s) => s.trim())
            .filter(Boolean);
    }

    return lines;
}

function normalizeActivity(s: string | undefined) {
    return (s ?? "").trim().replace(/\s+/g, " ");
}

function resolveRowRecompType(
    row: Visit2MonitoringCommitment,
    visitRecoLines: string[],
    visitCompLines: string[],
): RecompType | null {
    if (row.recompType === "recomendaciones" || row.recompType === "compromisos") {
        return row.recompType;
    }
    const a = normalizeActivity(row.activity);
    const inR = visitRecoLines.some((l) => normalizeActivity(l) === a);
    const inC = visitCompLines.some((l) => normalizeActivity(l) === a);
    if (inR && !inC) return "recomendaciones";
    if (inC && !inR) return "compromisos";
    if (inR && inC) return "recomendaciones";
    return null;
}

function trackingRowFilled(r: Visit2MonitoringCommitment) {
    const pct =
        String(r.porcentaje ?? "")
            .trim()
            || String(r.percentage_compliance ?? "");
    const ap = String(r.appropriation_in_field ?? "").trim();
    return pct !== "" && ap !== "";
}

function bucketCoversAllLinesWithFields(lines: string[], bucket: RecompBucketState): boolean {
    if (lines.length === 0) return true;
    const sel = new Set(bucket.selected);
    if (sel.size !== lines.length) return false;
    for (let i = 0; i < lines.length; i++) {
        if (!sel.has(i)) return false;
        if (String(bucket.percentage[i] ?? "").trim() === "") return false;
        if (String(bucket.appropriation[i] ?? "").trim() === "") return false;
    }
    return true;
}

// ─── Attendance options ─────────────────────────────────────────────────────

const ATTENDANCE_OPTIONS = [
    { id: "1", label: "Usuario" },
    { id: "2", label: "Trabajador UP" },
    { id: "3", label: "Persona núcleo familiar" },
    { id: "4", label: "Otro" },
] as const;

// ─── Section config ─────────────────────────────────────────────────────────

type SectionKey =
    | "objective"
    | "diagnosis"
    | "commitment_followup"
    | "recommendations"
    | "observations"
    | "photos"
    | "attendance"
    | "specific_objectives";

interface SectionConfig {
    key: SectionKey;
    label: string;
    shortLabel: string;
    sectionNum: string;
    icon: typeof Target;
    color: string;
}

const SECTIONS: SectionConfig[] = [
    { key: "objective", label: "Objetivo General del Acompañamiento", shortLabel: "Obj. General", sectionNum: "5", icon: Target, color: "#1a7a3a" },
    { key: "specific_objectives", label: "Objetivos Específicos", shortLabel: "Obj. Específicos", sectionNum: "5.0", icon: Target, color: "#1a7a3a" },
    { key: "diagnosis", label: "Diagnóstico visita", shortLabel: "Diagnóstico", sectionNum: "5.1", icon: Stethoscope, color: "#0284c7" },
    { key: "commitment_followup", label: "Seguimiento al cumplimiento de compromisos", shortLabel: "Seguimiento", sectionNum: "5.2", icon: ClipboardList, color: "#0284c7" },
    { key: "recommendations", label: "Recomendaciones y Compromisos", shortLabel: "Recomend.", sectionNum: "5.3", icon: FileText, color: "#0284c7" },
    { key: "observations", label: "Observaciones visita", shortLabel: "Observac.", sectionNum: "5.4", icon: MessageSquare, color: "#0284c7" },
    { key: "photos", label: "Registro Fotográfico", shortLabel: "Fotos", sectionNum: "5.5", icon: Camera, color: "#059669" },
    { key: "attendance", label: "Datos del Acompañamiento", shortLabel: "Acompañ.", sectionNum: "1", icon: Users, color: "#d97706" },
];

// ─── API Helpers ────────────────────────────────────────────────────────────

async function getVisit2(
    projectId: number,
    producerId: number,
): Promise<Visit2Response | null> {
    try {
        const res = await apiFetch<{ code: string; data: Visit2Response }>(
            `/visit-2/project/${projectId}/producer/${producerId}`,
        );
        return res?.data ?? null;
    } catch {
        return null;
    }
}

async function getVisit1ForVisit2(
    projectId: number,
    producerId: number,
): Promise<Visit1ForVisit2Response | null> {
    try {
        const res = await apiFetch<{ code: string; data: Visit1ForVisit2Response }>(
            `/visit-1/project/${projectId}/producer/${producerId}`,
        );
        return res?.data ?? null;
    } catch {
        return null;
    }
}

/** IDs de evento en `/objetives/event/:eventId/line/:lineId` (backend). */
const VISIT_OBJECTIVE_EVENT_IDS = {
    visit1: 4,
    visit2: 5,
} as const;

interface ObjectiveApiItem {
    id: number;
    production_line_id?: number;
    production_line_name?: string;
    type: string;
    description: string;
    event_id?: number;
}

function normalizeObjectiveType(type: string) {
    return type
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

/** Tipo marcado como general (no específico). */
function isGeneralObjectiveType(type: string) {
    const n = normalizeObjectiveType(type);
    return n.includes("general") && !n.includes("especific");
}

/** Tipo marcado como específico. */
function isSpecificObjectiveType(type: string) {
    return normalizeObjectiveType(type).includes("especific");
}

/**
 * GET /objetives/event/:eventId/line/:lineId
 */
async function getObjectivesForEventAndLine(
    eventId: number,
    lineId: number,
): Promise<ObjectiveApiItem[] | null> {
    try {
        const res = await apiFetch<{ code?: string; data?: ObjectiveApiItem[] }>(
            `/objetives/event/${eventId}/line/${lineId}`,
        );
        const list = res?.data;
        return Array.isArray(list) ? list : [];
    } catch {
        return null;
    }
}

function objectiveItemsToFormStrings(items: ObjectiveApiItem[]): { general: string; specific: string } {
    const general = items
        .filter((row) => isGeneralObjectiveType(row.type))
        .map((row) => row.description.trim())
        .filter(Boolean)
        .join("\n\n");
    const specifics = items
        .filter((row) => isSpecificObjectiveType(row.type))
        .map((row) => row.description.trim())
        .filter(Boolean)
        .join("\n");
    return { general, specific: specifics };
}

/** Lista de bloques para mostrar objetivos solo lectura (como Vue: generales por párrafo / específicos por línea). */
function parseObjectiveDisplayBlocks(text: string | undefined, mode: "double" | "line"): string[] {
    const raw = (text ?? "").trim();
    if (!raw) return [];
    if (mode === "double") {
        return raw
            .split(/\n{2,}/)
            .map((t) => t.trim())
            .filter(Boolean);
    }
    return raw
        .split(/\r?\n/)
        .map((t) => t.trim())
        .filter(Boolean);
}

function readProductionLineId(detail: { production_line_id?: number | null } | null): number | null {
    if (!detail || detail.production_line_id == null) return null;
    const n = Number(detail.production_line_id);
    return Number.isFinite(n) ? n : null;
}

async function createVisit2(payload: Visit2Payload): Promise<Visit2Response> {
    const res = await apiFetch<{ data: Visit2Response }>("/visit-2", {
        method: "POST",
        body: JSON.stringify(payload),
    });
    return res?.data ?? (res as any);
}

async function createVisit2WithImages(
    payload: Visit2Payload,
    photos: LocalPhoto[],
    monitoringCommitments: Visit2MonitoringCommitment[],
): Promise<Visit2Response> {
    const token = await getStoredToken();
    const formData = new FormData();
    formData.append("project_id", String(payload.project_id));
    formData.append("producer_id", String(payload.producer_id));
    formData.append("registration_date", payload.registration_date);
    formData.append("origin", payload.origin);
    formData.append("attendance_id", String(payload.attendance_id));
    formData.append("attendance_name", payload.attendance_name ?? "");
    formData.append("attendance_identification", payload.attendance_identification ?? "");
    formData.append("general_objective", payload.general_objective);
    formData.append("specific_objectives", payload.specific_objectives);
    formData.append("diagnostic", payload.diagnostic);
    formData.append("recommendations_commitments", payload.recommendations_commitments);
    formData.append("observations", payload.observations);
    formData.append(
        "monitoring_commitments",
        JSON.stringify(
            monitoringCommitments.map((c) => ({
                activity: c.activity,
                percentage_compliance: c.percentage_compliance,
                appropriation_in_field: c.appropriation_in_field,
            })),
        ),
    );

    for (const photo of photos) {
        formData.append("images", {
            uri: photo.uri,
            name: photo.fileName,
            type: photo.type,
        } as any);
    }

    const response = await fetch("https://playmusic.com.co/agro/api/v1/visit-2", {
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

async function updateVisit2(
    id: number,
    payload: Omit<Visit2Payload, "recommendations_commitments"> & { recommendations_commitments: string },
): Promise<Visit2Response> {
    const res = await apiFetch<{ data: Visit2Response }>(`/visit-2/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
    });
    return res?.data ?? (res as any);
}

async function uploadVisit2Images(
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

    const response = await fetch(
        `https://playmusic.com.co/agro/api/v1/visit-2/${visitId}/images`,
        {
            method: "POST",
            headers: {
                Accept: "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: formData,
        },
    );

    if (!response.ok) {
        throw new Error("Error al subir imágenes");
    }
}

async function deleteVisit2Image(imageId: number): Promise<void> {
    await apiFetch(`/visit-2/images/${imageId}`, { method: "DELETE" });
}

function getVisit2ImageUrl(imageId: number): string {
    return `https://playmusic.com.co/agro/api/v1/visit-2/images/${imageId}`;
}

async function createMonitoringCommitment(
    visit2Id: number,
    commitment: Omit<Visit2MonitoringCommitment, "id" | "visit_2_id" | "recompType" | "porcentaje">,
): Promise<void> {
    await apiFetch("/visit-2/monitoring-commitments", {
        method: "POST",
        body: JSON.stringify({ visit_2_id: visit2Id, ...commitment }),
    });
}

async function updateMonitoringCommitment(
    commitmentId: number,
    commitment: Omit<Visit2MonitoringCommitment, "id" | "visit_2_id" | "recompType" | "porcentaje">,
): Promise<void> {
    await apiFetch(`/visit-2/monitoring-commitments/${commitmentId}`, {
        method: "PUT",
        body: JSON.stringify(commitment),
    });
}

async function deleteMonitoringCommitment(commitmentId: number): Promise<void> {
    await apiFetch(`/visit-2/monitoring-commitments/${commitmentId}`, {
        method: "DELETE",
    });
}

// ─── Date helpers ───────────────────────────────────────────────────────────

function todayString(): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function formatDisplayDate(dateStr: string): string {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split(" ")[0]!.split("-");
    const months = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
    ];
    const monthName = months[Number(m) - 1] ?? m;
    return `${d} de ${monthName} de ${y}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function Visit2Tab({ producerId, projectId }: Visit2TabProps) {
    const { showAlert } = useAlert();

    // Bottom sheet refs (form principal + 5.2 recomp / compromisos)
    const sheetRef = useRef<BottomSheetModal>(null);
    const recompSheetRef = useRef<BottomSheetModal>(null);
    const [sheetOpen, setSheetOpen] = useState(false);
    const sheetSnapPoints = useMemo(() => ["94%"], []);
    const recompSnapPoints = useMemo(() => ["94%"], []);

    // Form state
    const [generalObjective, setGeneralObjective] = useState("");
    const [specificObjectives, setSpecificObjectives] = useState("");
    const [diagnosis, setDiagnosis] = useState("");
    const [recommendations, setRecommendations] = useState("");
    const [observations, setObservations] = useState("");
    const [attendanceId, setAttendanceId] = useState("");
    const [attendanceName, setAttendanceName] = useState("");
    const [attendanceIdentification, setAttendanceIdentification] = useState("");
    const [registrationDate, setRegistrationDate] = useState(todayString());

    // Monitoring commitments (seguimiento 5.2) — se edita solo en la bottom sheet secundaria
    const [commitments, setCommitments] = useState<Visit2MonitoringCommitment[]>([]);

    // Texto crudo de Visita 1 para líneas de Recomendaciones / Compromisos
    const [visit1RecommendationsRaw, setVisit1RecommendationsRaw] = useState("");
    const [visit1CommitmentsRaw, setVisit1CommitmentsRaw] = useState("");

    const [recompDialogType, setRecompDialogType] = useState<RecompType>("recomendaciones");
    const [recompBuckets, setRecompBuckets] = useState<Record<RecompType, RecompBucketState>>({
        recomendaciones: emptyRecompBucket(),
        compromisos: emptyRecompBucket(),
    });

    // Photos: local picks + existing server images
    const [localPhotos, setLocalPhotos] = useState<(LocalPhoto | null)[]>([null, null, null]);
    const [existingImages, setExistingImages] = useState<(Visit2Image | null)[]>([null, null, null]);

    // UI state
    const [expandedSections, setExpandedSections] = useState<Set<SectionKey>>(new Set(["objective"]));
    const [showAttendanceDropdown, setShowAttendanceDropdown] = useState(false);
    const [loading, setLoading] = useState(true);
    const [objectivesApiLoading, setObjectivesApiLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [existingVisitId, setExistingVisitId] = useState<number | null>(null);
    const [deletingPhotoIndex, setDeletingPhotoIndex] = useState<number | null>(null);
    const [methodAlreadyApplied, setMethodAlreadyApplied] = useState(false);

    const scrollRef = useRef<ScrollView>(null);
    const token = useAuthStore((s) => s.token);
    const authUser = useAuthStore((s) => s.user);
    const producerDetail = useProducerStore((s) => s.producerDetail);

    const visitRecoLines = useMemo(
        () => linesFromVisit1Text(visit1RecommendationsRaw),
        [visit1RecommendationsRaw],
    );
    const visitCompLines = useMemo(
        () => linesFromVisit1Text(visit1CommitmentsRaw),
        [visit1CommitmentsRaw],
    );

    const isSection52Complete = useMemo(() => {
        const rows = commitments;
        const reco = visitRecoLines;
        const comp = visitCompLines;
        const lineCovered = (type: RecompType, line: string) =>
            rows.some(
                (r) =>
                    resolveRowRecompType(r, visitRecoLines, visitCompLines) === type &&
                    normalizeActivity(r.activity) === normalizeActivity(line) &&
                    trackingRowFilled(r),
            );
        const recoDone = reco.length === 0 || reco.every((line) => lineCovered("recomendaciones", line));
        const compDone = comp.length === 0 || comp.every((line) => lineCovered("compromisos", line));
        return recoDone && compDone;
    }, [commitments, visitRecoLines, visitCompLines]);

    const isRecompDialogSaveReady = useMemo(
        () =>
            bucketCoversAllLinesWithFields(visitRecoLines, recompBuckets.recomendaciones) &&
            bucketCoversAllLinesWithFields(visitCompLines, recompBuckets.compromisos),
        [visitRecoLines, visitCompLines, recompBuckets],
    );

    const sortedCompSelectedIndices = useMemo(
        () => [...recompBuckets.compromisos.selected].sort((a, b) => a - b),
        [recompBuckets.compromisos.selected],
    );
    const sortedRecoSelectedIndices = useMemo(
        () => [...recompBuckets.recomendaciones.selected].sort((a, b) => a - b),
        [recompBuckets.recomendaciones.selected],
    );

    const activeRecompDialogSelections =
        recompDialogType === "recomendaciones"
            ? recompBuckets.recomendaciones.selected
            : recompBuckets.compromisos.selected;

    const recompDialogItems =
        recompDialogType === "recomendaciones" ? visitRecoLines : visitCompLines;

    // ── Bottom sheet handlers ───────────────────────────────────────────

    const openSheet = useCallback(() => {
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

    const sectionStatus = useMemo(() => {
        const hasPhotos =
            localPhotos.some((p) => p !== null) ||
            existingImages.some((img) => img !== null);
        const attendanceComplete =
            !!attendanceId && (attendanceId === "1" || !!attendanceName.trim());

        return {
            objective: !!generalObjective.trim(),
            specific_objectives: !!specificObjectives.trim(),
            diagnosis: !!diagnosis.trim(),
            commitment_followup: isSection52Complete,
            recommendations: !!recommendations.trim(),
            observations: !!observations.trim(),
            photos: hasPhotos,
            attendance: attendanceComplete,
        };
    }, [
        generalObjective,
        specificObjectives,
        diagnosis,
        isSection52Complete,
        recommendations,
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
        (async () => {
            setLoading(true);
            try {
                const uid = authUser?.user_id ?? 0;
                let visit1: Visit1ForVisit2Response | null = null;
                const online = await checkConnectivity();
                if (online) {
                    try {
                        visit1 = await getVisit1ForVisit2(Number(projectId), Number(producerId));
                    } catch {
                        /* ignorar error de red */
                    }
                }
                if (!visit1 && uid > 0) {
                    const rawV1 = await getVisitServerCacheRaw(
                        "visit1",
                        Number(producerId),
                        Number(projectId),
                        uid,
                    );
                    if (rawV1) {
                        try {
                            visit1 = JSON.parse(rawV1) as Visit1ForVisit2Response;
                        } catch {
                            visit1 = null;
                        }
                    }
                }

                const recoLines = linesFromVisit1Text(visit1?.recommendations ?? undefined);
                const compLines = linesFromVisit1Text(visit1?.commitments ?? undefined);
                if (!cancelled) {
                    setVisit1RecommendationsRaw(visit1?.recommendations ?? "");
                    setVisit1CommitmentsRaw(visit1?.commitments ?? "");
                }
                const pendingLocal =
                    uid > 0
                        ? await getPendingLocalVisit2(Number(producerId), Number(projectId), uid)
                        : null;

                const hydrateFromQueue = (localVisit: { payload: string; photos: string }) => {
                    const payload: Visit2Payload = JSON.parse(localVisit.payload);
                    let stored: Visit2QueueExtras;
                    try {
                        stored = JSON.parse(localVisit.photos ?? "{}") as Visit2QueueExtras;
                    } catch {
                        stored = {
                            monitoringCommitments: [],
                            photos: [],
                        };
                    }

                    const remoteId = stored.remote_visit_2_id ?? null;
                    const hasRemote = remoteId != null && Number.isFinite(remoteId);

                    setIsEditMode(hasRemote);
                    setExistingVisitId(hasRemote ? remoteId : null);
                    setGeneralObjective(payload.general_objective || "");
                    setSpecificObjectives(payload.specific_objectives || "");
                    setDiagnosis(payload.diagnostic || "");
                    setRecommendations(payload.recommendations_commitments || "");
                    setObservations(payload.observations || "");
                    setAttendanceId(payload.attendance_id ? String(payload.attendance_id) : "");
                    setAttendanceName(payload.attendance_name || "");
                    setAttendanceIdentification(payload.attendance_identification || "");
                    if (payload.registration_date) setRegistrationDate(payload.registration_date);

                    const commitmentsData = stored.monitoringCommitments ?? [];
                    if (commitmentsData.length > 0) {
                        setCommitments(
                            commitmentsData.map((c: Visit2MonitoringCommitment) => {
                                const rt = resolveRowRecompType(c, recoLines, compLines);
                                return { ...c, recompType: rt ?? c.recompType ?? "recomendaciones" };
                            }),
                        );
                    } else {
                        setCommitments([]);
                    }

                    const photos: LocalPhoto[] = stored.photos ?? [];
                    const newLocal: (LocalPhoto | null)[] = [null, null, null];
                    photos.slice(0, 3).forEach((p, i) => {
                        newLocal[i] = p;
                    });
                    setLocalPhotos(newLocal);
                    setExistingImages([null, null, null]);
                };

                const clearForm = () => {
                    setIsEditMode(false);
                    setExistingVisitId(null);
                    setGeneralObjective("");
                    setSpecificObjectives("");
                    setDiagnosis("");
                    setRecommendations("");
                    setObservations("");
                    setAttendanceId("");
                    setAttendanceName("");
                    setAttendanceIdentification("");
                    setRegistrationDate(todayString());
                    setCommitments([]);
                    setLocalPhotos([null, null, null]);
                    setExistingImages([null, null, null]);
                };

                if (cancelled) return;

                // Borrador / cambios locales pendientes tienen prioridad hasta sincronizar
                if (pendingLocal) {
                    hydrateFromQueue(pendingLocal);
                } else {
                    let data: Visit2Response | null = null;
                    if (online) {
                        try {
                            data = await getVisit2(Number(projectId), Number(producerId));
                        } catch {
                            data = null;
                        }
                    }
                    if (!data && uid > 0) {
                        const rawV2 = await getVisitServerCacheRaw(
                            "visit2",
                            Number(producerId),
                            Number(projectId),
                            uid,
                        );
                        if (rawV2) {
                            try {
                                data = JSON.parse(rawV2) as Visit2Response;
                            } catch {
                                data = null;
                            }
                        }
                    }
                    if (cancelled) return;

                    if (data) {
                        setIsEditMode(true);
                        setExistingVisitId(data.id);
                        setGeneralObjective(data.general_objective || "");
                        setSpecificObjectives(data.specific_objectives || "");
                        setDiagnosis(data.diagnostic || "");
                        setRecommendations(data.recommendations_commitments || "");
                        setObservations(data.observations || "");
                        setAttendanceId(data.attendance_id ? String(data.attendance_id) : "");
                        setAttendanceName(data.attendance_name || "");
                        setAttendanceIdentification(data.attendance_identification || "");
                        if (data.registration_date) setRegistrationDate(data.registration_date);

                        if (data.monitoring_commitments && data.monitoring_commitments.length > 0) {
                            setCommitments(
                                data.monitoring_commitments.map((c) => {
                                    const row: Visit2MonitoringCommitment = {
                                        id: c.id,
                                        visit_2_id: c.visit_2_id,
                                        activity: c.activity,
                                        percentage_compliance: c.percentage_compliance,
                                        appropriation_in_field: c.appropriation_in_field,
                                        porcentaje:
                                            c.percentage_compliance >= 0
                                                ? `${c.percentage_compliance}`
                                                : "",
                                    };
                                    const rt = resolveRowRecompType(row, recoLines, compLines);
                                    return { ...row, recompType: rt ?? "recomendaciones" };
                                }),
                            );
                        } else {
                            setCommitments([]);
                        }

                        const imgs = data.images ?? [];
                        const newExisting: (Visit2Image | null)[] = [null, null, null];
                        imgs.slice(0, 3).forEach((img, i) => {
                            newExisting[i] = img;
                        });
                        setExistingImages(newExisting);
                    } else if (!cancelled) {
                        clearForm();
                    }
                }
            } catch (err) {
                console.warn("No se pudo consultar visita 2 existente:", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [producerId, projectId, authUser]);

    /** Objetivos general / específico desde API (solo sin Visita 2 guardada ni campos ya rellenos). */
    useEffect(() => {
        if (!producerId || !projectId || loading) return;
        if (isEditMode) return;

        const lineId = readProductionLineId(
            producerDetail as { production_line_id?: number | null } | null,
        );
        if (lineId == null) return;

        let cancelled = false;
        setObjectivesApiLoading(true);

        void (async () => {
            const items = await getObjectivesForEventAndLine(
                VISIT_OBJECTIVE_EVENT_IDS.visit2,
                lineId,
            );
            if (cancelled) return;
            setObjectivesApiLoading(false);

            if (items == null || items.length === 0) return;

            const { general, specific } = objectiveItemsToFormStrings(items);
            setGeneralObjective((prev) => (prev.trim() ? prev : general));
            setSpecificObjectives((prev) => (prev.trim() ? prev : specific));
        })();

        return () => {
            cancelled = true;
            setObjectivesApiLoading(false);
        };
    }, [producerId, projectId, producerDetail, loading, isEditMode]);

    // Check if method already applied
    useEffect(() => {
        if (!producerId || !projectId) return;
        const pid = Number(producerId);
        const projId = Number(projectId);
        (async () => {
            const applied = await useCharacterizationStore.getState().hasInterventionMethodApplied(
                pid,
                projId,
                VISIT2_INTERVENTION_METHOD_ID,
            );
            setMethodAlreadyApplied(applied);
        })();
    }, [producerId, projectId]);

    // ── Toggle section ──────────────────────────────────────────────────────

    const toggleSection = useCallback((key: SectionKey) => {
        setExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    // ── Seguimiento 5.2 (buckets + bottom sheet secundaria) ──────────────

    const buildBucketFromForm = useCallback(
        (type: RecompType): RecompBucketState => {
            const lines = type === "recomendaciones" ? visitRecoLines : visitCompLines;
            const rows = commitments;
            const bucket = emptyRecompBucket();
            lines.forEach((line, idx) => {
                const row = rows.find(
                    (r) =>
                        resolveRowRecompType(r, visitRecoLines, visitCompLines) === type &&
                        normalizeActivity(r.activity) === normalizeActivity(line),
                );
                if (row) {
                    bucket.selected.push(idx);
                    const pct =
                        row.porcentaje?.replace(/[^\d]/g, "") ??
                        (row.percentage_compliance != null
                            ? String(row.percentage_compliance)
                            : "");
                    bucket.percentage[idx] = pct;
                    bucket.appropriation[idx] = row.appropriation_in_field ?? "";
                }
            });
            bucket.selected.sort((a, b) => a - b);
            return bucket;
        },
        [visitRecoLines, visitCompLines, commitments],
    );

    const hydrateRecompBucketsFromForm = useCallback(() => {
        setRecompBuckets({
            recomendaciones: buildBucketFromForm("recomendaciones"),
            compromisos: buildBucketFromForm("compromisos"),
        });
    }, [buildBucketFromForm]);

    const openRecompSheet = useCallback(() => {
        hydrateRecompBucketsFromForm();
        setRecompDialogType("recomendaciones");
        recompSheetRef.current?.present();
    }, [hydrateRecompBucketsFromForm]);

    const toggleRecompDialogItem = useCallback(
        (idx: number) => {
            setRecompBuckets((prev) => {
                const t = recompDialogType;
                const b = prev[t];
                const pos = b.selected.indexOf(idx);
                const selected =
                    pos >= 0
                        ? [...b.selected.slice(0, pos), ...b.selected.slice(pos + 1)]
                        : [...b.selected, idx].sort((a, bIdx) => a - bIdx);
                return {
                    ...prev,
                    [t]: {
                        ...b,
                        selected,
                        percentage:
                            pos < 0
                                ? { ...b.percentage, [idx]: b.percentage[idx] ?? "" }
                                : { ...b.percentage },
                        appropriation:
                            pos < 0
                                ? { ...b.appropriation, [idx]: b.appropriation[idx] ?? "" }
                                : { ...b.appropriation },
                    },
                };
            });
        },
        [recompDialogType],
    );

    const setBucketPercentageDigits = useCallback((type: RecompType, itemIdx: number, raw: string) => {
        const next = raw.replace(/\D/g, "");
        setRecompBuckets((prev) => ({
            ...prev,
            [type]: {
                ...prev[type],
                percentage: { ...prev[type].percentage, [itemIdx]: next },
            },
        }));
    }, []);

    const setBucketAppropriationField = useCallback((type: RecompType, itemIdx: number, raw: string) => {
        setRecompBuckets((prev) => ({
            ...prev,
            [type]: {
                ...prev[type],
                appropriation: { ...prev[type].appropriation, [itemIdx]: raw },
            },
        }));
    }, []);

    const saveRecompDialog = useCallback(() => {
        if (!isRecompDialogSaveReady) return;
        const bucketsSnapshot = recompBuckets;
        setCommitments((prevRows) => {
            const sliceFromBucket = (
                type: RecompType,
                lines: string[],
                bucket: RecompBucketState,
            ): Visit2MonitoringCommitment[] =>
                [...bucket.selected]
                    .sort((a, b) => a - b)
                    .map((idx) => {
                        const actividad = lines[idx]?.trim() || "";
                        const old = prevRows.find(
                            (r) =>
                                resolveRowRecompType(r, visitRecoLines, visitCompLines) === type &&
                                normalizeActivity(r.activity) === normalizeActivity(actividad),
                        );
                        const pctRaw = bucket.percentage[idx] ?? "";
                        const num = parseInt(pctRaw.replace(/[^\d]/g, ""), 10) || 0;
                        return {
                            ...(old?.id != null ? { id: old.id, visit_2_id: old.visit_2_id } : {}),
                            activity: actividad,
                            percentage_compliance: num,
                            appropriation_in_field: bucket.appropriation[idx] ?? "",
                            porcentaje: pctRaw,
                            recompType: type,
                        };
                    });

            return [
                ...sliceFromBucket("compromisos", visitCompLines, bucketsSnapshot.compromisos),
                ...sliceFromBucket("recomendaciones", visitRecoLines, bucketsSnapshot.recomendaciones),
            ];
        });
        recompSheetRef.current?.dismiss();
    }, [
        isRecompDialogSaveReady,
        recompBuckets,
        visitRecoLines,
        visitCompLines,
    ]);

    // ── Photo handling ──────────────────────────────────────────────────────

    const pickImage = useCallback(async (index: number) => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
            showAlert({ title: "Permisos", message: "Se necesitan permisos para acceder a la galería.", type: "warning" });
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.8,
        });

        if (result.canceled || !result.assets?.[0]) return;

        const asset = result.assets[0];
        const photo: LocalPhoto = {
            uri: asset.uri,
            fileName: asset.fileName || `photo_${Date.now()}.jpg`,
            type: asset.mimeType || "image/jpeg",
        };

        if (existingImages[index]) {
            try { await deleteVisit2Image(existingImages[index]!.id); } catch {}
            setExistingImages((prev) => { const n = [...prev]; n[index] = null; return n; });
        }

        setLocalPhotos((prev) => { const n = [...prev]; n[index] = photo; return n; });
    }, [existingImages]);

    const takePhoto = useCallback(async (index: number) => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
            showAlert({ title: "Permisos", message: "Se necesitan permisos para acceder a la cámara.", type: "warning" });
            return;
        }

        const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });

        if (result.canceled || !result.assets?.[0]) return;

        const asset = result.assets[0];
        const photo: LocalPhoto = {
            uri: asset.uri,
            fileName: asset.fileName || `photo_${Date.now()}.jpg`,
            type: asset.mimeType || "image/jpeg",
        };

        if (existingImages[index]) {
            try { await deleteVisit2Image(existingImages[index]!.id); } catch {}
            setExistingImages((prev) => { const n = [...prev]; n[index] = null; return n; });
        }

        setLocalPhotos((prev) => { const n = [...prev]; n[index] = photo; return n; });
    }, [existingImages]);

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
        if (existingImages[index]) {
            setDeletingPhotoIndex(index);
            try {
                await deleteVisit2Image(existingImages[index]!.id);
                setExistingImages((prev) => { const n = [...prev]; n[index] = null; return n; });
            } catch {
                showAlert({ title: "Error", message: "No se pudo eliminar la imagen", type: "error" });
                setDeletingPhotoIndex(null);
                return;
            }
            setDeletingPhotoIndex(null);
        }
        setLocalPhotos((prev) => { const n = [...prev]; n[index] = null; return n; });
    }, [existingImages]);

    // ── Save ──────────────────────────────────────────────────────────────

    const handleSave = useCallback(async () => {
        if (!generalObjective.trim()) {
            showAlert({ title: "Campo requerido", message: "Ingrese el objetivo general del acompañamiento.", type: "warning" });
            return;
        }
        if (!specificObjectives.trim()) {
            showAlert({ title: "Campo requerido", message: "Ingrese los objetivos específicos.", type: "warning" });
            return;
        }
        if (!diagnosis.trim()) {
            showAlert({ title: "Campo requerido", message: "Ingrese el diagnóstico de la visita.", type: "warning" });
            return;
        }
        if (!attendanceId) {
            showAlert({ title: "Campo requerido", message: "Seleccione quién atiende el acompañamiento.", type: "warning" });
            return;
        }
        if (attendanceId !== "1" && !attendanceName.trim()) {
            showAlert({ title: "Campo requerido", message: "Ingrese el nombre de la persona que atiende.", type: "warning" });
            return;
        }
        if (!isSection52Complete) {
            showAlert({
                title: "Sección 5.2 incompleta",
                message:
                    "Debe registrar el seguimiento (porcentaje y apropiación) para todas las recomendaciones y todos los compromisos cargados desde la Visita 1. Use «Agregar» y complete cada ítem antes de guardar.",
                type: "warning",
            });
            return;
        }

        setSaving(true);
        try {
            const payload: Visit2Payload = {
                project_id: Number(projectId),
                producer_id: Number(producerId),
                registration_date: registrationDate,
                origin: "app",
                attendance_id: Number(attendanceId),
                attendance_name: attendanceId !== "1" ? attendanceName.trim() : null,
                attendance_identification: attendanceId !== "1" ? attendanceIdentification.trim() : null,
                general_objective: generalObjective.trim(),
                specific_objectives: specificObjectives.trim(),
                diagnostic: diagnosis.trim(),
                recommendations_commitments: recommendations.trim(),
                observations: observations.trim(),
            };

            const monitoringCommitments: Visit2MonitoringCommitment[] = commitments
                .filter((c) => c.activity.trim())
                .map((c) => ({
                    activity: c.activity.trim(),
                    percentage_compliance: parseInt(c.porcentaje?.replace(/[^\d]/g, "") ?? "0", 10) || 0,
                    appropriation_in_field: c.appropriation_in_field.trim(),
                }));

            const commitmentsForQueue: Visit2MonitoringCommitment[] = commitments
                .filter((c) => c.activity.trim())
                .map((c) => ({
                    ...(c.id != null ? { id: c.id, visit_2_id: c.visit_2_id } : {}),
                    activity: c.activity.trim(),
                    percentage_compliance: parseInt(c.porcentaje?.replace(/[^\d]/g, "") ?? "0", 10) || 0,
                    appropriation_in_field: c.appropriation_in_field.trim(),
                    porcentaje: c.porcentaje ?? "",
                    recompType: c.recompType,
                }));

            const newPhotos = localPhotos.filter((p): p is LocalPhoto => p !== null);
            const isOnline = await checkConnectivity();
            const userId = authUser?.user_id ?? 0;

            if (isOnline) {
                if (isEditMode && existingVisitId) {
                    await updateVisit2(existingVisitId, payload);

                    // Update monitoring commitments
                    const existingCommitments = commitments.filter((c) => c.id);
                    const newCommitments = commitments.filter((c) => !c.id && c.activity.trim());

                    for (const c of existingCommitments) {
                        if (c.id) {
                            await updateMonitoringCommitment(c.id, {
                                activity: c.activity.trim(),
                                percentage_compliance: parseInt(c.porcentaje?.replace(/[^\d]/g, "") ?? "0", 10) || 0,
                                appropriation_in_field: c.appropriation_in_field.trim(),
                            });
                        }
                    }

                    for (const c of newCommitments) {
                        await createMonitoringCommitment(existingVisitId, {
                            activity: c.activity.trim(),
                            percentage_compliance: parseInt(c.porcentaje?.replace(/[^\d]/g, "") ?? "0", 10) || 0,
                            appropriation_in_field: c.appropriation_in_field.trim(),
                        });
                    }

                    if (newPhotos.length > 0) {
                        try {
                            await uploadVisit2Images(existingVisitId, newPhotos);
                        } catch {
                            showAlert({ title: "Aviso", message: "La visita se actualizó pero hubo un error al subir las fotos.", type: "warning" });
                        }
                    }
                    showAlert({ title: "Éxito", message: "Visita 2 actualizada exitosamente.", type: "success" });
                } else {
                    let result: Visit2Response;
                    if (newPhotos.length > 0 || monitoringCommitments.length > 0) {
                        result = await createVisit2WithImages(payload, newPhotos, monitoringCommitments);
                    } else {
                        result = await createVisit2(payload);
                    }
                    setExistingVisitId(result?.id ?? null);
                    setIsEditMode(true);
                    showAlert({ title: "Éxito", message: "Visita 2 guardada exitosamente.", type: "success" });
                }
                setLocalPhotos([null, null, null]);
            } else {
                const visitUuid = `${userId}-${producerId}-${projectId}-visit2-offline`;
                const remoteForQueue =
                    existingVisitId != null && Number.isFinite(existingVisitId)
                        ? existingVisitId
                        : null;
                await enqueueVisit2(
                    visitUuid,
                    payload,
                    commitmentsForQueue,
                    newPhotos,
                    userId,
                    remoteForQueue,
                );
                await markInterventionMethodApplied(
                    Number(producerId),
                    Number(projectId),
                    VISIT2_INTERVENTION_METHOD_ID,
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
                setLocalPhotos([null, null, null]);
                showAlert({
                    title: "Sin internet",
                    message: "La visita 2 se guardó localmente y se enviará al sincronizar.",
                    type: "warning",
                });
            }
        } catch (error) {
            console.error("Error al guardar visita 2:", error);
            showAlert({
                title: "Error",
                message: error instanceof Error ? error.message : "No se pudo guardar la visita 2.",
                type: "error",
            });
        } finally {
            setSaving(false);
        }
    }, [
        generalObjective, specificObjectives, diagnosis, recommendations, observations,
        attendanceId, attendanceName, attendanceIdentification, registrationDate,
        producerId, projectId, commitments, localPhotos, isEditMode, existingVisitId,
        showAlert, authUser, isSection52Complete,
    ]);

    // ── Render: section header ───────────────────────────────────────────

    const renderSectionHeader = useCallback(
        (section: SectionConfig, isDone: boolean) => {
            const isExpanded = expandedSections.has(section.key);
            const Icon = section.icon;

            return (
                <TouchableOpacity
                    style={styles.sectionHeader}
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
                        <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
                            {section.label}
                        </ThemedText>
                        <ThemedText style={styles.sectionSubtitle}>
                            Sección {section.sectionNum}
                        </ThemedText>
                    </View>
                    {isExpanded ? (
                        <ChevronUp size={responsiveFont(18)} color="#999" />
                    ) : (
                        <ChevronDown size={responsiveFont(18)} color="#999" />
                    )}
                </TouchableOpacity>
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
            hint?: string,
            belowHint?: React.ReactNode,
        ) => {
            if (!expandedSections.has(sectionKey)) return null;
            return (
                <View style={styles.sectionContent}>
                    {hint ? <ThemedText style={styles.sectionHint}>{hint}</ThemedText> : null}
                    {belowHint}
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

    /** Objetivos general / específico: información del servidor, no editables. */
    const renderReadOnlyObjectivesSection = useCallback(
        (
            sectionKey: Extract<SectionKey, "objective" | "specific_objectives">,
            body: string,
            blockMode: "double" | "line",
            hint: string,
            emptyMessage: string,
            belowHint?: React.ReactNode,
        ) => {
            if (!expandedSections.has(sectionKey)) return null;
            const lines = parseObjectiveDisplayBlocks(body, blockMode);
            return (
                <View style={styles.sectionContent}>
                    <ThemedText style={styles.sectionHint}>{hint}</ThemedText>
                    {belowHint}
                    {lines.length === 0 ? (
                        <View style={styles.objectivesReadonlyPanel}>
                            <ThemedText style={styles.objectivesReadonlyEmpty}>{emptyMessage}</ThemedText>
                        </View>
                    ) : (
                        <View style={styles.objectivesReadonlyPanel}>
                            {lines.map((line, idx) => (
                                <View key={`${sectionKey}-block-${idx}`}>
                                    {idx > 0 ? <View style={styles.objectivesReadonlySeparator} /> : null}
                                    <ThemedText style={styles.objectivesReadonlyParagraph}>
                                        <ThemedText style={styles.objectivesReadonlyIndex}>{idx + 1}. </ThemedText>
                                        {line}
                                    </ThemedText>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            );
        },
        [expandedSections],
    );

    // ── Render: photo slot ────────────────────────────────────────────────

    const renderPhotoSlot = useCallback(
        (index: number) => {
            const localPhoto = localPhotos[index];
            const existingImg = existingImages[index];
            const hasPhoto = localPhoto !== null || existingImg !== null;

            if (hasPhoto) {
                let uri = "";
                if (localPhoto) {
                    uri = localPhoto.uri;
                } else if (existingImg) {
                    uri = getVisit2ImageUrl(existingImg.id);
                }

                return (
                    <View key={index} style={styles.photoSlot}>
                        <ExpoImage
                            source={{
                                uri,
                                ...(existingImg && token
                                    ? { headers: { Authorization: `Bearer ${token}` } }
                                    : {}),
                            }}
                            style={styles.photoImage}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                        />
                        <TouchableOpacity
                            style={styles.photoRemoveBtn}
                            onPress={() => removePhoto(index)}
                            disabled={deletingPhotoIndex === index}
                        >
                            {deletingPhotoIndex === index ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <X size={responsiveFont(14)} color="#fff" />
                            )}
                        </TouchableOpacity>
                        <View style={styles.photoLabel}>
                            <ThemedText style={styles.photoLabelText} numberOfLines={1}>
                                {localPhoto?.fileName ?? `Foto ${index + 1}`}
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
        [localPhotos, existingImages, token, deletingPhotoIndex, removePhoto, showPhotoOptions],
    );

    // ── Render: attendance content ────────────────────────────────────────

    const renderAttendanceContent = useCallback(() => {
        if (!expandedSections.has("attendance")) return null;

        const selectedOption = ATTENDANCE_OPTIONS.find((o) => o.id === attendanceId);

        return (
            <View style={styles.sectionContent}>
                {/* Date & Origin */}
                <View style={styles.fieldRow}>
                    <View style={styles.fieldHalf}>
                        <ThemedText style={styles.fieldLabel}>Fecha de registro</ThemedText>
                        <View style={styles.readonlyField}>
                            <ThemedText style={styles.readonlyFieldText}>
                                {formatDisplayDate(registrationDate)}
                            </ThemedText>
                        </View>
                    </View>
                    <View style={styles.fieldHalf}>
                        <ThemedText style={styles.fieldLabel}>Origen registro</ThemedText>
                        <View style={styles.originBadge}>
                            <ThemedText style={styles.originBadgeText}>App</ThemedText>
                        </View>
                    </View>
                </View>

                <View style={styles.separator} />

                {/* Attendance selector */}
                <ThemedText type="defaultSemiBold" style={styles.attendanceTitle}>
                    Persona quien atiende el Acompañamiento
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

                {/* Conditional name input */}
                {attendanceId && attendanceId !== "1" && (
                    <View style={styles.conditionalField}>
                        <View style={styles.conditionalIndicator} />
                        <View style={styles.conditionalContent}>
                            <ThemedText style={styles.fieldLabel}>
                                {attendanceId === "4"
                                    ? "Especifique el nombre"
                                    : `Nombre del ${selectedOption?.label ?? ""}`}
                            </ThemedText>
                            <TextInput
                                style={styles.textInput}
                                value={attendanceName}
                                onChangeText={setAttendanceName}
                                placeholder="Ingrese el nombre de la persona..."
                                placeholderTextColor="#aaa"
                            />
                            <ThemedText style={[styles.fieldLabel, { marginTop: verticalScale(8) }]}>
                                Número de identificación
                            </ThemedText>
                            <TextInput
                                style={styles.textInput}
                                value={attendanceIdentification}
                                onChangeText={setAttendanceIdentification}
                                placeholder="Ingrese el número de identificación..."
                                placeholderTextColor="#aaa"
                                keyboardType="numeric"
                            />
                        </View>
                    </View>
                )}
            </View>
        );
    }, [expandedSections, registrationDate, attendanceId, attendanceName, attendanceIdentification, showAttendanceDropdown]);

    // ── Render: commitments content (5.2) ─────────────────────────────────

    const renderCommitmentsContent = useCallback(() => {
        if (!expandedSections.has("commitment_followup")) return null;

        return (
            <View style={styles.sectionContent}>
                <ThemedText style={styles.sectionHint}>
                    Pulse «Agregar» para seleccionar las líneas cargadas en la Visita 1 y registrar % de cumplimiento y
                    apropiación. No podrá guardar la Visita 2 hasta cubrir todas las recomendaciones y todos los compromisos
                    definidos en esa visita (si una lista viene vacía, no aplica). La lista siguiente es solo lectura; para
                    corregir valores use «Modificar valores».
                </ThemedText>

                <TouchableOpacity style={styles.recompOpenBtn} onPress={openRecompSheet} activeOpacity={0.75}>
                    {isSection52Complete ? (
                        <PencilLine size={responsiveFont(18)} color="#1a7a3a" />
                    ) : (
                        <Plus size={responsiveFont(18)} color="#1a7a3a" />
                    )}
                    <ThemedText style={styles.recompOpenBtnText}>
                        {isSection52Complete ? "Modificar valores" : "Agregar"}
                    </ThemedText>
                </TouchableOpacity>

                <View style={styles.commitmentsReadonlyBox}>
                    {commitments.length === 0 ? (
                        <ThemedText style={styles.commitmentsEmptyText}>Sin ítems de seguimiento.</ThemedText>
                    ) : (
                        commitments.map((row, idx) => {
                            const rt = resolveRowRecompType(row, visitRecoLines, visitCompLines);
                            const pctRaw = row.porcentaje?.trim() ?? "";
                            const pctLabel =
                                pctRaw !== ""
                                    ? pctRaw.endsWith("%")
                                        ? pctRaw
                                        : `${pctRaw}%`
                                    : row.percentage_compliance != null &&
                                        !Number.isNaN(row.percentage_compliance)
                                      ? `${row.percentage_compliance}%`
                                      : "—";
                            return (
                                <View key={`${rt}-${idx}-${normalizeActivity(row.activity)}`}>
                                    {idx > 0 ? <View style={styles.commitmentsReadonlyDivider} /> : null}
                                    <View style={styles.commitmentsReadonlyRow}>
                                        <View
                                            style={[
                                                styles.recompTypeBadge,
                                                rt === "compromisos"
                                                    ? styles.recompTypeBadgeComp
                                                    : styles.recompTypeBadgeReco,
                                            ]}
                                        >
                                            <ThemedText style={styles.recompTypeBadgeText}>
                                                {rt === "compromisos" ? "Compromiso" : "Recomendación"}
                                            </ThemedText>
                                        </View>
                                        <ThemedText style={styles.commitmentsActividadText}>
                                            {row.activity.trim() || "—"}
                                        </ThemedText>
                                        <ThemedText style={styles.commitmentsDetailText}>
                                            <ThemedText type="defaultSemiBold" style={styles.commitmentsDetailLabel}>
                                                % Cumplimiento:
                                            </ThemedText>
                                            {"  "}
                                            {pctLabel}
                                        </ThemedText>
                                        <ThemedText style={styles.commitmentsDetailText}>
                                            <ThemedText type="defaultSemiBold" style={styles.commitmentsDetailLabel}>
                                                Apropiación:
                                            </ThemedText>
                                            {"  "}
                                            {row.appropriation_in_field.trim() || "—"}
                                        </ThemedText>
                                    </View>
                                </View>
                            );
                        })
                    )}
                </View>
            </View>
        );
    }, [
        expandedSections,
        commitments,
        visitRecoLines,
        visitCompLines,
        isSection52Complete,
        openRecompSheet,
    ]);

    // ── Loading state ─────────────────────────────────────────────────────

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#1a7a3a" />
                <ThemedText style={styles.loadingText}>
                    Consultando datos de la Visita 2...
                </ThemedText>
            </View>
        );
    }

    // ── Main render ───────────────────────────────────────────────────────

    const completedCount = Object.values(sectionStatus).filter(Boolean).length;
    const totalSections = SECTIONS.length;

    return (
        <View style={styles.container}>
            {/* Summary card */}
            <View style={styles.summaryCard}>
                <View style={styles.summaryHeader}>
                    <ClipboardList size={responsiveFont(24)} color="#1a7a3a" />
                    <View style={styles.summaryHeaderText}>
                        <ThemedText type="defaultSemiBold" style={styles.summaryTitle}>
                            {isEditMode ? "Visita 2 registrada" : "Visita 2"}
                        </ThemedText>
                        <ThemedText style={styles.summarySubtitle}>
                            Formulario de seguimiento técnico productivo
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

            {/* Bottom Sheet */}
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
                            {isEditMode ? "Editar Visita 2" : "Aplicar Visita 2"}
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
                    {/* Section: Datos del Acompañamiento (first accordion) */}
                    <View style={styles.section}>
                        {renderSectionHeader(
                            SECTIONS.find((s) => s.key === "attendance")!,
                            sectionStatus.attendance,
                        )}
                        {renderAttendanceContent()}
                    </View>

                    {/* Section: Objetivo General (solo lectura — API / visita guardada) */}
                    <View style={styles.section}>
                        {renderSectionHeader(
                            SECTIONS.find((s) => s.key === "objective")!,
                            sectionStatus.objective,
                        )}
                        {renderReadOnlyObjectivesSection(
                            "objective",
                            generalObjective,
                            "double",
                            "Solo lectura. Objetivos tipo «General» definidos en el servidor para el evento Visita 2 y la línea productiva principal del usuario (`production_line_id`).",
                            "Sin objetivo general cargado para esta línea y visita.",
                            !isEditMode && objectivesApiLoading ? (
                                <View style={styles.objectivesLoadingRow}>
                                    <ActivityIndicator size="small" color="#1a7a3a" />
                                    <ThemedText style={styles.objectivesLoadingText}>
                                        Cargando objetivos desde el servidor…
                                    </ThemedText>
                                </View>
                            ) : undefined,
                        )}
                    </View>

                    {/* Section: Objetivos Específicos (solo lectura) */}
                    <View style={styles.section}>
                        {renderSectionHeader(
                            SECTIONS.find((s) => s.key === "specific_objectives")!,
                            sectionStatus.specific_objectives,
                        )}
                        {renderReadOnlyObjectivesSection(
                            "specific_objectives",
                            specificObjectives,
                            "line",
                            "Solo lectura. Objetivos tipo «Específico» del mismo catálogo (evento Visita 2, línea principal).",
                            "No hay objetivos específicos configurados para esta línea en el servidor.",
                        )}
                    </View>

                    {/* Section: Diagnóstico */}
                    <View style={styles.section}>
                        {renderSectionHeader(
                            SECTIONS.find((s) => s.key === "diagnosis")!,
                            sectionStatus.diagnosis,
                        )}
                        {renderTextSection(
                            "diagnosis",
                            diagnosis,
                            setDiagnosis,
                            "Describa el diagnóstico de la visita...",
                            "Describa detalladamente el diagnóstico técnico del sistema productivo, resaltando fortalezas y problemáticas.",
                        )}
                    </View>

                    {/* Section: Seguimiento al cumplimiento de compromisos (5.2) */}
                    <View style={styles.section}>
                        {renderSectionHeader(
                            SECTIONS.find((s) => s.key === "commitment_followup")!,
                            sectionStatus.commitment_followup,
                        )}
                        {renderCommitmentsContent()}
                    </View>

                    {/* Section: Recomendaciones y Compromisos (text) */}
                    <View style={styles.section}>
                        {renderSectionHeader(
                            SECTIONS.find((s) => s.key === "recommendations")!,
                            sectionStatus.recommendations,
                        )}
                        {expandedSections.has("recommendations") && (
                            <View style={styles.sectionContent}>
                                <TextInput
                                    style={styles.textArea}
                                    value={recommendations}
                                    onChangeText={setRecommendations}
                                    placeholder="Plantee recomendaciones técnicas de acuerdo al avance o situación encontrada..."
                                    placeholderTextColor="#aaa"
                                    multiline
                                    textAlignVertical="top"
                                    numberOfLines={4}
                                />
                            </View>
                        )}
                    </View>

                    {/* Section: Observaciones */}
                    <View style={styles.section}>
                        {renderSectionHeader(
                            SECTIONS.find((s) => s.key === "observations")!,
                            sectionStatus.observations,
                        )}
                        {renderTextSection(
                            "observations",
                            observations,
                            setObservations,
                            "Ingrese las observaciones de la visita...",
                        )}
                    </View>

                    {/* Section: Fotos */}
                    <View style={styles.section}>
                        {renderSectionHeader(
                            SECTIONS.find((s) => s.key === "photos")!,
                            sectionStatus.photos,
                        )}
                        {expandedSections.has("photos") && (
                            <View style={styles.sectionContent}>
                                <ThemedText style={styles.sectionHint}>
                                    Adjuntar hasta 3 fotografías con marca de agua (lugar, fecha, hora, georreferenciación, ASNM).
                                </ThemedText>
                                <View style={styles.photosGrid}>
                                    {[0, 1, 2].map(renderPhotoSlot)}
                                </View>
                            </View>
                        )}
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
                                    ? "Actualizar Visita 2"
                                    : "Guardar Visita 2"}
                        </ThemedText>
                    </TouchableOpacity>

                    <View style={{ height: verticalScale(32) }} />
                </BottomSheetScrollView>
            </BottomSheetModal>

            {/* Bottom sheet anidada: selección desde Visita 1 + % / apropiación (equiv. Visit2Dialog.vue) */}
            <BottomSheetModal
                ref={recompSheetRef}
                index={0}
                snapPoints={recompSnapPoints}
                stackBehavior="push"
                backdropComponent={renderBackdrop}
                enablePanDownToClose
                enableDynamicSizing={false}
                backgroundStyle={styles.sheetBackground}
                handleIndicatorStyle={styles.sheetHandle}
                keyboardBehavior="interactive"
                keyboardBlurBehavior="restore"
                android_keyboardInputMode="adjustResize"
            >
                <View style={styles.recompModalHeader}>
                    <ThemedText
                        type="defaultSemiBold"
                        style={styles.recompModalTitle}
                        lightColor="#333"
                        darkColor="#333"
                    >
                        Seleccionar Recomendaciones y Compromisos
                    </ThemedText>
                    <TouchableOpacity
                        style={styles.sheetCloseBtn}
                        onPress={() => recompSheetRef.current?.dismiss()}
                        activeOpacity={0.7}
                    >
                        <X size={responsiveFont(20)} color="#666" />
                    </TouchableOpacity>
                </View>

                <BottomSheetScrollView
                    contentContainerStyle={styles.recompScrollContent}
                    showsVerticalScrollIndicator
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.recompOriginCard}>
                        <ThemedText style={styles.recompSmallHeading}>Origen en Visita 1</ThemedText>
                        <View style={styles.recompTypeTabs}>
                            <TouchableOpacity
                                style={[
                                    styles.recompTypeTab,
                                    recompDialogType === "recomendaciones" && styles.recompTypeTabActive,
                                ]}
                                onPress={() => setRecompDialogType("recomendaciones")}
                                activeOpacity={0.75}
                            >
                                <ThemedText
                                    style={[
                                        styles.recompTypeTabText,
                                        recompDialogType === "recomendaciones" &&
                                            styles.recompTypeTabTextActive,
                                    ]}
                                >
                                    Recomendaciones
                                </ThemedText>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.recompTypeTab,
                                    recompDialogType === "compromisos" && styles.recompTypeTabActive,
                                ]}
                                onPress={() => setRecompDialogType("compromisos")}
                                activeOpacity={0.75}
                            >
                                <ThemedText
                                    style={[
                                        styles.recompTypeTabText,
                                        recompDialogType === "compromisos" && styles.recompTypeTabTextActive,
                                    ]}
                                >
                                    Compromisos
                                </ThemedText>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <ThemedText style={styles.recompListHeading}>
                        {recompDialogType === "recomendaciones"
                            ? "Recomendaciones (toque para seleccionar)"
                            : "Compromisos (toque para seleccionar)"}
                    </ThemedText>
                    <View style={styles.recompPickList}>
                        {recompDialogItems.length === 0 ? (
                            <ThemedText style={styles.recompPickEmpty}>
                                {recompDialogType === "recomendaciones"
                                    ? "No hay líneas de recomendaciones en la Visita 1. Revise ese registro o elija Compromisos."
                                    : "No hay líneas de compromisos en la Visita 1. Revise ese registro o elija Recomendaciones."}
                            </ThemedText>
                        ) : (
                            recompDialogItems.map((item, idx) => {
                                const selected = activeRecompDialogSelections.includes(idx);
                                return (
                                    <TouchableOpacity
                                        key={`${recompDialogType}-${idx}`}
                                        style={[styles.recompPickRow, selected && styles.recompPickRowSelected]}
                                        onPress={() => toggleRecompDialogItem(idx)}
                                        activeOpacity={0.7}
                                    >
                                        <ThemedText
                                            style={[styles.recompPickRowText, selected && styles.recompPickRowTextSelected]}
                                        >
                                            {item}
                                        </ThemedText>
                                    </TouchableOpacity>
                                );
                            })
                        )}
                    </View>

                    <View style={styles.recompMetricsCard}>
                        <ThemedText style={styles.recompSmallHeading}>
                            % y apropiación (compromisos y recomendaciones)
                        </ThemedText>
                        <ThemedText style={styles.recompCounters}>
                            Compromisos {recompBuckets.compromisos.selected.length} /{" "}
                            {visitCompLines.length} · Recomendaciones{" "}
                            {recompBuckets.recomendaciones.selected.length} / {visitRecoLines.length}
                        </ThemedText>
                    </View>

                    {visitCompLines.length > 0 ? (
                        <View style={styles.recompBucketBlock}>
                            <ThemedText style={styles.recompBucketHeading}>Compromisos</ThemedText>
                            {sortedCompSelectedIndices.length === 0 ? (
                                <ThemedText style={styles.recompBucketHint}>
                                    Aún sin compromisos seleccionados.
                                </ThemedText>
                            ) : (
                                sortedCompSelectedIndices.map((selIdx, i) => (
                                    <View key={`edc-${selIdx}`}>
                                        {i > 0 ? <View style={styles.recompCardDivider} /> : null}
                                        <View style={styles.recompInputCard}>
                                            <ThemedText style={styles.recompCardBadge}>Compromiso</ThemedText>
                                            <ThemedText style={styles.recompCardLine}>{visitCompLines[selIdx]}</ThemedText>
                                            <View style={styles.recompPctRow}>
                                                <View style={styles.recompPctCol}>
                                                    <ThemedText style={styles.fieldLabel}>% cumplimiento</ThemedText>
                                                    <TextInput
                                                        style={styles.recompPctInput}
                                                        value={recompBuckets.compromisos.percentage[selIdx] ?? ""}
                                                        onChangeText={(t) =>
                                                            setBucketPercentageDigits("compromisos", selIdx, t)
                                                        }
                                                        placeholder="0"
                                                        placeholderTextColor="#aaa"
                                                        keyboardType="number-pad"
                                                        maxLength={5}
                                                    />
                                                </View>
                                                <View style={styles.recompAprCol}>
                                                    <ThemedText style={styles.fieldLabel}>Apropiación</ThemedText>
                                                    <TextInput
                                                        style={styles.recompAprInput}
                                                        value={
                                                            recompBuckets.compromisos.appropriation[selIdx] ?? ""
                                                        }
                                                        onChangeText={(t) =>
                                                            setBucketAppropriationField(
                                                                "compromisos",
                                                                selIdx,
                                                                t,
                                                            )
                                                        }
                                                        placeholder="Descripción corta"
                                                        placeholderTextColor="#aaa"
                                                    />
                                                </View>
                                            </View>
                                        </View>
                                    </View>
                                ))
                            )}
                        </View>
                    ) : null}

                    {visitRecoLines.length > 0 ? (
                        <View style={styles.recompBucketBlock}>
                            <ThemedText style={styles.recompBucketHeading}>Recomendaciones</ThemedText>
                            {sortedRecoSelectedIndices.length === 0 ? (
                                <ThemedText style={styles.recompBucketHint}>
                                    Aún sin recomendaciones seleccionadas.
                                </ThemedText>
                            ) : (
                                sortedRecoSelectedIndices.map((selIdx, i) => (
                                    <View key={`edr-${selIdx}`}>
                                        {i > 0 ? <View style={styles.recompCardDivider} /> : null}
                                        <View style={styles.recompInputCard}>
                                            <ThemedText style={styles.recompCardBadge}>Recomendación</ThemedText>
                                            <ThemedText style={styles.recompCardLine}>
                                                {visitRecoLines[selIdx]}
                                            </ThemedText>
                                            <View style={styles.recompPctRow}>
                                                <View style={styles.recompPctCol}>
                                                    <ThemedText style={styles.fieldLabel}>% cumplimiento</ThemedText>
                                                    <TextInput
                                                        style={styles.recompPctInput}
                                                        value={
                                                            recompBuckets.recomendaciones.percentage[
                                                                selIdx
                                                            ] ?? ""
                                                        }
                                                        onChangeText={(t) =>
                                                            setBucketPercentageDigits(
                                                                "recomendaciones",
                                                                selIdx,
                                                                t,
                                                            )
                                                        }
                                                        placeholder="0"
                                                        placeholderTextColor="#aaa"
                                                        keyboardType="number-pad"
                                                        maxLength={5}
                                                    />
                                                </View>
                                                <View style={styles.recompAprCol}>
                                                    <ThemedText style={styles.fieldLabel}>Apropiación</ThemedText>
                                                    <TextInput
                                                        style={styles.recompAprInput}
                                                        value={
                                                            recompBuckets.recomendaciones.appropriation[
                                                                selIdx
                                                            ] ?? ""
                                                        }
                                                        onChangeText={(t) =>
                                                            setBucketAppropriationField(
                                                                "recomendaciones",
                                                                selIdx,
                                                                t,
                                                            )
                                                        }
                                                        placeholder="Descripción corta"
                                                        placeholderTextColor="#aaa"
                                                    />
                                                </View>
                                            </View>
                                        </View>
                                    </View>
                                ))
                            )}
                        </View>
                    ) : null}

                    {visitRecoLines.length === 0 && visitCompLines.length === 0 ? (
                        <ThemedText style={styles.recompPickEmpty}>
                            No hay recomendaciones ni compromisos en la Visita 1 para cargar aquí.
                        </ThemedText>
                    ) : null}

                    <View style={styles.recompFooterBtns}>
                        <TouchableOpacity
                            style={[styles.recompFooterBtnOutline, styles.recompFooterBtnHalf]}
                            onPress={() => recompSheetRef.current?.dismiss()}
                            activeOpacity={0.75}
                        >
                            <ThemedText style={styles.recompFooterBtnOutlineText}>Cancelar</ThemedText>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.recompFooterBtnPrimary,
                                styles.recompFooterBtnHalf,
                                !isRecompDialogSaveReady && styles.saveButtonDisabled,
                            ]}
                            onPress={saveRecompDialog}
                            disabled={!isRecompDialogSaveReady}
                            activeOpacity={0.8}
                        >
                            <Save size={responsiveFont(18)} color="#fff" />
                            <ThemedText style={styles.saveButtonText}>Guardar</ThemedText>
                        </TouchableOpacity>
                    </View>

                    <View style={{ height: verticalScale(24) }} />
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
        fontSize: responsiveFont(15),
        color: "#222",
        lineHeight: responsiveFont(22),
    },
    objectivesReadonlyIndex: {
        fontSize: responsiveFont(15),
        fontWeight: "700",
        color: "#666",
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

    // Sección 5.2 seguimiento (lista + modal)
    recompOpenBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: widthScale(8),
        paddingVertical: verticalScale(10),
        paddingHorizontal: widthScale(14),
        borderRadius: widthScale(8),
        borderWidth: 1,
        borderColor: "rgba(26,122,58,0.35)",
        backgroundColor: "rgba(26,122,58,0.06)",
        marginBottom: verticalScale(10),
    },
    recompOpenBtnText: {
        fontSize: responsiveFont(15),
        fontWeight: "700",
        color: "#1a7a3a",
    },
    commitmentsReadonlyBox: {
        borderRadius: widthScale(8),
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.1)",
        backgroundColor: "rgba(248,249,250,0.95)",
        paddingHorizontal: widthScale(10),
        paddingVertical: verticalScale(10),
    },
    commitmentsEmptyText: {
        fontSize: responsiveFont(14),
        color: "#888",
    },
    commitmentsReadonlyDivider: {
        height: 1,
        backgroundColor: "rgba(0,0,0,0.08)",
        marginVertical: verticalScale(10),
    },
    commitmentsReadonlyRow: {
        gap: verticalScale(6),
    },
    recompTypeBadge: {
        alignSelf: "flex-start",
        paddingHorizontal: widthScale(8),
        paddingVertical: verticalScale(3),
        borderRadius: widthScale(4),
        marginBottom: verticalScale(2),
    },
    recompTypeBadgeComp: {
        backgroundColor: "rgba(26,122,58,0.15)",
    },
    recompTypeBadgeReco: {
        backgroundColor: "rgba(2,132,199,0.12)",
    },
    recompTypeBadgeText: {
        fontSize: responsiveFont(10),
        fontWeight: "700",
        color: "#333",
        textTransform: "uppercase",
    },
    commitmentsActividadText: {
        fontSize: responsiveFont(15),
        color: "#222",
        lineHeight: responsiveFont(22),
    },
    commitmentsDetailText: {
        fontSize: responsiveFont(14),
        color: "#444",
        lineHeight: responsiveFont(20),
    },
    commitmentsDetailLabel: {
        color: "#666",
        fontWeight: "700",
        fontSize: responsiveFont(13),
    },

    recompModalHeader: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: widthScale(14),
        paddingBottom: verticalScale(10),
        borderBottomWidth: 1,
        borderBottomColor: "rgba(0,0,0,0.06)",
        gap: widthScale(8),
    },
    recompModalTitle: {
        flex: 1,
        fontSize: responsiveFont(18),
    },
    recompScrollContent: {
        paddingHorizontal: widthScale(14),
        paddingTop: verticalScale(12),
    },
    recompOriginCard: {
        backgroundColor: "#fff",
        borderRadius: widthScale(10),
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.08)",
        padding: widthScale(12),
        marginBottom: verticalScale(12),
    },
    recompSmallHeading: {
        fontSize: responsiveFont(11),
        fontWeight: "800",
        color: "#666",
        textTransform: "uppercase",
        letterSpacing: 0.4,
        marginBottom: verticalScale(8),
    },
    recompTypeTabs: {
        flexDirection: "row",
        gap: widthScale(8),
    },
    recompTypeTab: {
        flex: 1,
        paddingVertical: verticalScale(10),
        alignItems: "center",
        borderRadius: widthScale(8),
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.1)",
        backgroundColor: "#fafafa",
    },
    recompTypeTabActive: {
        borderColor: "rgba(26,122,58,0.45)",
        backgroundColor: "rgba(26,122,58,0.08)",
    },
    recompTypeTabText: {
        fontSize: responsiveFont(14),
        fontWeight: "600",
        color: "#666",
    },
    recompTypeTabTextActive: {
        color: "#1a7a3a",
    },
    recompListHeading: {
        fontSize: responsiveFont(12),
        fontWeight: "800",
        color: "#555",
        textTransform: "uppercase",
        marginBottom: verticalScale(8),
        letterSpacing: 0.3,
    },
    recompPickList: {
        backgroundColor: "#fff",
        borderRadius: widthScale(10),
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.08)",
        marginBottom: verticalScale(14),
        overflow: "hidden",
    },
    recompPickEmpty: {
        fontSize: responsiveFont(14),
        color: "#777",
        lineHeight: responsiveFont(20),
        padding: widthScale(16),
        textAlign: "center",
    },
    recompPickRow: {
        paddingHorizontal: widthScale(12),
        paddingVertical: verticalScale(12),
        borderBottomWidth: 1,
        borderBottomColor: "rgba(0,0,0,0.06)",
        backgroundColor: "#fff",
    },
    recompPickRowSelected: {
        backgroundColor: "rgba(26,122,58,0.08)",
        borderBottomColor: "rgba(26,122,58,0.12)",
    },
    recompPickRowText: {
        fontSize: responsiveFont(15),
        color: "#333",
        lineHeight: responsiveFont(22),
    },
    recompPickRowTextSelected: {
        fontWeight: "700",
        color: "#1a7a3a",
    },
    recompMetricsCard: {
        backgroundColor: "rgba(26,122,58,0.05)",
        borderRadius: widthScale(8),
        padding: widthScale(12),
        marginBottom: verticalScale(14),
        borderWidth: 1,
        borderColor: "rgba(26,122,58,0.12)",
    },
    recompCounters: {
        fontSize: responsiveFont(13),
        color: "#555",
        marginTop: verticalScale(4),
    },
    recompBucketBlock: {
        marginBottom: verticalScale(16),
    },
    recompBucketHeading: {
        fontSize: responsiveFont(11),
        fontWeight: "800",
        color: "#666",
        textTransform: "uppercase",
        marginBottom: verticalScale(8),
    },
    recompBucketHint: {
        fontSize: responsiveFont(14),
        color: "#888",
        fontStyle: "italic",
    },
    recompCardDivider: {
        height: 8,
    },
    recompInputCard: {
        backgroundColor: "#fff",
        borderRadius: widthScale(10),
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.1)",
        padding: widthScale(12),
        gap: verticalScale(6),
    },
    recompCardBadge: {
        fontSize: responsiveFont(10),
        fontWeight: "800",
        color: "#666",
        textTransform: "uppercase",
    },
    recompCardLine: {
        fontSize: responsiveFont(15),
        color: "#222",
        lineHeight: responsiveFont(21),
        marginBottom: verticalScale(4),
    },
    recompPctRow: {
        flexDirection: "row",
        gap: widthScale(10),
        alignItems: "flex-end",
        flexWrap: "wrap",
        marginTop: verticalScale(4),
    },
    recompPctCol: {
        width: 88,
        minWidth: 88,
        flexShrink: 0,
    },
    recompAprCol: {
        flex: 1,
        minWidth: widthScale(120),
    },
    recompPctInput: {
        backgroundColor: "#f8f9fa",
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.12)",
        borderRadius: widthScale(8),
        paddingHorizontal: widthScale(10),
        paddingVertical: verticalScale(10),
        fontSize: responsiveFont(15),
        color: "#222",
        marginTop: verticalScale(4),
    },
    recompAprInput: {
        backgroundColor: "#f8f9fa",
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.12)",
        borderRadius: widthScale(8),
        paddingHorizontal: widthScale(10),
        paddingVertical: verticalScale(10),
        fontSize: responsiveFont(15),
        color: "#222",
        marginTop: verticalScale(4),
        minHeight: verticalScale(44),
        textAlignVertical: "top",
    },
    recompFooterBtns: {
        flexDirection: "row",
        gap: widthScale(10),
        marginTop: verticalScale(8),
        marginBottom: verticalScale(4),
    },
    recompFooterBtnHalf: {
        flex: 1,
    },
    recompFooterBtnOutline: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: verticalScale(13),
        borderRadius: widthScale(10),
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.2)",
        backgroundColor: "#fff",
    },
    recompFooterBtnOutlineText: {
        fontSize: responsiveFont(16),
        fontWeight: "700",
        color: "#444",
    },
    recompFooterBtnPrimary: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: widthScale(6),
        paddingVertical: verticalScale(13),
        borderRadius: widthScale(10),
        backgroundColor: "#1a7a3a",
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