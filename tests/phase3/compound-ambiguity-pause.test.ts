import { beforeEach, describe, expect, it } from 'vitest';
import { resetLocalDbForTests } from '@/lib/db/localDb';
import { analyzeChatTextLocally } from '@/lib/domain/localPredictor';
import { useAuthStore } from '@/store/useAuthStore';
import { useDataStore } from '@/store/useDataStore';

describe('Multi-intenção, Ambiguidade (needs_clarification) e Pausas Naturais (Fase 3)', () => {
  beforeEach(async () => {
    await resetLocalDbForTests();
    await useDataStore.getState().hydrate();
  });

  it('processa frase composta com 2 motos ("34.500 a minha e 18.400 a dela") sem ambiguidade', async () => {
    const minhaMoto = useDataStore
      .getState()
      .assets.find((a) => a.name === 'Minha Moto')!;
    const motoEsposa = await useDataStore.getState().saveAsset({
      scope: 'personal',
      name: 'Moto da Esposa',
      category: 'vehicle',
      meter_unit: 'km',
      current_meter: 18000,
    });

    await useDataStore.getState().sendChatInput({
      text: '34.500 a minha e 18.400 a dela',
    });

    const updatedMinha = useDataStore
      .getState()
      .assets.find((a) => a.id === minhaMoto.id);
    const updatedEsposa = useDataStore
      .getState()
      .assets.find((a) => a.id === motoEsposa.id);

    expect(updatedMinha?.current_meter).toBe(34500);
    expect(updatedEsposa?.current_meter).toBe(18400);

    const lastAssistant = useDataStore
      .getState()
      .messages.slice()
      .reverse()
      .find((m) => m.sender === 'assistant')!;
    expect(lastAssistant.linked_entities).toHaveLength(2);
  });

  it('processa frase composta multi-intenção (km + mural com horário BRT + mercado)', async () => {
    await useDataStore.getState().sendChatInput({
      text: 'moto 34.500 e avisar esposa às 15:00: tirar roupa do varal e tá acabando o arroz',
    });

    const moto = useDataStore
      .getState()
      .assets.find((a) => a.name === 'Minha Moto');
    expect(moto?.current_meter).toBe(34500);

    const muralNote = useDataStore
      .getState()
      .muralNotes.find((n) => n.body.toLowerCase().includes('tirar roupa do varal'));
    expect(muralNote).toBeTruthy();
    expect(muralNote?.notify_at).toBeTruthy();

    const lastAssistant = useDataStore
      .getState()
      .messages.slice()
      .reverse()
      .find((m) => m.sender === 'assistant')!;
    expect(lastAssistant.linked_entities.some((e) => e.entity_type === 'asset')).toBe(
      true,
    );
    expect(lastAssistant.linked_entities.some((e) => e.entity_type === 'mural_note')).toBe(
      true,
    );
    expect(
      lastAssistant.linked_entities.some(
        (e) =>
          e.entity_type === 'external_market' &&
          e.label.toLowerCase().includes('arroz'),
      ),
    ).toBe(true);
  });

  it('retorna needs_clarification em ambiguidade real ("moto 34.500" com 2 motos) e aplica escolha com resolveClarification', async () => {
    const motoEsposa = await useDataStore.getState().saveAsset({
      scope: 'personal',
      name: 'Moto da Esposa',
      category: 'vehicle',
      meter_unit: 'km',
      current_meter: 18000,
    });

    await useDataStore.getState().sendChatInput({ text: 'moto 34.500' });

    const assistantMsg = useDataStore
      .getState()
      .messages.slice()
      .reverse()
      .find((m) => m.sender === 'assistant')!;
    expect(assistantMsg.clarification_payload).toBeTruthy();
    expect(assistantMsg.clarification_payload?.resolved).toBe(false);
    expect(assistantMsg.clarification_payload?.options.length).toBe(2);

    // Nenhuma moto deve ter sido alterada antes da escolha
    expect(
      useDataStore.getState().assets.find((a) => a.id === motoEsposa.id)?.current_meter,
    ).toBe(18000);

    const optionForEsposa = assistantMsg.clarification_payload!.options.find((opt) =>
      opt.label.includes('Moto da Esposa'),
    )!;
    await useDataStore
      .getState()
      .resolveClarification(assistantMsg.id, optionForEsposa.id);

    const resolvedMsg = useDataStore
      .getState()
      .messages.find((m) => m.id === assistantMsg.id)!;
    expect(resolvedMsg.clarification_payload?.resolved).toBe(true);
    expect(resolvedMsg.clarification_payload?.selected_option_id).toBe(
      optionForEsposa.id,
    );
    expect(resolvedMsg.linked_entities.some((l) => l.entity_id === motoEsposa.id)).toBe(
      true,
    );
    expect(
      useDataStore.getState().assets.find((a) => a.id === motoEsposa.id)?.current_meter,
    ).toBe(34500);
  });

  it('detecta ambiguidade em "limpar filtro" quando existem >= 2 regras compatíveis', () => {
    const acAsset = useDataStore
      .getState()
      .assets.find((a) => a.name.includes('Ar-condicionado'))!;
    const res = analyzeChatTextLocally({
      text: 'limpar filtro',
      assets: useDataStore.getState().assets,
      careRules: [
        ...useDataStore.getState().careRules,
        {
          id: 'rule-filtro-2',
          asset_id: acAsset.id,
          owner_id: acAsset.owner_id,
          household_id: null,
          scope: 'personal',
          title: 'Trocar filtro do purificador',
          trigger_type: 'flexible_days',
          interval_days: 30,
          interval_meter: null,
          annual_month: null,
          annual_day: null,
          last_done_at: null,
          last_done_meter: null,
          next_due_date: '2026-12-01',
          next_due_meter: null,
          service_history: [],
          created_at: '2026-11-01T12:00:00.000Z',
          updated_at: '2026-11-01T12:00:00.000Z',
          deleted_at: null,
        },
      ],
      timezone: 'America/Sao_Paulo',
    });

    expect(res.status).toBe('needs_clarification');
    expect(res.clarification?.options.length).toBeGreaterThanOrEqual(2);
  });

  it('interpreta pedido natural de pausa ("quero 4 dias de pausa essa semana às 21h") e atualiza pause_preferences', async () => {
    await useDataStore.getState().sendChatInput({
      text: 'quero 4 dias de pausa essa semana às 21h',
    });

    const prefs = useAuthStore.getState().profile.pause_preferences;
    expect(prefs.weekdays).toHaveLength(4);
    expect(prefs.start_time).toBe('21:00');
  });
});
