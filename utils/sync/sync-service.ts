import type { Project } from "@/schemas/project";
import { useAuthStore } from "@/store/useAuthStore";
import {
  PRODUCTIVE_LINES_INTERVENTION_METHOD_ID,
  VISIT2_INTERVENTION_METHOD_ID,
  VISIT_INTERVENTION_METHOD_ID,
} from "@/store/useCharacterizationStore";
import { apiFetch } from "@/utils/api";
import {
    deleteProducersNotIn,
    upsertProducers
} from "@/utils/database/repositories/producer-repository";
import {
    deleteProjectsNotIn,
    upsertProjects,
} from "@/utils/database/repositories/project-repository";
import {
    deleteSyncQueueRow,
    getMetadata,
    getPending,
    markFailed,
    setMetadata,
} from "@/utils/database/repositories/sync-repository";
import { deleteAnswers } from "@/utils/database/repositories/answer-repository";
import { upsertSurveyResults, type SurveyResultRow } from "@/utils/database/repositories/survey-results-repository";
import {
  compareInterventionMethodItemsStable,
  getInterventionMethodItemOrder,
} from "@/utils/survey/intervention-method-order";
import { getStoredToken } from "@/utils/secure-storage";
import {
    deleteVisit1QueueRow,
    getPendingVisit1Items,
    markVisit1Failed,
    parseVisit1QueuePhotosColumn,
    type Visit1Payload,
    type Visit1QueueItem,
} from "@/utils/database/repositories/visit1-repository";
import {
    deleteVisit2QueueRow,
    getPendingVisit2Items,
    markVisit2Failed,
    type Visit2MonitoringCommitment,
    type Visit2Payload,
    type Visit2QueueExtras,
    type Visit2QueueItem,
} from "@/utils/database/repositories/visit2-repository";
import {
    getPendingAnswerUpdates,
    deleteAnswerUpdate,
} from "@/utils/database/repositories/answer-update-repository";
import { markInterventionMethodApplied } from "@/utils/database/repositories/producer-intervention-repository";
import {
  upsertVisitServerCache,
  upsertProductiveLinesBundleCache,
  deleteExtensionistCachesNotInProject,
} from "@/utils/database/repositories/server-extensionist-cache-repository";


export interface SyncProgress {
  stage: string;
  current: number;
  total: number;
}

type DownloadPhaseKey = "projects" | "producers" | "results" | "finalize";

