import { compressImageForUpload } from '@/lib/platform/media';
import { supabase } from '@/lib/supabase';
import { createUuid } from '@/lib/uuid';
import type { CompressedMediaResult, EntityScope, UUID } from '@/types';

export const PRIVATE_MEDIA_BUCKET = 'meu-dia-media';
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hora
const CACHE_SAFETY_MARGIN_MS = 5 * 60 * 1000; // renova 5 min antes de expirar

interface CachedSignedUrl {
  url: string;
  expiresAtMs: number;
}

const signedUrlCache = new Map<string, CachedSignedUrl>();

export function buildPrivateMediaPath(params: {
  scope: EntityScope;
  ownerId: UUID;
  householdId?: UUID | null;
  folder: 'prints' | 'receipts' | 'chat';
  mimeType: string;
}): string {
  const ext = params.mimeType.includes('jpeg')
    ? 'jpg'
    : params.mimeType.includes('png')
      ? 'png'
      : 'webp';
  const fileId = createUuid();

  if (params.scope === 'shared') {
    if (!params.householdId) {
      throw new Error('Itens compartilhados exigem household_id para salvar mídia privada.');
    }
    return `shared/${params.householdId}/${params.folder}/${fileId}.${ext}`;
  }

  return `personal/${params.ownerId}/${params.folder}/${fileId}.${ext}`;
}

export async function prepareAndUploadMedia(params: {
  file: Blob;
  scope: EntityScope;
  ownerId: UUID;
  householdId?: UUID | null;
  folder: 'prints' | 'receipts' | 'chat';
}): Promise<{
  storagePath: string;
  compressed: CompressedMediaResult;
  uploadedRemotely: boolean;
}> {
  const compressed = await compressImageForUpload(params.file);
  const storagePath = buildPrivateMediaPath({
    scope: params.scope,
    ownerId: params.ownerId,
    householdId: params.householdId,
    folder: params.folder,
    mimeType: compressed.mime_type,
  });

  if (!supabase) {
    return {
      storagePath,
      compressed,
      uploadedRemotely: false,
    };
  }

  const { error } = await supabase.storage
    .from(PRIVATE_MEDIA_BUCKET)
    .upload(storagePath, compressed.blob, {
      contentType: compressed.mime_type,
      upsert: false,
    });

  if (error) {
    return {
      storagePath,
      compressed,
      uploadedRemotely: false,
    };
  }

  return {
    storagePath,
    compressed,
    uploadedRemotely: true,
  };
}

/**
 * Resolve acesso a mídias do bucket privado EXCLUSIVAMENTE via Signed URLs
 * com cache local em memória (nunca usa URL pública).
 */
export async function getPrivateMediaSignedUrl(
  storagePath: string,
  nowMs: number = Date.now(),
): Promise<string | null> {
  if (!storagePath) return null;

  const cached = signedUrlCache.get(storagePath);
  if (cached && cached.expiresAtMs - CACHE_SAFETY_MARGIN_MS > nowMs) {
    return cached.url;
  }

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(PRIVATE_MEDIA_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return null;
  }

  signedUrlCache.set(storagePath, {
    url: data.signedUrl,
    expiresAtMs: nowMs + SIGNED_URL_TTL_SECONDS * 1000,
  });

  return data.signedUrl;
}

export function clearSignedUrlCache(): void {
  signedUrlCache.clear();
}
