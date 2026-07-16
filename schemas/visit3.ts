import { z } from "zod";

/**
 * Visita 3 — contratos, mappers y validaciones para la app móvil.
 * Refleja los endpoints REST del backend `/visit-3`:
 *   - GET  /visit-3/project/:projectId/producer/:producerId
 *   - POST /visit-3 (multipart)
 *   - PUT  /visit-3/:id
 *   - POST /visit-3/:id/images (multipart)
 *   - GET  /visit-3/images/:imageId
 *   - DELETE /visit-3/images/:imageId
 *   - POST /visit-3/monitoring-commitments
 *   - PUT  /visit-3/monitoring-commitments/:id
 *   - DELETE /visit-3/monitoring-commitments/:id
 */

// ─── Constantes de dominio ──────────────────────────────────────────────

/** Máximo de imágenes soportadas en el registro. */
export const VISIT3_MAX_PHOTOS = 3;

/** Tamaño máximo por imagen en bytes (~6 MB). */
export const VISIT3_MAX_PHOTO_BYTES = 6 * 1024 * 1024;

/**
 * Aspectos evaluados (30 ítems en total) en la clasificación por Ley 1876
 * cuando el método es Visita 3 (`intervention_method_id = 9`).
 */
export const VISIT3_ASPECTS = [
  {
    id: "aspecto1",
    number: 1,
    title: "Aspecto 1: Desarrollo de capacidades humanas y técnicas",
    itemCount: 10,
    startNumber: 1,
  },
  {
    id: "aspecto2",
    number: 2,
    title:
      "Aspecto 2: Desarrollo de capacidades sociales integrales y el fortalecimiento de la asociatividad",
    itemCount: 7,
    startNumber: 11,
  },
  {
    id: "aspecto3",
    number: 3,
    title: "Aspecto 3: Acceso a la información y uso de las TIC",
    itemCount: 5,
    startNumber: 18,
  },
  {
    id: "aspecto4",
    number: 4,
    title: "Aspecto 4: Gestión sostenible de los recursos naturales",
    itemCount: 5,
    startNumber: 23,
  },
  {
    id: "aspecto5",
    number: 5,
    title:
      "Aspecto 5: Desarrollo de habilidades para la participación en espacios para la retroalimentación de la política pública sectorial y empoderamiento para auto gestionar la solución de sus necesidades",
    itemCount: 3,
    startNumber: 28,
  },
] as const;

export type Visit3AspectId = (typeof VISIT3_ASPECTS)[number]["id"];

/** Etiquetas para las 3 fotos requeridas. */
export const VISIT3_PHOTO_LABELS = [
  "Foto 1: Fachada o entrada del predio con el productor",
  "Foto 2: Cultivo o unidad productiva con el productor",
  "Foto 3: Productor realizando una actividad técnica",
] as const;

// ─── Zod schemas ────────────────────────────────────────────────────────

const numberFromLoose = z.union([z.number(), z.string()]).transform((v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
});

const optionalString = z.union([z.string(), z.null()]).optional();

export const Visit3ImageSchema = z
  .object({
    id: z.number(),
    filename: z.string().optional(),
  })
  .passthrough();

export type Visit3Image = z.infer<typeof Visit3ImageSchema>;

export const Visit3MonitoringCommitmentApiSchema = z
  .object({
    id: z.number().optional(),
    visit_3_id: z.number().optional(),
    activity: z.string(),
    percentage_compliance: numberFromLoose,
    appropriation_in_field: z.string(),
  })
  .passthrough();

export type Visit3MonitoringCommitmentApi = z.infer<
  typeof Visit3MonitoringCommitmentApiSchema
>;

export const Visit3ResponseSchema = z
  .object({
    id: z.number(),
    project_id: z.number(),
    producer_id: z.number(),
    registration_date: z.string(),
    origin: z.string().optional().default("app"),
    attendance_id: z.number(),
    attendance_identification: optionalString,
    attendance_name: optionalString,
    general_objective: z.string().default(""),
    specific_objectives: z.string().default(""),
    technical_recommendations: z.string().default(""),
    observations: z.string().default(""),
    aspect_1_justification: z.string().default(""),
    aspect_2_justification: z.string().default(""),
    aspect_3_justification: z.string().default(""),
    aspect_4_justification: z.string().default(""),
    aspect_5_justification: z.string().default(""),
    images: z.array(Visit3ImageSchema).default([]),
    monitoring_commitments: z
      .array(Visit3MonitoringCommitmentApiSchema)
      .default([]),
  })
  .passthrough();

export type Visit3Response = z.infer<typeof Visit3ResponseSchema>;

// ─── Form model ─────────────────────────────────────────────────────────

/**
 * Fila de seguimiento (5.1) trasladada de Visita 2 y editable en Visita 3.
 * `porcentaje` se maneja como string (permite entrada libre).
 */
