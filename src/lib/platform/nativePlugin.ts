import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type {
  AndroidNotificationDiagnostics,
  NotificationActionPayload,
} from '@/types';

export interface NativeShareEventPayload {
  kind: 'link' | 'image' | 'text';
  title?: string | null;
  text?: string | null;
  url?: string | null;
  mime_type?: string | null;
  image_base64?: string | null;
}

export interface MeuDiaNativePluginContract {
  getDiagnostics(): Promise<AndroidNotificationDiagnostics>;
  requestPermissions(): Promise<AndroidNotificationDiagnostics>;
  openSystemSettings(options: {
    target: 'notifications' | 'exact_alarm' | 'battery' | 'full_screen';
  }): Promise<void>;
  scheduleExactCallAlarm(options: {
    jobId: string;
    title: string;
    body: string;
    triggerAtMillis: number;
    deepLinkMessageId?: string;
  }): Promise<void>;
  cancelExactCallAlarm(options: { jobId: string }): Promise<void>;
  showMessageNotification(options: {
    jobId: string;
    title: string;
    body: string;
    entityType?: string;
    entityId?: string;
    deepLinkMessageId?: string;
  }): Promise<void>;
  consumePendingShare(): Promise<{ payload: NativeShareEventPayload | null }>;
  consumePendingNotificationAction(): Promise<{
    payload: NotificationActionPayload | null;
  }>;
  getFcmToken(): Promise<{ token: string | null }>;
  addListener(
    eventName: 'shareReceived',
    listenerFunc: (payload: NativeShareEventPayload) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'notificationAction',
    listenerFunc: (payload: NotificationActionPayload) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'fcmTokenUpdated',
    listenerFunc: (payload: { token: string }) => void,
  ): Promise<PluginListenerHandle>;
}

export const MeuDiaNative =
  registerPlugin<MeuDiaNativePluginContract>('MeuDiaNative');