const DOWNLOAD_PHASES: Record<DownloadPhaseKey, { start: number; weight: number }> = {
  projects: { start: 0, weight: 0.1 },
  producers: { start: 0.1, weight: 0.25 },
  results: { start: 0.35, weight: 0.55 },
  finalize: { start: 0.9, weight: 0.1 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function calcPhasePercent(phase: { start: number; weight: number }, current: number, total: number): number {
  const safeTotal = total > 0 ? total : 1;
  const ratio = clamp(current / safeTotal, 0, 1);
  return (phase.start + phase.weight * ratio) * 100;
}

function isRecordWithId(value: unknown): value is Record<string, unknown> & {
  id: unknown;
} {
  return typeof value === "object" && value !== null && "id" in value;
}

/**
 * Persista visitas 1/2 y listas REST de líneas productivas tras la descarga por productor/proyecto.
 */
async function downloadExtensionistCachesForProducer(
  userId: number,
  projectId: number,
  producerId: number,
): Promise<void> {
  const settleVisit1 = apiFetch<{ data?: unknown }>(
    `/visit-1/project/${projectId}/producer/${producerId}`,
  )
    .then(async (res) => {
      const data = res?.data;
      if (isRecordWithId(data)) {
        await upsertVisitServerCache({
          userId,
          producerId,
          projectId,
          kind: "visit1",
          jsonPayload: JSON.stringify(data),
        });
        await markInterventionMethodApplied(
          producerId,
          projectId,
          VISIT_INTERVENTION_METHOD_ID,
          userId,
        );
      }
    })
    .catch(() => {});

  const settleVisit2 = apiFetch<{ data?: unknown }>(
    `/visit-2/project/${projectId}/producer/${producerId}`,
  )
    .then(async (res) => {
      const data = res?.data;
      if (isRecordWithId(data)) {
        await upsertVisitServerCache({
          userId,
          producerId,
          projectId,
          kind: "visit2",
          jsonPayload: JSON.stringify(data),
        });
        await markInterventionMethodApplied(
          producerId,
          projectId,
          VISIT2_INTERVENTION_METHOD_ID,
          userId,
        );
      }
    })
    .catch(() => {});

  const settleBundle = Promise.all([
    apiFetch<{ data?: unknown[] }>(
      `/agricultural-lines/producer/${producerId}/project/${projectId}`,
    ).catch(() => ({ data: [] })),
    apiFetch<{ data?: unknown[] }>(
      `/livestock-lines/producer/${producerId}/project/${projectId}`,
    ).catch(() => ({ data: [] })),
    apiFetch<{ data?: unknown[] }>(
      `/forest-lines/producer/${producerId}/project/${projectId}`,
    ).catch(() => ({ data: [] })),
    apiFetch<{ data?: unknown[] }>(
      `/fishing-lines/producer/${producerId}/project/${projectId}`,
    ).catch(() => ({ data: [] })),
    apiFetch<{ data?: unknown[] }>(
      `/aquaculture-lines/producer/${producerId}/project/${projectId}`,
    ).catch(() => ({ data: [] })),
  ])
    .then(async ([agriRes, livestockRes, forestRes, fishingRes, aquacultureRes]) => {
      const agricultural = Array.isArray(agriRes?.data) ? agriRes!.data : [];
      const livestock = Array.isArray(livestockRes?.data) ? livestockRes!.data : [];
      const forest = Array.isArray(forestRes?.data) ? forestRes!.data : [];
      const fishing = Array.isArray(fishingRes?.data) ? fishingRes!.data : [];
      const aquaculture = Array.isArray(aquacultureRes?.data)
        ? aquacultureRes!.data
        : [];

      await upsertProductiveLinesBundleCache({
        userId,
        producerId,
        projectId,
        jsonPayload: JSON.stringify({
          agricultural,
          livestock,
          forest,
          fishing,
          aquaculture,
        }),
      });

      const linesCount =
        agricultural.length +
        livestock.length +
        forest.length +
        fishing.length +
        aquaculture.length;

      if (linesCount > 0) {
        await markInterventionMethodApplied(
          producerId,
          projectId,
          PRODUCTIVE_LINES_INTERVENTION_METHOD_ID,
          userId,
        );
      }
    })
    .catch(() => {});

  await Promise.all([settleVisit1, settleVisit2, settleBundle]);
}

export async function downloadAllData(
  onProgress?: (progress: SyncProgress) => void,
): Promise<void> {
  const { user } = useAuthStore.getState();
  if (!user) throw new Error("No authenticated user");

  const reportPhase = (
    stage: string,
    phase: { start: number; weight: number },
    current: number,
    total: number,
  ) => {
    const percent = Math.round(calcPhasePercent(phase, current, total));
    onProgress?.({ stage, current: percent, total: 100 });
  };

  // 1. Projects
  reportPhase("Descargando proyectos", DOWNLOAD_PHASES.projects, 0, 1);
  const projectsResponse = await apiFetch<any>(
    `/users/${user.user_id}/projects`,
    { method: "GET" },
  );
  let projects: Project[] = [];
  if (Array.isArray(projectsResponse)) {
    projects = projectsResponse;
  } else if (Array.isArray(projectsResponse?.data)) {
    projects = projectsResponse.data;
  } else if (Array.isArray(projectsResponse?.data?.pagination?.items)) {
    projects = projectsResponse.data.pagination.items;
  } else if (Array.isArray(projectsResponse?.data?.projects)) {
    projects = projectsResponse.data.projects;
  } else if (Array.isArray(projectsResponse?.pagination?.items)) {
    projects = projectsResponse.pagination.items;
  }
  await upsertProjects(projects);
  // Remove projects no longer assigned to this user
  if (projects.length > 0) {
    await deleteProjectsNotIn(projects.map((p) => p.id));
  }
  reportPhase("Descargando proyectos", DOWNLOAD_PHASES.projects, 1, 1);

  // 2. Producers for each project
  let producerCount = 0;
  const allProducerIds: Array<{ producerId: number; projectId: number }> = [];
  if (projects.length === 0) {
    reportPhase("Usuarios descargados", DOWNLOAD_PHASES.producers, 1, 1);
  } else {
    for (let i = 0; i < projects.length; i++) {
      const project = projects[i];

      // Fetch all pages
      let page = 1;
      let hasMore = true;
      let totalPages = 1;
      const fetchedProducerIds: number[] = [];
      while (hasMore) {
        const response = await apiFetch<any>(
          `/producer-assigned-to-extensionist/${project.id}/producers`,
          { method: "GET", params: { page, limit: 100 } },
        );

        let producers: any[] = [];
        if (response?.data?.pagination) {
          const pag = response.data.pagination;
          producers = Array.isArray(pag.items) ? pag.items : [];
          totalPages = pag.totalPages ?? pag.total_pages ?? 1;
          hasMore = page < totalPages;
        } else if (Array.isArray(response?.data)) {
          producers = response.data;
          totalPages = 1;
          hasMore = false;
        } else if (Array.isArray(response)) {
          producers = response;
          totalPages = 1;
          hasMore = false;
        } else {
          totalPages = 1;
          hasMore = false;
        }

        if (producers.length > 0) {
          await upsertProducers(producers, project.id);
          producerCount += producers.length;
          for (const p of producers) {
            const id = p.producer_id ?? p.id;
            if (id != null) fetchedProducerIds.push(Number(id));
            allProducerIds.push({ producerId: Number(id), projectId: project.id });
          }
        }

        const pageProgress = Math.min(page, totalPages) / Math.max(totalPages, 1);
        reportPhase(
          `Productores ${i + 1} de ${projects.length}`,
          DOWNLOAD_PHASES.producers,
          i + pageProgress,
          projects.length,
        );

        page++;
      }
      // Remove producers no longer assigned to this project
      await deleteProducersNotIn(project.id, fetchedProducerIds);
      await deleteExtensionistCachesNotInProject(project.id, fetchedProducerIds);
      reportPhase(
        `Productores ${i + 1} de ${projects.length}`,
        DOWNLOAD_PHASES.producers,
        i + 1,
        projects.length,
      );
    }
    reportPhase("Usuarios descargados", DOWNLOAD_PHASES.producers, 1, 1);
  }

  // 4. Download survey results for all producers across all intervention methods
  const INTERVENTION_METHOD_IDS = [1, 2, 3, 5, 6, 7, 8];
  const totalProducers = allProducerIds.length;

  reportPhase("Descargando resultados", DOWNLOAD_PHASES.results, 0, totalProducers || 1);

  for (let i = 0; i < totalProducers; i++) {
    const { producerId, projectId } = allProducerIds[i]!;

    for (const methodId of INTERVENTION_METHOD_IDS) {
      try {
        const response = await apiFetch<any>(
          `/surveys/${projectId}/producer/${producerId}/intervention_method/${methodId}`,
          { method: "GET" },
        );
        const rawData = Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response)
            ? response
            : [];

        if (rawData.length > 0) {
          await markInterventionMethodApplied(producerId, projectId, methodId, user.user_id);

          const flatResults: SurveyResultRow[] = [];
          const sortedRaw = [...rawData].sort(compareInterventionMethodItemsStable);
          for (const item of sortedRaw) {
            const nestedAnswers = item.answers;
            const qOrder = getInterventionMethodItemOrder(item);
            if (Array.isArray(nestedAnswers) && nestedAnswers.length > 0) {
              for (const ans of nestedAnswers) {
                flatResults.push({
                  survey_id: ans.survey_id ?? 0,
                  answer_id: ans.id,
                  question_id: ans.question_id ?? item.id,
                  answer_value: ans.value ?? ans.answer_value ?? "",
                  item_name: ans.item_name ?? null,
                  question_description: item.description ?? null,
                  question_type_id: item.question_type_id ?? 0,
                  question_parent_id: item.question_parent_id ?? null,
                  question_order: qOrder,
                  intervention_method_id: methodId,
                  producer_id: producerId,
                  project_id: projectId,
                  created_at: item.created_at ?? null,
                  updated_at: item.updated_at ?? null,
                });
              }
            } else if (item.answer_id != null) {
              flatResults.push({
                survey_id: item.survey_id ?? 0,
                answer_id: item.answer_id,
                question_id: item.question_id ?? 0,
                answer_value: item.answer_value ?? item.value ?? "",
                item_name: item.item_name ?? null,
                question_description: item.question_description ?? null,
                question_type_id: item.question_type_id ?? 0,
                question_parent_id: item.question_parent_id ?? null,
                question_order: qOrder,
                intervention_method_id: methodId,
                producer_id: producerId,
                project_id: projectId,
                created_at: item.created_at ?? null,
                updated_at: item.updated_at ?? null,
              });
            }
          }
          if (flatResults.length > 0) {
            await upsertSurveyResults(flatResults);
          }
        }
      } catch {
        // Skip silently — endpoint may not exist or producer has no results
      }
    }

    await downloadExtensionistCachesForProducer(
      user.user_id,
      projectId,
      producerId,
    );

    // Report once per producer (not per method) to avoid visual jumps
    reportPhase(
      `Resultados ${i + 1} de ${totalProducers}`,
      DOWNLOAD_PHASES.results,
      i + 1,
      totalProducers,
    );
  }

  reportPhase("Resultados descargados", DOWNLOAD_PHASES.results, 1, 1);


  // Note: Producer details endpoint (/producers/:id) is not available for extensionists.
  // Components, questions, question types, and innova fields are pre-seeded in the DB.

  // Mark last download time
  reportPhase("Finalizando descarga", DOWNLOAD_PHASES.finalize, 0, 1);
  await setMetadata("last_full_download", new Date().toISOString());
  reportPhase("Descarga completa", DOWNLOAD_PHASES.finalize, 1, 1);
}

const BASE_URL = "https://playmusic.com.co/agro/api/v1";

function isRateLimited(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes("429") || error.message.includes("rate");
  }
  return false;
}

