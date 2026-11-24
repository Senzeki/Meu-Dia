import { getDeviceFcmToken, subscribeFcmTokenRefresh } from '@/lib/platform/notifications';
import { getPlatformRuntimeInfo } from '@/lib/platform/runtime';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { UUID } from '@/types';

let tokenListenerBoundForUser: UUID | null = null;
let unsubscribeTokenRefresh: (() => void) | null = null;

async function upsertFcmTokenToSupabase(userId: UUID, token: string): Promise<void> {
  if (!token || !isSupabaseConfigured() || !supabase) return;

  const nowIso = new Date().toISOString();
  await supabase.from('device_push_tokens').upsert(
    {
      user_id: userId,
      platform: 'android',
      token,
      device_label: 'Android',
      last_seen_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: 'user_id,token' },
  );
}

/**
 * Registra o token FCM do aparelho Android autenticado em `public.device_push_tokens`
 * para habilitar notificações push remotas e Modo Ligação entre os 2 celulares.
 * Executa como no-op silencioso na Web/PC.
 */
export async function syncDevicePushToken(userId: UUID): Promise<void> {
  const runtime = getPlatformRuntimeInfo();
  if (!runtime.is_android || !isSupabaseConfigured() || !supabase) return;

  try {
    const token = await getDeviceFcmToken();
    if (token) {
      await upsertFcmTokenToSupabase(userId, token);
    }

    if (tokenListenerBoundForUser !== userId) {
      unsubscribeTokenRefresh?.();
      tokenListenerBoundForUser = userId;
      unsubscribeTokenRefresh = subscribeFcmTokenRefresh((newToken) => {
        void upsertFcmTokenToSupabase(userId, newToken);
      });
    }
  } catch {
    // Falha de rede ao registrar token não deve bloquear o login nem o modo offline
  }
}
