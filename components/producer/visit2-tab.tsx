import { ThemedText } from "@/components/themed-text";
import { useAlert } from "@/components/ui/custom-alert";
import { checkConnectivity } from "@/hooks/use-network";
import { useAuthStore } from "@/store/useAuthStore";
import {
    PROPERTY_INFO_INTERVENTION_METHOD_ID,
    VISIT2_INTERVENTION_METHOD_ID,
    useCharacterizationStore,
} from "@/store/useCharacterizationStore";
import { useProducerStore } from "@/store/useProducerStore";
import {
    enqueueVisit2,
    getExistingVisit2FromQueue,
    type LocalPhoto,
    type Visit2Payload,
    type Visit2MonitoringCommitment,
} from "@/utils/database/repositories/visit2-repository";
import {
    markInterventionMethodApplied,
} from "@/utils/database/repositories/producer-intervention-repository";
import { apiFetch } from "@/utils/api";
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

    // Bottom sheet ref
    const sheetRef = useRef<BottomSheetModal>(null);
    const [sheetOpen, setSheetOpen] = useState(false);
    const sheetSnapPoints = useMemo(() => ["94%"], []);

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

    // Monitoring commitments (seguimiento compromisos)
    const [commitments, setCommitments] = useState<Visit2MonitoringCommitment[]>([
        { activity: "", percentage_compliance: 0, appropriation_in_field: "", recompType: "recomendaciones" },
    ]);

    // Photos: local picks + existing server images
    const [localPhotos, setLocalPhotos] = useState<(LocalPhoto | null)[]>([null, null, null]);
    const [existingImages, setExistingImages] = useState<(Visit2Image | null)[]>([null, null, null]);

    // UI state
    const [expandedSections, setExpandedSections] = useState<Set<SectionKey>>(new Set(["objective"]));
    const [showAttendanceDropdown, setShowAttendanceDropdown] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [existingVisitId, setExistingVisitId] = useState<number | null>(null);
    const [deletingPhotoIndex, setDeletingPhotoIndex] = useState<number | null>(null);
    const [methodAlreadyApplied, setMethodAlreadyApplied] = useState(false);

    const scrollRef = useRef<ScrollView>(null);
    const token = useAuthStore((s) => s.token);
    const authUser = useAuthStore((s) => s.user);
    const producerDetail = useProducerStore((s) => s.producerDetail);

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
            commitment_followup: commitments.some((c) => c.activity.trim()),
            recommendations: !!recommendations.trim(),
            observations: !!observations.trim(),
            photos: hasPhotos,
            attendance: attendanceComplete,
        };
    }, [generalObjective, specificObjectives, diagnosis, commitments, recommendations, observations, localPhotos, existingImages, attendanceId, attendanceName]);

    // ── Load existing visit ─────────────────────────────────────────────────

    useEffect(() => {
        if (!producerId || !projectId) return;

        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const data = await getVisit2(Number(projectId), Number(producerId));
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

                    // Load monitoring commitments
                    if (data.monitoring_commitments && data.monitoring_commitments.length > 0) {
                        setCommitments(
                            data.monitoring_commitments.map((c) => ({
                                id: c.id,
                                visit_2_id: c.visit_2_id,
                                activity: c.activity,
                                percentage_compliance: c.percentage_compliance,
                                appropriation_in_field: c.appropriation_in_field,
                                recompType: "recomendaciones",
                                porcentaje: `${c.percentage_compliance}%`,
                            })),
                        );
                    }

                    const imgs = data.images ?? [];
                    const newExisting: (Visit2Image | null)[] = [null, null, null];
                    imgs.slice(0, 3).forEach((img, i) => {
                        newExisting[i] = img;
                    });
                    setExistingImages(newExisting);
                } else {
                    // No API visit found — check pending local queue
                    const userId = authUser?.user_id ?? 0;
                    const localVisit = await getExistingVisit2FromQueue(
                        `${producerId}-${projectId}-%`,
                    );
                    if (localVisit && !cancelled) {
                        const payload: Visit2Payload = JSON.parse(localVisit.payload);
                        setIsEditMode(false);
                        setExistingVisitId(null);
                        setGeneralObjective(payload.general_objective || "");
                        setSpecificObjectives(payload.specific_objectives || "");
                        setDiagnosis(payload.diagnostic || "");
                        setRecommendations(payload.recommendations_commitments || "");
                        setObservations(payload.observations || "");
                        setAttendanceId(payload.attendance_id ? String(payload.attendance_id) : "");
                        setAttendanceName(payload.attendance_name || "");
                        setAttendanceIdentification(payload.attendance_identification || "");
                        if (payload.registration_date) setRegistrationDate(payload.registration_date);
                        const stored = JSON.parse(localVisit.photos ?? "{}");
                        const commitmentsData = stored.monitoringCommitments ?? [];
                        if (commitmentsData.length > 0) {
                            setCommitments(commitmentsData);
                        }
                        const photos: LocalPhoto[] = stored.photos ?? [];
                        const newLocal: (LocalPhoto | null)[] = [null, null, null];
                        photos.slice(0, 3).forEach((p, i) => { newLocal[i] = p; });
                        setLocalPhotos(newLocal);
                        setExistingImages([null, null, null]);
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

    // ── Commitment helpers ─────────────────────────────────────────────────

    const addCommitmentRow = () => {
        setCommitments((prev) => [
            ...prev,
            { activity: "", percentage_compliance: 0, appropriation_in_field: "", recompType: "recomendaciones" },
        ]);
    };

    const updateCommitment = (index: number, field: keyof Visit2MonitoringCommitment, value: any) => {
        setCommitments((prev) => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    };

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
                const visitUuid = `${producerId}-${projectId}-${Date.now()}`;
                await enqueueVisit2(visitUuid, payload, monitoringCommitments, newPhotos, userId);
                await markInterventionMethodApplied(
                    Number(producerId),
                    Number(projectId),
                    VISIT2_INTERVENTION_METHOD_ID,
                    userId,
                );
                setMethodAlreadyApplied(true);
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
        showAlert, authUser,
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
        ) => {
            if (!expandedSections.has(sectionKey)) return null;
            return (
                <View style={styles.sectionContent}>
                    {hint && <ThemedText style={styles.sectionHint}>{hint}</ThemedText>}
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

    // ── Render: commitments content ──────────────────────────────────────

    const renderCommitmentsContent = useCallback(() => {
        if (!expandedSections.has("commitment_followup")) return null;

        return (
            <View style={styles.sectionContent}>
                <ThemedText style={styles.sectionHint}>
                    Registre las actividades comprometidas, el porcentaje de cumplimiento y la apropiación en campo.
                </ThemedText>

                {/* Header */}
                <View style={styles.commitmentsHeader}>
                    <ThemedText style={[styles.commitmentsHeaderText, { flex: 1 }]}>Actividad</ThemedText>
                    <ThemedText style={[styles.commitmentsHeaderText, { width: 60, textAlign: "center" }]}>% Cumpl.</ThemedText>
                    <ThemedText style={[styles.commitmentsHeaderText, { flex: 1 }]}>Apropiación en campo</ThemedText>
                </View>

                {/* Rows */}
                {commitments.map((commitment, index) => (
                    <View key={index} style={styles.commitmentRow}>
                        <TextInput
                            style={styles.commitmentActivity}
                            value={commitment.activity}
                            onChangeText={(text) => updateCommitment(index, "activity", text)}
                            placeholder="Actividad comprometida"
                            placeholderTextColor="#aaa"
                            multiline
                        />
                        <TextInput
                            style={styles.commitmentPercentage}
                            value={commitment.porcentaje ?? ""}
                            onChangeText={(text) => updateCommitment(index, "porcentaje", text)}
                            placeholder="%"
                            placeholderTextColor="#aaa"
                            keyboardType="numeric"
                        />
                        <TextInput
                            style={styles.commitmentAppropriation}
                            value={commitment.appropriation_in_field}
                            onChangeText={(text) => updateCommitment(index, "appropriation_in_field", text)}
                            placeholder="Descripción..."
                            placeholderTextColor="#aaa"
                            multiline
                        />
                    </View>
                ))}

                <TouchableOpacity
                    style={styles.addCommitmentBtn}
                    onPress={addCommitmentRow}
                    activeOpacity={0.7}
                >
                    <ThemedText style={styles.addCommitmentBtnText}>+ Agregar fila</ThemedText>
                </TouchableOpacity>
            </View>
        );
    }, [expandedSections, commitments]);

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

                    {/* Section: Objetivo General */}
                    <View style={styles.section}>
                        {renderSectionHeader(
                            SECTIONS.find((s) => s.key === "objective")!,
                            sectionStatus.objective,
                        )}
                        {renderTextSection(
                            "objective",
                            generalObjective,
                            setGeneralObjective,
                            "Describa el objetivo general del acompañamiento...",
                            "Realice seguimiento técnico-productivo al sistema agropecuario del usuario productor, verificando la adopción de las prácticas recomendadas.",
                        )}
                    </View>

                    {/* Section: Objetivos Específicos */}
                    <View style={styles.section}>
                        {renderSectionHeader(
                            SECTIONS.find((s) => s.key === "specific_objectives")!,
                            sectionStatus.specific_objectives,
                        )}
                        {renderTextSection(
                            "specific_objectives",
                            specificObjectives,
                            setSpecificObjectives,
                            "Ingrese los objetivos específicos del acompañamiento...",
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

    // Commitments
    commitmentsHeader: {
        flexDirection: "row",
        gap: widthScale(6),
        paddingHorizontal: widthScale(2),
        marginBottom: verticalScale(6),
    },
    commitmentsHeaderText: {
        fontSize: responsiveFont(11),
        fontWeight: "700",
        color: "#666",
        textTransform: "uppercase",
    },
    commitmentRow: {
        flexDirection: "row",
        gap: widthScale(6),
        alignItems: "flex-start",
        marginBottom: verticalScale(8),
    },
    commitmentActivity: {
        flex: 1,
        backgroundColor: "#f8f9fa",
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.1)",
        borderRadius: widthScale(8),
        paddingHorizontal: widthScale(10),
        paddingVertical: verticalScale(8),
        fontSize: responsiveFont(14),
        color: "#333",
        minHeight: verticalScale(36),
    },
    commitmentPercentage: {
        width: 60,
        backgroundColor: "#f8f9fa",
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.1)",
        borderRadius: widthScale(8),
        paddingHorizontal: widthScale(8),
        paddingVertical: verticalScale(8),
        fontSize: responsiveFont(14),
        color: "#333",
        textAlign: "center",
    },
    commitmentAppropriation: {
        flex: 1,
        backgroundColor: "#f8f9fa",
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.1)",
        borderRadius: widthScale(8),
        paddingHorizontal: widthScale(10),
        paddingVertical: verticalScale(8),
        fontSize: responsiveFont(14),
        color: "#333",
        minHeight: verticalScale(36),
    },
    addCommitmentBtn: {
        paddingVertical: verticalScale(10),
        alignItems: "center",
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.1)",
        borderRadius: widthScale(8),
        borderStyle: "dashed",
        marginTop: verticalScale(4),
    },
    addCommitmentBtnText: {
        fontSize: responsiveFont(14),
        color: "#666",
        fontWeight: "600",
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