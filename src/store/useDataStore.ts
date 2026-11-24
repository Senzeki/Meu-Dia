import { create } from 'zustand';
import {
  CHAT_PAGE_SIZE,
  compareChatMessagesAsc,
  getAllRecords,
  getLatestChatMessagesPage,
  getOlderChatMessagesPage,
  getRecord,
  putRecord,
  type LocalEntityStoreName,
} from '@/lib/db/localDb';
import { ensureInitialSeedData } from '@/lib/db/seedData';
import {
  applyCareRuleCompletion,
  computeInitialCareSchedule,
  getUpcomingWarrantyAlertsForAssets,
} from '@/lib/domain/careEngine';
import { predictChatInput } from '@/lib/domain/localPredictor';
import {
  applyHouseRoutineCompletion,
  computeInitialRoutineDueDate,
} from '@/lib/domain/routineEngine';
import { normalizeTextForSearch } from '@/lib/domain/textUtils';
import { compressImageForUpload } from '@/lib/platform/media';
import { isSupabaseConfigured } from '@/lib/supabase';
import { getLocalDateString, resolveTimezone } from '@/lib/timezone';
import { createUuid } from '@/lib/uuid';
import { exportBackupFromLocalDb } from '@/services/backupService';
import {
  buildPrivateMediaPath,
  getPrivateMediaSignedUrl,
} from '@/services/mediaService';
import {
  enqueueMediaUpload,
  enqueueOutboxMutation,
  flushOfflineQueues as runSyncFlush,
  getLastSyncedAt,
  getPendingQueueCounts,
} from '@/services/syncService';
import { useAuthStore } from '@/store/useAuthStore';
import type {
  Asset,
  CareRule,
  ChatMessage,
  DataStoreContract,
  EntityScope,
  GlobalSearchResultItem,
  HouseRoutine,
  LinkedEntityLiveState,
  MuralNote,
  MutationOperation,
  SyncBaseEntity,
  SyncTableName,
  Task,
  UUID,
  VaultItem,
} from '@/types';

let activeHydratePromise: Promise<void> | null = null;
let onlineListenersBound = false;

function resolveScopedHousehold(
  requestedScope: EntityScope | undefined,
  householdId: UUID | null,
): { scope: EntityScope; household_id: UUID | null } {
  if (requestedScope === 'shared' && householdId) {
    return { scope: 'shared', household_id: householdId };
  }
  return { scope: 'personal', household_id: null };
}

function getSafeObjectUrl(blob: Blob): string | null {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    return URL.createObjectURL(blob);
  }
  return null;
}

async function loadAllActiveFromDb() {
  const [
    page,
    tasks,
    houseRoutines,
    muralNotes,
    assets,
    careRules,
    vaultItems,
    mediaBlobs,
    counts,
    lastSyncedAt,
  ] = await Promise.all([
    getLatestChatMessagesPage(CHAT_PAGE_SIZE),
    getAllRecords('tasks'),
    getAllRecords('house_routines'),
    getAllRecords('mural_notes'),
    getAllRecords('assets'),
    getAllRecords('care_rules'),
    getAllRecords('vault_items'),
    getAllRecords('media_blobs'),
    getPendingQueueCounts(),
    getLastSyncedAt(),
  ]);

  const byCreatedDesc = <T extends SyncBaseEntity>(items: T[]) =>
    items
      .filter((item) => !item.deleted_at)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return {
    messages: page.items,
    hasOlderMessages: page.hasOlder,
    tasks: byCreatedDesc(tasks),
    houseRoutines: byCreatedDesc(houseRoutines),
    muralNotes: byCreatedDesc(muralNotes),
    assets: byCreatedDesc(assets),
    careRules: byCreatedDesc(careRules),
    vaultItems: byCreatedDesc(vaultItems),
    mediaBlobs,
    counts,
    lastSyncedAt,
  };
}

