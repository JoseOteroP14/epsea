import { apiFetch, NetworkError } from "@/utils/api";
import { API_BASE_URL } from "@/utils/api-config";
import { getStoredToken } from "@/utils/secure-storage";
import {
  unwrapVisit3Payload,
  Visit3ResponseSchema,
  type Visit3CreatePayload,
  type Visit3Response,
  type Visit3UpdatePayload,
} from "@/schemas/visit3";

const BASE_URL = API_BASE_URL;

export interface Visit3LocalPhoto {
  uri: string;
  fileName: string;
  type: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getStoredToken();
  return token
    ? { Accept: "application/json", Authorization: `Bearer ${token}` }
    : { Accept: "application/json" };
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (data && typeof data === "object" && typeof (data as any).message === "string") {
      return (data as any).message as string;
    }
  } catch {
    // ignore
  }
  return `Error ${response.status}`;
}

/**
 * GET /visit-3/project/:projectId/producer/:producerId
 * Devuelve null cuando el backend responde 404 o cuerpo vacío.
 */
export async function getVisit3(
  projectId: number,
  producerId: number,
): Promise<Visit3Response | null> {
  try {
    const res = await apiFetch<unknown>(
      `/visit-3/project/${projectId}/producer/${producerId}`,
    );
    return unwrapVisit3Payload(res);
  } catch (error) {
    if (error instanceof NetworkError) throw error;
    if (error instanceof Error && /404/.test(error.message)) return null;
    return null;
  }
}

/**
 * POST /visit-3 (multipart) — crea la visita junto con las imágenes y compromisos.
 * Si el backend responde 409 (ya existe), intenta traer la visita actual para hacer upsert.
 */
export async function createVisit3(
  payload: Visit3CreatePayload,
  photos: Visit3LocalPhoto[],
): Promise<{ visit: Visit3Response | null; conflictExisting?: Visit3Response }> {
  const formData = new FormData();
  formData.append("project_id", String(payload.project_id));
  formData.append("producer_id", String(payload.producer_id));
  formData.append("registration_date", payload.registration_date);
  formData.append("origin", payload.origin);
  formData.append("attendance_id", String(payload.attendance_id));
  formData.append("attendance_identification", payload.attendance_identification ?? "");
  formData.append("attendance_name", payload.attendance_name ?? "");
  formData.append("general_objective", payload.general_objective);
  formData.append("specific_objectives", payload.specific_objectives);
  formData.append("technical_recommendations", payload.technical_recommendations);
  formData.append("observations", payload.observations);
  formData.append("aspect_1_justification", payload.aspect_1_justification);
  formData.append("aspect_2_justification", payload.aspect_2_justification);
  formData.append("aspect_3_justification", payload.aspect_3_justification);
  formData.append("aspect_4_justification", payload.aspect_4_justification);
  formData.append("aspect_5_justification", payload.aspect_5_justification);
  formData.append(
    "monitoring_commitments",
    JSON.stringify(payload.monitoring_commitments ?? []),
  );

  for (const photo of photos) {
    formData.append(
      "images",
      { uri: photo.uri, name: photo.fileName, type: photo.type } as any,
    );
  }

  const headers = await authHeaders();
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/visit-3`, {
      method: "POST",
      headers,
      body: formData,
    });
  } catch (error) {
    throw new NetworkError(
      error instanceof Error ? error.message : "Error de red",
    );
  }

  if (response.status === 409) {
    const existing = await getVisit3(payload.project_id, payload.producer_id);
    return { visit: null, conflictExisting: existing ?? undefined };
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const raw = await response.json().catch(() => null);
  return { visit: unwrapVisit3Payload(raw) };
}

/**
 * PUT /visit-3/:id — actualiza el registro (sin imágenes; se manejan por separado).
 */
export async function updateVisit3(
  id: number,
  payload: Visit3UpdatePayload,
): Promise<Visit3Response | null> {
  const res = await apiFetch<unknown>(`/visit-3/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return unwrapVisit3Payload(res);
}

/**
 * POST /visit-3/:id/images — agrega imágenes a una visita existente.
 */
export async function uploadVisit3Images(
  visitId: number,
  photos: Visit3LocalPhoto[],
): Promise<void> {
  if (photos.length === 0) return;
  const headers = await authHeaders();
  const formData = new FormData();
  for (const photo of photos) {
    formData.append("images", {
      uri: photo.uri,
      name: photo.fileName,
      type: photo.type,
    } as any);
  }
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/visit-3/${visitId}/images`, {
      method: "POST",
      headers,
      body: formData,
    });
  } catch (error) {
    throw new NetworkError(
      error instanceof Error ? error.message : "Error de red",
    );
  }
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
}

/**
 * DELETE /visit-3/images/:imageId
 */
export async function deleteVisit3Image(imageId: number): Promise<void> {
  await apiFetch(`/visit-3/images/${imageId}`, { method: "DELETE" });
}

/** URL de la imagen para renderizado (requiere auth mediante fetch/download). */
export function getVisit3ImageUrl(imageId: number): string {
  return `${BASE_URL}/visit-3/images/${imageId}`;
}

// ─── Monitoring commitments ────────────────────────────────────────────

export interface Visit3MonitoringCommitmentInput {
  activity: string;
  percentage_compliance: number;
  appropriation_in_field: string;
}

export async function createMonitoringCommitment(
  visit3Id: number,
  data: Visit3MonitoringCommitmentInput,
): Promise<void> {
  await apiFetch("/visit-3/monitoring-commitments", {
    method: "POST",
    body: JSON.stringify({ visit_3_id: visit3Id, ...data }),
  });
}

export async function updateMonitoringCommitment(
  id: number,
  data: Visit3MonitoringCommitmentInput,
): Promise<void> {
  await apiFetch(`/visit-3/monitoring-commitments/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteMonitoringCommitment(id: number): Promise<void> {
  await apiFetch(`/visit-3/monitoring-commitments/${id}`, {
    method: "DELETE",
  });
}

/** Re-export para hidratar datos en cache y sync. */
export { Visit3ResponseSchema };
