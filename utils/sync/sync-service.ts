import type { Question } from "@/schemas/characterization";
import type { Project } from "@/schemas/project";
import { useAuthStore } from "@/store/useAuthStore";
import {
  CHARACTERIZATION_COMPONENT_ID,
  CLASSIFICATION_COMPONENT_ID,
  PERSONAL_INFO_COMPONENT_ID,
  PRODUCTIVE_LINES_COMPONENT_ID,
  PRODUCTIVE_LINES_INTERVENTION_METHOD_ID,
  PROPERTY_INFO_COMPONENT_ID,
  VISIT2_INTERVENTION_METHOD_ID,
  VISIT3_CLASSIFICATION_INTERVENTION_METHOD_ID,
  VISIT3_REGISTRATION_INTERVENTION_METHOD_ID,
  VISIT_INTERVENTION_METHOD_ID,
} from "@/store/useCharacterizationStore";
import { apiFetch, NetworkError } from "@/utils/api";
import { API_BASE_URL } from "@/utils/api-config";
import {
  upsertQuestionDetail,
  upsertQuestions,
} from "@/utils/database/repositories/characterization-repository";
import {
    deleteProducersNotIn,
    getProducerRawJsonRow,
    upsertProducers,
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
import { upsertSurveyResults } from "@/utils/database/repositories/survey-results-repository";
import {
  extractInterventionMethodSurveyArray,
  flattenInterventionMethodSurveyPayloadToRows,
} from "@/utils/survey/flatten-intervention-method-survey-results";
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
    deleteVisit3QueueRow,
    getPendingVisit3Items,
    markVisit3Failed,
    type Visit3QueueExtras,
    type Visit3QueueItem,
} from "@/utils/database/repositories/visit3-repository";
import type {
    Visit3CreatePayload,
    Visit3UpdatePayload,
} from "@/schemas/visit3";
import {
  clearOfflineVisitPhotoDir,
  deletePersistedOfflineVisitPhotoUris,
} from "@/utils/visit-offline-photos";
import {
    getPendingAnswerUpdates,
    deleteAnswerUpdate,
} from "@/utils/database/repositories/answer-update-repository";
import { markInterventionMethodApplied } from "@/utils/database/repositories/producer-intervention-repository";
import {
  upsertVisitServerCache,
  upsertProductiveLinesBundleCache,
  getProductiveLinesBundleCacheRaw,
  deleteExtensionistCachesNotInProject,
} from "@/utils/database/repositories/server-extensionist-cache-repository";
import {
    readProductionLineId,
    refreshVisitObjectivesCacheForLine,
} from "@/utils/agro-objectives";
import {
  assertDownloadGeneration,
  clearDownloadResultsCheckpoint,
  loadDownloadResultsCheckpoint,
  saveDownloadResultsCheckpoint,
  yieldToEventLoop,
  type ProducerQueueItem,
} from "@/utils/sync/sync-download-session";

export interface SyncProgress {
  stage: string;
  current: number;
  total: number;
}

/** Cola offline: POST masivos de líneas productivas (`productive-lines-tab`). */
export type ProductiveLinesBulkKind =
  | "agricultural"
  | "livestock"
  | "forest"
  | "fishing"
  | "aquaculture";

export interface ProductiveLinesBulkQueuePayload {
  kind: ProductiveLinesBulkKind;
  body: { lines: unknown[] };
  /** Paralelo a `body.lines`: ids locales (negativos) para reescribir creates pendientes. */
  local_ids?: number[];
}

/** Cola offline: PUT de una línea productiva existente. */
export interface ProductiveLineUpdateQueuePayload {
  kind: ProductiveLinesBulkKind;
  id: number;
  body: Record<string, unknown>;
}

const PRODUCTIVE_LINES_BULK_PATH: Record<ProductiveLinesBulkKind, string> = {
  agricultural: "/agricultural-lines/bulk",
  livestock: "/livestock-lines/bulk",
  forest: "/forest-lines/bulk",
  fishing: "/fishing-lines/bulk",
  aquaculture: "/aquaculture-lines/bulk",
};

const PRODUCTIVE_LINES_ITEM_PATH: Record<ProductiveLinesBulkKind, string> = {
  agricultural: "/agricultural-lines",
  livestock: "/livestock-lines",
  forest: "/forest-lines",
  fishing: "/fishing-lines",
  aquaculture: "/aquaculture-lines",
};

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

/**
 * Un componente por cada flujo de encuesta / método de intervención con preguntas.
 * El orden del array en `GET /questions/with-options/{id}/` se persiste en `sort_order`.
 */
const SURVEY_CATALOG_COMPONENT_IDS = [
  PERSONAL_INFO_COMPONENT_ID,
  PROPERTY_INFO_COMPONENT_ID,
  PRODUCTIVE_LINES_COMPONENT_ID,
  CLASSIFICATION_COMPONENT_ID,
  CHARACTERIZATION_COMPONENT_ID,
] as const;

/**
 * Persiste opciones/ítems de listas desde el payload with-options para lectura offline.
 */
