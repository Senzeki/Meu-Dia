import type { SyncBaseEntity, UUID } from './common';

export type VaultCategory = 'print' | 'link' | 'study' | 'work';

export interface VaultItem extends SyncBaseEntity {
  owner_id: UUID;
  category: VaultCategory;
  title: string;
  url: string | null;
  body: string | null;
  media_path: string | null;
  local_preview_url?: string | null;
  source_message_id: UUID | null;
}
