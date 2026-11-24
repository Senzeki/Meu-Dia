import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deleteRecord,
  getAllRecords,
  getMeta,
  putRecord,
  putRecords,
  setMeta,
  type LocalEntityStoreName,
} from '@/lib/db/localDb';
import { supabase } from '@/lib/supabase';
import { createUuid } from '@/lib/uuid';
import { PRIVATE_MEDIA_BUCKET } from '@/services/mediaService';
import type {
  MediaUploadTask,
  MutationOperation,
  OutboxMutation,
  SyncBaseEntity,
  SyncTableName,
  UUID,
} from '@/types';

const LAST_SYNCED_META_KEY = 'last_synced_at_v1';

const SYNC_TABLES: LocalEntityStoreName[] = [
  'chat_messages',
  'tasks',
  'house_routines',
  'mural_notes',
  'assets',
  'care_rules',
  'vault_items',
];

function parseTimestampMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Escolhe o vencedor entre duas versões da mesma entidade usando Last-Write-Wins (`updated_at`),
 * garantindo que exclusões (`deleted_at`) nunca ressuscitem como zumbis em empates ou pacotes atrasados.
 */
export function pickLwwWinner<T extends SyncBaseEntity>(local: T, remote: T): T {
  const localMs = parseTimestampMs(local.updated_at);
  const remoteMs = parseTimestampMs(remote.updated_at);

  if (remoteMs > localMs) {
    return remote;
  }
  if (localMs > remoteMs) {
    return local;
  }

  // Em empate exato de timestamp, soft delete vence para impedir ressurreição zumbi
  if (local.deleted_at && !remote.deleted_at) {
    return local;
  }
  if (remote.deleted_at && !local.deleted_at) {
    return remote;
  }
  return remote;
}

/**
 * Mescla listas local e remota por `id` aplicando LWW e preservando tombstones `deleted_at`.
 */
export function mergeEntitiesWithLww<T extends SyncBaseEntity>(
  localItems: T[],
  remoteItems: T[],
): T[] {
  const merged = new Map<string, T>();

  for (const item of localItems) {
    merged.set(item.id, item);
  }

  for (const remote of remoteItems) {
    const existing = merged.get(remote.id);
    if (!existing) {
      merged.set(remote.id, remote);
    } else {
      merged.set(remote.id, pickLwwWinner(existing, remote));
    }
  }

  return Array.from(merged.values());
}

/**
 * Remove propriedades efêmeras de cliente (ex: `local_preview_url`) antes de persistir no Supabase.
 */
export function sanitizePayloadForSupabase(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const cleaned = { ...payload };
  delete cleaned.local_preview_url;
  return cleaned;
}

export async function enqueueOutboxMutation<T extends SyncBaseEntity>(
  table: SyncTableName,
  operation: MutationOperation,
  entity: T,
): Promise<OutboxMutation> {
  const now = new Date().toISOString();
  const mutationId = entity.client_mutation_id || createUuid();
  const mutation: OutboxMutation = {
    client_mutation_id: mutationId,
    table,
    operation,
    entity_id: entity.id,
    payload: sanitizePayloadForSupabase(entity as unknown as Record<string, unknown>),
    created_at: now,
    updated_at: now,
    attempts: 0,
    last_error: null,
  };

  await putRecord('outbox_mutations', mutation);
  return mutation;
}

export async function enqueueMediaUpload(params: {
  storagePath: string;
  blob: Blob;
  mimeType: string;
  entityTable: SyncTableName;
  entityId: UUID;
}): Promise<MediaUploadTask> {
  const now = new Date().toISOString();

  await putRecord('media_blobs', {
    storage_path: params.storagePath,
    mime_type: params.mimeType,
    blob: params.blob,
    updated_at: now,
  });

  const uploadTask: MediaUploadTask = {
    id: createUuid(),
    bucket: PRIVATE_MEDIA_BUCKET,
    storage_path: params.storagePath,
    mime_type: params.mimeType,
    byte_size: params.blob.size,
    blob: params.blob,
    entity_table: params.entityTable,
    entity_id: params.entityId,
    created_at: now,
    attempts: 0,
    last_error: null,
  };

  await putRecord('media_uploads', uploadTask);
  return uploadTask;
}

export async function getPendingQueueCounts(): Promise<{
  pending_mutations: number;
  pending_uploads: number;
}> {
  const [mutations, uploads] = await Promise.all([
    getAllRecords('outbox_mutations'),
    getAllRecords('media_uploads'),
  ]);

  return {
    pending_mutations: mutations.length,
    pending_uploads: uploads.length,
  };
}

export async function getLastSyncedAt(): Promise<string | null> {
  return (await getMeta<string>(LAST_SYNCED_META_KEY)) ?? null;
}

function isIdempotentDuplicateMutationError(error: {
  code?: string;
  message?: string;
}): boolean {
  if (error.code === '23505') return true;
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes('client_mutation_id') && msg.includes('duplicate');
}

