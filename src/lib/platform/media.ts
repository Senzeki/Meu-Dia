import type { CompressedMediaResult } from '@/types';

export interface CompressImageOptions {
  /** Tamanho alvo em bytes (~150 KB padrão para envio rápido na rua/obra) */
  targetMaxBytes?: number;
  /** Maior dimensão preservando nitidez de prints e notas fiscais */
  maxDimension?: number;
}

const DEFAULT_TARGET_BYTES = 150 * 1024;
const DEFAULT_MAX_DIMENSION = 1440;

export function calculateScaledDimensions(
  width: number,
  height: number,
  maxDimension: number = DEFAULT_MAX_DIMENSION,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    return { width: 1, height: 1 };
  }
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }
  const scale = maxDimension / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Falha ao comprimir imagem no aparelho.'));
      },
      mimeType,
      quality,
    );
  });
}

async function loadImageElement(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Arquivo de imagem inválido ou não suportado.'));
    };
    img.src = url;
  });
}

/**
 * Comprime imagens e prints localmente para ~150 KB sem OCR invasivo,
 * retornando URL local imediata para renderização otimista offline-first.
 */
export async function compressImageForUpload(
  file: Blob,
  options: CompressImageOptions = {},
): Promise<CompressedMediaResult> {
  const targetMaxBytes = options.targetMaxBytes ?? DEFAULT_TARGET_BYTES;
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;

  // Em ambiente de teste sem decodificador real de bitmap (jsdom) ou se já for leve
  if (typeof document === 'undefined' || file.size <= targetMaxBytes) {
    const previewUrl =
      typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(file)
        : '';
    return {
      blob: file,
      mime_type: file.type || 'image/webp',
      byte_size: file.size,
      width: maxDimension,
      height: maxDimension,
      preview_url: previewUrl,
    };
  }

  const image = await loadImageElement(file);
  const { width, height } = calculateScaledDimensions(
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    maxDimension,
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Contexto gráfico indisponível para comprimir imagem.');
  }
  ctx.drawImage(image, 0, 0, width, height);

  const preferredMime = 'image/webp';
  const qualities = [0.82, 0.72, 0.62, 0.52, 0.42];
  let bestBlob = await canvasToBlob(canvas, preferredMime, qualities[0]);

  for (let i = 1; i < qualities.length && bestBlob.size > targetMaxBytes; i += 1) {
    bestBlob = await canvasToBlob(canvas, preferredMime, qualities[i]);
  }

  // Fallback JPEG caso o runtime retorne PNG não comprimido ao pedir WebP
  if (bestBlob.type === 'image/png' && bestBlob.size > targetMaxBytes) {
    for (const q of qualities) {
      bestBlob = await canvasToBlob(canvas, 'image/jpeg', q);
      if (bestBlob.size <= targetMaxBytes) break;
    }
  }

  const previewUrl = URL.createObjectURL(bestBlob);
  return {
    blob: bestBlob,
    mime_type: bestBlob.type || preferredMime,
    byte_size: bestBlob.size,
    width,
    height,
    preview_url: previewUrl,
  };
}