function getRetryDelay(attempts: number): number {
  return Math.min(1000 * Math.pow(2, attempts), 5 * 60 * 1000);
}

async function uploadVisit1Item(item: Visit1QueueItem): Promise<void> {
  const token = await getStoredToken();
  const payload = JSON.parse(item.payload) as Visit1Payload;
  const { photos, remote_visit_1_id } = parseVisit1QueuePhotosColumn(
    item.photos,
  );

  if (remote_visit_1_id != null) {
    const putRes = await fetch(`${BASE_URL}/visit-1/${remote_visit_1_id}`, {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!putRes.ok) {
      const errData = await putRes.json().catch(() => ({}));
      throw new Error(
        typeof errData?.message === "string"
          ? errData.message
          : `Error ${putRes.status}`,
      );
    }
    if (photos.length > 0) {
      const formData = new FormData();
      for (const photo of photos) {
        formData.append("images", {
          uri: photo.uri,
          name: photo.fileName,
          type: photo.type,
        } as any);
      }
      const imgRes = await fetch(
        `${BASE_URL}/visit-1/${remote_visit_1_id}/images`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: formData,
        },
      );
      if (!imgRes.ok) {
        throw new Error("Error al subir imágenes visita 1");
      }
    }
    return;
  }

  const formData = new FormData();
  formData.append("project_id", String(payload.project_id));
  formData.append("producer_id", String(payload.producer_id));
  formData.append("objetive", payload.objetive);
  formData.append("diagnosis", payload.diagnosis);
  formData.append("recommendations", payload.recommendations);
  formData.append("observations", payload.observations ?? "");
  formData.append(
    "compliance_recommendation_id",
    String(payload.compliance_recommendation_id),
  );
  formData.append("registration_date", payload.registration_date);
  formData.append("attendance_id", String(payload.attendance_id));
  formData.append("attendance_name", payload.attendance_name ?? "");
  formData.append("origin", payload.origin ?? "app");
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
}