export const useDataStore = create<DataStoreContract>((set, get) => {
  const bindConnectivityListeners = () => {
    if (onlineListenersBound || typeof window === 'undefined') return;
    onlineListenersBound = true;

    window.addEventListener('online', () => {
      set((state) => ({
        syncStatus: { ...state.syncStatus, online: true },
      }));
      void get().flushOfflineQueues();
    });

    window.addEventListener('offline', () => {
      set((state) => ({
        syncStatus: { ...state.syncStatus, online: false, syncing: false },
      }));
    });
  };

  const refreshQueueCounts = async () => {
    const counts = await getPendingQueueCounts();
    set((state) => ({
      syncStatus: {
        ...state.syncStatus,
        pending_mutations: counts.pending_mutations,
        pending_uploads: counts.pending_uploads,
      },
    }));
  };

  const persistAndQueue = async <T extends SyncBaseEntity>(
    storeName: LocalEntityStoreName & SyncTableName,
    operation: MutationOperation,
    entity: T,
  ) => {
    await putRecord(storeName, entity as never);
    await enqueueOutboxMutation(storeName, operation, entity);
    await refreshQueueCounts();

    if (get().syncStatus.online && isSupabaseConfigured()) {
      void get().flushOfflineQueues();
    }
  };

  const stageImageMedia = async (params: {
    blob: Blob;
    scope: EntityScope;
    folder: 'prints' | 'receipts' | 'chat';
    entityTable: SyncTableName;
    entityId: UUID;
  }): Promise<{ storagePath: string; previewUrl: string | null }> => {
    const profile = useAuthStore.getState().profile;
    const effectiveScope: EntityScope =
      params.scope === 'shared' && profile.household_id ? 'shared' : 'personal';
    const compressed = await compressImageForUpload(params.blob);
    const storagePath = buildPrivateMediaPath({
      scope: effectiveScope,
      ownerId: profile.id,
      householdId: profile.household_id,
      folder: params.folder,
      mimeType: compressed.mime_type,
    });

    await enqueueMediaUpload({
      storagePath,
      blob: compressed.blob,
      mimeType: compressed.mime_type,
      entityTable: params.entityTable,
      entityId: params.entityId,
    });

    const previewUrl = compressed.preview_url || getSafeObjectUrl(compressed.blob);
    if (previewUrl) {
      set((state) => ({
        localMediaUrls: {
          ...state.localMediaUrls,
          [storagePath]: previewUrl,
        },
      }));
    }

    await refreshQueueCounts();
    return { storagePath, previewUrl };
  };

  const persistMessage = async (msg: ChatMessage) => {
    await persistAndQueue('chat_messages', 'upsert', msg);
    set((state) => {
      const exists = state.messages.some((m) => m.id === msg.id);
      const nextMessages = exists
        ? state.messages.map((m) => (m.id === msg.id ? msg : m))
        : [...state.messages, msg].sort(compareChatMessagesAsc);
      return { messages: nextMessages };
    });
  };

  return {
    hydrated: false,
    syncStatus: {
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      syncing: false,
      pending_mutations: 0,
      pending_uploads: 0,
      last_synced_at: null,
    },
    messages: [],
    hasOlderMessages: false,
    tasks: [],
    houseRoutines: [],
    muralNotes: [],
    assets: [],
    careRules: [],
    vaultItems: [],
    localMediaUrls: {},

    hydrate: async () => {
      if (activeHydratePromise) {
        return activeHydratePromise;
      }

      activeHydratePromise = (async () => {
        try {
          bindConnectivityListeners();
          const profile = useAuthStore.getState().profile;
          await ensureInitialSeedData(profile);

          const snapshot = await loadAllActiveFromDb();
          const existingUrls = get().localMediaUrls;
          const nextMediaUrls: Record<string, string> = {};

          for (const blobRec of snapshot.mediaBlobs) {
            if (existingUrls[blobRec.storage_path]) {
              nextMediaUrls[blobRec.storage_path] = existingUrls[blobRec.storage_path];
            } else {
              const objUrl = getSafeObjectUrl(blobRec.blob);
              if (objUrl) {
                nextMediaUrls[blobRec.storage_path] = objUrl;
              }
            }
          }

          set((state) => ({
            hydrated: true,
            messages: snapshot.messages.map((m) =>
              m.media_path && nextMediaUrls[m.media_path]
                ? { ...m, local_preview_url: nextMediaUrls[m.media_path] }
                : m,
            ),
            hasOlderMessages: snapshot.hasOlderMessages,
            tasks: snapshot.tasks,
            houseRoutines: snapshot.houseRoutines,
            muralNotes: snapshot.muralNotes,
            assets: snapshot.assets,
            careRules: snapshot.careRules,
            vaultItems: snapshot.vaultItems.map((v) =>
              v.media_path && nextMediaUrls[v.media_path]
                ? { ...v, local_preview_url: nextMediaUrls[v.media_path] }
                : v,
            ),
            localMediaUrls: nextMediaUrls,
            syncStatus: {
              ...state.syncStatus,
              online: typeof navigator !== 'undefined' ? navigator.onLine : state.syncStatus.online,
              pending_mutations: snapshot.counts.pending_mutations,
              pending_uploads: snapshot.counts.pending_uploads,
              last_synced_at: snapshot.lastSyncedAt,
            },
          }));
        } finally {
          activeHydratePromise = null;
        }
      })();

      return activeHydratePromise;
    },

    loadOlderMessages: async () => {
      const current = get().messages;
      if (current.length === 0) {
        const latest = await getLatestChatMessagesPage(CHAT_PAGE_SIZE);
        set({
          messages: latest.items,
          hasOlderMessages: latest.hasOlder,
        });
        return latest.items.length;
      }

      const oldest = current[0];
      const older = await getOlderChatMessagesPage({
        oldestLoaded: oldest,
        limit: CHAT_PAGE_SIZE,
      });

      if (older.items.length === 0) {
        set({ hasOlderMessages: false });
        return 0;
      }

      const existingIds = new Set(current.map((m) => m.id));
      const newOnes = older.items.filter((m) => !existingIds.has(m.id));
      const localUrls = get().localMediaUrls;
      const enriched = newOnes.map((m) =>
        m.media_path && localUrls[m.media_path]
          ? { ...m, local_preview_url: localUrls[m.media_path] }
          : m,
      );

      set({
        messages: [...enriched, ...current].sort(compareChatMessagesAsc),
        hasOlderMessages: older.hasOlder,
      });

      return newOnes.length;
    },

    sendChatInput: async (params) => {
      const profile = useAuthStore.getState().profile;
      const nowDate = new Date();
      const nowIso = nowDate.toISOString();
      const prediction = predictChatInput({
        text: params.text,
        hasImage: Boolean(params.image_blob),
        imageTitle: params.image_title,
        assets: get().assets,
        timezone: profile.timezone,
        now: nowDate,
      });

      if (prediction.kind === 'empty') return;

      const userMessageId = createUuid();

      if (prediction.kind === 'vault_print') {
        if (!params.image_blob) return;
        const vaultId = createUuid();
        const staged = await stageImageMedia({
          blob: params.image_blob,
          scope: 'personal',
          folder: 'prints',
          entityTable: 'vault_items',
          entityId: vaultId,
        });
        const mediaPath = staged.storagePath;
        const previewUrl = staged.previewUrl;

        const userMsg: ChatMessage = {
          id: userMessageId,
          user_id: profile.id,
          sender: 'user',
          message_type: 'image',
          body: (params.text ?? '').trim() || prediction.title,
          media_path: mediaPath,
          local_preview_url: previewUrl,
          actions_payload: [],
          clarification_payload: null,
          linked_entities: [],
          client_mutation_id: createUuid(),
          created_at: nowIso,
          updated_at: nowIso,
          deleted_at: null,
        };
        await persistMessage(userMsg);

        const vaultItem: VaultItem = {
          id: vaultId,
          owner_id: profile.id,
          category: 'print',
          title: prediction.title,
          url: null,
          body: prediction.body,
          media_path: mediaPath,
          local_preview_url: previewUrl,
          source_message_id: userMessageId,
          client_mutation_id: createUuid(),
          created_at: nowIso,
          updated_at: nowIso,
          deleted_at: null,
        };
        await persistAndQueue('vault_items', 'upsert', vaultItem);
        set((state) => ({ vaultItems: [vaultItem, ...state.vaultItems] }));

        const assistantTime = new Date(nowDate.getTime() + 1).toISOString();
        const assistantMsg: ChatMessage = {
          id: createUuid(),
          user_id: profile.id,
          sender: 'assistant',
          message_type: 'text',
          body: `Print salvo intacto em Guardados: "${vaultItem.title}".`,
          media_path: null,
          actions_payload: [
            {
              kind: 'create_vault_item',
              summary: 'Salvar print em Guardados',
              confidence: 1,
              payload: { vault_item_id: vaultItem.id, category: 'print' },
            },
          ],
          clarification_payload: null,
          linked_entities: [
            {
              entity_type: 'vault_item',
              entity_id: vaultItem.id,
              tab: 'guardados',
              label: vaultItem.title,
              live_state: 'open',
              can_undo: true,
            },
          ],
          client_mutation_id: createUuid(),
          created_at: assistantTime,
          updated_at: assistantTime,
          deleted_at: null,
        };
        await persistMessage(assistantMsg);
        return;
      }

      const userMsg: ChatMessage = {
        id: userMessageId,
        user_id: profile.id,
        sender: 'user',
        message_type: prediction.kind === 'vault_link' ? 'link' : 'text',
        body: (params.text ?? '').trim(),
        media_path: null,
        actions_payload: [],
        clarification_payload: null,
        linked_entities: [],
        client_mutation_id: createUuid(),
        created_at: nowIso,
        updated_at: nowIso,
        deleted_at: null,
      };
      await persistMessage(userMsg);

      const assistantTime = new Date(nowDate.getTime() + 1).toISOString();

      if (prediction.kind === 'vault_link') {
        const vaultItem: VaultItem = {
          id: createUuid(),
          owner_id: profile.id,
          category: 'link',
          title: prediction.title,
          url: prediction.url,
          body: prediction.body,
          media_path: null,
          source_message_id: userMessageId,
          client_mutation_id: createUuid(),
          created_at: assistantTime,
          updated_at: assistantTime,
          deleted_at: null,
        };
        await persistAndQueue('vault_items', 'upsert', vaultItem);
        set((state) => ({ vaultItems: [vaultItem, ...state.vaultItems] }));

        const assistantMsg: ChatMessage = {
          id: createUuid(),
          user_id: profile.id,
          sender: 'assistant',
          message_type: 'text',
          body: `Link guardado em Guardados: "${vaultItem.title}".`,
          media_path: null,
          actions_payload: [
            {
              kind: 'create_vault_item',
              summary: 'Salvar link em Guardados',
              confidence: 1,
              payload: { vault_item_id: vaultItem.id, category: 'link', url: prediction.url },
            },
          ],
          clarification_payload: null,
          linked_entities: [
            {
              entity_type: 'vault_item',
              entity_id: vaultItem.id,
              tab: 'guardados',
              label: vaultItem.title,
              live_state: 'open',
              can_undo: true,
            },
          ],
          client_mutation_id: createUuid(),
          created_at: assistantTime,
          updated_at: assistantTime,
          deleted_at: null,
        };
        await persistMessage(assistantMsg);
        return;
      }

      if (prediction.kind === 'update_asset_meter') {
        const prevMeter = prediction.asset.current_meter;
        const prevMeterAt = prediction.asset.meter_updated_at;
        const updatedAsset: Asset = {
          ...prediction.asset,
          current_meter: prediction.newMeter,
          meter_updated_at: assistantTime,
          updated_at: assistantTime,
          client_mutation_id: createUuid(),
        };
        await persistAndQueue('assets', 'upsert', updatedAsset);
        set((state) => ({
          assets: state.assets.map((a) => (a.id === updatedAsset.id ? updatedAsset : a)),
        }));

        const assistantMsg: ChatMessage = {
          id: createUuid(),
          user_id: profile.id,
          sender: 'assistant',
          message_type: 'text',
          body: prediction.replyText,
          media_path: null,
          actions_payload: [
            {
              kind: 'update_asset_meter',
              summary: 'Atualizar medidor do ativo',
              confidence: 1,
              payload: {
                asset_id: updatedAsset.id,
                meter_value: prediction.newMeter,
                previous_meter: prevMeter,
                previous_meter_updated_at: prevMeterAt,
              },
            },
          ],
          clarification_payload: null,
          linked_entities: [
            {
              entity_type: 'asset',
              entity_id: updatedAsset.id,
              tab: 'cuidados',
              label: updatedAsset.name,
              live_state: 'open',
              can_undo: true,
            },
          ],
          client_mutation_id: createUuid(),
          created_at: assistantTime,
          updated_at: assistantTime,
          deleted_at: null,
        };
        await persistMessage(assistantMsg);
        return;
      }

      if (prediction.kind === 'clarify_asset_meter') {
        const assistantMsg: ChatMessage = {
          id: createUuid(),
          user_id: profile.id,
          sender: 'assistant',
          message_type: 'text',
          body: prediction.question,
          media_path: null,
          actions_payload: [],
          clarification_payload: {
            question: prediction.question,
            resolved: false,
            selected_option_id: null,
            options: prediction.options,
          },
          linked_entities: [],
          client_mutation_id: createUuid(),
          created_at: assistantTime,
          updated_at: assistantTime,
          deleted_at: null,
        };
        await persistMessage(assistantMsg);
        return;
      }

      // create_task ('open' ou 'waiting')
      const newTask: Task = {
        id: createUuid(),
        owner_id: profile.id,
        household_id: null,
        scope: 'personal',
        title: prediction.title,
        notes: null,
        horizon: prediction.horizon,
        status: prediction.status,
        assigned_to: 'me',
        assigned_user_id: profile.id,
        due_date: prediction.dueDate,
        due_time: null,
        waiting_remind_at: prediction.waitingRemindAt,
        alarm_call_mode: false,
        completed_at: null,
        source_message_id: userMessageId,
        client_mutation_id: createUuid(),
        created_at: assistantTime,
        updated_at: assistantTime,
        deleted_at: null,
      };
      await persistAndQueue('tasks', 'upsert', newTask);
      set((state) => ({ tasks: [newTask, ...state.tasks] }));

      const assistantMsg: ChatMessage = {
        id: createUuid(),
        user_id: profile.id,
        sender: 'assistant',
        message_type: 'text',
        body: prediction.replyText,
        media_path: null,
        actions_payload: [
          {
            kind: 'create_task',
            summary:
              prediction.status === 'waiting'
                ? 'Criar item aguardando retorno'
                : 'Criar tarefa para hoje',
            confidence: 1,
            payload: { task_id: newTask.id, horizon: 'today', status: prediction.status },
          },
        ],
        clarification_payload: null,
        linked_entities: [
          {
            entity_type: 'task',
            entity_id: newTask.id,
            tab: 'agenda',
            agenda_horizon: 'today',
            label: newTask.title,
            live_state: 'open',
            can_undo: true,
          },
        ],
        client_mutation_id: createUuid(),
        created_at: assistantTime,
        updated_at: assistantTime,
        deleted_at: null,
      };
      await persistMessage(assistantMsg);
    },

    undoOrRedirectMessageAction: async (messageId, target) => {
      const message = get().messages.find((m) => m.id === messageId);
      if (!message || message.linked_entities.length === 0) return;

      const primary = message.linked_entities[0];
      const nowIso = new Date().toISOString();

      if (target.kind === 'undo_delete') {
        if (primary.entity_type === 'task') {
          await get().deleteTask(primary.entity_id);
        } else if (primary.entity_type === 'vault_item') {
          await get().deleteVaultItem(primary.entity_id);
        } else if (primary.entity_type === 'mural_note') {
          await get().deleteMuralNote(primary.entity_id);
        } else if (primary.entity_type === 'house_routine') {
          await get().deleteHouseRoutine(primary.entity_id);
        } else if (primary.entity_type === 'asset') {
          const meterAction = message.actions_payload.find(
            (a) => a.kind === 'update_asset_meter',
          );
          const asset = get().assets.find((a) => a.id === primary.entity_id);
          if (asset && meterAction && 'previous_meter' in meterAction.payload) {
            const restoredAsset: Asset = {
              ...asset,
              current_meter:
                (meterAction.payload.previous_meter as number | null | undefined) ?? null,
              meter_updated_at:
                (meterAction.payload.previous_meter_updated_at as string | null | undefined) ??
                null,
              updated_at: nowIso,
              client_mutation_id: createUuid(),
            };
            await persistAndQueue('assets', 'upsert', restoredAsset);
            set((state) => ({
              assets: state.assets.map((a) =>
                a.id === restoredAsset.id ? restoredAsset : a,
              ),
            }));
          } else if (asset) {
            await get().deleteAsset(primary.entity_id);
          }
        }

        const updatedMessage: ChatMessage = {
          ...message,
          linked_entities: message.linked_entities.map((link, idx) =>
            idx === 0
              ? {
                  ...link,
                  live_state:
                    primary.entity_type === 'asset' ? 'open' : 'removed',
                  can_undo: false,
                }
              : link,
          ),
          updated_at: nowIso,
          client_mutation_id: createUuid(),
        };
        await persistMessage(updatedMessage);
        return;
      }

      if (target.kind === 'move_task_horizon') {
        const profile = useAuthStore.getState().profile;
        const todayIso = getLocalDateString(new Date(), resolveTimezone(profile.timezone));

        if (primary.entity_type === 'task') {
          const existingTask = get().tasks.find((t) => t.id === primary.entity_id);
          if (!existingTask) return;
          const updatedTask: Task = {
            ...existingTask,
            horizon: target.horizon,
            due_date:
              target.horizon === 'today'
                ? todayIso
                : target.horizon === 'later'
                  ? null
                  : existingTask.due_date,
            updated_at: nowIso,
            client_mutation_id: createUuid(),
          };
          await persistAndQueue('tasks', 'upsert', updatedTask);
          set((state) => ({
            tasks: state.tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t)),
          }));

          const updatedMessage: ChatMessage = {
            ...message,
            linked_entities: [
              {
                ...primary,
                tab: 'agenda',
                agenda_horizon: target.horizon,
                live_state: get().getLinkedEntityLiveState('task', updatedTask.id),
              },
              ...message.linked_entities.slice(1),
            ],
            updated_at: nowIso,
            client_mutation_id: createUuid(),
          };
          await persistMessage(updatedMessage);
          return;
        }

        // Converte outro tipo (ex: vault_item ou mural_note) em Task no horizonte alvo
        let title = primary.label;
        if (primary.entity_type === 'vault_item') {
          const v = get().vaultItems.find((item) => item.id === primary.entity_id);
          if (v) title = v.title;
          await get().deleteVaultItem(primary.entity_id);
        } else if (primary.entity_type === 'mural_note') {
          const n = get().muralNotes.find((note) => note.id === primary.entity_id);
          if (n) title = n.body;
          await get().deleteMuralNote(primary.entity_id);
        }

        const createdTask = await get().saveTask({
          title,
          horizon: target.horizon,
          due_date: target.horizon === 'today' ? todayIso : null,
        });

        const updatedMessage: ChatMessage = {
          ...message,
          linked_entities: [
            {
              entity_type: 'task',
              entity_id: createdTask.id,
              tab: 'agenda',
              agenda_horizon: target.horizon,
              label: createdTask.title,
              live_state: 'open',
              can_undo: true,
            },
            ...message.linked_entities.slice(1),
          ],
          updated_at: nowIso,
          client_mutation_id: createUuid(),
        };
        await persistMessage(updatedMessage);
        return;
      }

      if (target.kind === 'move_to_casa') {
        if (primary.entity_type === 'mural_note') return;

        let body = primary.label;
        if (primary.entity_type === 'task') {
          const t = get().tasks.find((item) => item.id === primary.entity_id);
          if (t) body = t.title;
          await get().deleteTask(primary.entity_id);
        } else if (primary.entity_type === 'vault_item') {
          const v = get().vaultItems.find((item) => item.id === primary.entity_id);
          if (v) body = v.title;
          await get().deleteVaultItem(primary.entity_id);
        }

        const note = await get().saveMuralNote({ body });
        const updatedMessage: ChatMessage = {
          ...message,
          linked_entities: [
            {
              entity_type: 'mural_note',
              entity_id: note.id,
              tab: 'casa',
              label: note.body,
              live_state: 'open',
              can_undo: true,
            },
            ...message.linked_entities.slice(1),
          ],
          updated_at: nowIso,
          client_mutation_id: createUuid(),
        };
        await persistMessage(updatedMessage);
        return;
      }

      if (target.kind === 'move_to_vault') {
        if (primary.entity_type === 'vault_item') {
          const existingVault = get().vaultItems.find((v) => v.id === primary.entity_id);
          if (!existingVault) return;
          const updatedVault: VaultItem = {
            ...existingVault,
            category: target.category,
            updated_at: nowIso,
            client_mutation_id: createUuid(),
          };
          await persistAndQueue('vault_items', 'upsert', updatedVault);
          set((state) => ({
            vaultItems: state.vaultItems.map((v) =>
              v.id === updatedVault.id ? updatedVault : v,
            ),
          }));

          const updatedMessage: ChatMessage = {
            ...message,
            linked_entities: [
              {
                ...primary,
                tab: 'guardados',
                live_state: 'open',
              },
              ...message.linked_entities.slice(1),
            ],
            updated_at: nowIso,
            client_mutation_id: createUuid(),
          };
          await persistMessage(updatedMessage);
          return;
        }

        let title = primary.label;
        let body: string | null = null;
        if (primary.entity_type === 'task') {
          const t = get().tasks.find((item) => item.id === primary.entity_id);
          if (t) {
            title = t.title;
            body = t.notes;
          }
          await get().deleteTask(primary.entity_id);
        } else if (primary.entity_type === 'mural_note') {
          const n = get().muralNotes.find((note) => note.id === primary.entity_id);
          if (n) title = n.body;
          await get().deleteMuralNote(primary.entity_id);
        }

        const vaultItem = await get().saveVaultItem({
          category: target.category,
          title,
          body,
        });

        const updatedMessage: ChatMessage = {
          ...message,
          linked_entities: [
            {
              entity_type: 'vault_item',
              entity_id: vaultItem.id,
              tab: 'guardados',
              label: vaultItem.title,
              live_state: 'open',
              can_undo: true,
            },
            ...message.linked_entities.slice(1),
          ],
          updated_at: nowIso,
          client_mutation_id: createUuid(),
        };
        await persistMessage(updatedMessage);
      }
    },

    getLinkedEntityLiveState: (entityType, entityId): LinkedEntityLiveState => {
      const state = get();
      const profile = useAuthStore.getState().profile;
      const todayIso = getLocalDateString(new Date(), resolveTimezone(profile.timezone));

      if (entityType === 'task') {
        const task = state.tasks.find((t) => t.id === entityId && !t.deleted_at);
        if (!task) return 'removed';
        return task.status === 'done' || task.status === 'archived' ? 'done' : 'open';
      }

      if (entityType === 'house_routine') {
        const routine = state.houseRoutines.find(
          (r) => r.id === entityId && !r.deleted_at,
        );
        if (!routine) return 'removed';
        if (routine.last_completed_at) {
          const completedDay = getLocalDateString(
            new Date(routine.last_completed_at),
            resolveTimezone(profile.timezone),
          );
          if (completedDay === todayIso) return 'done';
        }
        return 'open';
      }

      if (entityType === 'mural_note') {
        const note = state.muralNotes.find((n) => n.id === entityId && !n.deleted_at);
        if (!note) return 'removed';
        return note.status === 'acknowledged' || note.status === 'dismissed'
          ? 'done'
          : 'open';
      }

      if (entityType === 'care_rule') {
        const rule = state.careRules.find((r) => r.id === entityId && !r.deleted_at);
        if (!rule) return 'removed';
        if (rule.last_done_at) {
          const doneDay = getLocalDateString(
            new Date(rule.last_done_at),
            resolveTimezone(profile.timezone),
          );
          if (doneDay === todayIso) return 'done';
        }
        return 'open';
      }

      if (entityType === 'asset') {
        const asset = state.assets.find((a) => a.id === entityId && !a.deleted_at);
        return asset ? 'open' : 'removed';
      }

      if (entityType === 'vault_item') {
        const item = state.vaultItems.find((v) => v.id === entityId && !v.deleted_at);
        return item ? 'open' : 'removed';
      }

      return 'open';
    },

    saveTask: async (input) => {
      const profile = useAuthStore.getState().profile;
      const nowIso = new Date().toISOString();
      const existing = input.id
        ? get().tasks.find((t) => t.id === input.id) ?? (await getRecord('tasks', input.id))
        : undefined;
      const { scope, household_id } = resolveScopedHousehold(
        input.scope ?? existing?.scope,
        profile.household_id,
      );

      const nextStatus = input.status ?? existing?.status ?? 'open';
      const task: Task = {
        id: existing?.id ?? input.id ?? createUuid(),
        owner_id: existing?.owner_id ?? profile.id,
        household_id,
        scope,
        title: input.title.trim(),
        notes: input.notes !== undefined ? input.notes : (existing?.notes ?? null),
        horizon: input.horizon,
        status: nextStatus,
        assigned_to:
          input.assigned_to !== undefined
            ? input.assigned_to
            : (existing?.assigned_to ?? 'me'),
        assigned_user_id: existing?.assigned_user_id ?? profile.id,
        due_date:
          input.due_date !== undefined ? input.due_date : (existing?.due_date ?? null),
        due_time:
          input.due_time !== undefined ? input.due_time : (existing?.due_time ?? null),
        waiting_remind_at:
          input.waiting_remind_at !== undefined
            ? input.waiting_remind_at
            : (existing?.waiting_remind_at ?? null),
        alarm_call_mode: input.alarm_call_mode ?? existing?.alarm_call_mode ?? false,
        completed_at:
          nextStatus === 'done'
            ? (existing?.completed_at ?? nowIso)
            : nextStatus === 'open' || nextStatus === 'waiting'
              ? null
              : (existing?.completed_at ?? null),
        source_message_id: existing?.source_message_id ?? null,
        client_mutation_id: createUuid(),
        created_at: existing?.created_at ?? nowIso,
        updated_at: nowIso,
        deleted_at: null,
      };

      await persistAndQueue('tasks', 'upsert', task);
      set((state) => ({
        tasks: existing
          ? state.tasks.map((t) => (t.id === task.id ? task : t))
          : [task, ...state.tasks],
      }));
      return task;
    },

    setTaskStatus: async (taskId, status) => {
      const existing = get().tasks.find((t) => t.id === taskId);
      if (!existing) return;
      const nowIso = new Date().toISOString();
      const updated: Task = {
        ...existing,
        status,
        completed_at: status === 'done' ? nowIso : status === 'open' ? null : existing.completed_at,
        updated_at: nowIso,
        client_mutation_id: createUuid(),
      };
      await persistAndQueue('tasks', 'upsert', updated);
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === taskId ? updated : t)),
      }));
    },

    moveOverdueTask: async (taskId, action) => {
      const existing = get().tasks.find((t) => t.id === taskId);
      if (!existing) return;
      const profile = useAuthStore.getState().profile;
      const todayIso = getLocalDateString(new Date(), resolveTimezone(profile.timezone));
      const nowIso = new Date().toISOString();

      let updated: Task;
      if (action === 'archive') {
        updated = {
          ...existing,
          status: 'archived',
          updated_at: nowIso,
          client_mutation_id: createUuid(),
        };
      } else if (action === 'today') {
        updated = {
          ...existing,
          horizon: 'today',
          due_date: todayIso,
          status: 'open',
          updated_at: nowIso,
          client_mutation_id: createUuid(),
        };
      } else {
        updated = {
          ...existing,
          horizon: action,
          due_date: null,
          status: 'open',
          updated_at: nowIso,
          client_mutation_id: createUuid(),
        };
      }

      await persistAndQueue('tasks', 'upsert', updated);
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === taskId ? updated : t)),
      }));
    },

    deleteTask: async (taskId) => {
      const existing =
        get().tasks.find((t) => t.id === taskId) ?? (await getRecord('tasks', taskId));
      if (!existing) return;
      const nowIso = new Date().toISOString();
      const deleted: Task = {
        ...existing,
        deleted_at: nowIso,
        updated_at: nowIso,
        client_mutation_id: createUuid(),
      };
      await persistAndQueue('tasks', 'soft_delete', deleted);
      set((state) => ({
        tasks: state.tasks.filter((t) => t.id !== taskId),
      }));
    },

    saveMuralNote: async (input) => {
      const profile = useAuthStore.getState().profile;
      const partner = useAuthStore.getState().partner;
      const nowIso = new Date().toISOString();
      const existing = input.id
        ? get().muralNotes.find((n) => n.id === input.id) ??
          (await getRecord('mural_notes', input.id))
        : undefined;

      const recipientId =
        input.recipient_role === 'me'
          ? profile.id
          : (partner?.id ?? existing?.recipient_id ?? null);

      const note: MuralNote = {
        id: existing?.id ?? input.id ?? createUuid(),
        owner_id: existing?.owner_id ?? profile.id,
        household_id: existing?.household_id ?? profile.household_id ?? null,
        author_id: existing?.author_id ?? profile.id,
        recipient_id: recipientId,
        body: input.body.trim(),
        notify_at:
          input.notify_at !== undefined ? input.notify_at : (existing?.notify_at ?? null),
        alarm_call_mode: input.alarm_call_mode ?? existing?.alarm_call_mode ?? false,
        status: existing?.status ?? 'scheduled',
        source_message_id: existing?.source_message_id ?? null,
        client_mutation_id: createUuid(),
        created_at: existing?.created_at ?? nowIso,
        updated_at: nowIso,
        deleted_at: null,
      };

      await persistAndQueue('mural_notes', 'upsert', note);
      set((state) => ({
        muralNotes: existing
          ? state.muralNotes.map((n) => (n.id === note.id ? note : n))
          : [note, ...state.muralNotes],
      }));
      return note;
    },

    acknowledgeMuralNote: async (noteId, status = 'acknowledged') => {
      const existing = get().muralNotes.find((n) => n.id === noteId);
      if (!existing) return;
      const nowIso = new Date().toISOString();
      const updated: MuralNote = {
        ...existing,
        status,
        updated_at: nowIso,
        client_mutation_id: createUuid(),
      };
      await persistAndQueue('mural_notes', 'upsert', updated);
      set((state) => ({
        muralNotes: state.muralNotes.map((n) => (n.id === noteId ? updated : n)),
      }));
    },

    deleteMuralNote: async (noteId) => {
      const existing =
        get().muralNotes.find((n) => n.id === noteId) ??
        (await getRecord('mural_notes', noteId));
      if (!existing) return;
      const nowIso = new Date().toISOString();
      const deleted: MuralNote = {
        ...existing,
        deleted_at: nowIso,
        updated_at: nowIso,
        client_mutation_id: createUuid(),
      };
      await persistAndQueue('mural_notes', 'soft_delete', deleted);
      set((state) => ({
        muralNotes: state.muralNotes.filter((n) => n.id !== noteId),
      }));
    },

    saveHouseRoutine: async (input) => {
      const profile = useAuthStore.getState().profile;
      const nowDate = new Date();
      const nowIso = nowDate.toISOString();
      const existing = input.id
        ? get().houseRoutines.find((r) => r.id === input.id) ??
          (await getRecord('house_routines', input.id))
        : undefined;

      const computedNextDue =
        input.next_due_date ??
        existing?.next_due_date ??
        computeInitialRoutineDueDate(
          {
            mode: input.mode,
            weekdays: input.weekdays ?? null,
            cycle_days: input.cycle_days ?? null,
          },
          nowDate,
          profile.timezone,
        );

      const routine: HouseRoutine = {
        id: existing?.id ?? input.id ?? createUuid(),
        owner_id: existing?.owner_id ?? profile.id,
        household_id: existing?.household_id ?? profile.household_id ?? null,
        created_by: existing?.created_by ?? profile.id,
        title: input.title.trim(),
        mode: input.mode,
        weekdays: input.mode === 'fixed_weekdays' ? (input.weekdays ?? [1]) : null,
        cycle_days: input.mode === 'cyclic_days' ? (input.cycle_days ?? 7) : null,
        assigned_to: input.assigned_to,
        assigned_user_id: existing?.assigned_user_id ?? null,
        next_due_date: computedNextDue,
        last_completed_at: existing?.last_completed_at ?? null,
        recent_completions: existing?.recent_completions ?? [],
        client_mutation_id: createUuid(),
        created_at: existing?.created_at ?? nowIso,
        updated_at: nowIso,
        deleted_at: null,
      };

      await persistAndQueue('house_routines', 'upsert', routine);
      set((state) => ({
        houseRoutines: existing
          ? state.houseRoutines.map((r) => (r.id === routine.id ? routine : r))
          : [routine, ...state.houseRoutines],
      }));
      return routine;
    },

    completeHouseRoutine: async (routineId, note) => {
      const existing = get().houseRoutines.find((r) => r.id === routineId);
      if (!existing) return;
      const profile = useAuthStore.getState().profile;

      const updated = applyHouseRoutineCompletion({
        routine: existing,
        completedBy: profile.id,
        note,
        timezone: profile.timezone,
        mutationId: createUuid(),
      });

      await persistAndQueue('house_routines', 'upsert', updated);
      set((state) => ({
        houseRoutines: state.houseRoutines.map((r) => (r.id === routineId ? updated : r)),
      }));
    },

    deleteHouseRoutine: async (routineId) => {
      const existing =
        get().houseRoutines.find((r) => r.id === routineId) ??
        (await getRecord('house_routines', routineId));
      if (!existing) return;
      const nowIso = new Date().toISOString();
      const deleted: HouseRoutine = {
        ...existing,
        deleted_at: nowIso,
        updated_at: nowIso,
        client_mutation_id: createUuid(),
      };
      await persistAndQueue('house_routines', 'soft_delete', deleted);
      set((state) => ({
        houseRoutines: state.houseRoutines.filter((r) => r.id !== routineId),
      }));
    },

    saveAsset: async (input) => {
      const profile = useAuthStore.getState().profile;
      const nowIso = new Date().toISOString();
      const existing = input.id
        ? get().assets.find((a) => a.id === input.id) ?? (await getRecord('assets', input.id))
        : undefined;
      const { scope, household_id } = resolveScopedHousehold(
        input.scope,
        profile.household_id,
      );

      const assetId = existing?.id ?? input.id ?? createUuid();
      let receiptPath = existing?.receipt_path ?? null;

      if (input.receipt_blob) {
        const staged = await stageImageMedia({
          blob: input.receipt_blob,
          scope,
          folder: 'receipts',
          entityTable: 'assets',
          entityId: assetId,
        });
        receiptPath = staged.storagePath;
      }

      const nextMeter =
        input.current_meter !== undefined
          ? input.current_meter
          : (existing?.current_meter ?? null);

      const asset: Asset = {
        id: assetId,
        owner_id: existing?.owner_id ?? profile.id,
        household_id,
        scope,
        name: input.name.trim(),
        category: input.category,
        meter_unit: input.meter_unit,
        current_meter: nextMeter,
        meter_updated_at:
          input.current_meter !== undefined && input.current_meter !== existing?.current_meter
            ? nowIso
            : (existing?.meter_updated_at ?? (nextMeter !== null ? nowIso : null)),
        purchased_at:
          input.purchased_at !== undefined
            ? input.purchased_at
            : (existing?.purchased_at ?? null),
        warranty_expires_at:
          input.warranty_expires_at !== undefined
            ? input.warranty_expires_at
            : (existing?.warranty_expires_at ?? null),
        receipt_path: receiptPath,
        notes: input.notes !== undefined ? input.notes : (existing?.notes ?? null),
        client_mutation_id: createUuid(),
        created_at: existing?.created_at ?? nowIso,
        updated_at: nowIso,
        deleted_at: null,
      };

      await persistAndQueue('assets', 'upsert', asset);
      set((state) => ({
        assets: existing
          ? state.assets.map((a) => (a.id === asset.id ? asset : a))
          : [asset, ...state.assets],
      }));
      return asset;
    },

    updateAssetMeter: async (assetId, meterValue) => {
      const existing = get().assets.find((a) => a.id === assetId);
      if (!existing) return;
      const nowIso = new Date().toISOString();
      const updated: Asset = {
        ...existing,
        current_meter: meterValue,
        meter_updated_at: nowIso,
        updated_at: nowIso,
        client_mutation_id: createUuid(),
      };
      await persistAndQueue('assets', 'upsert', updated);
      set((state) => ({
        assets: state.assets.map((a) => (a.id === assetId ? updated : a)),
      }));
    },

    deleteAsset: async (assetId) => {
      const existing =
        get().assets.find((a) => a.id === assetId) ?? (await getRecord('assets', assetId));
      if (!existing) return;
      const nowIso = new Date().toISOString();
      const deleted: Asset = {
        ...existing,
        deleted_at: nowIso,
        updated_at: nowIso,
        client_mutation_id: createUuid(),
      };
      await persistAndQueue('assets', 'soft_delete', deleted);

      // Soft-delete também as regras vinculadas a esse ativo
      const childRules = get().careRules.filter((r) => r.asset_id === assetId);
      for (const rule of childRules) {
        const deletedRule: CareRule = {
          ...rule,
          deleted_at: nowIso,
          updated_at: nowIso,
          client_mutation_id: createUuid(),
        };
        await persistAndQueue('care_rules', 'soft_delete', deletedRule);
      }

      set((state) => ({
        assets: state.assets.filter((a) => a.id !== assetId),
        careRules: state.careRules.filter((r) => r.asset_id !== assetId),
      }));
    },

    saveCareRule: async (input) => {
      const profile = useAuthStore.getState().profile;
      const nowDate = new Date();
      const nowIso = nowDate.toISOString();
      const existing = input.id
        ? get().careRules.find((r) => r.id === input.id) ??
          (await getRecord('care_rules', input.id))
        : undefined;
      const parentAsset = get().assets.find((a) => a.id === input.asset_id);
      const { scope, household_id } = resolveScopedHousehold(
        input.scope ?? parentAsset?.scope ?? existing?.scope,
        profile.household_id,
      );

      const initialSchedule = computeInitialCareSchedule(
        {
          trigger_type: input.trigger_type,
          interval_days: input.interval_days ?? null,
          interval_meter: input.interval_meter ?? null,
          annual_month: input.annual_month ?? null,
          annual_day: input.annual_day ?? null,
          next_due_date: input.next_due_date ?? existing?.next_due_date ?? null,
          next_due_meter: input.next_due_meter ?? existing?.next_due_meter ?? null,
        },
        parentAsset?.current_meter,
        nowDate,
        profile.timezone,
      );

      const rule: CareRule = {
        id: existing?.id ?? input.id ?? createUuid(),
        asset_id: input.asset_id,
        owner_id: existing?.owner_id ?? profile.id,
        household_id,
        scope,
        title: input.title.trim(),
        trigger_type: input.trigger_type,
        interval_days:
          input.interval_days !== undefined
            ? input.interval_days
            : (existing?.interval_days ?? null),
        interval_meter:
          input.interval_meter !== undefined
            ? input.interval_meter
            : (existing?.interval_meter ?? null),
        annual_month:
          input.annual_month !== undefined
            ? input.annual_month
            : (existing?.annual_month ?? null),
        annual_day:
          input.annual_day !== undefined
            ? input.annual_day
            : (existing?.annual_day ?? null),
        last_done_at: existing?.last_done_at ?? null,
        last_done_meter: existing?.last_done_meter ?? null,
        next_due_date: initialSchedule.next_due_date,
        next_due_meter: initialSchedule.next_due_meter,
        service_history: existing?.service_history ?? [],
        client_mutation_id: createUuid(),
        created_at: existing?.created_at ?? nowIso,
        updated_at: nowIso,
        deleted_at: null,
      };

      await persistAndQueue('care_rules', 'upsert', rule);
      set((state) => ({
        careRules: existing
          ? state.careRules.map((r) => (r.id === rule.id ? rule : r))
          : [rule, ...state.careRules],
      }));
      return rule;
    },

    completeCareRule: async (input) => {
      const rule = get().careRules.find((r) => r.id === input.rule_id);
      if (!rule) return;
      const profile = useAuthStore.getState().profile;
      const asset = get().assets.find((a) => a.id === rule.asset_id) ?? null;

      const result = applyCareRuleCompletion({
        rule,
        asset,
        input,
        timezone: profile.timezone,
        mutationId: createUuid(),
      });

      await persistAndQueue('care_rules', 'upsert', result.rule);
      if (result.asset && result.asset !== asset) {
        await persistAndQueue('assets', 'upsert', result.asset);
      }

      set((state) => ({
        careRules: state.careRules.map((r) =>
          r.id === result.rule.id ? result.rule : r,
        ),
        assets:
          result.asset && result.asset !== asset
            ? state.assets.map((a) => (a.id === result.asset!.id ? result.asset! : a))
            : state.assets,
      }));
    },

    deleteCareRule: async (ruleId) => {
      const existing =
        get().careRules.find((r) => r.id === ruleId) ??
        (await getRecord('care_rules', ruleId));
      if (!existing) return;
      const nowIso = new Date().toISOString();
      const deleted: CareRule = {
        ...existing,
        deleted_at: nowIso,
        updated_at: nowIso,
        client_mutation_id: createUuid(),
      };
      await persistAndQueue('care_rules', 'soft_delete', deleted);
      set((state) => ({
        careRules: state.careRules.filter((r) => r.id !== ruleId),
      }));
    },

    saveVaultItem: async (input) => {
      const profile = useAuthStore.getState().profile;
      const nowIso = new Date().toISOString();
      const existing = input.id
        ? get().vaultItems.find((v) => v.id === input.id) ??
          (await getRecord('vault_items', input.id))
        : undefined;

      const itemId = existing?.id ?? input.id ?? createUuid();
      let mediaPath = existing?.media_path ?? null;
      let previewUrl = existing?.local_preview_url ?? null;

      if (input.image_blob) {
        const staged = await stageImageMedia({
          blob: input.image_blob,
          scope: 'personal',
          folder: 'prints',
          entityTable: 'vault_items',
          entityId: itemId,
        });
        mediaPath = staged.storagePath;
        previewUrl = staged.previewUrl;
      }

      const item: VaultItem = {
        id: itemId,
        owner_id: existing?.owner_id ?? profile.id,
        category: input.category,
        title: input.title.trim(),
        url: input.url !== undefined ? input.url : (existing?.url ?? null),
        body: input.body !== undefined ? input.body : (existing?.body ?? null),
        media_path: mediaPath,
        local_preview_url: previewUrl,
        source_message_id: existing?.source_message_id ?? null,
        client_mutation_id: createUuid(),
        created_at: existing?.created_at ?? nowIso,
        updated_at: nowIso,
        deleted_at: null,
      };

      await persistAndQueue('vault_items', 'upsert', item);
      set((state) => ({
        vaultItems: existing
          ? state.vaultItems.map((v) => (v.id === item.id ? item : v))
          : [item, ...state.vaultItems],
      }));
      return item;
    },

    deleteVaultItem: async (itemId) => {
      const existing =
        get().vaultItems.find((v) => v.id === itemId) ??
        (await getRecord('vault_items', itemId));
      if (!existing) return;
      const nowIso = new Date().toISOString();
      const deleted: VaultItem = {
        ...existing,
        deleted_at: nowIso,
        updated_at: nowIso,
        client_mutation_id: createUuid(),
      };
      await persistAndQueue('vault_items', 'soft_delete', deleted);
      set((state) => ({
        vaultItems: state.vaultItems.filter((v) => v.id !== itemId),
      }));
    },

    searchAll: (query) => {
      const term = normalizeTextForSearch(query);
      if (!term) return [];

      const state = get();
      const results: GlobalSearchResultItem[] = [];
      const matches = (...parts: Array<string | null | undefined>) =>
        parts.some((part) => (part ? normalizeTextForSearch(part).includes(term) : false));

      for (const task of state.tasks) {
        if (task.deleted_at) continue;
        if (matches(task.title, task.notes)) {
          results.push({
            id: task.id,
            area: 'agenda',
            area_label: 'Agenda',
            agenda_horizon: task.horizon,
            title: task.title,
            subtitle:
              task.notes ||
              (task.status === 'waiting' ? 'Aguardando retorno' : `Agenda • ${task.horizon}`),
            updated_at: task.updated_at,
          });
        }
      }

      for (const routine of state.houseRoutines) {
        if (routine.deleted_at) continue;
        if (matches(routine.title)) {
          results.push({
            id: routine.id,
            area: 'casa',
            area_label: 'Casa',
            title: routine.title,
            subtitle: `Rotina da casa • próximo em ${routine.next_due_date}`,
            updated_at: routine.updated_at,
          });
        }
      }

      for (const note of state.muralNotes) {
        if (note.deleted_at) continue;
        if (matches(note.body)) {
          results.push({
            id: note.id,
            area: 'casa',
            area_label: 'Casa',
            title: note.body,
            subtitle: 'Mural da casa',
            updated_at: note.updated_at,
          });
        }
      }

      const assetNames = new Map(state.assets.map((a) => [a.id, a.name]));

      for (const asset of state.assets) {
        if (asset.deleted_at) continue;
        if (matches(asset.name, asset.notes)) {
          results.push({
            id: asset.id,
            area: 'cuidados',
            area_label: 'Cuidados',
            title: asset.name,
            subtitle:
              asset.current_meter !== null
                ? `${asset.current_meter.toLocaleString('pt-BR')} ${asset.meter_unit}`
                : (asset.notes || 'Ativo cadastrado'),
            updated_at: asset.updated_at,
          });
        }
      }

      for (const rule of state.careRules) {
        if (rule.deleted_at) continue;
        const assetName = assetNames.get(rule.asset_id);
        if (matches(rule.title, assetName)) {
          results.push({
            id: rule.id,
            area: 'cuidados',
            area_label: 'Cuidados',
            title: rule.title,
            subtitle: assetName ? `${assetName} • manutenção` : 'Regra de cuidado',
            updated_at: rule.updated_at,
          });
        }
      }

      for (const item of state.vaultItems) {
        if (item.deleted_at) continue;
        if (matches(item.title, item.body, item.url)) {
          results.push({
            id: item.id,
            area: 'guardados',
            area_label: 'Guardados',
            title: item.title,
            subtitle: item.url || item.body || `Categoria: ${item.category}`,
            updated_at: item.updated_at,
          });
        }
      }

      for (const msg of state.messages) {
        if (msg.deleted_at) continue;
        if (matches(msg.body)) {
          results.push({
            id: msg.id,
            area: 'chat',
            area_label: 'Conversa',
            title: msg.body,
            subtitle: msg.sender === 'user' ? 'Você na Conversa' : 'Assistente',
            updated_at: msg.updated_at,
          });
        }
      }

      return results.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    },

    getUpcomingWarrantyAlerts: (withinDays = 30) => {
      const profile = useAuthStore.getState().profile;
      return getUpcomingWarrantyAlertsForAssets(get().assets, {
        withinDays,
        timezone: profile.timezone,
      });
    },

    resolveMediaUrl: async (mediaPath) => {
      if (!mediaPath) return null;
      const cached = get().localMediaUrls[mediaPath];
      if (cached) return cached;

      const localBlob = await getRecord('media_blobs', mediaPath);
      if (localBlob) {
        const objUrl = getSafeObjectUrl(localBlob.blob);
        if (objUrl) {
          set((state) => ({
            localMediaUrls: {
              ...state.localMediaUrls,
              [mediaPath]: objUrl,
            },
          }));
          return objUrl;
        }
      }

      return getPrivateMediaSignedUrl(mediaPath);
    },

    flushOfflineQueues: async () => {
      const online =
        typeof navigator !== 'undefined' ? navigator.onLine : get().syncStatus.online;

      set((state) => ({
        syncStatus: { ...state.syncStatus, online, syncing: online && isSupabaseConfigured() },
      }));

      try {
        const result = await runSyncFlush({ online });
        if (result.synced) {
          const snapshot = await loadAllActiveFromDb();
          const localUrls = get().localMediaUrls;
          set({
            messages: snapshot.messages.map((m) =>
              m.media_path && localUrls[m.media_path]
                ? { ...m, local_preview_url: localUrls[m.media_path] }
                : m,
            ),
            hasOlderMessages: snapshot.hasOlderMessages,
            tasks: snapshot.tasks,
            houseRoutines: snapshot.houseRoutines,
            muralNotes: snapshot.muralNotes,
            assets: snapshot.assets,
            careRules: snapshot.careRules,
            vaultItems: snapshot.vaultItems.map((v) =>
              v.media_path && localUrls[v.media_path]
                ? { ...v, local_preview_url: localUrls[v.media_path] }
                : v,
            ),
            syncStatus: {
              online,
              syncing: false,
              pending_mutations: result.pending_mutations,
              pending_uploads: result.pending_uploads,
              last_synced_at: result.last_synced_at,
            },
          });
        } else {
          set({
            syncStatus: {
              online,
              syncing: false,
              pending_mutations: result.pending_mutations,
              pending_uploads: result.pending_uploads,
              last_synced_at: result.last_synced_at,
            },
          });
        }
      } catch {
        const counts = await getPendingQueueCounts();
        set((state) => ({
          syncStatus: {
            ...state.syncStatus,
            online,
            syncing: false,
            pending_mutations: counts.pending_mutations,
            pending_uploads: counts.pending_uploads,
          },
        }));
      }
    },

    exportBackupJson: async () => {
      const profile = useAuthStore.getState().profile;
      return exportBackupFromLocalDb(profile);
    },
  };
});
