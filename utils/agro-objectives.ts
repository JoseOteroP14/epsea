import { apiFetch } from "@/utils/api";
import { checkConnectivity } from "@/hooks/use-network";
import {
    getCachedObjectiveItemsJson,
    upsertCachedObjectiveItemsJson,
} from "@/utils/database/repositories/visit-objectives-cache-repository";

/** IDs de evento en `GET /objetives/event/:eventId/line/:lineId` (backend). */
export const VISIT_OBJECTIVE_EVENT_IDS = {
    visit1: 4,
    visit2: 5,
    visit3: 6,
} as const;

export interface ObjectiveApiItem {
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

function isGeneralObjectiveType(type: string) {
    const n = normalizeObjectiveType(type);
    return n.includes("general") && !n.includes("especific");
}

function isSpecificObjectiveType(type: string) {
    return normalizeObjectiveType(type).includes("especific");
}

function parseCachedItemsJson(json: string | null): ObjectiveApiItem[] | null {
    if (!json) return null;
    try {
        const parsed = JSON.parse(json) as unknown;
        return Array.isArray(parsed) ? (parsed as ObjectiveApiItem[]) : null;
    } catch {
        return null;
    }
}

/**
 * GET /objetives/event/:eventId/line/:lineId
 * Usa caché SQLite (rellenada en sincronización / al refrescar con red) para funcionar offline.
 */
export async function getObjectivesForEventAndLine(
    eventId: number,
    lineId: number,
): Promise<ObjectiveApiItem[] | null> {
    const cachedJson = await getCachedObjectiveItemsJson(eventId, lineId);
    const cached = parseCachedItemsJson(cachedJson);
    const online = await checkConnectivity();

    if (!online) {
        return cached && cached.length > 0 ? cached : null;
    }

    try {
        const res = await apiFetch<{ code?: string; data?: ObjectiveApiItem[] }>(
            `/objetives/event/${eventId}/line/${lineId}`,
        );
        const list = Array.isArray(res?.data) ? res!.data! : [];
        if (list.length > 0) {
            await upsertCachedObjectiveItemsJson(eventId, lineId, JSON.stringify(list));
            return list;
        }
        return cached && cached.length > 0 ? cached : [];
    } catch {
        return cached && cached.length > 0 ? cached : null;
    }
}

/** Precarga caché local para una línea (Visita 1, 2 y 3). Llamar desde sincronización con red. */
export async function refreshVisitObjectivesCacheForLine(lineId: number): Promise<void> {
    for (const eventId of [
        VISIT_OBJECTIVE_EVENT_IDS.visit1,
        VISIT_OBJECTIVE_EVENT_IDS.visit2,
        VISIT_OBJECTIVE_EVENT_IDS.visit3,
    ]) {
        try {
            const res = await apiFetch<{ code?: string; data?: ObjectiveApiItem[] }>(
                `/objetives/event/${eventId}/line/${lineId}`,
            );
            const list = Array.isArray(res?.data) ? res!.data! : [];
            if (list.length > 0) {
                await upsertCachedObjectiveItemsJson(eventId, lineId, JSON.stringify(list));
            }
        } catch {
            // ignorar fallos por línea
        }
    }
}

/** Solo descripciones de tipo «específico» (como Visit1Dialog.vue). */
export function objectiveItemsToSpecificLines(items: ObjectiveApiItem[]): string[] {
  return items
    .filter((row) => isSpecificObjectiveType(row.type))
    .map((row) => row.description.trim())
    .filter(Boolean);
}

export function objectiveItemsToFormStrings(items: ObjectiveApiItem[]): { general: string; specific: string } {
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

/** Visita 1 usa un solo campo `objetive`; combina general + específicos del catálogo. */
export function mergeObjectivesForVisit1Field(general: string, specific: string): string {
    const g = general.trim();
    const s = specific.trim();
    if (g && s) return `${g}\n\n${s}`;
    return g || s;
}

const LINE_ID_KEYS = [
    "production_line_id",
    "productive_line_id",
    "main_productive_line_id",
    "main_line_id",
] as const;

export function readProductionLineId(
    detail: { production_line_id?: number | null } | Record<string, unknown> | null | undefined,
): number | null {
    if (!detail) return null;
    const o = detail as Record<string, unknown>;
    if (o.production_line_id != null) {
        const n = Number(o.production_line_id);
        if (Number.isFinite(n)) return n;
    }
    for (const k of LINE_ID_KEYS) {
        if (k === "production_line_id") continue;
        const v = o[k];
        if (v != null) {
            const n = Number(v);
            if (Number.isFinite(n)) return n;
        }
    }
    return null;
}

/** Lista de bloques para UI solo lectura (generales por párrafo / específicos por línea). */
export function parseObjectiveDisplayBlocks(text: string | undefined, mode: "double" | "line"): string[] {
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
