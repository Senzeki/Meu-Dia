import { Capacitor } from '@capacitor/core';
import type { PlatformRuntimeInfo } from '@/types';

export function getPlatformRuntimeInfo(): PlatformRuntimeInfo {
  try {
    const isNative = Capacitor.isNativePlatform();
    const rawPlatform = Capacitor.getPlatform();
    const isAndroid = isNative && rawPlatform === 'android';
    return {
      platform: isAndroid ? 'android' : 'web',
      is_native: isNative,
      is_android: isAndroid,
    };
  } catch {
    return {
      platform: 'web',
      is_native: false,
      is_android: false,
    };
  }
}
