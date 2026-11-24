import type { PlatformAdapter } from '@/types';
import { triggerHaptic } from './haptics';
import {
  cancelLocalAlarm,
  getNotificationDiagnostics,
  openSystemNotificationSettings,
  requestNotificationPermissions,
  scheduleLocalAlarm,
} from './notifications';
import { getPlatformRuntimeInfo } from './runtime';
import { subscribeShareTarget } from './shareTarget';

export * from './runtime';
export * from './haptics';
export * from './notifications';
export * from './shareTarget';
export * from './media';

export const platformAdapter: PlatformAdapter = {
  getRuntimeInfo: getPlatformRuntimeInfo,
  triggerHaptic,
  getNotificationDiagnostics,
  requestNotificationPermissions,
  scheduleLocalAlarm,
  cancelLocalAlarm,
  openSystemNotificationSettings,
  subscribeShareTarget,
};