interface LocalPhoto {
  uri: string;
  fileName: string;
  type: string;
}

async function uploadVisit2Item(item: Visit2QueueItem): Promise<void> {
  const token = await getStoredToken();
  const payload = JSON.parse(item.payload) as Visit2Payload;
  let extras: Visit2QueueExtras;
  try {
    extras = JSON.parse(item.photos ?? "{}");
  } catch {
    extras = { monitoringCommitments: [], photos: [] };
  }
  const monitoringCommitments = extras.monitoringCommitments ?? [];
  const photos: LocalPhoto[] = extras.photos ?? [];
  const remoteId = extras.remote_visit_2_id ?? null;

  const mapCommitmentApi = (
    c: Visit2MonitoringCommitment,
  ): {
    activity: string;
    percentage_compliance: number;
    appropriation_in_field: string;
  } => ({
    activity: (c.activity ?? "").trim(),
    percentage_compliance: c.percentage_compliance ?? 0,
    appropriation_in_field: (c.appropriation_in_field ?? "").trim(),
  });

  const recommendationStr = String(payload.recommendations_commitments ?? "");

  if (remoteId != null && Number.isFinite(remoteId)) {
    const putBody = {
      project_id: payload.project_id,
      producer_id: payload.producer_id,
      registration_date: payload.registration_date,
      origin: payload.origin ?? "app",
      attendance_id: payload.attendance_id,
      attendance_name: payload.attendance_name ?? "",
      attendance_identification: payload.attendance_identification ?? "",
      general_objective: payload.general_objective,
      specific_objectives: payload.specific_objectives,
      diagnostic: payload.diagnostic,
      recommendations_commitments: recommendationStr,
      observations: payload.observations ?? "",
    };

    const putRes = await fetch(`${BASE_URL}/visit-2/${remoteId}`, {
      method: "PUT",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(putBody),
    });
    if (!putRes.ok) {
      const errData = await putRes.json().catch(() => ({}));
      throw new Error(
        typeof errData?.message === "string"
          ? errData.message
          : `Error ${putRes.status}`,
      );
    }

    const existingCommitments = monitoringCommitments.filter((c) => c.id != null);
    const newCommitments = monitoringCommitments.filter(
      (c) => c.id == null && (c.activity ?? "").trim(),
    );

    for (const c of existingCommitments) {
      if (c.id == null) continue;
      const mc = await fetch(
        `${BASE_URL}/visit-2/monitoring-commitments/${c.id}`,
        {
          method: "PUT",
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(mapCommitmentApi(c)),
        },
      );
      if (!mc.ok) {
        const errData = await mc.json().catch(() => ({}));
        throw new Error(
          typeof errData?.message === "string"
            ? errData.message
            : `Seguimiento ${mc.status}`,
        );
      }
    }

    for (const c of newCommitments) {
      const mc = await fetch(`${BASE_URL}/visit-2/monitoring-commitments`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          visit_2_id: remoteId,
          ...mapCommitmentApi(c),
        }),
      });
      if (!mc.ok) {
        const errData = await mc.json().catch(() => ({}));
        throw new Error(
          typeof errData?.message === "string"
            ? errData.message
            : `Seguimiento ${mc.status}`,
        );
      }
    }

    if (photos.length > 0) {
      const formData = new FormData();
      for (const photo of photos) {
        formData.append("images", {
          uri: photo.uri,
          name: photo.fileName,
          type: photo.type,
        } as any);
      }
      const imgRes = await fetch(
        `${BASE_URL}/visit-2/${remoteId}/images`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: formData,
        },
      );
      if (!imgRes.ok) {
        throw new Error("Error al subir imágenes visita 2");
      }
    }

    return;
  }

  if (photos.length > 0 || monitoringCommitments.length > 0) {
    const formData = new FormData();
    formData.append("project_id", String(payload.project_id));
    formData.append("producer_id", String(payload.producer_id));
    formData.append("registration_date", payload.registration_date);
    formData.append("origin", payload.origin ?? "app");
    formData.append("attendance_id", String(payload.attendance_id));
    formData.append("attendance_name", payload.attendance_name ?? "");
    formData.append(
      "attendance_identification",
      payload.attendance_identification ?? "",
    );
    formData.append("general_objective", payload.general_objective);
    formData.append("specific_objectives", payload.specific_objectives);
    formData.append("diagnostic", payload.diagnostic);
    formData.append(
      "recommendations_commitments",
      recommendationStr,
    );
    formData.append("observations", payload.observations ?? "");
    formData.append(
      "monitoring_commitments",
      JSON.stringify(monitoringCommitments.map(mapCommitmentApi)),
    );
    for (const photo of photos) {
      formData.append(
        "images",
        {
          uri: photo.uri,
          name: photo.fileName,
          type: photo.type,
        } as any,
      );
    }
    const response = await fetch(`${BASE_URL}/visit-2`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(
        typeof errData?.message === "string"
          ? errData.message
          : `Error ${response.status}`,
      );
    }
    return;
  }

  await apiFetch("/visit-2", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function uploadPendingAnswers(
  onProgress?: (progress: SyncProgress) => void,
): Promise<{ uploaded: number; failed: number }> {
  const { user } = useAuthStore.getState();
  if (!user) throw new Error("No authenticated user");

  let uploaded = 0;
  let failed = 0;

  // 1. Upload answer updates (PUT operations for edited answers)
  const answerUpdates = await getPendingAnswerUpdates(user.user_id);
  for (let i = 0; i < answerUpdates.length; i++) {
    const update = answerUpdates[i]!;
    onProgress?.({
      stage: "Subiendo ediciones",
      current: i,
      total: answerUpdates.length,
    });
    try {
      // Detect dependent_list updates encoded as JSON with __type: "dependent"
      let endpoint = `/surveys/update-answer/${update.answer_id}`;
      let body: any = { value: update.new_value };
      try {
        const parsed = JSON.parse(update.new_value ?? "");
        if (parsed && typeof parsed === "object" && parsed.__type === "dependent") {
          endpoint = `/questions-dependent-list/${update.answer_id}`;
          const rawChild = (parsed as { child?: unknown }).child;
          body = {
            value: String((parsed as { value?: unknown }).value ?? ""),
            child:
              rawChild != null &&
              typeof rawChild === "object" &&
              !Array.isArray(rawChild)
                ? {
                    question_id: Number(
                      (rawChild as { question_id?: unknown }).question_id,
                    ),
                    answer_value: String(
                      (rawChild as { answer_value?: unknown }).answer_value ??
                        "",
                    ),
                  }
                : null,
          };
        }
      } catch {}

      await apiFetch(endpoint, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      await deleteAnswerUpdate(update.answer_id);
      uploaded++;
    } catch (error) {
      failed++;
    }
  }

  // 2. Upload survey answers (POST new answers)
  const pending = await getPending(user.user_id);
  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    onProgress?.({
      stage: "Subiendo respuestas",
      current: i,
      total: pending.length,
    });

    const retryDelay = getRetryDelay(item.attempts);
    await new Promise((r) => setTimeout(r, retryDelay));

    try {
      const payload = JSON.parse(item.payload);

      await apiFetch(`/surveys`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      await deleteSyncQueueRow(item.id);

      if (item.entity_type === "survey_answers") {
        const parts = item.entity_key.split("-").map((n) => Number(n));
        if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
          const [pid, projId, compId, uId] = parts;
          try {
            await deleteAnswers(pid, projId, compId, uId);
          } catch (e) {
            console.error("Failed to clean local answers after upload:", e);
          }
        }
        // Mark intervention method as applied after successful upload
        try {
          const parsedPayload = JSON.parse(item.payload);
          await markInterventionMethodApplied(
            parsedPayload.producer_id,
            parsedPayload.project_id,
            parsedPayload.intervention_method_id,
            user.user_id,
          );
        } catch (e) {
          console.error("Failed to mark intervention method applied:", e);
        }
      }

      uploaded++;
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      await markFailed(item.id, errorMsg);
      failed++;
    }
  }

  // 3. Upload visit1 entries (including photos)
  const visit1Pending = await getPendingVisit1Items(user.user_id);
  for (let i = 0; i < visit1Pending.length; i++) {
    const item = visit1Pending[i]!;
    onProgress?.({
      stage: "Subiendo visitas",
      current: i,
      total: visit1Pending.length,
    });

    const retryDelay = getRetryDelay(item.attempts ?? 0);
    await new Promise((r) => setTimeout(r, retryDelay));

    try {
      await uploadVisit1Item(item);
      await deleteVisit1QueueRow(item.id!);
      // Mark VISIT method as applied after successful upload
      try {
        const visitPayload = JSON.parse(item.payload);
        await markInterventionMethodApplied(
          visitPayload.producer_id,
          visitPayload.project_id,
          5, // VISIT_INTERVENTION_METHOD_ID
          user.user_id,
        );
      } catch (e) {
        console.error("Failed to mark visit method applied:", e);
      }
      uploaded++;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await markVisit1Failed(item.id!, errorMsg);
      failed++;
    }
  }

  // 4. Upload visit2 entries (incluye fotos, seguimiento 5.2 y PUT si viene de servidor)
  const visit2Pending = await getPendingVisit2Items(user.user_id);
  for (let i = 0; i < visit2Pending.length; i++) {
    const item = visit2Pending[i]!;
    onProgress?.({
      stage: "Subiendo visitas 2",
      current: i,
      total: visit2Pending.length,
    });

    const retryDelay = getRetryDelay(item.attempts ?? 0);
    await new Promise((r) => setTimeout(r, retryDelay));

    if (item.id == null) continue;

    try {
      await uploadVisit2Item(item);
      await deleteVisit2QueueRow(item.id);
      try {
        const visitPayload = JSON.parse(item.payload) as Visit2Payload;
        await markInterventionMethodApplied(
          visitPayload.producer_id,
          visitPayload.project_id,
          VISIT2_INTERVENTION_METHOD_ID,
          user.user_id,
        );
      } catch (e) {
        console.error("Failed to mark visit2 intervention method applied:", e);
      }
      uploaded++;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await markVisit2Failed(item.id, errorMsg);
      failed++;
    }
  }

  await setMetadata("last_upload", new Date().toISOString());
  onProgress?.({
    stage: "Subida completa",
    current: uploaded + failed,
    total: uploaded + failed,
  });

  if (failed === 0 && uploaded > 0) {
    try {
      await downloadAllData(undefined);
    } catch (e) {
      console.error("Falló la actualización local tras la subida:", e);
    }
  }

  return { uploaded, failed };
}
