import type { Question } from "@/schemas/characterization";
import type { Project } from "@/schemas/project";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/utils/api";
import {
    upsertComponents,
    upsertInnovaFields,
    upsertQuestionDetail,
    upsertQuestionTypes,
    upsertQuestions,
} from "@/utils/database/repositories/characterization-repository";
import {
    deleteProducersNotIn,
    upsertProducers
} from "@/utils/database/repositories/producer-repository";
import {
    deleteProjectsNotIn,
    upsertProjects,
} from "@/utils/database/repositories/project-repository";
import {
    getPending,
    markCompleted,
    markFailed,
    setMetadata,
} from "@/utils/database/repositories/sync-repository";

// Map type names to GET-capable detail endpoints.
// Only "list" type questions support GET /questions-list/:id (returns options).
// text, date, bool, numeric endpoints do NOT support GET — they only have POST/PUT/DELETE.
const QUESTION_DETAIL_ENDPOINTS: Record<string, string> = {
  list: "/questions-list",
  lista: "/questions-list",
};

// Full map of type names to their base endpoints (used for answer submission)
const QUESTION_TYPE_ENDPOINTS: Record<string, string> = {
  text: "/questions-text",
  texto: "/questions-text",
  date: "/questions-date",
  fecha: "/questions-date",
  bool: "/questions-bool",
  boolean: "/questions-bool",
  booleano: "/questions-bool",
  numeric: "/questions-numeric",
  numerico: "/questions-numeric",
  "numérico": "/questions-numeric",
  list: "/questions-list",
  lista: "/questions-list",
};

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
        }
      }
      page++;
    }
    // Remove producers no longer assigned to this project
    await deleteProducersNotIn(project.id, fetchedProducerIds);
  }
  report("Usuarios descargados", producerCount, producerCount);

  // Note: Producer details endpoint (/producers/:id) is not available for extensionists.
  // Producer data from the list is sufficient for offline use.

  // 3. Components
  report("Descargando componentes", 0, 1);
  const componentsResponse = await apiFetch<any>("/components", {
    method: "GET",
  });
  const components = Array.isArray(componentsResponse?.data)
    ? componentsResponse.data
    : Array.isArray(componentsResponse)
      ? componentsResponse
      : [];
  await upsertComponents(components);
  report("Descargando componentes", 1, 1);

  // 5. Question types
  report("Descargando tipos de pregunta", 0, 1);
  const typesResponse = await apiFetch<any>("/questions/types", {
    method: "GET",
  });
  const questionTypes = Array.isArray(typesResponse?.data)
    ? typesResponse.data
    : Array.isArray(typesResponse)
      ? typesResponse
      : [];
  await upsertQuestionTypes(questionTypes);
  report("Descargando tipos de pregunta", 1, 1);

  // Build type name map from fetched types
  const typeNameById: Record<number, string> = {};
  for (const t of questionTypes) {
    typeNameById[t.id] = t.name.toLowerCase().trim();
  }

  // 6. Questions per component
  const allQuestions: Question[] = [];
  for (let i = 0; i < components.length; i++) {
    const comp = components[i];
    report(
      `Preguntas (componente ${i + 1}/${components.length})`,
      i,
      components.length,
    );

    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const response = await apiFetch<any>("/questions/", {
        method: "GET",
        params: { page, limit: 100, component_id: comp.id },
      });

      let questions: Question[] = [];
      if (response?.data?.pagination) {
        const pag = response.data.pagination;
        questions = Array.isArray(pag.items) ? pag.items : [];
        hasMore = page < (pag.totalPages ?? pag.total_pages ?? 1);
      } else if (Array.isArray(response?.data)) {
        questions = response.data;
        hasMore = false;
      } else if (Array.isArray(response)) {
        questions = response;
        hasMore = false;
      } else {
        hasMore = false;
      }

      if (questions.length > 0) {
        await upsertQuestions(questions);
        allQuestions.push(...questions);
      }
      page++;
    }
  }

  // 7. Question details — only for types that support GET (list)
  const listQuestions = allQuestions.filter((q) => {
    const typeName = typeNameById[q.question_type_id];
    return typeName ? !!QUESTION_DETAIL_ENDPOINTS[typeName] : false;
  });

  for (let i = 0; i < listQuestions.length; i++) {
    const q = listQuestions[i];
    report(
      `Detalles de preguntas`,
      i,
      listQuestions.length,
    );

    const typeName = typeNameById[q.question_type_id]!;
    const endpoint = QUESTION_DETAIL_ENDPOINTS[typeName]!;

    try {
      const response = await apiFetch<any>(`${endpoint}/${q.id}`, {
        method: "GET",
      });
      const detail = response?.data ?? response;
      await upsertQuestionDetail(q.id, typeName, detail);
    } catch (e) {
      // 404 means the question was deleted on the server — skip silently
      if (e instanceof Error && e.message.includes("404")) continue;
      console.error(`Failed to download question detail ${q.id}:`, e);
    }
  }

  // 8. Innova fields
  report("Descargando campos innova", 0, 1);
  try {
    const innovaResponse = await apiFetch<any>("/assistants/innova-fields", {
      method: "GET",
    });
    const innovaFields = Array.isArray(innovaResponse?.data)
      ? innovaResponse.data
      : Array.isArray(innovaResponse)
        ? innovaResponse
        : [];
    await upsertInnovaFields(innovaFields);
  } catch (e) {
    console.error("Failed to download innova fields:", e);
  }
  report("Descargando campos innova", 1, 1);

  // Mark last download time
  await setMetadata("last_full_download", new Date().toISOString());
  report("Descarga completa", 1, 1);
}

export async function uploadPendingAnswers(
  onProgress?: (progress: SyncProgress) => void,
): Promise<{ uploaded: number; failed: number }> {
  const { user } = useAuthStore.getState();
  if (!user) throw new Error("No authenticated user");

  // Only upload items queued by the current user
  const pending = await getPending(user.user_id);
  let uploaded = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    onProgress?.({
      stage: "Subiendo respuestas",
      current: i,
      total: pending.length,
    });

    try {
      const payload = JSON.parse(item.payload);

      // POST the survey to the API
      await apiFetch(`/surveys`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      await markCompleted(item.id);
      uploaded++;
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      await markFailed(item.id, errorMsg);
      failed++;
    }
  }

  await setMetadata("last_upload", new Date().toISOString());
  onProgress?.({
    stage: "Subida completa",
    current: pending.length,
    total: pending.length,
  });

  return { uploaded, failed };
}
