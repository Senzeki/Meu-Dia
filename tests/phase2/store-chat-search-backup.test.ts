import { beforeEach, describe, expect, it } from 'vitest';
import {
  getAllRecords,
  putRecords,
  resetLocalDbForTests,
  setMeta,
} from '@/lib/db/localDb';
import { useDataStore } from '@/store/useDataStore';
import type { ChatMessage } from '@/types';

const USER_ID = '00000000-0000-4000-8000-000000000001';

describe('Store Local-First: Paginação, Predição O(1), Vínculos Vivos, Busca e Backup', () => {
  beforeEach(async () => {
    await resetLocalDbForTests();
  });

  it('pagina mensagens em lotes de ~50 mais recentes e carrega anteriores com loadOlderMessages', async () => {
    await setMeta('initial_seed_v1', true);
    const total = 120;
    const baseMs = Date.parse('2026-11-20T10:00:00.000Z');
    const seededMessages: ChatMessage[] = Array.from({ length: total }, (_, idx) => {
      const ts = new Date(baseMs + idx * 60_000).toISOString();
      return {
        id: `msg-${String(idx).padStart(3, '0')}`,
        user_id: USER_ID,
        sender: idx % 2 === 0 ? 'user' : 'assistant',
        message_type: 'text',
        body: `Mensagem ${idx}`,
        media_path: null,
        actions_payload: [],
        clarification_payload: null,
        linked_entities: [],
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      };
    });
    await putRecords('chat_messages', seededMessages);

    await useDataStore.getState().hydrate();
    expect(useDataStore.getState().messages).toHaveLength(50);
    expect(useDataStore.getState().hasOlderMessages).toBe(true);
    expect(useDataStore.getState().messages[0].body).toBe('Mensagem 70');
    expect(useDataStore.getState().messages[49].body).toBe('Mensagem 119');

    const loadedBatch1 = await useDataStore.getState().loadOlderMessages();
    expect(loadedBatch1).toBe(50);
    expect(useDataStore.getState().messages).toHaveLength(100);
    expect(useDataStore.getState().hasOlderMessages).toBe(true);
    expect(useDataStore.getState().messages[0].body).toBe('Mensagem 20');

    const loadedBatch2 = await useDataStore.getState().loadOlderMessages();
    expect(loadedBatch2).toBe(20);
    expect(useDataStore.getState().messages).toHaveLength(120);
    expect(useDataStore.getState().hasOlderMessages).toBe(false);
    expect(useDataStore.getState().messages[0].body).toBe('Mensagem 0');
  });

  it('predição local O(1) classifica imagem, URL, km da moto, aguardando e texto comum offline', async () => {
    await useDataStore.getState().hydrate();

    // 1) Print/imagem -> Guardados (print intacto) + blob local offline
    const fakeImg = new Blob(['png-bytes'], { type: 'image/png' });
    await useDataStore.getState().sendChatInput({
      image_blob: fakeImg,
      image_title: 'Print da garantia',
    });
    const printVault = useDataStore
      .getState()
      .vaultItems.find((v) => v.title === 'Print da garantia');
    expect(printVault?.category).toBe('print');
    expect(printVault?.media_path).toBeTruthy();
    expect((await getAllRecords('media_blobs')).length).toBeGreaterThanOrEqual(1);
    expect(useDataStore.getState().syncStatus.pending_uploads).toBeGreaterThanOrEqual(1);

    // 2) URL -> Guardados (link)
    await useDataStore.getState().sendChatInput({
      text: 'Manual de peças https://meu-dia.app/manual-cg160',
    });
    const linkVault = useDataStore
      .getState()
      .vaultItems.find((v) => v.url === 'https://meu-dia.app/manual-cg160');
    expect(linkVault?.category).toBe('link');
    expect(linkVault?.title).toBe('Manual de peças');

    // 3) Medição direta de km -> atualiza Minha Moto em Cuidados
    await useDataStore.getState().sendChatInput({ text: '34.500 km' });
    const moto = useDataStore.getState().assets.find((a) => a.name === 'Minha Moto');
    expect(moto?.current_meter).toBe(34500);

    await useDataStore.getState().sendChatInput({ text: 'moto 34850' });
    const motoUpdated = useDataStore.getState().assets.find((a) => a.name === 'Minha Moto');
    expect(motoUpdated?.current_meter).toBe(34850);

    // 4) "aguardando ..." -> Task em Agenda (status waiting com waiting_remind_at +2d)
    await useDataStore.getState().sendChatInput({
      text: 'Aguardando retorno da oficina sobre o pneu',
    });
    const waitingTask = useDataStore
      .getState()
      .tasks.find((t) => t.title === 'Aguardando retorno da oficina sobre o pneu');
    expect(waitingTask?.status).toBe('waiting');
    expect(waitingTask?.horizon).toBe('today');
    expect(waitingTask?.waiting_remind_at).toBeTruthy();

    // 5) Texto comum -> Task em Agenda hoje (status open)
    await useDataStore.getState().sendChatInput({ text: 'Comprar abraçadeira' });
    const openTask = useDataStore
      .getState()
      .tasks.find((t) => t.title === 'Comprar abraçadeira');
    expect(openTask?.status).toBe('open');
    expect(openTask?.horizon).toBe('today');
  });

  it('reflete live_state em tempo real e executa undoOrRedirectMessageAction', async () => {
    await useDataStore.getState().hydrate();

    // Cria tarefa via chat
    await useDataStore.getState().sendChatInput({ text: 'Revisar orçamento da calha' });
    const assistantMsg = useDataStore
      .getState()
      .messages.slice()
      .reverse()
      .find((m) => m.sender === 'assistant' && m.linked_entities.length > 0)!;
    const taskId = assistantMsg.linked_entities[0].entity_id;

    expect(useDataStore.getState().getLinkedEntityLiveState('task', taskId)).toBe('open');

    // Concluir tarefa muda estado vivo para 'done'
    await useDataStore.getState().setTaskStatus(taskId, 'done');
    expect(useDataStore.getState().getLinkedEntityLiveState('task', taskId)).toBe('done');

    // Redirecionar tarefa para horizonte 'week'
    await useDataStore
      .getState()
      .undoOrRedirectMessageAction(assistantMsg.id, {
        kind: 'move_task_horizon',
        horizon: 'week',
      });
    expect(
      useDataStore.getState().tasks.find((t) => t.id === taskId)?.horizon,
    ).toBe('week');

    // Redirecionar para Casa (vira recado no Mural e remove a tarefa antiga)
    await useDataStore
      .getState()
      .undoOrRedirectMessageAction(assistantMsg.id, { kind: 'move_to_casa' });
    expect(useDataStore.getState().getLinkedEntityLiveState('task', taskId)).toBe('removed');
    const msgAfterCasa = useDataStore
      .getState()
      .messages.find((m) => m.id === assistantMsg.id)!;
    expect(msgAfterCasa.linked_entities[0].entity_type).toBe('mural_note');
    expect(msgAfterCasa.linked_entities[0].tab).toBe('casa');

    // Redirecionar para Guardados (estudos)
    await useDataStore.getState().undoOrRedirectMessageAction(assistantMsg.id, {
      kind: 'move_to_vault',
      category: 'study',
    });
    const msgAfterVault = useDataStore
      .getState()
      .messages.find((m) => m.id === assistantMsg.id)!;
    expect(msgAfterVault.linked_entities[0].entity_type).toBe('vault_item');
    const movedVaultId = msgAfterVault.linked_entities[0].entity_id;
    expect(
      useDataStore.getState().vaultItems.find((v) => v.id === movedVaultId)?.category,
    ).toBe('study');

    // Desfazer (undo_delete) remove item vinculado e marca live_state = 'removed'
    await useDataStore
      .getState()
      .undoOrRedirectMessageAction(assistantMsg.id, { kind: 'undo_delete' });
    expect(
      useDataStore.getState().getLinkedEntityLiveState('vault_item', movedVaultId),
    ).toBe('removed');

    // Desfazer atualização de km restaura medição anterior sem apagar o ativo
    await useDataStore.getState().sendChatInput({ text: '35.100 km' });
    const meterMsg = useDataStore
      .getState()
      .messages.slice()
      .reverse()
      .find((m) => m.sender === 'assistant' && m.linked_entities[0]?.entity_type === 'asset')!;
    expect(
      useDataStore.getState().assets.find((a) => a.name === 'Minha Moto')?.current_meter,
    ).toBe(35100);

    await useDataStore
      .getState()
      .undoOrRedirectMessageAction(meterMsg.id, { kind: 'undo_delete' });
    const motoRestored = useDataStore
      .getState()
      .assets.find((a) => a.name === 'Minha Moto');
    expect(motoRestored?.current_meter).toBe(34200);
    expect(
      useDataStore.getState().getLinkedEntityLiveState('asset', motoRestored!.id),
    ).toBe('open');
  });

  it('searchAll busca sem acento/maiúsculas em todas as áreas e exportBackupJson gera payload completo', async () => {
    await useDataStore.getState().hydrate();

    // Busca sem acento para encontrar "Troca de óleo" e "Ar-condicionado" / "lâmpada"
    const oilMatches = useDataStore.getState().searchAll('OLEO');
    expect(oilMatches.some((r) => r.area === 'cuidados' && r.title === 'Troca de óleo')).toBe(
      true,
    );

    const lampMatches = useDataStore.getState().searchAll('lampada');
    expect(lampMatches.some((r) => r.area === 'agenda')).toBe(true);

    // Excluir uma tarefa e garantir que não aparece na busca nem no backup
    const targetTask = useDataStore.getState().tasks[0];
    await useDataStore.getState().deleteTask(targetTask.id);

    const backup = await useDataStore.getState().exportBackupJson();
    expect(backup.app).toBe('Meu Dia');
    expect(backup.schema_version).toBe(1);
    expect(backup.timezone).toBe('America/Sao_Paulo');
    expect(backup.tasks.some((t) => t.id === targetTask.id)).toBe(false);
    expect(backup.assets.some((a) => a.name === 'Minha Moto')).toBe(true);
    expect(backup.house_routines.length).toBeGreaterThanOrEqual(2);
    expect(backup.mural_notes.length).toBeGreaterThanOrEqual(1);
    expect(backup.care_rules.length).toBeGreaterThanOrEqual(3);
    expect(backup.vault_items.length).toBeGreaterThanOrEqual(3);
    expect(backup.recent_messages.length).toBeGreaterThanOrEqual(3);
  });
});