export interface Visit3TrackingRow {
  /** ID remoto si proviene de servidor; undefined = fila nueva. */
  id?: number;
  activity: string;
  percentage_compliance: string;
  appropriation_in_field: string;
  /** Tipo detectado para clasificación visual en la UI. */
  recompType?: "recomendaciones" | "compromisos";
}

/** Estado del formulario de registro (sección 5.x + aspectos). */
export interface Visit3FormValues {
  registration_date: string;
  registration_time: string;
  usuario_acepta_servicio: string;
  attendance_id: string;
  attendance_name: string;
  attendance_identification: string;

  /** Solo lectura, viene de `/objetives/event/6/line/{lineId}`. */
  general_objective: string;
  specific_objectives: string;

  /** Sección 5.1: seguimiento a compromisos de Visita 2. */
  commitments_tracking: Visit3TrackingRow[];

  technical_recommendations: string;
  observations: string;

  /** Cinco justificaciones (sección 6). */
  aspect_justifications: Record<Visit3AspectId, string>;
}

export function createEmptyVisit3Form(): Visit3FormValues {
  const justifications = {} as Record<Visit3AspectId, string>;
  for (const aspect of VISIT3_ASPECTS) {
    justifications[aspect.id] = "";
  }
  return {
    registration_date: "",
    registration_time: "09:00:00",
    usuario_acepta_servicio: "",
    attendance_id: "",
    attendance_name: "",
    attendance_identification: "",
    general_objective: "",
    specific_objectives: "",
    commitments_tracking: [],
    technical_recommendations: "",
    observations: "",
    aspect_justifications: justifications,
  };
}

// ─── Payload types ──────────────────────────────────────────────────────

export interface Visit3AspectJustifications {
  aspect_1_justification: string;
  aspect_2_justification: string;
  aspect_3_justification: string;
  aspect_4_justification: string;
  aspect_5_justification: string;
}

export interface Visit3CreatePayload extends Visit3AspectJustifications {
  project_id: number;
  producer_id: number;
  registration_date: string;
  origin: "app" | "web";
  attendance_id: number;
  attendance_identification: string | null;
  attendance_name: string | null;
  general_objective: string;
  specific_objectives: string;
  technical_recommendations: string;
  observations: string;
  monitoring_commitments: {
    activity: string;
    percentage_compliance: number;
    appropriation_in_field: string;
  }[];
}

export interface Visit3UpdatePayload extends Visit3AspectJustifications {
  project_id: number;
  producer_id: number;
  registration_date: string;
  origin: "app" | "web";
  attendance_id: number;
  attendance_identification: string | null;
  attendance_name: string | null;
  general_objective: string;
  specific_objectives: string;
  technical_recommendations: string;
  observations: string;
}

// ─── Mappers ────────────────────────────────────────────────────────────

