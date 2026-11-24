import type { ISOTimestamp, UUID } from './common';

export type DevicePlatform = 'android' | 'web';

export interface DevicePushToken {
  id: UUID;
  user_id: UUID;
  platform: DevicePlatform;
  token: string;
  device_label: string | null;
  last_seen_at: ISOTimestamp;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export type NotificationEntityType =
  | 'task'
  | 'mural_note'
  | 'care_rule'
  | 'warranty'
  | 'checkin'
  | 'pause';

export type NotificationDeliveryMode = 'push' | 'call_alarm';

export type NotificationJobStatus =
  | 'pending'
  | 'processing'
  | 'sent'
  | 'failed'
  | 'cancelled';

export interface NotificationJob {
  id: UUID;
  user_id: UUID;
  household_id: UUID | null;
  entity_type: NotificationEntityType;
  entity_id: UUID;
  delivery_mode: NotificationDeliveryMode;
  title: string;
  body: string;
  scheduled_for: ISOTimestamp;
  status: NotificationJobStatus;
  locked_at: ISOTimestamp | null;
  attempt_count: number;
  last_error: string | null;
  deep_link_message_id: UUID | null;
  sent_at: ISOTimestamp | null;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export type DiagnosticPermissionState = 'granted' | 'denied' | 'prompt' | 'not_applicable';

export interface AndroidNotificationDiagnostics {
  platform: DevicePlatform;
  notifications_permission: DiagnosticPermissionState;
  exact_alarms_allowed: DiagnosticPermissionState;
  full_screen_intent_allowed: DiagnosticPermissionState;
  battery_optimization_ignored: DiagnosticPermissionState;
  checked_at: ISOTimestamp;
}
