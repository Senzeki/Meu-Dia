import type {
  AndroidNotificationDiagnostics,
  DevicePlatform,
  NotificationDeliveryMode,
} from './notifications';
import type { ISOTimestamp, UUID } from './common';

export type HapticImpactStyle = 'light' | 'medium' | 'heavy' | 'success' | 'warning';

export interface PlatformRuntimeInfo {
  platform: DevicePlatform;
  is_native: boolean;
  is_android: boolean;
}

export interface SharedIncomingPayload {
  kind: 'link' | 'image' | 'text';
  title?: string | null;
  text?: string | null;
  url?: string | null;
  mime_type?: string | null;
  blob?: Blob | null;
}

export interface LocalAlarmScheduleInput {
  job_id: UUID;
  title: string;
  body: string;
  scheduled_for: ISOTimestamp;
  delivery_mode: NotificationDeliveryMode;
  deep_link_message_id?: UUID | null;
}

export interface CompressedMediaResult {
  blob: Blob;
  mime_type: string;
  byte_size: number;
  width: number;
  height: number;
  preview_url: string;
}

export interface PlatformAdapter {
  getRuntimeInfo(): PlatformRuntimeInfo;
  triggerHaptic(style?: HapticImpactStyle): Promise<void>;
  getNotificationDiagnostics(): Promise<AndroidNotificationDiagnostics>;
  requestNotificationPermissions(): Promise<AndroidNotificationDiagnostics>;
  scheduleLocalAlarm(input: LocalAlarmScheduleInput): Promise<void>;
  cancelLocalAlarm(jobId: UUID): Promise<void>;
  openSystemNotificationSettings(
    target?: 'notifications' | 'exact_alarm' | 'battery' | 'full_screen',
  ): Promise<void>;
  subscribeShareTarget(listener: (payload: SharedIncomingPayload) => void): () => void;
}