function parsePercentageInput(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const raw = String(value).replace(/[^0-9.,-]/g, "").replace(",", ".");
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function combineDateTime(date: string, time: string): string {
  const datePart = (date ?? "").trim() || new Date().toISOString().split("T")[0]!;
  const timePart = (time ?? "").trim() || "09:00:00";
  const cleanDate = datePart.includes(" ") ? datePart.split(" ")[0]! : datePart;
  return `${cleanDate} ${timePart}`;
}

function splitDateTime(dateTime: string): { date: string; time: string } {
  if (!dateTime) return { date: "", time: "09:00:00" };
  const [datePart, timePart] = dateTime.includes("T")
    ? dateTime.split("T")
    : dateTime.split(" ");
  return {
    date: (datePart ?? "").trim(),
    time: (timePart ?? "09:00:00").trim() || "09:00:00",
  };
}

function aspectJustificationsFromForm(
  form: Visit3FormValues,
): Visit3AspectJustifications {
  return {
    aspect_1_justification: String(
      form.aspect_justifications.aspecto1 ?? "",
    ).trim(),
    aspect_2_justification: String(
      form.aspect_justifications.aspecto2 ?? "",
    ).trim(),
    aspect_3_justification: String(
      form.aspect_justifications.aspecto3 ?? "",
    ).trim(),
    aspect_4_justification: String(
      form.aspect_justifications.aspecto4 ?? "",
    ).trim(),
    aspect_5_justification: String(
      form.aspect_justifications.aspecto5 ?? "",
    ).trim(),
  };
}

export function mapFormToCreatePayload(
  form: Visit3FormValues,
  meta: { projectId: number; producerId: number },
): Visit3CreatePayload {
  const attendanceId = Number(form.attendance_id) || 1;
  const isOther = form.attendance_id !== "1";
  return {
    project_id: meta.projectId,
    producer_id: meta.producerId,
    registration_date: combineDateTime(
      form.registration_date,
      form.registration_time,
    ),
    origin: "app",
    attendance_id: attendanceId,
    attendance_identification: isOther
      ? form.attendance_identification.trim() || null
      : null,
    attendance_name: isOther ? form.attendance_name.trim() || null : null,
    general_objective: form.general_objective.trim(),
    specific_objectives: form.specific_objectives.trim(),
    technical_recommendations: form.technical_recommendations.trim(),
    observations: form.observations.trim(),
    ...aspectJustificationsFromForm(form),
    monitoring_commitments: form.commitments_tracking
      .filter(
        (r) =>
          r.activity.trim() ||
          r.appropriation_in_field.trim() ||
          r.percentage_compliance.trim(),
      )
      .map((r) => ({
        activity: r.activity.trim(),
        percentage_compliance: parsePercentageInput(r.percentage_compliance),
        appropriation_in_field: r.appropriation_in_field.trim(),
      })),
  };
}

export function mapFormToUpdatePayload(
  form: Visit3FormValues,
  meta: { projectId: number; producerId: number },
): Visit3UpdatePayload {
  const attendanceId = Number(form.attendance_id) || 1;
  const isOther = form.attendance_id !== "1";
  return {
    project_id: meta.projectId,
    producer_id: meta.producerId,
    registration_date: combineDateTime(
      form.registration_date,
      form.registration_time,
    ),
    origin: "app",
    attendance_id: attendanceId,
    attendance_identification: isOther
      ? form.attendance_identification.trim() || null
      : null,
    attendance_name: isOther ? form.attendance_name.trim() || null : null,
    general_objective: form.general_objective.trim(),
    specific_objectives: form.specific_objectives.trim(),
    technical_recommendations: form.technical_recommendations.trim(),
    observations: form.observations.trim(),
    ...aspectJustificationsFromForm(form),
  };
}

export function mapResponseToForm(response: Visit3Response): Visit3FormValues {
  const form = createEmptyVisit3Form();
  const { date, time } = splitDateTime(response.registration_date ?? "");
  form.registration_date = date;
  form.registration_time = time || "09:00:00";
  form.usuario_acepta_servicio = "si";
  form.attendance_id = String(response.attendance_id ?? "");
  form.attendance_name = response.attendance_name ?? "";
  form.attendance_identification = response.attendance_identification ?? "";
  form.general_objective = response.general_objective ?? "";
  form.specific_objectives = response.specific_objectives ?? "";
  form.technical_recommendations = response.technical_recommendations ?? "";
  form.observations = response.observations ?? "";
  form.aspect_justifications.aspecto1 = response.aspect_1_justification ?? "";
  form.aspect_justifications.aspecto2 = response.aspect_2_justification ?? "";
  form.aspect_justifications.aspecto3 = response.aspect_3_justification ?? "";
  form.aspect_justifications.aspecto4 = response.aspect_4_justification ?? "";
  form.aspect_justifications.aspecto5 = response.aspect_5_justification ?? "";
  form.commitments_tracking = (response.monitoring_commitments ?? []).map(
    (c) => ({
      id: c.id,
      activity: c.activity ?? "",
      percentage_compliance:
        c.percentage_compliance != null ? String(c.percentage_compliance) : "",
      appropriation_in_field: c.appropriation_in_field ?? "",
    }),
  );
  return form;
}

/**
 * Normaliza distintas envolturas del API (`{ data: ... }`, arreglos, o entidad plana)
 * y valida contra el schema. Devuelve `null` si el payload no representa una Visita 3.
 */
export function unwrapVisit3Payload(raw: unknown): Visit3Response | null {
  if (raw == null) return null;

  const tryParse = (candidate: unknown): Visit3Response | null => {
    const result = Visit3ResponseSchema.safeParse(candidate);
    return result.success ? result.data : null;
  };

  if (typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const nested = record.data;
  if (Array.isArray(nested)) {
    for (const item of nested) {
      const parsed = tryParse(item);
      if (parsed) return parsed;
    }
    return null;
  }
  const nestedParsed = tryParse(nested);
  if (nestedParsed) return nestedParsed;
  return tryParse(record);
}

// ─── Section validation helpers ────────────────────────────────────────

export function sectionAccompanimentComplete(form: Visit3FormValues): boolean {
  if (!form.registration_date.trim()) return false;
  if (!form.registration_time.trim()) return false;
  if (form.usuario_acepta_servicio !== "si") return false;
  if (!form.attendance_id) return false;
  if (form.attendance_id !== "1") {
    if (!form.attendance_name.trim()) return false;
    if (!form.attendance_identification.trim()) return false;
  }
  return true;
}

export function sectionTechnicalFocusComplete(form: Visit3FormValues): boolean {
  return (
    !!form.technical_recommendations.trim() &&
    Object.values(form.aspect_justifications).every((v) => (v ?? "").trim().length > 0)
  );
}

export function sectionClassificationComplete(
  form: Visit3FormValues,
  hasClassificationAnswers: boolean,
): boolean {
  return (
    hasClassificationAnswers &&
    Object.values(form.aspect_justifications).every(
      (v) => (v ?? "").trim().length > 0,
    )
  );
}
