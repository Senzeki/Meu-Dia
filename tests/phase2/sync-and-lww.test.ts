import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getAllRecords,
  putRecord,
  resetLocalDbForTests,
} from '@/lib/db/localDb';
import {
  enqueueMediaUpload,
  enqueueOutboxMutation,
  flushMediaUploadsToSupabase,
  flushOfflineQueues,
  flushOutboxToSupabase,
  mergeEntitiesWithLww,
  sanitizePayloadForSupabase,
} from '@/services/syncService';
import { useDataStore } from '@/store/useDataStore';
import type { Task } from '@/types';

const USER_ID = '00000000-0000-4000-8000-000000000001';

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 'task-1',
    owner_id: USER_ID,
    household_id: null,
    scope: 'personal',
    title: 'Tarefa teste',
    notes: null,
    horizon: 'today',
    status: 'open',
    assigned_to: 'me',
    assigned_user_id: USER_ID,
    due_date: '2026-11-23',
    due_time: null,
    waiting_remind_at: null,
    alarm_call_mode: false,
    completed_at: null,
    source_message_id: null,
    created_at: '2026-11-23T10:00:00.000Z',
    updated_at: '2026-11-23T10:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

describe('Sincronização Offline-First, Idempotência, LWW e Soft Delete', () => {
  beforeEach(async () => {
    await resetLocalDbForTests();
  });

  it('preserva client_mutation_id idempotente e trata erro 23505 de duplicidade como já aplicado', async () => {
    const task = makeTask({
      id: 'task-idem-1',
      client_mutation_id: 'mut-idem-1111',
    });

    await enqueueOutboxMutation('tasks', 'upsert', task);
    const queued = await getAllRecords('outbox_mutations');
    expect(queued).toHaveLength(1);
    expect(queued[0].client_mutation_id).toBe('mut-idem-1111');

    const upsertPayloads: Record<string, unknown>[] = [];
    const mockClient = {
      from: () => ({
        upsert: async (payload: Record<string, unknown>) => {
          upsertPayloads.push(payload);
          // Simula resposta de retry onde o servidor já tinha registrado aquele client_mutation_id
          return {
            error: {
              code: '23505',
              message: 'duplicate key value violates unique constraint "tasks_client_mutation_id_key"',
            },
          };
        },
      }),
    } as unknown as SupabaseClient;

    const result = await flushOutboxToSupabase(mockClient);
    expect(result).toEqual({ flushed: 1, failed: 0 });
    expect(upsertPayloads[0].client_mutation_id).toBe('mut-idem-1111');
    expect(await getAllRecords('outbox_mutations')).toHaveLength(0);
  });

  it('remove propriedades efêmeras de cliente antes de enviar ao Supabase', () => {
    const sanitized = sanitizePayloadForSupabase({
      id: 'msg-1',
      body: 'Print',
      local_preview_url: 'blob:http://localhost/123',
    });
    expect(sanitized).toEqual({ id: 'msg-1', body: 'Print' });
    expect('local_preview_url' in sanitized).toBe(false);
  });

  it('resolve conflitos via Last-Write-Wins (updated_at) e impede ressurreição zumbi via deleted_at', () => {
    const localDeletedNewer = makeTask({
      id: 't-zombie-1',
      title: 'Excluída localmente',
      updated_at: '2026-11-23T12:00:00.000Z',
      deleted_at: '2026-11-23T12:00:00.000Z',
    });
    const remoteStaleActive = makeTask({
      id: 't-zombie-1',
      title: 'Versão antiga ativa do servidor',
      updated_at: '2026-11-23T11:00:00.000Z',
      deleted_at: null,
    });

    // Empate exato de timestamp também deve preservar soft delete
    const localActiveTie = makeTask({
      id: 't-zombie-2',
      title: 'Ativa local',
      updated_at: '2026-11-23T12:00:00.000Z',
      deleted_at: null,
    });
    const remoteDeletedTie = makeTask({
      id: 't-zombie-2',
      title: 'Excluída no outro aparelho',
      updated_at: '2026-11-23T12:00:00.000Z',
      deleted_at: '2026-11-23T12:00:00.000Z',
    });

    // Edição remota mais recente vence edição local mais antiga
    const localOlderEdit = makeTask({
      id: 't-lww-3',
      title: 'Título antigo',
      updated_at: '2026-11-23T09:00:00.000Z',
    });
    const remoteNewerEdit = makeTask({
      id: 't-lww-3',
      title: 'Título atualizado no outro aparelho',
      updated_at: '2026-11-23T10:30:00.000Z',
    });

    const merged = mergeEntitiesWithLww(
      [localDeletedNewer, localActiveTie, localOlderEdit],
      [remoteStaleActive, remoteDeletedTie, remoteNewerEdit],
    );

    const byId = new Map(merged.map((item) => [item.id, item]));
    expect(byId.get('t-zombie-1')?.deleted_at).toBe('2026-11-23T12:00:00.000Z');
    expect(byId.get('t-zombie-2')?.deleted_at).toBe('2026-11-23T12:00:00.000Z');
    expect(byId.get('t-lww-3')?.title).toBe('Título atualizado no outro aparelho');
  });

  it('persiste fila separada de upload de mídia e limpa após envio bem-sucedido', async () => {
    const blob = new Blob(['fake-webp'], { type: 'image/webp' });
    await enqueueMediaUpload({
      storagePath: `personal/${USER_ID}/prints/abc.webp`,
      blob,
      mimeType: 'image/webp',
      entityTable: 'vault_items',
      entityId: 'vault-1',
    });

    expect(await getAllRecords('media_uploads')).toHaveLength(1);
    expect(await getAllRecords('media_blobs')).toHaveLength(1);

    const uploadedPaths: string[] = [];
    const mockClient = {
      storage: {
        from: () => ({
          upload: async (path: string) => {
            uploadedPaths.push(path);
            return { error: null };
          },
        }),
      },
    } as unknown as SupabaseClient;

    const res = await flushMediaUploadsToSupabase(mockClient);
    expect(res).toEqual({ uploaded: 1, failed: 0 });
    expect(uploadedPaths).toEqual([`personal/${USER_ID}/prints/abc.webp`]);
    expect(await getAllRecords('media_uploads')).toHaveLength(0);
    // Blob local permanece em cache offline
    expect(await getAllRecords('media_blobs')).toHaveLength(1);
  });

  it('sincroniza pull remoto com LWW sem ressuscitar item deletado localmente', async () => {
    const taskId = 'task-sync-anti-zombie';
    await putRecord(
      'tasks',
      makeTask({
        id: taskId,
        title: 'Apagada offline',
        updated_at: '2026-11-23T15:00:00.000Z',
        deleted_at: '2026-11-23T15:00:00.000Z',
      }),
    );

    const mockClient = {
      auth: {
        getSession: async () => ({ data: { session: { user: { id: USER_ID } } } }),
      },
      from: (table: string) => ({
        select: async () => {
          if (table === 'tasks') {
            return {
              data: [
                makeTask({
                  id: taskId,
                  title: 'Versão zumbi antiga',
                  updated_at: '2026-11-23T14:00:00.000Z',
                  deleted_at: null,
                }),
              ],
              error: null,
            };
          }
          return { data: [], error: null };
        },
        upsert: async () => ({ error: null }),
      }),
      storage: {
        from: () => ({ upload: async () => ({ error: null }) }),
      },
    } as unknown as SupabaseClient;

    const flushRes = await flushOfflineQueues({ client: mockClient, online: true });
    expect(flushRes.synced).toBe(true);

    const allTasks = await getAllRecords('tasks');
    const target = allTasks.find((t) => t.id === taskId);
    expect(target?.deleted_at).toBe('2026-11-23T15:00:00.000Z');
  });

  it('nunca recria dados iniciais após o usuário excluí-los e recarregar o store', async () => {
    await useDataStore.getState().hydrate();
    const initialTasks = useDataStore.getState().tasks;
    expect(initialTasks.length).toBeGreaterThanOrEqual(4);

    for (const task of initialTasks) {
      await useDataStore.getState().deleteTask(task.id);
    }
    expect(useDataStore.getState().tasks).toHaveLength(0);

    // Simula reboot/re-hidratação do app
    await useDataStore.getState().hydrate();
    expect(useDataStore.getState().tasks).toHaveLength(0);
  });
});
