import { create } from 'zustand';
import { createUuid } from '@/lib/uuid';
import { getLocalDateString } from '@/lib/timezone';
import type { DataStoreContract } from '@/types';

/**
 * Contrato base do store de dados local-first.
 * `backend-core` implementa na Fase 2 a persistência IndexedDB, fila idempotente,
 * motores de recorrência/cuidados, predição O(1) e sincronização Supabase.
 */
export const useDataStore = create<DataStoreContract>(() => ({
  hydrated: true,
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

  hydrate: async () => undefined,
  loadOlderMessages: async () => 0,
  sendChatInput: async () => undefined,
  undoOrRedirectMessageAction: async () => undefined,
  getLinkedEntityLiveState: () => 'open',

  saveTask: async (input) => {
    const now = new Date().toISOString();
    return {
      id: input.id ?? createUuid(),
      owner_id: '00000000-0000-4000-8000-000000000001',
      household_id: null,
      scope: input.scope ?? 'personal',
      title: input.title,
      notes: input.notes ?? null,
      horizon: input.horizon,
      status: input.status ?? 'open',
      assigned_to: input.assigned_to ?? null,
      assigned_user_id: null,
      due_date: input.due_date ?? null,
      due_time: input.due_time ?? null,
      waiting_remind_at: input.waiting_remind_at ?? null,
      alarm_call_mode: input.alarm_call_mode ?? false,
      completed_at: null,
      source_message_id: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
  },
  setTaskStatus: async () => undefined,
  moveOverdueTask: async () => undefined,
  deleteTask: async () => undefined,

  saveMuralNote: async (input) => {
    const now = new Date().toISOString();
    return {
      id: input.id ?? createUuid(),
      owner_id: '00000000-0000-4000-8000-000000000001',
      household_id: null,
      author_id: '00000000-0000-4000-8000-000000000001',
      recipient_id: null,
      body: input.body,
      notify_at: input.notify_at ?? null,
      alarm_call_mode: input.alarm_call_mode ?? false,
      status: 'scheduled',
      source_message_id: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
  },
  acknowledgeMuralNote: async () => undefined,
  deleteMuralNote: async () => undefined,

  saveHouseRoutine: async (input) => {
    const now = new Date().toISOString();
    return {
      id: input.id ?? createUuid(),
      owner_id: '00000000-0000-4000-8000-000000000001',
      household_id: null,
      created_by: '00000000-0000-4000-8000-000000000001',
      title: input.title,
      mode: input.mode,
      weekdays: input.weekdays ?? null,
      cycle_days: input.cycle_days ?? null,
      assigned_to: input.assigned_to,
      assigned_user_id: null,
      next_due_date: input.next_due_date ?? getLocalDateString(),
      last_completed_at: null,
      recent_completions: [],
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
  },
  completeHouseRoutine: async () => undefined,
  deleteHouseRoutine: async () => undefined,

  saveAsset: async (input) => {
    const now = new Date().toISOString();
    return {
      id: input.id ?? createUuid(),
      owner_id: '00000000-0000-4000-8000-000000000001',
      household_id: null,
      scope: input.scope,
      name: input.name,
      category: input.category,
      meter_unit: input.meter_unit,
      current_meter: input.current_meter ?? null,
      meter_updated_at: input.current_meter != null ? now : null,
      purchased_at: input.purchased_at ?? null,
      warranty_expires_at: input.warranty_expires_at ?? null,
      receipt_path: null,
      notes: input.notes ?? null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
  },
  updateAssetMeter: async () => undefined,
  deleteAsset: async () => undefined,

  saveCareRule: async (input) => {
    const now = new Date().toISOString();
    return {
      id: input.id ?? createUuid(),
      asset_id: input.asset_id,
      owner_id: '00000000-0000-4000-8000-000000000001',
      household_id: null,
      scope: input.scope ?? 'personal',
      title: input.title,
      trigger_type: input.trigger_type,
      interval_days: input.interval_days ?? null,
      interval_meter: input.interval_meter ?? null,
      annual_month: input.annual_month ?? null,
      annual_day: input.annual_day ?? null,
      last_done_at: null,
      last_done_meter: null,
      next_due_date: input.next_due_date ?? null,
      next_due_meter: input.next_due_meter ?? null,
      service_history: [],
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
  },
  completeCareRule: async () => undefined,
  deleteCareRule: async () => undefined,

  saveVaultItem: async (input) => {
    const now = new Date().toISOString();
    return {
      id: input.id ?? createUuid(),
      owner_id: '00000000-0000-4000-8000-000000000001',
      category: input.category,
      title: input.title,
      url: input.url ?? null,
      body: input.body ?? null,
      media_path: null,
      source_message_id: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
  },
  deleteVaultItem: async () => undefined,

  searchAll: () => [],
  getUpcomingWarrantyAlerts: () => [],
  resolveMediaUrl: async () => null,
  flushOfflineQueues: async () => undefined,
  exportBackupJson: async () => ({
    app: 'Meu Dia',
    schema_version: 1,
    exported_at: new Date().toISOString(),
    timezone: 'America/Sao_Paulo',
    profile: {
      id: '00000000-0000-4000-8000-000000000001',
      display_name: 'Você',
      timezone: 'America/Sao_Paulo',
      pause_preferences: {
        weekdays: [2, 4, 6],
        start_time: '21:30',
        default_duration_minutes: 20,
        mute_non_critical: true,
      },
    },
    tasks: [],
    house_routines: [],
    mural_notes: [],
    assets: [],
    care_rules: [],
    vault_items: [],
    recent_messages: [],
  }),
}));