async function persistQuestionDetailsFromCatalog(
  questions: Question[],
): Promise<void> {
  for (const q of questions) {
    const rec = q as Record<string, unknown>;
    const options = rec.options;
    const items = rec.items;
    if (Array.isArray(options) && options.length > 0) {
      await upsertQuestionDetail(q.id, "lista", { options });
      continue;
    }
    if (Array.isArray(items) && items.length > 0) {
      await upsertQuestionDetail(q.id, "lista dependiente", { items });
    }
  }
}

/**
 * Refresca preguntas desde el API en el orden devuelto por cada componente
 * (`GET /questions/with-options/{componentId}/`).
 */
async function downloadSurveyQuestionsCatalog(): Promise<void> {
  for (const componentId of SURVEY_CATALOG_COMPONENT_IDS) {
    try {
      const res = await apiFetch<{ data?: unknown; status?: number }>(
        `/questions/with-options/${componentId}/`,
      );
      const raw = res?.data;
      const list = Array.isArray(raw) ? raw : [];
      if (list.length === 0) continue;
      await upsertQuestions(list as Question[]);
      await persistQuestionDetailsFromCatalog(list as Question[]);
    } catch (e) {
      console.error(
        `Failed to download questions catalog for component ${componentId}:`,
        e,
      );
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimited(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes("429") || error.message.includes("rate");
  }
  return false;
}

function getRetryDelay(attempts: number): number {
  return Math.min(1000 * Math.pow(2, attempts), 5 * 60 * 1000);
}

/** Reintenta fallos transitorios (red / 429) durante la precarga offline. */
async function apiFetchWithRetry<T>(
  endpoint: string,
  options?: Parameters<typeof apiFetch>[1],
  attempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await apiFetch<T>(endpoint, options);
    } catch (e) {
      lastError = e;
      const retryable = e instanceof NetworkError || isRateLimited(e);
      if (!retryable || i === attempts - 1) throw e;
      await sleep(getRetryDelay(i));
    }
  }
  throw lastError;
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
 * Persista visitas 1/2/3 y listas REST de líneas productivas tras la descarga por productor/proyecto.
 * No sobrescribe el bundle local con arrays vacíos si todos los endpoints fallan.
 */
async function downloadExtensionistCachesForProducer(
  userId: number,
  projectId: number,
  producerId: number,
): Promise<void> {
  const settleVisit1 = apiFetchWithRetry<{ data?: unknown }>(
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
    .catch((e) => {
      console.warn(
        `Visit1 cache download failed p=${producerId} proj=${projectId}:`,
        e,
      );
    });

  const settleVisit2 = apiFetchWithRetry<{ data?: unknown }>(
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
    .catch((e) => {
      console.warn(
        `Visit2 cache download failed p=${producerId} proj=${projectId}:`,
        e,
      );
    });

  const settleVisit3 = apiFetchWithRetry<{ data?: unknown }>(
    `/visit-3/project/${projectId}/producer/${producerId}`,
  )
    .then(async (res) => {
      const data = res?.data;
      if (isRecordWithId(data)) {
        await upsertVisitServerCache({
          userId,
          producerId,
          projectId,
          kind: "visit3",
          jsonPayload: JSON.stringify(data),
        });
        await markInterventionMethodApplied(
          producerId,
          projectId,
          VISIT3_REGISTRATION_INTERVENTION_METHOD_ID,
          userId,
        );
      }
    })
    .catch((e) => {
      console.warn(
        `Visit3 cache download failed p=${producerId} proj=${projectId}:`,
        e,
      );
    });

  const fetchLines = async (
    path: string,
  ): Promise<{ ok: true; data: unknown[] } | { ok: false }> => {
    try {
      const res = await apiFetchWithRetry<{ data?: unknown[] }>(path);
      return {
        ok: true,
        data: Array.isArray(res?.data) ? res.data : [],
      };
    } catch (e) {
      console.warn(
        `Productive lines cache download failed ${path}:`,
        e,
      );
      return { ok: false };
    }
  };

  const settleBundle = Promise.all([
    fetchLines(`/agricultural-lines/producer/${producerId}/project/${projectId}`),
    fetchLines(`/livestock-lines/producer/${producerId}/project/${projectId}`),
    fetchLines(`/forest-lines/producer/${producerId}/project/${projectId}`),
    fetchLines(`/fishing-lines/producer/${producerId}/project/${projectId}`),
    fetchLines(`/aquaculture-lines/producer/${producerId}/project/${projectId}`),
  ]).then(async ([agriRes, livestockRes, forestRes, fishingRes, aquacultureRes]) => {
    const anyOk =
      agriRes.ok ||
      livestockRes.ok ||
      forestRes.ok ||
      fishingRes.ok ||
      aquacultureRes.ok;

    // Si todos fallan, conservar el bundle previo en SQLite (no escribir vacío).
    if (!anyOk) return;

    type BundleShape = {
      agricultural?: unknown[];
      livestock?: unknown[];
      forest?: unknown[];
      fishing?: unknown[];
      aquaculture?: unknown[];
    };
    let previous: BundleShape = {};
    try {
      const raw = await getProductiveLinesBundleCacheRaw(
        producerId,
        projectId,
        userId,
      );
      if (raw) previous = JSON.parse(raw) as BundleShape;
    } catch {
      previous = {};
    }

    const agricultural = agriRes.ok
      ? agriRes.data
      : (previous.agricultural ?? []);
    const livestock = livestockRes.ok
      ? livestockRes.data
      : (previous.livestock ?? []);
    const forest = forestRes.ok ? forestRes.data : (previous.forest ?? []);
    const fishing = fishingRes.ok ? fishingRes.data : (previous.fishing ?? []);
    const aquaculture = aquacultureRes.ok
      ? aquacultureRes.data
      : (previous.aquaculture ?? []);

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
  });

  await Promise.all([settleVisit1, settleVisit2, settleVisit3, settleBundle]);
}

export interface LocalUploadTouchAccumulator {
  surveys: { producerId: number; projectId: number; methodId: number }[];
  extensionistCaches: { producerId: number; projectId: number }[];
}

function createEmptyTouchAccumulator(): LocalUploadTouchAccumulator {
  return { surveys: [], extensionistCaches: [] };
}

function surveyTouchKey(t: {
  producerId: number;
  projectId: number;
  methodId: number;
}): string {
  return `${t.producerId}-${t.projectId}-${t.methodId}`;
}

function extensionistKey(t: {
  producerId: number;
  projectId: number;
}): string {
  return `${t.producerId}-${t.projectId}`;
}

function addSurveyTouch(
  acc: LocalUploadTouchAccumulator,
  producerId: number,
  projectId: number,
  methodId: number,
): void {
  if (
    !Number.isFinite(producerId) ||
    !Number.isFinite(projectId) ||
    !Number.isFinite(methodId)
  ) {
    return;
  }
  acc.surveys.push({ producerId, projectId, methodId });
}

function addExtensionistTouch(
  acc: LocalUploadTouchAccumulator,
  producerId: number,
  projectId: number,
): void {
  if (!Number.isFinite(producerId) || !Number.isFinite(projectId)) return;
  acc.extensionistCaches.push({ producerId, projectId });
}

/**
 * Tras subir cambios offline, alinea SQLite con el servidor solo en los productores/métodos afectados
 * (sin repetir proyectos, listado completo de productores ni encuestas de quien no cambió).
 */
export async function refreshTouchedDataAfterLocalUpload(
  userId: number,
  acc: LocalUploadTouchAccumulator,
  onProgress?: (progress: SyncProgress) => void,
): Promise<void> {
  const seenSurvey = new Set<string>();
  const uniqueSurveys = acc.surveys.filter((t) => {
    const k = surveyTouchKey(t);
    if (seenSurvey.has(k)) return false;
    seenSurvey.add(k);
    return true;
  });
  const seenExt = new Set<string>();
  const uniqueExt = acc.extensionistCaches.filter((t) => {
    const k = extensionistKey(t);
    if (seenExt.has(k)) return false;
    seenExt.add(k);
    return true;
  });

  const totalSteps = uniqueSurveys.length + uniqueExt.length;
  let step = 0;

  const report = (stage: string) => {
    const pct =
      totalSteps > 0
        ? Math.round((step / totalSteps) * 100)
        : 100;
    onProgress?.({ stage, current: pct, total: 100 });
  };

  for (const t of uniqueSurveys) {
    report(`Actualizando respuestas (productor ${t.producerId})…`);
    try {
      const response = await apiFetchWithRetry<unknown>(
        `/surveys/${t.projectId}/producer/${t.producerId}/intervention_method/${t.methodId}`,
        { method: "GET" },
      );
      const rawData = extractInterventionMethodSurveyArray(response);
      if (rawData.length > 0) {
        const flatResults = flattenInterventionMethodSurveyPayloadToRows(
          rawData,
          t.methodId,
          t.producerId,
          t.projectId,
        );
        if (flatResults.length > 0) {
          await upsertSurveyResults(flatResults);
          await markInterventionMethodApplied(
            t.producerId,
            t.projectId,
            t.methodId,
            userId,
          );
        } else {
          console.warn(
            `Survey refresh flatten empty p=${t.producerId} m=${t.methodId} raw=${rawData.length}`,
          );
        }
      }
    } catch (e) {
      console.warn(
        `Survey refresh failed p=${t.producerId} m=${t.methodId}:`,
        e,
      );
    }
    step++;
  }

  const objectiveLineIds = new Set<number>();

  for (const p of uniqueExt) {
    report(`Actualizando visitas y líneas (productor ${p.producerId})…`);
    await downloadExtensionistCachesForProducer(userId, p.projectId, p.producerId);
    try {
      const rawProducer = await getProducerRawJsonRow(p.producerId, p.projectId);
      const lineId = readProductionLineId(rawProducer);
      if (lineId != null) objectiveLineIds.add(lineId);
    } catch {
      // ignore
    }
    step++;
  }

  for (const lineId of objectiveLineIds) {
    try {
      await refreshVisitObjectivesCacheForLine(lineId);
    } catch {
      // ignore
    }
  }

  onProgress?.({
    stage: "Actualización selectiva completada",
    current: 100,
    total: 100,
  });
}

export interface DownloadAllDataOptions {
  /** Invalidates in-flight loops when a stalled session is recovered. */
  generation?: number;
  /** Skips catalog/projects/producers and continues the results queue from SQLite. */
  resumeResultsOnly?: boolean;
}

async function downloadProducerResults(
  userId: number,
  allProducerIds: ProducerQueueItem[],
  startIndex: number,
  generation: number | undefined,
  reportPhase: (
    stage: string,
    phase: { start: number; weight: number },
    current: number,
    total: number,
  ) => void,
): Promise<void> {
  // Incluye 9 = clasificación de Visita 3. El registro Visita 3 (método 11)
  // no genera respuestas de encuesta, así que no se lista aquí.
  const INTERVENTION_METHOD_IDS = [1, 2, 3, 5, 6, 7, 8, 9];
  const totalProducers = allProducerIds.length;
  const objectiveLineIds = new Set<number>();
  let hardSurveyFailures = 0;

  await saveDownloadResultsCheckpoint(startIndex, allProducerIds);

  for (let i = startIndex; i < totalProducers; i++) {
    assertDownloadGeneration(generation);

    const { producerId, projectId } = allProducerIds[i]!;
    let producerHadHardFailure = false;

    for (const methodId of INTERVENTION_METHOD_IDS) {
      assertDownloadGeneration(generation);
      try {
        const response = await apiFetchWithRetry<unknown>(
          `/surveys/${projectId}/producer/${producerId}/intervention_method/${methodId}`,
          { method: "GET" },
        );
        const rawData = extractInterventionMethodSurveyArray(response);

        if (rawData.length > 0) {
          const flatResults = flattenInterventionMethodSurveyPayloadToRows(
            rawData,
            methodId,
            producerId,
            projectId,
          );
          if (flatResults.length > 0) {
            await upsertSurveyResults(flatResults);
            await markInterventionMethodApplied(
              producerId,
              projectId,
              methodId,
              userId,
            );
          } else {
            console.warn(
              `Survey download flatten empty p=${producerId} m=${methodId} raw=${rawData.length}`,
            );
          }
        }
      } catch (e) {
        // 404 = método sin aplicar; otros errores no deben finalizar la sync como "completa".
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("404") || msg.includes("Error 404")) {
          continue;
        }
        producerHadHardFailure = true;
        hardSurveyFailures += 1;
        console.warn(
          `Survey download failed p=${producerId} proj=${projectId} m=${methodId}:`,
          e,
        );
      }
    }

    await downloadExtensionistCachesForProducer(userId, projectId, producerId);

    const rawProducer = await getProducerRawJsonRow(producerId, projectId);
    const lineId = readProductionLineId(rawProducer);
    if (lineId != null) objectiveLineIds.add(lineId);

    // No avanzar checkpoint si este productor quedó incompleto: se reintentará al reanudar.
    if (!producerHadHardFailure) {
      await saveDownloadResultsCheckpoint(i + 1, allProducerIds);
    } else {
      // Mantener índice en este productor para reintento; no marcar fase como lista.
      await saveDownloadResultsCheckpoint(i, allProducerIds);
      throw new Error(
        `Descarga incompleta: falló la precarga de encuestas del productor ${producerId}. Reintente la sincronización.`,
      );
    }

    reportPhase(
      `Resultados ${i + 1} de ${totalProducers}`,
      DOWNLOAD_PHASES.results,
      i + 1,
      totalProducers,
    );

    await yieldToEventLoop();
  }

  if (objectiveLineIds.size > 0) {
    reportPhase(
      "Precargando objetivos de visitas (por línea productiva)",
      DOWNLOAD_PHASES.results,
      totalProducers,
      totalProducers,
    );
    for (const lineId of objectiveLineIds) {
      assertDownloadGeneration(generation);
      await refreshVisitObjectivesCacheForLine(lineId);
    }
  }

  if (hardSurveyFailures > 0) {
    throw new Error(
      `Descarga incompleta: ${hardSurveyFailures} encuesta(s) no se pudieron precargar.`,
    );
  }

  reportPhase("Resultados descargados", DOWNLOAD_PHASES.results, 1, 1);
}

export async function downloadAllData(
  onProgress?: (progress: SyncProgress) => void,
  options?: DownloadAllDataOptions,
): Promise<void> {
  const { user } = useAuthStore.getState();
  if (!user) throw new Error("No authenticated user");

  const generation = options?.generation;

  const reportPhase = (
    stage: string,
    phase: { start: number; weight: number },
    current: number,
    total: number,
  ) => {
    const percent = Math.round(calcPhasePercent(phase, current, total));
    onProgress?.({ stage, current: percent, total: 100 });
  };

  if (options?.resumeResultsOnly) {
    const { index, queue } = await loadDownloadResultsCheckpoint();
    if (queue.length === 0) {
      throw new Error("No hay progreso de descarga para reanudar");
    }

    reportPhase("Reanudando descarga", DOWNLOAD_PHASES.results, index, queue.length);
    await downloadProducerResults(
      user.user_id,
      queue,
      index,
      generation,
      reportPhase,
    );

    assertDownloadGeneration(generation);

    reportPhase("Finalizando descarga", DOWNLOAD_PHASES.finalize, 0, 1);
    await setMetadata("last_full_download", new Date().toISOString());
    await clearDownloadResultsCheckpoint();
    reportPhase("Descarga completa", DOWNLOAD_PHASES.finalize, 1, 1);
    return;
  }

  await clearDownloadResultsCheckpoint();
  await downloadSurveyQuestionsCatalog();
  assertDownloadGeneration(generation);

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
      assertDownloadGeneration(generation);
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

  assertDownloadGeneration(generation);

  const totalProducers = allProducerIds.length;
  // Checkpoint antes de resultados: si el OS congela aquí, recover puede reanudar.
  await saveDownloadResultsCheckpoint(0, allProducerIds);
  reportPhase("Descargando resultados", DOWNLOAD_PHASES.results, 0, totalProducers || 1);

  await downloadProducerResults(
    user.user_id,
    allProducerIds,
    0,
    generation,
    reportPhase,
  );

  assertDownloadGeneration(generation);

  reportPhase("Finalizando descarga", DOWNLOAD_PHASES.finalize, 0, 1);
  await setMetadata("last_full_download", new Date().toISOString());
  await clearDownloadResultsCheckpoint();
  reportPhase("Descarga completa", DOWNLOAD_PHASES.finalize, 1, 1);
}

const BASE_URL = API_BASE_URL;

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
  formData.append("lat", (payload.lat ?? "").trim());
  formData.append("lng", (payload.lng ?? "").trim());
  formData.append(
    "masl",
    payload.masl != null && Number.isFinite(payload.masl)
      ? String(payload.masl)
      : "",
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

// ─── Visit 3 upload ─────────────────────────────────────────────────────

async function uploadVisit3Item(item: Visit3QueueItem): Promise<void> {
  const token = await getStoredToken();
  const payload = JSON.parse(item.payload) as
    | Visit3CreatePayload
    | Visit3UpdatePayload;
  let extras: Visit3QueueExtras;
  try {
    extras = JSON.parse(item.photos ?? "{}");
  } catch {
    extras = {
      photos: [],
      keepRemoteImages: [],
      pendingImageDeletions: [],
      pendingCommitmentDeletions: [],
      trackings: [],
    };
  }

  const photos = extras.photos ?? [];
  const remoteId = extras.remote_visit_3_id ?? null;
  const trackings = extras.trackings ?? [];
  const pendingImageDeletions = extras.pendingImageDeletions ?? [];
  const pendingCommitmentDeletions = extras.pendingCommitmentDeletions ?? [];

  const authHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const mapCommitmentApi = (t: {
    activity: string;
    percentage_compliance: number;
    appropriation_in_field: string;
  }) => ({
    activity: (t.activity ?? "").trim(),
    percentage_compliance: t.percentage_compliance ?? 0,
    appropriation_in_field: (t.appropriation_in_field ?? "").trim(),
  });

  // ── PUT (existing remote visit) ────────────────────────────────────────
  if (remoteId != null && Number.isFinite(remoteId)) {
    const updateBody =
      (extras.update_payload as Visit3UpdatePayload | undefined) ?? {
        project_id: (payload as Visit3UpdatePayload).project_id,
        producer_id: (payload as Visit3UpdatePayload).producer_id,
        registration_date: (payload as Visit3UpdatePayload).registration_date,
        origin: (payload as Visit3UpdatePayload).origin ?? "app",
        attendance_id: (payload as Visit3UpdatePayload).attendance_id,
        attendance_identification:
          (payload as Visit3UpdatePayload).attendance_identification ?? null,
        attendance_name:
          (payload as Visit3UpdatePayload).attendance_name ?? null,
        general_objective: (payload as Visit3UpdatePayload).general_objective,
        specific_objectives:
          (payload as Visit3UpdatePayload).specific_objectives,
        technical_recommendations:
          (payload as Visit3UpdatePayload).technical_recommendations,
        observations: (payload as Visit3UpdatePayload).observations,
        aspect_1_justification:
          (payload as Visit3UpdatePayload).aspect_1_justification,
        aspect_2_justification:
          (payload as Visit3UpdatePayload).aspect_2_justification,
        aspect_3_justification:
          (payload as Visit3UpdatePayload).aspect_3_justification,
        aspect_4_justification:
          (payload as Visit3UpdatePayload).aspect_4_justification,
        aspect_5_justification:
          (payload as Visit3UpdatePayload).aspect_5_justification,
      };

    const putRes = await fetch(`${BASE_URL}/visit-3/${remoteId}`, {
      method: "PUT",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(updateBody),
    });
    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      throw new Error(
        typeof err?.message === "string"
          ? err.message
          : `Error ${putRes.status}`,
      );
    }

    // Delete pending images
    for (const imgId of pendingImageDeletions) {
      try {
        await fetch(`${BASE_URL}/visit-3/images/${imgId}`, {
          method: "DELETE",
          headers: authHeaders,
        });
      } catch {
        // ignore
      }
    }
    // Delete pending commitments
    for (const cid of pendingCommitmentDeletions) {
      try {
        await fetch(`${BASE_URL}/visit-3/monitoring-commitments/${cid}`, {
          method: "DELETE",
          headers: authHeaders,
        });
      } catch {
        // ignore
      }
    }

    // Trackings: create new, update existing
    for (const t of trackings) {
      if (t.id != null) {
        const mc = await fetch(
          `${BASE_URL}/visit-3/monitoring-commitments/${t.id}`,
          {
            method: "PUT",
            headers: { ...authHeaders, "Content-Type": "application/json" },
            body: JSON.stringify(mapCommitmentApi(t)),
          },
        );
        if (!mc.ok) {
          const err = await mc.json().catch(() => ({}));
          throw new Error(
            typeof err?.message === "string"
              ? err.message
              : `Seguimiento ${mc.status}`,
          );
        }
      } else if ((t.activity ?? "").trim()) {
        const mc = await fetch(`${BASE_URL}/visit-3/monitoring-commitments`, {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            visit_3_id: remoteId,
            ...mapCommitmentApi(t),
          }),
        });
        if (!mc.ok) {
          const err = await mc.json().catch(() => ({}));
          throw new Error(
            typeof err?.message === "string"
              ? err.message
              : `Seguimiento ${mc.status}`,
          );
        }
      }
    }

    // Upload new photos
    if (photos.length > 0) {
      const formData = new FormData();
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
      const imgRes = await fetch(`${BASE_URL}/visit-3/${remoteId}/images`, {
        method: "POST",
        headers: authHeaders,
        body: formData,
      });
      if (!imgRes.ok) {
        throw new Error("Error al subir imágenes visita 3");
      }
    }
    return;
  }

  // ── POST (create new) ─────────────────────────────────────────────────
  const createPayload = payload as Visit3CreatePayload;
  const formData = new FormData();
  formData.append("project_id", String(createPayload.project_id));
  formData.append("producer_id", String(createPayload.producer_id));
  formData.append("registration_date", createPayload.registration_date);
  formData.append("origin", createPayload.origin ?? "app");
  formData.append("attendance_id", String(createPayload.attendance_id));
  formData.append(
    "attendance_name",
    createPayload.attendance_name ?? "",
  );
  formData.append(
    "attendance_identification",
    createPayload.attendance_identification ?? "",
  );
  formData.append("general_objective", createPayload.general_objective);
  formData.append("specific_objectives", createPayload.specific_objectives);
  formData.append(
    "technical_recommendations",
    createPayload.technical_recommendations,
  );
  formData.append("observations", createPayload.observations);
  formData.append(
    "aspect_1_justification",
    createPayload.aspect_1_justification,
  );
  formData.append(
    "aspect_2_justification",
    createPayload.aspect_2_justification,
  );
  formData.append(
    "aspect_3_justification",
    createPayload.aspect_3_justification,
  );
  formData.append(
    "aspect_4_justification",
    createPayload.aspect_4_justification,
  );
  formData.append(
    "aspect_5_justification",
    createPayload.aspect_5_justification,
  );
  formData.append(
    "monitoring_commitments",
    JSON.stringify(
      (trackings ?? []).map(mapCommitmentApi).filter((t) => t.activity),
    ),
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

  const res = await fetch(`${BASE_URL}/visit-3`, {
    method: "POST",
    headers: authHeaders,
    body: formData,
  });

  if (res.status === 409) {
    // Conflicto → resolvemos con GET+PUT.
    const existing = await apiFetch<{ data?: unknown }>(
      `/visit-3/project/${createPayload.project_id}/producer/${createPayload.producer_id}`,
    ).catch(() => null);
    const existingId = isRecordWithId(existing?.data)
      ? Number((existing?.data as { id: unknown }).id)
      : null;
    if (existingId == null || !Number.isFinite(existingId)) {
      throw new Error("Conflicto 409 sin visita existente que reconciliar.");
    }
    const updatePayload: Visit3UpdatePayload = {
      project_id: createPayload.project_id,
      producer_id: createPayload.producer_id,
      registration_date: createPayload.registration_date,
      origin: createPayload.origin,
      attendance_id: createPayload.attendance_id,
      attendance_identification: createPayload.attendance_identification,
      attendance_name: createPayload.attendance_name,
      general_objective: createPayload.general_objective,
      specific_objectives: createPayload.specific_objectives,
      technical_recommendations: createPayload.technical_recommendations,
      observations: createPayload.observations,
      aspect_1_justification: createPayload.aspect_1_justification,
      aspect_2_justification: createPayload.aspect_2_justification,
      aspect_3_justification: createPayload.aspect_3_justification,
      aspect_4_justification: createPayload.aspect_4_justification,
      aspect_5_justification: createPayload.aspect_5_justification,
    };
    const putRes = await fetch(`${BASE_URL}/visit-3/${existingId}`, {
      method: "PUT",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(updatePayload),
    });
    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      throw new Error(
        typeof err?.message === "string"
          ? err.message
          : `Error ${putRes.status}`,
      );
    }
    for (const t of trackings ?? []) {
      if ((t.activity ?? "").trim()) {
        await fetch(`${BASE_URL}/visit-3/monitoring-commitments`, {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            visit_3_id: existingId,
            ...mapCommitmentApi(t),
          }),
        }).catch(() => {});
      }
    }
    if (photos.length > 0) {
      const imgForm = new FormData();
      for (const photo of photos) {
        imgForm.append("images", {
          uri: photo.uri,
          name: photo.fileName,
          type: photo.type,
        } as any);
      }
      await fetch(`${BASE_URL}/visit-3/${existingId}/images`, {
        method: "POST",
        headers: authHeaders,
        body: imgForm,
      }).catch(() => {});
    }
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      typeof err?.message === "string" ? err.message : `Error ${res.status}`,
    );
  }
}

