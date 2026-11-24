import type { SupabaseClient } from '@supabase/supabase-js';
import { analyzeChatTextLocally } from '@/lib/domain/localPredictor';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { DEFAULT_TIMEZONE, getLocalIsoNow, resolveTimezone } from '@/lib/timezone';
import type {
  Asset,
  AssistantContextAsset,
  AssistantIngestRequest,
  AssistantIngestResponse,
  CareRule,
  UUID,
} from '@/types';

export const MAX_AUDIO_DURATION_SECONDS = 90;

export interface AssistantIngestCallParams {
  messageId: UUID;
  text?: string;
  audioBlob?: Blob | null;
  audioDurationSeconds?: number;
  assets: Asset[];
  careRules?: CareRule[];
  partnerName?: string | null;
  timezone?: string;
  now?: Date;
  online?: boolean;
  client?: SupabaseClient | null;
}

export type AssistantIngestCallResult =
  | { kind: 'response'; response: AssistantIngestResponse }
  | { kind: 'queued_audio_offline' };

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function buildContextAssets(assets: Asset[]): AssistantContextAsset[] {
  return assets
    .filter((a) => !a.deleted_at)
    .map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      meter_unit: a.meter_unit,
      current_meter: a.current_meter,
    }));
}

async function resolveAuthenticatedClient(
  explicitClient?: SupabaseClient | null,
): Promise<SupabaseClient | null> {
  const client =
    explicitClient !== undefined
      ? explicitClient
      : isSupabaseConfigured()
        ? supabase
        : null;

  if (!client) return null;
  try {
    const {
      data: { session },
    } = await client.auth.getSession();
    return session?.access_token ? client : null;
  } catch {
    return null;
  }
}

export async function invokeCloudAssistantIngest(params: {
  client: SupabaseClient;
  request: AssistantIngestRequest;
}): Promise<AssistantIngestResponse | null> {
  try {
    const { data, error } = await params.client.functions.invoke<AssistantIngestResponse>(
      'assistant-ingest',
      { body: params.request },
    );

    if (error || !data) return null;
    if (data.status !== 'applied' && data.status !== 'needs_clarification') {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * Orquestra ingestão híbrida (Edge Function `assistant-ingest` quando online+autenticado,
 * com fallback resiliente para o motor local composto/ambíguo ou fila offline de áudio).
 */
export async function ingestWithAssistant(
  params: AssistantIngestCallParams,
): Promise<AssistantIngestCallResult> {
  if (
    typeof params.audioDurationSeconds === 'number' &&
    params.audioDurationSeconds > MAX_AUDIO_DURATION_SECONDS
  ) {
    throw new Error(`Áudios podem ter no máximo ${MAX_AUDIO_DURATION_SECONDS} segundos.`);
  }

  const nowDate = params.now ?? new Date();
  const safeTz = resolveTimezone(params.timezone ?? DEFAULT_TIMEZONE);
  const online =
    params.online ?? (typeof navigator !== 'undefined' ? navigator.onLine : true);

  const authClient = online ? await resolveAuthenticatedClient(params.client) : null;

  if (authClient) {
    const request: AssistantIngestRequest = {
      message_id: params.messageId,
      text: params.text?.trim() || undefined,
      audio_base64: params.audioBlob ? await blobToBase64(params.audioBlob) : undefined,
      audio_mime_type: params.audioBlob?.type || (params.audioBlob ? 'audio/webm' : undefined),
      audio_duration_seconds: params.audioDurationSeconds,
      local_iso_now: getLocalIsoNow(nowDate, safeTz),
      timezone: safeTz,
      context: {
        assets: buildContextAssets(params.assets),
        partner_name: params.partnerName ?? null,
      },
    };

    const cloudResponse = await invokeCloudAssistantIngest({
      client: authClient,
      request,
    });
    if (cloudResponse) {
      return { kind: 'response', response: cloudResponse };
    }
  }

  if (params.audioBlob) {
    return { kind: 'queued_audio_offline' };
  }

  const localResponse = analyzeChatTextLocally({
    text: params.text ?? '',
    assets: params.assets,
    careRules: params.careRules,
    partnerName: params.partnerName,
    timezone: safeTz,
    now: nowDate,
  });

  return { kind: 'response', response: localResponse };
}
