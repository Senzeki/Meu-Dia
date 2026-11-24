import { LocalNotifications } from '@capacitor/local-notifications';
import type {
  AndroidNotificationDiagnostics,
  DiagnosticPermissionState,
  LocalAlarmScheduleInput,
  NotificationActionPayload,
  UUID,
} from '@/types';
import { MeuDiaNative } from './nativePlugin';
import { getPlatformRuntimeInfo } from './runtime';

function hashUuidToInt(id: UUID): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

function mapWebPermission(): DiagnosticPermissionState {
  if (typeof Notification === 'undefined') return 'not_applicable';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'prompt';
}

export async function getNotificationDiagnostics(): Promise<AndroidNotificationDiagnostics> {
  const runtime = getPlatformRuntimeInfo();
  const checkedAt = new Date().toISOString();

  if (!runtime.is_android) {
    return {
      platform: 'web',
      notifications_permission: mapWebPermission(),
      exact_alarms_allowed: 'not_applicable',
      full_screen_intent_allowed: 'not_applicable',
      battery_optimization_ignored: 'not_applicable',
      checked_at: checkedAt,
    };
  }

  try {
    return await MeuDiaNative.getDiagnostics();
  } catch {
    try {
      const perm = await LocalNotifications.checkPermissions();
      const exactSetting = await LocalNotifications.checkExactNotificationSetting().catch(
        () => ({ exact_alarm: 'prompt' as const }),
      );
      return {
        platform: 'android',
        notifications_permission:
          perm.display === 'granted'
            ? 'granted'
            : perm.display === 'denied'
              ? 'denied'
              : 'prompt',
        exact_alarms_allowed:
          exactSetting.exact_alarm === 'granted'
            ? 'granted'
            : exactSetting.exact_alarm === 'denied'
              ? 'denied'
              : 'prompt',
        full_screen_intent_allowed: 'prompt',
        battery_optimization_ignored: 'prompt',
        checked_at: checkedAt,
      };
    } catch {
      return {
        platform: 'android',
        notifications_permission: 'prompt',
        exact_alarms_allowed: 'prompt',
        full_screen_intent_allowed: 'prompt',
        battery_optimization_ignored: 'prompt',
        checked_at: checkedAt,
      };
    }
  }
}

export async function requestNotificationPermissions(): Promise<AndroidNotificationDiagnostics> {
  const runtime = getPlatformRuntimeInfo();
  if (!runtime.is_android) {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      await Notification.requestPermission().catch(() => undefined);
    }
    return getNotificationDiagnostics();
  }

  await LocalNotifications.requestPermissions().catch(() => undefined);
  await MeuDiaNative.requestPermissions().catch(() => undefined);
  return getNotificationDiagnostics();
}

export async function scheduleLocalAlarm(input: LocalAlarmScheduleInput): Promise<void> {
  const runtime = getPlatformRuntimeInfo();
  if (!runtime.is_android) return;

  const scheduleAt = new Date(input.scheduled_for);
  if (Number.isNaN(scheduleAt.getTime()) || scheduleAt.getTime() <= Date.now()) return;

  if (input.delivery_mode === 'call_alarm') {
    await MeuDiaNative.scheduleExactCallAlarm({
      jobId: input.job_id,
      title: input.title,
      body: input.body,
      triggerAtMillis: scheduleAt.getTime(),
      deepLinkMessageId: input.deep_link_message_id ?? undefined,
    }).catch(() => undefined);
    return;
  }

  await LocalNotifications.schedule({
    notifications: [
      {
        id: hashUuidToInt(input.job_id),
        title: input.title,
        body: input.body,
        schedule: {
          at: scheduleAt,
          allowWhileIdle: true,
        },
        extra: {
          job_id: input.job_id,
          delivery_mode: input.delivery_mode,
          deep_link_message_id: input.deep_link_message_id ?? null,
        },
      },
    ],
  }).catch(() => undefined);
}

export async function cancelLocalAlarm(jobId: UUID): Promise<void> {
  const runtime = getPlatformRuntimeInfo();
  if (!runtime.is_android) return;

  await MeuDiaNative.cancelExactCallAlarm({ jobId }).catch(() => undefined);
  await LocalNotifications.cancel({
    notifications: [{ id: hashUuidToInt(jobId) }],
  }).catch(() => undefined);
}

export async function openSystemNotificationSettings(
  target: 'notifications' | 'exact_alarm' | 'battery' | 'full_screen' = 'notifications',
): Promise<void> {
  const runtime = getPlatformRuntimeInfo();
  if (!runtime.is_android) return;

  await MeuDiaNative.openSystemSettings({ target }).catch(async () => {
    if (target === 'exact_alarm') {
      await LocalNotifications.changeExactNotificationSetting().catch(() => undefined);
    }
  });
}

export function subscribeNotificationActions(
  listener: (payload: NotificationActionPayload) => void,
): () => void {
  const runtime = getPlatformRuntimeInfo();
  if (!runtime.is_android) {
    return () => undefined;
  }

  let disposed = false;
  let removeNativeListener: (() => void) | null = null;

  void MeuDiaNative.consumePendingNotificationAction()
    .then(({ payload }) => {
      if (!disposed && payload) {
        listener(payload);
      }
    })
    .catch(() => undefined);

  void MeuDiaNative.addListener('notificationAction', (payload) => {
    if (!disposed) {
      listener(payload);
    }
  })
    .then((handle) => {
      if (disposed) {
        void handle.remove();
      } else {
        removeNativeListener = () => {
          void handle.remove();
        };
      }
    })
    .catch(() => undefined);

  return () => {
    disposed = true;
    removeNativeListener?.();
  };
}
