import { useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { platformAdapter } from '@/lib/platform';
import { useAuthStore } from '@/store/useAuthStore';
import { useDataStore } from '@/store/useDataStore';
import { useUiStore } from '@/store/useUiStore';

export function App() {
  const initialize = useAuthStore((s) => s.initialize);
  const hydrate = useDataStore((s) => s.hydrate);
  const triggerWeeklyCheckinIfDue = useDataStore((s) => s.triggerWeeklyCheckinIfDue);
  const sendChatInput = useDataStore((s) => s.sendChatInput);
  const handleNotificationAction = useDataStore((s) => s.handleNotificationAction);
  const focusChatMessage = useUiStore((s) => s.focusChatMessage);

  useEffect(() => {
    void initialize()
      .then(() => hydrate())
      .then(() => triggerWeeklyCheckinIfDue());
  }, [initialize, hydrate, triggerWeeklyCheckinIfDue]);

  useEffect(() => {
    const unsubShare = platformAdapter.subscribeShareTarget((incoming) => {
      if (incoming.kind === 'image' && incoming.blob) {
        void sendChatInput({
          text: incoming.text ?? incoming.title ?? '',
          image_blob: incoming.blob,
          image_title: incoming.title ?? undefined,
        });
      } else {
        const text = [incoming.url, incoming.title, incoming.text]
          .filter(Boolean)
          .join(' — ')
          .trim();
        if (text) {
          void sendChatInput({ text });
        }
      }
    });

    const onDeepLink = (ev: Event) => {
      const detail = (ev as CustomEvent<{
        action?: 'open' | 'snooze_1h' | 'complete' | 'snooze_10m';
        job_id?: string | null;
        entity_type?: string | null;
        entity_id?: string | null;
        deep_link_message_id?: string | null;
      }>).detail;
      if (!detail) return;
      if (detail.deep_link_message_id) {
        focusChatMessage(detail.deep_link_message_id);
      }
      if (detail.action) {
        void handleNotificationAction({
          action: detail.action,
          job_id: detail.job_id ?? null,
          entity_type: detail.entity_type ?? null,
          entity_id: detail.entity_id ?? null,
          deep_link_message_id: detail.deep_link_message_id ?? null,
        });
      }
    };

    window.addEventListener('meudia:notification-action', onDeepLink);
    return () => {
      unsubShare();
      window.removeEventListener('meudia:notification-action', onDeepLink);
    };
  }, [sendChatInput, handleNotificationAction, focusChatMessage]);

  return <AppShell />;
}

export default App;
