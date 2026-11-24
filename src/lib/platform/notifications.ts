import { LocalNotifications } from '@capacitor/local-notifications';
import type {
  AndroidNotificationDiagnostics,
  DiagnosticPermissionState,
  LocalAlarmScheduleInput,
  UUID,
} from '@/types';
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
      // Plugin nativo de FullScreenIntent + BatteryOptimization entra na Fase 4
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

export async function requestNotificationPermissions(): Promise<AndroidNotificationDiagnostics> {
  const runtime = getPlatformRuntimeInfo();
  if (!runtime.is_android) {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      await Notification.requestPermission().catch(() => undefined);
    }
    return getNotificationDiagnostics();
  }

  await LocalNotifications.requestPermissions().catch(() => undefined);
  return getNotificationDiagnostics();
}

export async function scheduleLocalAlarm(input: LocalAlarmScheduleInput): Promise<void> {
  const runtime = getPlatformRuntimeInfo();
  if (!runtime.is_android) return;

  const scheduleAt = new Date(input.scheduled_for);
  if (Number.isNaN(scheduleAt.getTime()) || scheduleAt.getTime() <= Date.now()) return;

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

  await LocalNotifications.cancel({
    notifications: [{ id: hashUuidToInt(jobId) }],
  }).catch(() => undefined);
}

export async function openSystemNotificationSettings(
  target: 'notifications' | 'exact_alarm' | 'battery' | 'full_screen' = 'notifications',
): Promise<void> {
  const runtime = getPlatformRuntimeInfo();
  if (!runtime.is_android) return;

  if (target === 'exact_alarm') {
    await LocalNotifications.changeExactNotificationSetting().catch(() => undefined);
  }
}
