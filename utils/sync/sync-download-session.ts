import { getMetadata, setMetadata } from "@/utils/database/repositories/sync-repository";

export const DOWNLOAD_RESULTS_INDEX_KEY = "download_results_index";
export const DOWNLOAD_RESULTS_QUEUE_KEY = "download_results_queue";

export type ProducerQueueItem = { producerId: number; projectId: number };

let downloadGeneration = 0;

export function beginDownloadSession(): number {
  downloadGeneration += 1;
  return downloadGeneration;
}

export function isDownloadSessionStale(generation: number): boolean {
  return generation !== downloadGeneration;
}

export function abortActiveDownloadSession(): number {
  return beginDownloadSession();
}

export async function clearDownloadResultsCheckpoint(): Promise<void> {
  await setMetadata(DOWNLOAD_RESULTS_INDEX_KEY, "0");
  await setMetadata(DOWNLOAD_RESULTS_QUEUE_KEY, "");
}

export async function saveDownloadResultsCheckpoint(
  index: number,
  queue: ProducerQueueItem[],
): Promise<void> {
  await setMetadata(DOWNLOAD_RESULTS_INDEX_KEY, String(index));
  await setMetadata(DOWNLOAD_RESULTS_QUEUE_KEY, JSON.stringify(queue));
}

export async function loadDownloadResultsCheckpoint(): Promise<{
  index: number;
  queue: ProducerQueueItem[];
}> {
  const rawIndex = await getMetadata(DOWNLOAD_RESULTS_INDEX_KEY);
  const rawQueue = await getMetadata(DOWNLOAD_RESULTS_QUEUE_KEY);
  const index = Math.max(0, parseInt(rawIndex ?? "0", 10) || 0);

  if (!rawQueue) {
    return { index: 0, queue: [] };
  }

  try {
    const parsed = JSON.parse(rawQueue) as ProducerQueueItem[];
    if (!Array.isArray(parsed)) return { index: 0, queue: [] };
    const queue = parsed.filter(
      (item) =>
        item &&
        Number.isFinite(item.producerId) &&
        Number.isFinite(item.projectId),
    );
    return { index: Math.min(index, queue.length), queue };
  } catch {
    return { index: 0, queue: [] };
  }
}

export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}
