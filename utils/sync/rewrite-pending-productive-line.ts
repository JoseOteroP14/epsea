import {
  enqueue,
  getPending,
} from "@/utils/database/repositories/sync-repository";
import type {
  ProductiveLinesBulkKind,
  ProductiveLinesBulkQueuePayload,
} from "@/utils/sync/sync-service";

/**
 * Reescribe el ítem `productive_lines_bulk` pendiente que contiene `localId`,
 * fusionando `lineBody` en la línea correspondiente (preserva campos no enviados
 * en el PUT de edición, p. ej. especies en pesca/acuícola).
 */
export async function rewritePendingProductiveLineBulkCreate(params: {
  userId: number;
  kind: ProductiveLinesBulkKind;
  localId: number;
  lineBody: Record<string, unknown>;
}): Promise<boolean> {
  const { userId, kind, localId, lineBody } = params;
  const pending = await getPending(userId);

  for (const item of pending) {
    if (item.entity_type !== "productive_lines_bulk") continue;

    let pl: ProductiveLinesBulkQueuePayload;
    try {
      pl = JSON.parse(item.payload) as ProductiveLinesBulkQueuePayload;
    } catch {
      continue;
    }
    if (pl.kind !== kind) continue;

    const localIds = pl.local_ids ?? [];
    const idx = localIds.indexOf(localId);
    if (idx < 0) continue;

    const lines = Array.isArray(pl.body?.lines) ? [...pl.body.lines] : [];
    const prev =
      lines[idx] != null && typeof lines[idx] === "object"
        ? { ...(lines[idx] as Record<string, unknown>) }
        : {};
    lines[idx] = { ...prev, ...lineBody };

    await enqueue(
      item.entity_type,
      item.entity_key,
      {
        kind: pl.kind,
        body: { lines },
        local_ids: localIds,
      } satisfies ProductiveLinesBulkQueuePayload,
      userId,
    );
    return true;
  }

  return false;
}
