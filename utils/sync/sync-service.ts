import type { Project } from "@/schemas/project";
import { useAuthStore } from "@/store/useAuthStore";
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
    getMetadata,
    getPending,
    markCompleted,
    markFailed,
    setMetadata,
} from "@/utils/database/repositories/sync-repository";
import { deleteAnswers } from "@/utils/database/repositories/answer-repository";
import { upsertSurveyResults, type SurveyResultRow } from "@/utils/database/repositories/survey-results-repository";
import { getStoredToken } from "@/utils/secure-storage";
import {
    getPendingVisit1Items,
    markVisit1Completed,
    markVisit1Failed,
    type Visit1QueueItem,
} from "@/utils/database/repositories/visit1-repository";
import {
    getPendingAnswerUpdates,
    deleteAnswerUpdate,
} from "@/utils/database/repositories/answer-update-repository";
import {
    hasInterventionMethodApplied,
    markInterventionMethodApplied,
} from "@/utils/database/repositories/producer-intervention-repository";


export interface SyncProgress {
  stage: string;
  current: number;
  total: number;
}

export async function downloadAllData(
  onProgress?: (progress: SyncProgress) => void,
): Promise<void> {
  const { user } = useAuthStore.getState();
  if (!user) throw new Error("No authenticated user");

  const report = (stage: string, current: number, total: number) =>
    onProgress?.({ stage, current, total });

  // 1. Projects
  report("Descargando proyectos", 0, 1);
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
  report("Descargando proyectos", 1, 1);

  // 2. Producers for each project
  let producerCount = 0;
  const allProducerIds: Array<{ producerId: number; projectId: number }> = [];
  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];
    report(
      `Usuarios (proyecto ${i + 1}/${projects.length})`,
      i,
      projects.length,
    );

    // Fetch all pages
    let page = 1;
    let hasMore = true;
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
        hasMore = page < (pag.totalPages ?? pag.total_pages ?? 1);
      } else if (Array.isArray(response?.data)) {
        producers = response.data;
        hasMore = false;
      } else if (Array.isArray(response)) {
        producers = response;
        hasMore = false;
      } else {
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
      page++;
    }
    // Remove producers no longer assigned to this project
    await deleteProducersNotIn(project.id, fetchedProducerIds);
  }
  report("Usuarios descargados", producerCount, producerCount);

  // 4. Download survey results for all producers across all intervention methods
  //    This populates local cache AND marks which methods were actually applied.
  const INTERVENTION_METHOD_IDS = [1, 2, 3, 5, 7, 8];

  let resultCount = 0;
  for (let i = 0; i < allProducerIds.length; i++) {
    const { producerId, projectId } = allProducerIds[i]!;
    if (i % 20 === 0 || i === allProducerIds.length - 1) {
      report(
        `Resultados de encuestas (${i + 1}/${allProducerIds.length})`,
        i + 1,
        allProducerIds.length,
      );
    }
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
        // Only mark as applied AND persist if there are actual answers
        if (rawData.length > 0) {
          await markInterventionMethodApplied(
            producerId,
            projectId,
            methodId,
            user.user_id,
          );

          // Flatten and persist survey results to SQLite for offline access
          const flatResults: SurveyResultRow[] = [];
          for (const item of rawData) {
            const nestedAnswers = item.answers;
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

          resultCount++;
        }
      } catch {
        // Skip silently — endpoint may not exist or producer has no results
      }
    }
  }
  report(`Resultados de encuestas`, allProducerIds.length, allProducerIds.length);

  // Note: Producer details endpoint (/producers/:id) is not available for extensionists.
  // Components, questions, question types, and innova fields are pre-seeded in the DB.

  // Mark last download time
  await setMetadata("last_full_download", new Date().toISOString());
  report("Descarga completa", 1, 1);
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
  const payload = JSON.parse(item.payload);
  const photos: LocalPhoto[] = JSON.parse(item.photos ?? "[]");
  const formData = new FormData();
  formData.append("project_id", String(payload.project_id));
  formData.append("producer_id", String(payload.producer_id));
  formData.append("objetive", payload.objetive);
  formData.append("diagnosis", payload.diagnosis);
  formData.append("recommendations", payload.recommendations);
  formData.append("observations", payload.observations ?? "");
  formData.append("compliance_recommendation_id", String(payload.compliance_recommendation_id));
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
      await apiFetch(`/surveys/update-answer/${update.answer_id}`, {
        method: "PUT",
        body: JSON.stringify({ value: update.new_value }),
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

      await markCompleted(item.id);

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
      await markVisit1Completed(item.id!);
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

  await setMetadata("last_upload", new Date().toISOString());
  onProgress?.({
    stage: "Subida completa",
    current: uploaded + failed,
    total: uploaded + failed,
  });

  return { uploaded, failed };
}
