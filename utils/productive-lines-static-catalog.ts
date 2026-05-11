import { EMBEDDED_PRODUCTIVE_LINES_CATALOG } from "@/constants/productive-lines-catalog-embedded";
import {
  ACTIVITY_IDS,
  ACTIVITY_TYPES,
  type AssistantItem,
  type ProductiveLine,
  SPECIES_ACTIVITY_ID,
  type UnitOfMeasureItem,
} from "@/constants/productive-lines-questions";
import { apiFetch } from "@/utils/api";
import { getMetadata, setMetadata } from "@/utils/database/repositories/sync-repository";

/** v1: sin `unitsByLineId`. Se sigue leyendo si aún no hay v2. */
const METADATA_KEY_V1 = "pl_static_catalog_v1";
const METADATA_KEY_V2 = "pl_static_catalog_v2";

export interface ProductiveLinesStaticCatalog {
  typesOfFishing: AssistantItem[];
  fishingAreas: AssistantItem[];
  aquacultureTypes: AssistantItem[];
  croppingSystemAreas: AssistantItem[];
  speciesLines: ProductiveLine[];
  /** Líneas por `activity_id` del API (1–5). */
  linesByActivityId: Record<number, ProductiveLine[]>;
  /** Unidades de medida por `line_id` (Forestal y otros usos de `/unit-of-measure/:lineId`). */
  unitsByLineId: Record<number, UnitOfMeasureItem[]>;
}

function normalizeLinesByActivityId(
  raw: unknown,
): Record<number, ProductiveLine[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<number, ProductiveLine[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(k);
    if (!Number.isFinite(id)) continue;
    out[id] = Array.isArray(v) ? (v as ProductiveLine[]) : [];
  }
  return out;
}

function normalizeUnitsByLineId(
  raw: unknown,
): Record<number, UnitOfMeasureItem[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<number, UnitOfMeasureItem[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(k);
    if (!Number.isFinite(id)) continue;
    out[id] = Array.isArray(v) ? (v as UnitOfMeasureItem[]) : [];
  }
  return out;
}

export function parseProductiveLinesStaticCatalog(
  raw: string | null,
): ProductiveLinesStaticCatalog | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ProductiveLinesStaticCatalog> &
      Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      typesOfFishing: Array.isArray(parsed.typesOfFishing)
        ? parsed.typesOfFishing
        : [],
      fishingAreas: Array.isArray(parsed.fishingAreas) ? parsed.fishingAreas : [],
      aquacultureTypes: Array.isArray(parsed.aquacultureTypes)
        ? parsed.aquacultureTypes
        : [],
      croppingSystemAreas: Array.isArray(parsed.croppingSystemAreas)
        ? parsed.croppingSystemAreas
        : [],
      speciesLines: Array.isArray(parsed.speciesLines) ? parsed.speciesLines : [],
      linesByActivityId: normalizeLinesByActivityId(parsed.linesByActivityId),
      unitsByLineId: normalizeUnitsByLineId(parsed.unitsByLineId),
    };
  } catch {
    return null;
  }
}

export async function loadProductiveLinesStaticCatalogFromCache(): Promise<ProductiveLinesStaticCatalog | null> {
  const v2 = await getMetadata(METADATA_KEY_V2);
  const parsedV2 = parseProductiveLinesStaticCatalog(v2);
  if (parsedV2) return parsedV2;
  const v1 = await getMetadata(METADATA_KEY_V1);
  return parseProductiveLinesStaticCatalog(v1);
}

function pickList<T>(cached: T[] | undefined, seed: T[]): T[] {
  if (cached && cached.length > 0) return cached;
  return seed;
}

function pickLinesByActivity(
  cached: Record<number, ProductiveLine[]> | undefined,
  seed: Record<number, ProductiveLine[]>,
): Record<number, ProductiveLine[]> {
  const ids = new Set([
    ...Object.keys(seed).map(Number),
    ...Object.keys(cached ?? {}).map(Number),
  ]);
  const out: Record<number, ProductiveLine[]> = {};
  for (const id of ids) {
    if (!Number.isFinite(id)) continue;
    out[id] = pickList(cached?.[id], seed[id] ?? []);
  }
  return out;
}

function mergeUnitsMaps(
  cached: Record<number, UnitOfMeasureItem[]> | undefined,
  seed: Record<number, UnitOfMeasureItem[]>,
): Record<number, UnitOfMeasureItem[]> {
  const out: Record<number, UnitOfMeasureItem[]> = { ...seed };
  if (cached) {
    for (const [k, v] of Object.entries(cached)) {
      const id = Number(k);
      if (!Number.isFinite(id)) continue;
      if (Array.isArray(v) && v.length > 0) out[id] = v;
    }
  }
  return out;
}

/**
 * Combina SQLite + semilla embebida para que offline siempre tenga la mejor fuente disponible
 * (caché rellenada con red gana sobre la semilla vacía).
 */
