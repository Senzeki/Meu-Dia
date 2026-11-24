import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { putRecord, resetLocalDbForTests } from '@/lib/db/localDb';
import * as bridgeService from '@/services/bridgeService';
import { useDataStore } from '@/store/useDataStore';
import type { ChatMessage, PassatemposSearchCandidate } from '@/types';

describe('Pontes Opcionais Desacopladas: Rotinas de Casa e Passatempos (Fase 4)', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetLocalDbForTests();
    await useDataStore.getState().hydrate();
  });

  it('degrada graciosamente quando offline ou sem integração configurada', async () => {
    const marketRes = await bridgeService.sendMarketItemToRotinas('arroz', null);
    expect(marketRes.configured).toBe(false);
    expect(marketRes.sent).toBe(false);

    const searchRes = await bridgeService.searchPassatemposCandidates('Matrix', null);
    expect(searchRes.configured).toBe(false);
    expect(searchRes.candidates).toEqual([]);

    const enqueueRes = await bridgeService.enqueuePassatemposCandidate(
      { external_id: 'tt0133093', title: 'Matrix', kind: 'movie', year: 1999 },
      null,
    );
    expect(enqueueRes.configured).toBe(false);
    expect(enqueueRes.queued).toBe(false);
  });

  it('envia item ao Rotinas de Casa e limita busca no Passatempos a 3 candidatos quando autenticado', async () => {
    const mockClient = {
      auth: {
        getSession: async () => ({
          data: { session: { access_token: 'jwt-valid' } },
        }),
      },
      functions: {
        invoke: vi.fn(async (fnName: string, options: { body: Record<string, unknown> }) => {
          if (fnName === 'bridge-rotinas') {
            return {
              data: {
                configured: true,
                sent: true,
                item_name: options.body.item_name,
                message: 'Enviado',
              },
              error: null,
            };
          }
          if (fnName === 'bridge-passatempos' && options.body.action === 'search') {
            return {
              data: {
                configured: true,
                query: options.body.query,
                candidates: [
                  { external_id: '1', title: 'Duna', kind: 'movie', year: 2021 },
                  { external_id: '2', title: 'Duna: Parte 2', kind: 'movie', year: 2024 },
                  { external_id: '3', title: 'Duna (1984)', kind: 'movie', year: 1984 },
                  { external_id: '4', title: 'Extra ignorado', kind: 'movie', year: 2000 },
                ],
              },
              error: null,
            };
          }
          return { data: null, error: null };
        }),
      },
    } as unknown as SupabaseClient;

    const market = await bridgeService.sendMarketItemToRotinas('café', mockClient);
    expect(market.configured).toBe(true);
    expect(market.sent).toBe(true);

    const search = await bridgeService.searchPassatemposCandidates('Duna', mockClient);
    expect(search.configured).toBe(true);
    expect(search.candidates).toHaveLength(3);
  });

  it('confirmPassatemposCandidate confirma escolha na bolha do chat e marca vínculo como concluído', async () => {
    const candidate: PassatemposSearchCandidate = {
      external_id: 'tt1160419',
      title: 'Duna',
      kind: 'movie',
      year: 2021,
    };

    const msgId = 'msg-passatempos-1';
    const nowIso = new Date().toISOString();
    const msg: ChatMessage = {
      id: msgId,
      user_id: '00000000-0000-4000-8000-000000000001',
      sender: 'assistant',
      message_type: 'text',
      body: 'Encontrei estas opções no Passatempos:',
      media_path: null,
      actions_payload: [
        {
          kind: 'bridge_passatempos_search',
          summary: 'Buscar "Duna" no Passatempos',
          confidence: 0.95,
          payload: {
            query: 'Duna',
            candidates: [candidate],
          },
        },
      ],
      clarification_payload: null,
      linked_entities: [
        {
          entity_type: 'external_media',
          entity_id: 'ext-media-1',
          tab: 'guardados',
          label: 'Passatempos: Duna',
          live_state: 'open',
          can_undo: false,
        },
      ],
      created_at: nowIso,
      updated_at: nowIso,
      deleted_at: null,
    };

    await putRecord('chat_messages', msg);
    useDataStore.setState((s) => ({ messages: [...s.messages, msg] }));

    vi.spyOn(bridgeService, 'enqueuePassatemposCandidate').mockResolvedValueOnce({
      configured: true,
      queued: true,
      title: 'Duna',
      message: '"Duna" enviado para a caixa de entrada do Passatempos.',
    });

    await useDataStore.getState().confirmPassatemposCandidate(msgId, candidate);

    const updated = useDataStore.getState().messages.find((m) => m.id === msgId)!;
    expect(updated.actions_payload[0].payload.queued).toBe(true);
    expect(updated.actions_payload[0].payload.confirmed_external_id).toBe('tt1160419');
    expect(updated.linked_entities[0].live_state).toBe('done');
  });
});
