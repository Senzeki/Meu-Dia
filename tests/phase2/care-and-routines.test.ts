import { describe, expect, it } from 'vitest';
import {
  applyCareRuleCompletion,
  computeNextAnnualDate,
  getUpcomingWarrantyAlertsForAssets,
} from '@/lib/domain/careEngine';
import {
  applyHouseRoutineCompletion,
  computeNextFixedWeekdayDate,
} from '@/lib/domain/routineEngine';
import type { Asset, CareRule, HouseRoutine } from '@/types';

const USER_ID = '00000000-0000-4000-8000-000000000001';

describe('Motor de Cuidados e Rotinas da Casa (Fase 2)', () => {
  it('flexible_days reinicia sempre a partir da data real de conclusão em America/Sao_Paulo', () => {
    const rule: CareRule = {
      id: 'rule-flex-1',
      asset_id: 'asset-ac-1',
      owner_id: USER_ID,
      household_id: null,
      scope: 'personal',
      title: 'Limpar filtro do ar',
      trigger_type: 'flexible_days',
      interval_days: 60,
      interval_meter: null,
      annual_month: null,
      annual_day: null,
      last_done_at: null,
      last_done_meter: null,
      // Data prevista antiga era 2026-11-10, mas o usuário concluiu em 2026-11-23 às 22:30 BRT (2026-11-24T01:30Z)
      next_due_date: '2026-11-10',
      next_due_meter: null,
      service_history: [],
      created_at: '2026-09-01T12:00:00.000Z',
      updated_at: '2026-09-01T12:00:00.000Z',
      deleted_at: null,
    };

    const result = applyCareRuleCompletion({
      rule,
      asset: null,
      input: {
        rule_id: rule.id,
        performed_at: '2026-11-24T01:30:00.000Z', // 23/11 em America/Sao_Paulo
      },
      timezone: 'America/Sao_Paulo',
    });

    // 2026-11-23 + 60 dias = 2027-01-22 (nunca baseado em 2026-11-10)
    expect(result.rule.next_due_date).toBe('2027-01-22');
    expect(result.rule.service_history).toHaveLength(1);
  });

  it('meter recalcula next_due_meter, registra histórico e só atualiza asset.current_meter se confirmado for maior', () => {
    const asset: Asset = {
      id: 'asset-moto-1',
      owner_id: USER_ID,
      household_id: null,
      scope: 'personal',
      name: 'Minha Moto',
      category: 'vehicle',
      meter_unit: 'km',
      current_meter: 34200,
      meter_updated_at: '2026-11-20T12:00:00.000Z',
      purchased_at: null,
      warranty_expires_at: null,
      receipt_path: null,
      notes: null,
      created_at: '2026-01-01T12:00:00.000Z',
      updated_at: '2026-11-20T12:00:00.000Z',
      deleted_at: null,
    };

    const rule: CareRule = {
      id: 'rule-oil-1',
      asset_id: asset.id,
      owner_id: USER_ID,
      household_id: null,
      scope: 'personal',
      title: 'Troca de óleo',
      trigger_type: 'meter',
      interval_days: null,
      interval_meter: 1500,
      annual_month: null,
      annual_day: null,
      last_done_at: null,
      last_done_meter: 33000,
      next_due_date: null,
      next_due_meter: 34500,
      service_history: [],
      created_at: '2026-01-01T12:00:00.000Z',
      updated_at: '2026-01-01T12:00:00.000Z',
      deleted_at: null,
    };

    // Caso 1: confirmed_meter maior (34620 > 34200) -> atualiza asset.current_meter
    const res1 = applyCareRuleCompletion({
      rule,
      asset,
      input: {
        rule_id: rule.id,
        confirmed_meter: 34620,
        workshop_or_parts: 'Oficina Moto Sul - Óleo 10W30',
        cost_note: 'R$ 98,00',
        performed_at: '2026-11-23T15:00:00.000Z',
      },
      timezone: 'America/Sao_Paulo',
    });

    expect(res1.rule.next_due_meter).toBe(36120);
    expect(res1.rule.last_done_meter).toBe(34620);
    expect(res1.rule.service_history[0]).toMatchObject({
      performed_at: '2026-11-23T15:00:00.000Z',
      meter_value: 34620,
      workshop_or_parts: 'Oficina Moto Sul - Óleo 10W30',
      cost_note: 'R$ 98,00',
    });
    expect(res1.asset?.current_meter).toBe(34620);

    // Caso 2: registro retroativo com confirmed_meter menor (34100 < 34620) -> mantém current_meter em 34620
    const res2 = applyCareRuleCompletion({
      rule: res1.rule,
      asset: res1.asset,
      input: {
        rule_id: rule.id,
        confirmed_meter: 34100,
        performed_at: '2026-11-24T12:00:00.000Z',
      },
      timezone: 'America/Sao_Paulo',
    });

    expect(res2.rule.next_due_meter).toBe(35600);
    expect(res2.asset?.current_meter).toBe(34620);
    expect(res2.rule.service_history).toHaveLength(2);
  });

  it('annual_date calcula próxima data anual respeitando anos bissextos e não bissextos (29/02 -> 28/02)', () => {
    // 2027 não é bissexto -> 29/02 vira 2027-02-28
    expect(computeNextAnnualDate(2, 29, '2026-03-01')).toBe('2027-02-28');
    // 2028 é bissexto -> mantém 2028-02-29
    expect(computeNextAnnualDate(2, 29, '2028-02-28')).toBe('2028-02-29');
    // Após 2028-02-29 -> próximo é 2029 (não bissexto) -> 2029-02-28
    expect(computeNextAnnualDate(2, 29, '2028-02-29')).toBe('2029-02-28');

    const annualRule: CareRule = {
      id: 'rule-annual-1',
      asset_id: 'asset-moto-1',
      owner_id: USER_ID,
      household_id: null,
      scope: 'personal',
      title: 'Licenciamento anual',
      trigger_type: 'annual_date',
      interval_days: null,
      interval_meter: null,
      annual_month: 2,
      annual_day: 29,
      last_done_at: null,
      last_done_meter: null,
      next_due_date: '2026-02-28',
      next_due_meter: null,
      service_history: [],
      created_at: '2026-01-01T12:00:00.000Z',
      updated_at: '2026-01-01T12:00:00.000Z',
      deleted_at: null,
    };

    const completed = applyCareRuleCompletion({
      rule: annualRule,
      asset: null,
      input: {
        rule_id: annualRule.id,
        performed_at: '2026-02-28T22:30:00-03:00',
      },
      timezone: 'America/Sao_Paulo',
    });

    expect(completed.rule.next_due_date).toBe('2027-02-28');
  });

  it('detecta garantias vencendo em <= 30 dias no fuso America/Sao_Paulo', () => {
    const now = new Date('2026-11-24T01:30:00.000Z'); // 2026-11-23 em SP
    const baseAsset: Omit<Asset, 'id' | 'name' | 'warranty_expires_at'> = {
      owner_id: USER_ID,
      household_id: null,
      scope: 'personal',
      category: 'appliance',
      meter_unit: 'none',
      current_meter: null,
      meter_updated_at: null,
      purchased_at: null,
      receipt_path: null,
      notes: null,
      created_at: '2026-01-01T12:00:00.000Z',
      updated_at: '2026-01-01T12:00:00.000Z',
      deleted_at: null,
    };

    const alerts = getUpcomingWarrantyAlertsForAssets(
      [
        { ...baseAsset, id: 'a1', name: 'AC Sala', warranty_expires_at: '2026-12-23' }, // exatamente 30 dias
        { ...baseAsset, id: 'a2', name: 'Geladeira', warranty_expires_at: '2026-11-23' }, // 0 dias (hoje)
        { ...baseAsset, id: 'a3', name: 'TV', warranty_expires_at: '2026-12-24' }, // 31 dias -> fora
        { ...baseAsset, id: 'a4', name: 'Furadeira', warranty_expires_at: '2026-11-22' }, // já venceu -> fora
        {
          ...baseAsset,
          id: 'a5',
          name: 'Deletado',
          warranty_expires_at: '2026-12-01',
          deleted_at: '2026-11-20T00:00:00.000Z',
        },
      ],
      { withinDays: 30, now, timezone: 'America/Sao_Paulo' },
    );

    expect(alerts).toEqual([
      {
        asset_id: 'a2',
        asset_name: 'Geladeira',
        expires_at: '2026-11-23',
        days_remaining: 0,
      },
      {
        asset_id: 'a1',
        asset_name: 'AC Sala',
        expires_at: '2026-12-23',
        days_remaining: 30,
      },
    ]);
  });

  it('rotina fixed_weekdays calcula próximo dia estritamente após conclusão em America/Sao_Paulo', () => {
    // 2026-11-23 é segunda-feira (weekday = 1). Configurado [1, 3, 5] (seg, qua, sex).
    expect(computeNextFixedWeekdayDate([1, 3, 5], '2026-11-23')).toBe('2026-11-25');
    // 2026-11-27 é sexta-feira (5) -> próxima é segunda 2026-11-30
    expect(computeNextFixedWeekdayDate([1, 3, 5], '2026-11-27')).toBe('2026-11-30');

    const routine: HouseRoutine = {
      id: 'rot-1',
      owner_id: USER_ID,
      household_id: null,
      created_by: USER_ID,
      title: 'Colocar lixo na rua',
      mode: 'fixed_weekdays',
      weekdays: [1, 3, 5],
      cycle_days: null,
      assigned_to: 'me',
      assigned_user_id: USER_ID,
      next_due_date: '2026-11-23',
      last_completed_at: null,
      recent_completions: [],
      created_at: '2026-11-01T12:00:00.000Z',
      updated_at: '2026-11-01T12:00:00.000Z',
      deleted_at: null,
    };

    const completed = applyHouseRoutineCompletion({
      routine,
      completedBy: USER_ID,
      completedAt: '2026-11-24T01:30:00.000Z', // 23/11 segunda em SP
      timezone: 'America/Sao_Paulo',
    });

    expect(completed.next_due_date).toBe('2026-11-25');
    expect(completed.recent_completions).toHaveLength(1);
  });

  it('rotina cyclic_days soma cycle_days à data real de conclusão e limita histórico a 10 entradas', () => {
    const existingHistory = Array.from({ length: 10 }, (_, idx) => ({
      completed_at: `2026-10-${String(idx + 1).padStart(2, '0')}T12:00:00.000Z`,
      completed_by: USER_ID,
      note: `hist-${idx}`,
    }));

    const routine: HouseRoutine = {
      id: 'rot-2',
      owner_id: USER_ID,
      household_id: null,
      created_by: USER_ID,
      title: 'Trocar filtro do purificador',
      mode: 'cyclic_days',
      weekdays: null,
      cycle_days: 15,
      assigned_to: 'both',
      assigned_user_id: null,
      next_due_date: '2026-11-20',
      last_completed_at: null,
      recent_completions: existingHistory,
      created_at: '2026-10-01T12:00:00.000Z',
      updated_at: '2026-10-01T12:00:00.000Z',
      deleted_at: null,
    };

    const completed = applyHouseRoutineCompletion({
      routine,
      completedBy: USER_ID,
      note: 'Filtro novo instalado',
      completedAt: '2026-11-24T01:30:00.000Z', // 2026-11-23 em SP
      timezone: 'America/Sao_Paulo',
    });

    // 2026-11-23 + 15 = 2026-12-08
    expect(completed.next_due_date).toBe('2026-12-08');
    expect(completed.recent_completions).toHaveLength(10);
    expect(completed.recent_completions[0].note).toBe('Filtro novo instalado');
  });
});
