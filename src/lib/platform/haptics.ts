import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import type { HapticImpactStyle } from '@/types';
import { getPlatformRuntimeInfo } from './runtime';

export async function triggerHaptic(style: HapticImpactStyle = 'light'): Promise<void> {
  const { is_native } = getPlatformRuntimeInfo();
  if (!is_native) return;

  try {
    if (style === 'success') {
      await Haptics.notification({ type: NotificationType.Success });
      return;
    }
    if (style === 'warning') {
      await Haptics.notification({ type: NotificationType.Warning });
      return;
    }
    const impactMap: Record<'light' | 'medium' | 'heavy', ImpactStyle> = {
      light: ImpactStyle.Light,
      medium: ImpactStyle.Medium,
      heavy: ImpactStyle.Heavy,
    };
    await Haptics.impact({ style: impactMap[style] });
  } catch {
    // Fallback silencioso caso aparelho não suporte motor háptico
  }
}