export function mergeProductiveLinesStaticCatalog(
  cached: ProductiveLinesStaticCatalog | null,
): ProductiveLinesStaticCatalog {
  const seed =
    EMBEDDED_PRODUCTIVE_LINES_CATALOG as unknown as ProductiveLinesStaticCatalog;
  const c = cached;
  return {
    typesOfFishing: pickList(c?.typesOfFishing, seed.typesOfFishing),
    fishingAreas: pickList(c?.fishingAreas, seed.fishingAreas),
    aquacultureTypes: pickList(c?.aquacultureTypes, seed.aquacultureTypes),
    croppingSystemAreas: pickList(c?.croppingSystemAreas, seed.croppingSystemAreas),
    speciesLines: pickList(c?.speciesLines, seed.speciesLines),
    linesByActivityId: pickLinesByActivity(c?.linesByActivityId, seed.linesByActivityId),
    unitsByLineId: mergeUnitsMaps(c?.unitsByLineId, seed.unitsByLineId),
  };
}

export async function loadResolvedProductiveLinesStaticCatalog(): Promise<ProductiveLinesStaticCatalog> {
  const cached = await loadProductiveLinesStaticCatalogFromCache();
  return mergeProductiveLinesStaticCatalog(cached);
}

async function safeUnits(lineId: number): Promise<UnitOfMeasureItem[]> {
  try {
    const res = await apiFetch<{ data: UnitOfMeasureItem[] }>(
      `/unit-of-measure/${lineId}`,
    );
    return res.data ?? [];
  } catch {
    return [];
  }
}

async function prefetchUnitsForForestLines(
  forestLines: ProductiveLine[],
): Promise<Record<number, UnitOfMeasureItem[]>> {
  const byId: Record<number, UnitOfMeasureItem[]> = {};
  const ids = forestLines.map((l) => l.id).filter((id) => Number.isFinite(id));
  const batchSize = 5;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const rows = await Promise.all(
      batch.map(async (lineId) => ({ lineId, units: await safeUnits(lineId) })),
    );
    for (const { lineId, units } of rows) {
      if (units.length > 0) byId[lineId] = units;
    }
  }
  return byId;
}

function mergeRefreshedUnits(
  previous: Record<number, UnitOfMeasureItem[]> | undefined,
  fetched: Record<number, UnitOfMeasureItem[]>,
): Record<number, UnitOfMeasureItem[]> {
  const out: Record<number, UnitOfMeasureItem[]> = { ...(previous ?? {}) };
  for (const [k, v] of Object.entries(fetched)) {
    const id = Number(k);
    if (Array.isArray(v) && v.length > 0) out[id] = v;
  }
  return out;
}

/**
 * Descarga catálogos globales (líneas por actividad, asistentes pesca/acuícola, especies, unidades forestales).
 * No forma parte de la descarga de sincronización de productores; llamar con red al iniciar sesión o al abrir la UI.
 */
export async function refreshProductiveLinesStaticCatalog(): Promise<void> {
  const safeLines = async (activityId: number): Promise<ProductiveLine[]> => {
    try {
      const res = await apiFetch<{ data: ProductiveLine[] }>(
        `/productive-lines/activity/${activityId}`,
      );
      return res.data ?? [];
    } catch {
      return [];
    }
  };

  const safeAssist = async (path: string): Promise<AssistantItem[]> => {
    try {
      const res = await apiFetch<{ data: AssistantItem[] }>(path);
      return res.data ?? [];
    } catch {
      return [];
    }
  };

  const prevRaw = await getMetadata(METADATA_KEY_V2);
  const prev = parseProductiveLinesStaticCatalog(prevRaw);

  const [
    typesOfFishing,
    fishingAreas,
    aquacultureTypes,
    croppingSystemAreas,
    speciesLines,
  ] = await Promise.all([
    safeAssist("/assistants/types-of-fishing"),
    safeAssist("/assistants/fishing-areas"),
    safeAssist("/assistants/aquaculture-types-of-system"),
    safeAssist("/assistants/area-of-cropping-system"),
    safeLines(SPECIES_ACTIVITY_ID),
  ]);

  const linesByActivityId: Record<number, ProductiveLine[]> = {};
  await Promise.all(
    ACTIVITY_TYPES.map(async (t) => {
      const id = ACTIVITY_IDS[t];
      linesByActivityId[id] = await safeLines(id);
    }),
  );

  const forestLines = linesByActivityId[ACTIVITY_IDS.forestal] ?? [];
  const fetchedUnits = await prefetchUnitsForForestLines(forestLines);
  const unitsByLineId = mergeRefreshedUnits(prev?.unitsByLineId, fetchedUnits);

  const catalog: ProductiveLinesStaticCatalog = {
    typesOfFishing,
    fishingAreas,
    aquacultureTypes,
    croppingSystemAreas,
    speciesLines,
    linesByActivityId,
    unitsByLineId,
  };

  await setMetadata(METADATA_KEY_V2, JSON.stringify(catalog));
}
