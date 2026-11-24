import { computeNextAnnualDate } from '@/lib/domain/careEngine';
import { computeNextFixedWeekdayDate } from '@/lib/domain/routineEngine';
import { addDaysToIsoDate, getLocalDateString, resolveTimezone } from '@/lib/timezone';
import { createUuid } from '@/lib/uuid';
import { getAllRecords, getMeta, putRecords, setMeta } from './localDb';
import type {
  Asset,
  CareRule,
  ChatMessage,
  HouseRoutine,
  MuralNote,
  Task,
  UserProfile,
  VaultItem,
} from '@/types';

const INITIAL_SEED_META_KEY = 'initial_seed_v1';

/**
 * Semeia um conjunto enxuto e realista no primeiro boot vazio.
 * Usa flag persistida para nunca recriar itens que o usuário apagar depois.
 */
export async function ensureInitialSeedData(profile: UserProfile): Promise<void> {
  const alreadySeeded = await getMeta<boolean>(INITIAL_SEED_META_KEY);
  if (alreadySeeded) return;

  // Se já existirem dados locais (ex: sincronizados da nuvem), apenas marca a flag
  const [existingTasks, existingAssets, existingMessages, existingVault] =
    await Promise.all([
      getAllRecords('tasks'),
      getAllRecords('assets'),
      getAllRecords('chat_messages'),
      getAllRecords('vault_items'),
    ]);

  if (
    existingTasks.length > 0 ||
    existingAssets.length > 0 ||
    existingMessages.length > 0 ||
    existingVault.length > 0
  ) {
    await setMeta(INITIAL_SEED_META_KEY, true);
    return;
  }

  const now = new Date();
  const tz = resolveTimezone(profile.timezone);
  const todayIso = getLocalDateString(now, tz);
  const createdAt = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
  const ownerId = profile.id;
  const householdId = profile.household_id ?? null;

  const taskToday1Id = createUuid();
  const taskToday2Id = createUuid();
  const taskOverdueId = createUuid();
  const taskWaitingId = createUuid();

  const tasks: Task[] = [
    {
      id: taskToday1Id,
      owner_id: ownerId,
      household_id: null,
      scope: 'personal',
      title: 'Confirmar horário da revisão da moto',
      notes: 'Ligar para a oficina antes das 17h',
      horizon: 'today',
      status: 'open',
      assigned_to: 'me',
      assigned_user_id: ownerId,
      due_date: todayIso,
      due_time: '15:00',
      waiting_remind_at: null,
      alarm_call_mode: false,
      completed_at: null,
      source_message_id: null,
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
    },
    {
      id: taskToday2Id,
      owner_id: ownerId,
      household_id: null,
      scope: 'personal',
      title: 'Separar documento da garantia do ar-condicionado',
      notes: null,
      horizon: 'today',
      status: 'open',
      assigned_to: 'me',
      assigned_user_id: ownerId,
      due_date: todayIso,
      due_time: null,
      waiting_remind_at: null,
      alarm_call_mode: false,
      completed_at: null,
      source_message_id: null,
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
    },
    {
      id: taskOverdueId,
      owner_id: ownerId,
      household_id: null,
      scope: 'personal',
      title: 'Comprar fita isolante e lâmpada da varanda',
      notes: 'Item de dia anterior para revisar com calma',
      horizon: 'today',
      status: 'open',
      assigned_to: 'me',
      assigned_user_id: ownerId,
      due_date: addDaysToIsoDate(todayIso, -2),
      due_time: null,
      waiting_remind_at: null,
      alarm_call_mode: false,
      completed_at: null,
      source_message_id: null,
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
    },
    {
      id: taskWaitingId,
      owner_id: ownerId,
      household_id: null,
      scope: 'personal',
      title: 'Aguardando orçamento do eletricista',
      notes: 'Combinado retorno até sexta',
      horizon: 'today',
      status: 'waiting',
      assigned_to: 'me',
      assigned_user_id: ownerId,
      due_date: todayIso,
      due_time: null,
      waiting_remind_at: new Date(now.getTime() + 2 * 86_400_000).toISOString(),
      alarm_call_mode: false,
      completed_at: null,
      source_message_id: null,
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
    },
  ];

  const muralNotes: MuralNote[] = [
    {
      id: createUuid(),
      owner_id: ownerId,
      household_id: householdId,
      author_id: ownerId,
      recipient_id: null,
      body: 'Hoje passo na loja de materiais antes de voltar para casa.',
      notify_at: new Date(now.getTime() + 4 * 3_600_000).toISOString(),
      alarm_call_mode: false,
      status: 'scheduled',
      source_message_id: null,
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
    },
  ];

  const houseRoutines: HouseRoutine[] = [
    {
      id: createUuid(),
      owner_id: ownerId,
      household_id: householdId,
      created_by: ownerId,
      title: 'Colocar lixo na rua',
      mode: 'fixed_weekdays',
      weekdays: [1, 3, 5],
      cycle_days: null,
      assigned_to: 'me',
      assigned_user_id: ownerId,
      next_due_date: computeNextFixedWeekdayDate([1, 3, 5], todayIso, {
        includeSameDay: true,
      }),
      last_completed_at: null,
      recent_completions: [],
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
    },
    {
      id: createUuid(),
      owner_id: ownerId,
      household_id: householdId,
      created_by: ownerId,
      title: 'Limpar filtro do purificador de água',
      mode: 'cyclic_days',
      weekdays: null,
      cycle_days: 30,
      assigned_to: 'both',
      assigned_user_id: null,
      next_due_date: addDaysToIsoDate(todayIso, 5),
      last_completed_at: null,
      recent_completions: [],
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
    },
  ];

  const motoAssetId = createUuid();
  const acAssetId = createUuid();
  const sharedAssetScope = householdId ? 'shared' : 'personal';

  const assets: Asset[] = [
    {
      id: motoAssetId,
      owner_id: ownerId,
      household_id: null,
      scope: 'personal',
      name: 'Minha Moto',
      category: 'vehicle',
      meter_unit: 'km',
      current_meter: 34200,
      meter_updated_at: createdAt,
      purchased_at: null,
      warranty_expires_at: null,
      receipt_path: null,
      notes: 'Óleo 10W30 a cada 1.500 km',
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
    },
    {
      id: acAssetId,
      owner_id: ownerId,
      household_id: householdId,
      scope: sharedAssetScope,
      name: 'Ar-condicionado da Sala',
      category: 'appliance',
      meter_unit: 'none',
      current_meter: null,
      meter_updated_at: null,
      purchased_at: addDaysToIsoDate(todayIso, -347),
      warranty_expires_at: addDaysToIsoDate(todayIso, 18),
      receipt_path: null,
      notes: 'Garantia de 12 meses com nota fiscal',
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
    },
  ];

  const careRules: CareRule[] = [
    {
      id: createUuid(),
      asset_id: motoAssetId,
      owner_id: ownerId,
      household_id: null,
      scope: 'personal',
      title: 'Troca de óleo',
      trigger_type: 'meter',
      interval_days: null,
      interval_meter: 1500,
      annual_month: null,
      annual_day: null,
      last_done_at: addDaysToIsoDate(todayIso, -40) + 'T14:00:00.000Z',
      last_done_meter: 33000,
      next_due_date: null,
      next_due_meter: 34500,
      service_history: [
        {
          id: createUuid(),
          performed_at: addDaysToIsoDate(todayIso, -40) + 'T14:00:00.000Z',
          meter_value: 33000,
          workshop_or_parts: 'Oficina Central — Óleo 10W30 + filtro',
          cost_note: 'R$ 95,00',
        },
      ],
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
    },
    {
      id: createUuid(),
      asset_id: motoAssetId,
      owner_id: ownerId,
      household_id: null,
      scope: 'personal',
      title: 'Licenciamento anual',
      trigger_type: 'annual_date',
      interval_days: null,
      interval_meter: null,
      annual_month: 8,
      annual_day: 20,
      last_done_at: null,
      last_done_meter: null,
      next_due_date: computeNextAnnualDate(8, 20, todayIso, { allowSameDay: true }),
      next_due_meter: null,
      service_history: [],
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
    },
    {
      id: createUuid(),
      asset_id: acAssetId,
      owner_id: ownerId,
      household_id: householdId,
      scope: sharedAssetScope,
      title: 'Limpar filtro de ar',
      trigger_type: 'flexible_days',
      interval_days: 60,
      interval_meter: null,
      annual_month: null,
      annual_day: null,
      last_done_at: addDaysToIsoDate(todayIso, -52) + 'T12:00:00.000Z',
      last_done_meter: null,
      next_due_date: addDaysToIsoDate(todayIso, 8),
      next_due_meter: null,
      service_history: [],
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
    },
  ];

  const vaultItems: VaultItem[] = [
    {
      id: createUuid(),
      owner_id: ownerId,
      category: 'print',
      title: 'Comprovante de garantia do ar-condicionado',
      url: null,
      body: 'Print salvo sem alterações',
      media_path: null,
      source_message_id: null,
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
    },
    {
      id: createUuid(),
      owner_id: ownerId,
      category: 'link',
      title: 'Tabela de calibragem e torque da moto',
      url: 'https://exemplo.meu-dia.app/manual-moto',
      body: 'Referência rápida para manutenção',
      media_path: null,
      source_message_id: null,
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
    },
    {
      id: createUuid(),
      owner_id: ownerId,
      category: 'work',
      title: 'Checklist de entrega da obra',
      url: null,
      body: 'Conferir disjuntores, tomadas 20A e vedação da área externa.',
      media_path: null,
      source_message_id: null,
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
    },
  ];

  const msg1Time = new Date(now.getTime() - 120 * 60 * 1000).toISOString();
  const msg2Time = new Date(now.getTime() - 90 * 60 * 1000).toISOString();
  const msg3Time = new Date(now.getTime() - 89 * 60 * 1000).toISOString();

  const messages: ChatMessage[] = [
    {
      id: createUuid(),
      user_id: ownerId,
      sender: 'assistant',
      message_type: 'text',
      body: 'Tudo pronto por aqui. Pode mandar uma tarefa, um link, um print ou a quilometragem da moto — eu organizo na hora, mesmo offline.',
      media_path: null,
      actions_payload: [],
      clarification_payload: null,
      linked_entities: [],
      created_at: msg1Time,
      updated_at: msg1Time,
      deleted_at: null,
    },
    {
      id: createUuid(),
      user_id: ownerId,
      sender: 'user',
      message_type: 'text',
      body: 'Confirmar horário da revisão da moto',
      media_path: null,
      actions_payload: [],
      clarification_payload: null,
      linked_entities: [],
      created_at: msg2Time,
      updated_at: msg2Time,
      deleted_at: null,
    },
    {
      id: createUuid(),
      user_id: ownerId,
      sender: 'assistant',
      message_type: 'text',
      body: 'Adicionei à sua Agenda de hoje: "Confirmar horário da revisão da moto".',
      media_path: null,
      actions_payload: [
        {
          kind: 'create_task',
          summary: 'Criar tarefa para hoje',
          confidence: 1,
          payload: { task_id: taskToday1Id, horizon: 'today' },
        },
      ],
      clarification_payload: null,
      linked_entities: [
        {
          entity_type: 'task',
          entity_id: taskToday1Id,
          tab: 'agenda',
          agenda_horizon: 'today',
          label: 'Confirmar horário da revisão da moto',
          live_state: 'open',
          can_undo: true,
        },
      ],
      created_at: msg3Time,
      updated_at: msg3Time,
      deleted_at: null,
    },
  ];

  await Promise.all([
    putRecords('tasks', tasks),
    putRecords('mural_notes', muralNotes),
    putRecords('house_routines', houseRoutines),
    putRecords('assets', assets),
    putRecords('care_rules', careRules),
    putRecords('vault_items', vaultItems),
    putRecords('chat_messages', messages),
  ]);

  await setMeta(INITIAL_SEED_META_KEY, true);
}
