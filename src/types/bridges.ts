import type { UUID } from './common';

export interface MarketBridgeResult {
  configured: boolean;
  sent: boolean;
  item_name: string;
  message: string;
}

export interface PassatemposSearchCandidate {
  external_id: string;
  title: string;
  kind: string;
  year?: string | number | null;
  subtitle?: string | null;
  poster_url?: string | null;
}

export interface PassatemposSearchResult {
  configured: boolean;
  query: string;
  candidates: PassatemposSearchCandidate[];
  message?: string;
}

export interface PassatemposEnqueueResult {
  configured: boolean;
  queued: boolean;
  title: string;
  message: string;
}

export interface NotificationActionPayload {
  action: 'open' | 'snooze_1h' | 'complete' | 'snooze_10m';
  job_id?: UUID | null;
  entity_type?: string | null;
  entity_id?: UUID | null;
  deep_link_message_id?: UUID | null;
}
