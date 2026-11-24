import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAllRecords, resetLocalDbForTests } from '@/lib/db/localDb';
import * as assistantService from '@/services/assistantService';
import { evaluateWeeklyCheckin } from '@/services/checkinService';
import { useDataStore } from '@/store/useDataStore';

describe('Áudio Offline com Descarte Pós-Transcrição, Edição e Check-in Semanal (Fase 3)', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetLocalDbForTests();
    await useDataStore.getState().hydrate();
  });

  it('enfileira áudio offline em audio_queue, descarta blob após transcrição e suporta editAudioTranscript', async () => {
    // Simula modo offline ao enviar áudio
    useDataStore.setState((s) => ({
      syncStatus: { ...s.syncStatus, online: false },
    }));

    const fakeAudio = new Blob(['audio-opus-bytes'], { type: 'audio/webm' });
    await useDataStore.getState().sendChatInput({
      audio_blob: fakeAudio,
      audio_duration_seconds: 12,
    });

    expect(useDataStore.getState().pendingAudioCount).toBe(1);
    expect(await getAllRecords('audio_queue')).toHaveLength(1);

    const audioMsg = useDataStore
      .getState()
      .messages.find((m) => m.message_type === 'audio_transcript')!;
    expect(audioMsg).toBeTruthy();
    expect(audioMsg.transcript_editable).toBe(true);

    // Volta online e simula resposta da Edge Function transcrevendo com ruído de obra
    vi.spyOn(assistantService, 'ingestWithAssistant').mockResolvedValueOnce({
      kind: 'response',
      response: {
        status: 'applied',
        transcript: 'Comprar fita isolante',
        reply_text: 'Adicionei à sua Agenda de hoje: "Comprar fita isolante".',
        actions: [
          {
            kind: 'create_task',
            summary: 'Comprar fita isolante',
            confidence: 0.95,
            payload: { title: 'Comprar fita isolante', horizon: 'today', status: 'open' },
          },
        ],
        model_used: 'qwen/qwen3-32b',
      },
    });

    useDataStore.setState((s) => ({
      syncStatus: { ...s.syncStatus, online: true },
    }));
    await useDataStore.getState().flushOfflineQueues();

    // Blob deve ter sido descartado imediatamente após transcrição!
    expect(useDataStore.getState().pendingAudioCount).toBe(0);
    expect(await getAllRecords('audio_queue')).toHaveLength(0);

    const transcribedMsg = useDataStore
      .getState()
      .messages.find((m) => m.id === audioMsg.id)!;
    expect(transcribedMsg.body).toBe('Comprar fita isolante');

    const oldTask = useDataStore
      .getState()
      .tasks.find((t) => t.title === 'Comprar fita isolante' && t.source_message_id === audioMsg.id);
    expect(oldTask).toBeTruthy();

    // Usuário corrige ruído de obra: "Comprar fita veda rosca"
    vi.restoreAllMocks();
    await useDataStore
      .getState()
      .editAudioTranscript(audioMsg.id, 'Comprar fita veda rosca');

    expect(
      useDataStore.getState().messages.find((m) => m.id === audioMsg.id)?.body,
    ).toBe('Comprar fita veda rosca');
    // Tarefa antiga deve ter sido desfeita e substituída pela nova
    expect(
      useDataStore.getState().tasks.some((t) => t.id === oldTask!.id),
    ).toBe(false);
    expect(
      useDataStore.getState().tasks.some((t) => t.title === 'Comprar fita veda rosca'),
    ).toBe(true);
  });

  it('rejeita áudio acima de 90 segundos', async () => {
    const longAudio = new Blob(['x'], { type: 'audio/webm' });
    await expect(
      useDataStore.getState().sendChatInput({
        audio_blob: longAudio,
        audio_duration_seconds: 91,
      }),
    ).rejects.toThrow(/90 segundos/);
  });

  it('dispara check-in semanal quando ativo com medidor está >= 7 dias sem leitura e evita duplicata', async () => {
    const moto = useDataStore
      .getState()
      .assets.find((a) => a.name === 'Minha Moto')!;
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();

    useDataStore.setState((s) => ({
      assets: s.assets.map((a) =>
        a.id === moto.id ? { ...a, meter_updated_at: tenDaysAgo } : a,
      ),
    }));

    const triggered1 = await useDataStore.getState().triggerWeeklyCheckinIfDue();
    expect(triggered1).toBe(true);

    const checkinMsg = useDataStore
      .getState()
      .messages.find((m) => m.message_type === 'checkin');
    expect(checkinMsg).toBeTruthy();
    expect(checkinMsg?.linked_entities[0]?.tab).toBe('cuidados');

    // Na segunda chamada dentro da mesma semana, não deve duplicar
    const triggered2 = await useDataStore.getState().triggerWeeklyCheckinIfDue();
    expect(triggered2).toBe(false);

    // Também não dispara durante pausa ativa
    const pausedCheck = evaluateWeeklyCheckin({
      assets: useDataStore.getState().assets,
      messages: [],
      pauseActive: true,
      timezone: 'America/Sao_Paulo',
    });
    expect(pausedCheck).toBeNull();
  });
});