export async function uploadPendingAnswers(
  onProgress?: (progress: SyncProgress) => void,
): Promise<{ uploaded: number; failed: number }> {
  const { user } = useAuthStore.getState();
  if (!user) throw new Error("No authenticated user");

  let uploaded = 0;
  let failed = 0;
  const touches = createEmptyTouchAccumulator();

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
        } else if (
          parsed &&
          typeof parsed === "object" &&
          parsed.__type === "multiple"
        ) {
          endpoint = `/surveys/update-answer-multiple`;
          const rawAnswers = (parsed as { answers?: unknown }).answers;
          body = {
            question_id: Number(
              (parsed as { question_id?: unknown }).question_id ??
                update.question_id,
            ),
            survey_id: Number((parsed as { survey_id?: unknown }).survey_id),
            answers: Array.isArray(rawAnswers)
              ? rawAnswers.map((a) => ({
                  answer_value: String(
                    a != null && typeof a === "object"
                      ? (a as { answer_value?: unknown }).answer_value ?? ""
                      : a ?? "",
                  ),
                }))
              : [],
          };
        }
      } catch {}

      await apiFetch(endpoint, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      await deleteAnswerUpdate(update.answer_id);
      addSurveyTouch(
        touches,
        update.producer_id,
        update.project_id,
        update.intervention_method_id,
      );
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

      if (item.entity_type === "productive_lines_bulk") {
        const pl = payload as ProductiveLinesBulkQueuePayload;
        const path = PRODUCTIVE_LINES_BULK_PATH[pl.kind];
        await apiFetch(path, {
          method: "POST",
          body: JSON.stringify(pl.body),
        });
        const lines = (pl.body as { lines?: unknown }).lines;
        const first = Array.isArray(lines) ? (lines[0] as Record<string, unknown>) : undefined;
        const pid = Number(first?.producer_id);
        const projId = Number(first?.project_id);
        if (Number.isFinite(pid) && Number.isFinite(projId)) {
          addExtensionistTouch(touches, pid, projId);
          addSurveyTouch(
            touches,
            pid,
            projId,
            PRODUCTIVE_LINES_INTERVENTION_METHOD_ID,
          );
        }
        await deleteSyncQueueRow(item.id);
        uploaded++;
        continue;
      }

      if (item.entity_type === "productive_line_update") {
        const pl = payload as ProductiveLineUpdateQueuePayload;
        const base = PRODUCTIVE_LINES_ITEM_PATH[pl.kind];
        await apiFetch(`${base}/${pl.id}`, {
          method: "PUT",
          body: JSON.stringify(pl.body),
        });
        const pid = Number(pl.body.producer_id);
        const projId = Number(pl.body.project_id);
        if (Number.isFinite(pid) && Number.isFinite(projId)) {
          addExtensionistTouch(touches, pid, projId);
          addSurveyTouch(
            touches,
            pid,
            projId,
            PRODUCTIVE_LINES_INTERVENTION_METHOD_ID,
          );
        }
        await deleteSyncQueueRow(item.id);
        uploaded++;
        continue;
      }

      await apiFetch(`/surveys`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      await deleteSyncQueueRow(item.id);

      if (item.entity_type === "survey_answers") {
        const parts = item.entity_key.split("-").map((n) => Number(n));
        if (
          (parts.length === 4 || parts.length === 5) &&
          parts.every((n) => Number.isFinite(n))
        ) {
          const [pid, projId, compId, uId, methodId] = parts;
          try {
            await deleteAnswers(pid, projId, compId, uId, methodId ?? undefined);
          } catch (e) {
            console.error("Failed to clean local answers after upload:", e);
          }
        }
        // Mark intervention method as applied after successful upload
        try {
          const parsedPayload = JSON.parse(item.payload) as {
            producer_id?: unknown;
            project_id?: unknown;
            intervention_method_id?: unknown;
          };
          await markInterventionMethodApplied(
            Number(parsedPayload.producer_id),
            Number(parsedPayload.project_id),
            Number(parsedPayload.intervention_method_id),
            user.user_id,
          );
          addSurveyTouch(
            touches,
            Number(parsedPayload.producer_id),
            Number(parsedPayload.project_id),
            Number(parsedPayload.intervention_method_id),
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
      try {
        const { photos } = parseVisit1QueuePhotosColumn(item.photos);
        await deletePersistedOfflineVisitPhotoUris(photos.map((p) => p.uri));
        const visitPayload = JSON.parse(item.payload) as {
          producer_id?: unknown;
          project_id?: unknown;
        };
        const vPid = Number(visitPayload.producer_id);
        const vProj = Number(visitPayload.project_id);
        if (
          Number.isFinite(vPid) &&
          Number.isFinite(vProj) &&
          item.user_id != null
        ) {
          await clearOfflineVisitPhotoDir({
            kind: "visit1",
            userId: item.user_id,
            producerId: vPid,
            projectId: vProj,
          });
        }
        await markInterventionMethodApplied(
          vPid,
          vProj,
          VISIT_INTERVENTION_METHOD_ID,
          user.user_id,
        );
        if (Number.isFinite(vPid) && Number.isFinite(vProj)) {
          addExtensionistTouch(touches, vPid, vProj);
          addSurveyTouch(
            touches,
            vPid,
            vProj,
            VISIT_INTERVENTION_METHOD_ID,
          );
        }
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
        let extras: Visit2QueueExtras;
        try {
          extras = JSON.parse(item.photos ?? "{}");
        } catch {
          extras = { monitoringCommitments: [], photos: [] };
        }
        await deletePersistedOfflineVisitPhotoUris(
          (extras.photos ?? []).map((p) => p.uri),
        );
        const visitPayload = JSON.parse(item.payload) as Visit2Payload;
        if (item.user_id != null) {
          await clearOfflineVisitPhotoDir({
            kind: "visit2",
            userId: item.user_id,
            producerId: visitPayload.producer_id,
            projectId: visitPayload.project_id,
          });
        }
        await markInterventionMethodApplied(
          visitPayload.producer_id,
          visitPayload.project_id,
          VISIT2_INTERVENTION_METHOD_ID,
          user.user_id,
        );
        const v2Pid = Number(visitPayload.producer_id);
        const v2Proj = Number(visitPayload.project_id);
        if (Number.isFinite(v2Pid) && Number.isFinite(v2Proj)) {
          addExtensionistTouch(touches, v2Pid, v2Proj);
          addSurveyTouch(
            touches,
            v2Pid,
            v2Proj,
            VISIT2_INTERVENTION_METHOD_ID,
          );
        }
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

  // 5. Upload visit3 entries (create/update + fotos + seguimiento + eliminaciones)
  const visit3Pending = await getPendingVisit3Items(user.user_id);
  for (let i = 0; i < visit3Pending.length; i++) {
    const item = visit3Pending[i]!;
    onProgress?.({
      stage: "Subiendo visitas 3",
      current: i,
      total: visit3Pending.length,
    });

    const retryDelay = getRetryDelay(item.attempts ?? 0);
    await new Promise((r) => setTimeout(r, retryDelay));

    if (item.id == null) continue;

    try {
      await uploadVisit3Item(item);
      await deleteVisit3QueueRow(item.id);
      try {
        let extras: Visit3QueueExtras;
        try {
          extras = JSON.parse(item.photos ?? "{}");
        } catch {
          extras = {
            photos: [],
            keepRemoteImages: [],
            pendingImageDeletions: [],
            pendingCommitmentDeletions: [],
            trackings: [],
          };
        }
        await deletePersistedOfflineVisitPhotoUris(
          (extras.photos ?? []).map((p) => p.uri),
        );
        const visitPayload = JSON.parse(item.payload) as
          | Visit3CreatePayload
          | Visit3UpdatePayload;
        const vPid = Number(visitPayload.producer_id);
        const vProj = Number(visitPayload.project_id);
        if (
          Number.isFinite(vPid) &&
          Number.isFinite(vProj) &&
          item.user_id != null
        ) {
          await clearOfflineVisitPhotoDir({
            kind: "visit3",
            userId: item.user_id,
            producerId: vPid,
            projectId: vProj,
          });
        }
        await markInterventionMethodApplied(
          vPid,
          vProj,
          VISIT3_REGISTRATION_INTERVENTION_METHOD_ID,
          user.user_id,
        );
        await markInterventionMethodApplied(
          vPid,
          vProj,
          VISIT3_CLASSIFICATION_INTERVENTION_METHOD_ID,
          user.user_id,
        );
        if (Number.isFinite(vPid) && Number.isFinite(vProj)) {
          addExtensionistTouch(touches, vPid, vProj);
          addSurveyTouch(
            touches,
            vPid,
            vProj,
            VISIT3_CLASSIFICATION_INTERVENTION_METHOD_ID,
          );
        }
      } catch (e) {
        console.error("Failed to mark visit3 intervention method applied:", e);
      }
      uploaded++;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await markVisit3Failed(item.id, errorMsg);
      failed++;
    }
  }

  await setMetadata("last_upload", new Date().toISOString());

  const shouldRefreshLocal = failed === 0 && uploaded > 0;
  if (shouldRefreshLocal) {
    onProgress?.({
      stage: "Respuestas enviadas. Actualizando solo lo tocado en el dispositivo…",
      current: 0,
      total: 100,
    });
    try {
      await refreshTouchedDataAfterLocalUpload(user.user_id, touches, onProgress);
    } catch (e) {
      console.error("Falló la actualización selectiva tras la subida:", e);
    }
  }

  onProgress?.({
    stage: shouldRefreshLocal
      ? "Sincronización completada"
      : uploaded + failed > 0
        ? "Subida finalizada"
        : "Sin cambios que subir",
    current: uploaded + failed,
    total: Math.max(uploaded + failed, 1),
  });

  return { uploaded, failed };
}