export async function flushMediaUploadsToSupabase(
  client: SupabaseClient | null = supabase,
): Promise<{ uploaded: number; failed: number }> {
  if (!client) return { uploaded: 0, failed: 0 };

  const tasks = (await getAllRecords('media_uploads')).sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  let uploaded = 0;
  let failed = 0;

  for (const task of tasks) {
    const { error } = await client.storage
      .from(task.bucket)
      .upload(task.storage_path, task.blob, {
        contentType: task.mime_type,
        upsert: false,
      });

    const isAlreadyUploaded =
      Boolean(error) &&
      (/already exists|duplicate|409/i.test(error?.message ?? '') ||
        (error as { statusCode?: string | number } | null)?.statusCode === '409' ||
        (error as { statusCode?: string | number } | null)?.statusCode === 409);

    if (!error || isAlreadyUploaded) {
      await deleteRecord('media_uploads', task.id);
      uploaded += 1;
      continue;
    }

    failed += 1;
    await putRecord('media_uploads', {
      ...task,
      attempts: task.attempts + 1,
      last_error: error.message,
    });
  }

  return { uploaded, failed };
}

export async function flushOutboxToSupabase(
  client: SupabaseClient | null = supabase,
): Promise<{ flushed: number; failed: number }> {
  if (!client) return { flushed: 0, failed: 0 };

  const mutations = (await getAllRecords('outbox_mutations')).sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  let flushed = 0;
  let failed = 0;

  for (const mutation of mutations) {
    const payload = sanitizePayloadForSupabase({
      ...mutation.payload,
      client_mutation_id: mutation.client_mutation_id,
    });

    const { error } = await client
      .from(mutation.table)
      .upsert(payload, { onConflict: 'id' });

    if (!error || isIdempotentDuplicateMutationError(error)) {
      await deleteRecord('outbox_mutations', mutation.client_mutation_id);
      flushed += 1;
      continue;
    }

    failed += 1;
    await putRecord('outbox_mutations', {
      ...mutation,
      attempts: mutation.attempts + 1,
      last_error: error.message,
      updated_at: new Date().toISOString(),
    });
  }

  return { flushed, failed };
}

export async function pullRemoteTablesWithLww(
  client: SupabaseClient | null = supabase,
): Promise<boolean> {
  if (!client) return false;

  const pendingMutations = await getAllRecords('outbox_mutations');
  const pendingEntityKeys = new Set(
    pendingMutations.map((m) => `${m.table}:${m.entity_id}`),
  );

  let allSucceeded = true;

  for (const table of SYNC_TABLES) {
    const { data, error } = await client.from(table).select('*');
    if (error || !data) {
      allSucceeded = false;
      continue;
    }

    const localRows = await getAllRecords(table);
    const remoteRows = (data as SyncBaseEntity[]).filter((row) => {
      // Não sobrescreve entidades que ainda aguardam flush local pendente com mesmo ou menor timestamp
      if (!pendingEntityKeys.has(`${table}:${row.id}`)) return true;
      const localMatch = localRows.find((l) => l.id === row.id);
      if (!localMatch) return true;
      return parseTimestampMs(row.updated_at) > parseTimestampMs(localMatch.updated_at);
    });

    const merged = mergeEntitiesWithLww(localRows as SyncBaseEntity[], remoteRows);
    await putRecords(table, merged as never[]);
  }

  return allSucceeded;
}

export interface FlushSyncResult {
  synced: boolean;
  pending_mutations: number;
  pending_uploads: number;
  last_synced_at: string | null;
}

export async function flushOfflineQueues(options?: {
  client?: SupabaseClient | null;
  online?: boolean;
}): Promise<FlushSyncResult> {
  const online =
    options?.online ?? (typeof navigator !== 'undefined' ? navigator.onLine : true);
  const client = options?.client === undefined ? supabase : options.client;

  if (!online || !client) {
    const counts = await getPendingQueueCounts();
    return {
      synced: false,
      ...counts,
      last_synced_at: await getLastSyncedAt(),
    };
  }

  const {
    data: { session },
  } = await client.auth.getSession();

  if (!session?.user) {
    const counts = await getPendingQueueCounts();
    return {
      synced: false,
      ...counts,
      last_synced_at: await getLastSyncedAt(),
    };
  }

  await flushMediaUploadsToSupabase(client);
  const outboxRes = await flushOutboxToSupabase(client);
  const pulled = await pullRemoteTablesWithLww(client);

  let lastSyncedAt = await getLastSyncedAt();
  if (outboxRes.failed === 0 && pulled) {
    lastSyncedAt = new Date().toISOString();
    await setMeta(LAST_SYNCED_META_KEY, lastSyncedAt);
  }

  const counts = await getPendingQueueCounts();
  return {
    synced: outboxRes.failed === 0 && pulled,
    ...counts,
    last_synced_at: lastSyncedAt,
  };
}
