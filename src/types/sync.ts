import type { Asset, CareRule } from './cuidados';
import type { ChatMessage } from './chat';
import type { HouseRoutine, MuralNote } from './casa';
import type { ISOTimestamp, UUID } from './common';
import type { Task } from './agenda';
import type { UserProfile } from './auth';
import type { VaultItem } from './guardados';

export type SyncTableName =
  | 'chat_messages'
  | 'tasks'
  | 'house_routines'
  | 'mural_notes'
  | 'assets'
  | 'care_rules'
  | 'vault_items';

export type MutationOperation = 'upsert' | 'soft_delete';

export interface OutboxMutation<TPayload = Record<string, unknown>> {
  client_mutation_id: UUID;
  table: SyncTableName;
  operation: MutationOperation;
  entity_id: UUID;
  payload: TPayload;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  attempts: number;
  last_error: string | null;
}

export interface MediaUploadTask {
  id: UUID;
  bucket: 'meu-dia-media';
  storage_path: string;
  mime_type: string;
  byte_size: number;
  blob: Blob;
  entity_table: SyncTableName;
  entity_id: UUID;
  created_at: ISOTimestamp;
  attempts: number;
  last_error: string | null;
}

export interface SyncStateSnapshot {
  online: boolean;
  syncing: boolean;
  pending_mutations: number;
  pending_uploads: number;
  last_synced_at: ISOTimestamp | null;
}

export interface BackupExportPayload {
  app: 'Meu Dia';
  schema_version: 1;
  exported_at: ISOTimestamp;
  timezone: string;
  profile: Pick<UserProfile, 'id' | 'display_name' | 'timezone' | 'pause_preferences'>;
  tasks: Task[];
  house_routines: HouseRoutine[];
  mural_notes: MuralNote[];
  assets: Asset[];
  care_rules: CareRule[];
  vault_items: VaultItem[];
  recent_messages: ChatMessage[];
}
