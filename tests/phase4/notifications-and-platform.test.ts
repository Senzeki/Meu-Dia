import { beforeEach, describe, expect, it } from 'vitest';
import { resetLocalDbForTests } from '@/lib/db/localDb';
import { emitIncomingShare, platformAdapter } from '@/lib/platform';
import { useDataStore } from '@/store/useDataStore';
import { useUiStore } from '@/store/useUiStore';
import type { SharedIncomingPayload } from '@/types';

describe('Notificações, Modo Ligação, Deep Link e Fallback Web (Fase 4)', () => {
  beforeEach(async () => {
    await resetLocalDbForTests();
    await useDataStore.getState().hydrate();
    useUiStore.getState().focusChatMessage(null);
  });

  it('handleNotificationAction executa complete, snooze_1h, snooze_10m e open (deep link)', async () => {
    const task = await useDataStore.getState().saveTask({
      scope: 'personal',
      title: 'Ligar para mecânico',
      horizon: 'today',
      due_date: '2026-11-24',
      due_time: '14:00',
      alarm_call_mode: true,
    });

    // 1) Adiar 1h (mantendo cálculo consistente com America/Sao_Paulo)
    await useDataStore.getState().handleNotificationAction({
      action: 'snooze_1h',
      entity_type: 'task',
      entity_id: task.id,
    });
    const snoozed1h = useDataStore.getState().tasks.find((t) => t.id === task.id)!;
    expect(snoozed1h.due_time).not.toBe('14:00');

    // 2) Adiar 10m em MuralNote
    const note = await useDataStore.getState().saveMuralNote({
      body: 'Levar capacete reserva',
      notify_at: '2099-11-24T18:00:00.000Z',
      alarm_call_mode: true,
    });
    await useDataStore.getState().handleNotificationAction({
      action: 'snooze_10m',
      entity_type: 'mural_note',
      entity_id: note.id,
    });
    const snoozedNote = useDataStore
      .getState()
      .muralNotes.find((n) => n.id === note.id)!;
    expect(snoozedNote.notify_at).toBe('2099-11-24T18:10:00.000Z');

    // 3) Concluir tarefa via ação inline
    await useDataStore.getState().handleNotificationAction({
      action: 'complete',
      entity_type: 'task',
      entity_id: task.id,
    });
    expect(useDataStore.getState().tasks.find((t) => t.id === task.id)?.status).toBe(
      'done',
    );

    // 4) Open com deep_link_message_id foca mensagem na Conversa
    const targetMsgId = useDataStore.getState().messages[0].id;
    await useDataStore.getState().handleNotificationAction({
      action: 'open',
      deep_link_message_id: targetMsgId,
    });
    expect(useUiStore.getState().focusedMessageId).toBe(targetMsgId);
    expect(useUiStore.getState().activeMobileTab).toBe('chat');
  });

  it('abstração de plataforma Web executa diagnóstico, permissões, configurações e Share Target sem erros', async () => {
    const diag = await platformAdapter.getNotificationDiagnostics();
    expect(diag.platform).toBe('web');
    expect(diag.exact_alarms_allowed).toBe('not_applicable');
    expect(diag.full_screen_intent_allowed).toBe('not_applicable');
    expect(diag.battery_optimization_ignored).toBe('not_applicable');

    await expect(
      platformAdapter.requestNotificationPermissions(),
    ).resolves.toMatchObject({ platform: 'web' });
    await expect(
      platformAdapter.openSystemNotificationSettings('full_screen'),
    ).resolves.toBeUndefined();

    const received: SharedIncomingPayload[] = [];
    const unsubscribe = platformAdapter.subscribeShareTarget((payload) => {
      received.push(payload);
    });
    emitIncomingShare({
      kind: 'link',
      title: 'Vídeo revisão moto',
      url: 'https://youtu.be/exemplo123',
    });
    unsubscribe();

    expect(received).toHaveLength(1);
    expect(received[0].url).toBe('https://youtu.be/exemplo123');
  });
});
