import type { AgendaHorizon, ISOTimestamp, NavigationTab, SyncBaseEntity, UUID } from './common';

export type ChatSender = 'user' | 'assistant' | 'system';

export type ChatMessageType =
  | 'text'
  | 'image'
  | 'audio_transcript'
  | 'link'
  | 'checkin'
  | 'mural_alert';

export type LinkedEntityType =
  | 'task'
  | 'house_routine'
  | 'mural_note'
  | 'asset'
  | 'care_rule'
  | 'vault_item'
  | 'external_market'
  | 'external_media';

export type LinkedEntityLiveState = 'open' | 'done' | 'removed';

export interface LinkedEntityRef {
  entity_type: LinkedEntityType;
  entity_id: UUID;
  tab: NavigationTab;
  agenda_horizon?: AgendaHorizon;
  label: string;
  live_state?: LinkedEntityLiveState;
  can_undo?: boolean;
}

export interface ClarificationOption {
  id: string;
  label: string;
  action_patch: Record<string, unknown>;
}

export interface ClarificationPayload {
  question: string;
  resolved: boolean;
  selected_option_id?: string | null;
  options: ClarificationOption[];
}

export type StructuredActionKind =
  | 'create_task'
  | 'update_asset_meter'
  | 'create_mural_note'
  | 'create_vault_item'
  | 'schedule_pause'
  | 'bridge_market_item'
  | 'bridge_passatempos_search';

export interface StructuredAssistantAction {
  kind: StructuredActionKind;
  summary: string;
  confidence: number;
  payload: Record<string, unknown>;
}

export interface ChatMessage extends SyncBaseEntity {
  user_id: UUID;
  sender: ChatSender;
  message_type: ChatMessageType;
  body: string;
  transcript_editable?: boolean;
  media_path: string | null;
  local_preview_url?: string | null;
  actions_payload: StructuredAssistantAction[];
  clarification_payload: ClarificationPayload | null;
  linked_entities: LinkedEntityRef[];
}

export interface AssistantContextAsset {
  id: UUID;
  name: string;
  category: string;
  meter_unit: 'km' | 'hours' | 'none';
  current_meter: number | null;
}

export interface AssistantIngestRequest {
  message_id: UUID;
  text?: string;
  audio_base64?: string;
  audio_mime_type?: string;
  audio_duration_seconds?: number;
  media_path?: string | null;
  local_iso_now: ISOTimestamp;
  timezone: string;
  context?: {
    assets?: AssistantContextAsset[];
    partner_name?: string | null;
  };
}

export interface AssistantIngestResponse {
  status: 'applied' | 'needs_clarification';
  reply_text: string;
  transcript?: string;
  actions: StructuredAssistantAction[];
  clarification?: ClarificationPayload | null;
  model_used?: string;
}
