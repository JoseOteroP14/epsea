import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { getInfoAsync } from "expo-file-system/legacy";

/** Paridad con agro-proj-vue `useImageWebpOptimization`. */
export const IMAGE_OPTIMIZE_MAX_BYTES = 6 * 1024 * 1024;
export const IMAGE_OPTIMIZE_MAX_DIMENSION = 1920;
export const IMAGE_OPTIMIZE_QUALITY = 0.85;

export interface OptimizedLocalPhoto {
  uri: string;
  fileName: string;
  type: "image/webp";
  originalSize: number;
  optimizedSize: number;
}

export class ImageOptimizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageOptimizationError";
  }
}

function toWebpFileName(originalName?: string | null): string {
  const base =
    (originalName ?? "imagen").replace(/\.[^.]+$/, "").trim() || "imagen";
  return `${base}.webp`;
}

async function fileSizeBytes(uri: string): Promise<number> {
  const info = await getInfoAsync(uri).catch(() => null);
  const size = (info as { size?: number } | null)?.size;
  return typeof size === "number" ? size : 0;
}

/**
 * Redimensiona (lado mayor ≤ 1920), convierte a WebP y comprime (calidad 0.85).
 * Rechaza si el resultado sigue superando 6 MB.
 */
export async function optimizeImageToWebp(params: {
  uri: string;
  fileName?: string | null;
  width?: number | null;
  height?: number | null;
}): Promise<OptimizedLocalPhoto> {
  const originalSize = await fileSizeBytes(params.uri);
  const context = ImageManipulator.manipulate(params.uri);

  let width = params.width ?? 0;
  let height = params.height ?? 0;

  if (width <= 0 || height <= 0) {
    const probed = await context.renderAsync();
    width = probed.width;
    height = probed.height;
    context.reset();
  }

  const longest = Math.max(width, height);
  if (longest > IMAGE_OPTIMIZE_MAX_DIMENSION) {
    if (width >= height) {
      context.resize({ width: IMAGE_OPTIMIZE_MAX_DIMENSION });
    } else {
      context.resize({ height: IMAGE_OPTIMIZE_MAX_DIMENSION });
    }
  }

  const imageRef = await context.renderAsync();
  const saved = await imageRef.saveAsync({
    compress: IMAGE_OPTIMIZE_QUALITY,
    format: SaveFormat.WEBP,
  });

  const optimizedSize = await fileSizeBytes(saved.uri);
  if (optimizedSize > IMAGE_OPTIMIZE_MAX_BYTES) {
    throw new ImageOptimizationError(
      "Tras optimizar, el tamaño sigue superando 6 MB.",
    );
  }

  return {
    uri: saved.uri,
    fileName: toWebpFileName(params.fileName),
    type: "image/webp",
    originalSize,
    optimizedSize,
  };
}
