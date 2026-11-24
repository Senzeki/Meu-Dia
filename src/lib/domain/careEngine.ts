import {
  DEFAULT_TIMEZONE,
  addDaysToIsoDate,
  diffDaysBetweenIsoDates,
  formatIsoDateParts,
  getDaysInMonth,
  getLocalDateString,
  parseIsoDateParts,
  resolveTimezone,
} from '@/lib/timezone';
import { createUuid } from '@/lib/uuid';
import type {
  Asset,
  CareRule,
  CareServiceLog,
  CompleteCareRuleInput,
  ISODateString,
  WarrantyAlertSummary,
} from '@/types';

/**
 * Calcula a próxima data anual (mês/dia) no calendário do perfil,
 * ajustando 29/02 para 28/02 em anos não bissextos.
 */
export function computeNextAnnualDate(
  annualMonth: number,
  annualDay: number,
  fromIsoDate: ISODateString,
  options: { allowSameDay?: boolean } = {},
): ISODateString {
  const safeMonth = Math.min(12, Math.max(1, Math.trunc(annualMonth)));
  const { year } = parseIsoDateParts(fromIsoDate);

  const clampForYear = (targetYear: number): ISODateString => {
    const maxDay = getDaysInMonth(targetYear, safeMonth);
    const safeDay = Math.min(maxDay, Math.max(1, Math.trunc(annualDay)));
    return formatIsoDateParts(targetYear, safeMonth, safeDay);
  };

  const candidateThisYear = clampForYear(year);
  const isValidCandidate = options.allowSameDay
    ? candidateThisYear >= fromIsoDate
    : candidateThisYear > fromIsoDate;

  return isValidCandidate ? candidateThisYear : clampForYear(year + 1);
}

/**
 * Calcula o vencimento inicial ao criar uma regra de cuidado caso `next_due_date` / `next_due_meter` não seja informado.
 */
export function computeInitialCareSchedule(
  rule: Pick<
    CareRule,
    | 'trigger_type'
    | 'interval_days'
    | 'interval_meter'
    | 'annual_month'
    | 'annual_day'
    | 'next_due_date'
    | 'next_due_meter'
  >,
  assetCurrentMeter: number | null | undefined,
  now: Date = new Date(),
  timezone: string = DEFAULT_TIMEZONE,
): { next_due_date: ISODateString | null; next_due_meter: number | null } {
  const safeTz = resolveTimezone(timezone);
  const todayIso = getLocalDateString(now, safeTz);

  if (rule.trigger_type === 'flexible_days') {
    const interval = rule.interval_days && rule.interval_days > 0 ? rule.interval_days : 30;
    return {
      next_due_date: rule.next_due_date ?? addDaysToIsoDate(todayIso, interval),
      next_due_meter: null,
    };
  }

  if (rule.trigger_type === 'annual_date') {
    const month = rule.annual_month ?? 1;
    const day = rule.annual_day ?? 1;
    return {
      next_due_date:
        rule.next_due_date ??
        computeNextAnnualDate(month, day, todayIso, { allowSameDay: true }),
      next_due_meter: null,
    };
  }

  const baseMeter = assetCurrentMeter ?? 0;
  const intervalMeter =
    rule.interval_meter && rule.interval_meter > 0 ? rule.interval_meter : null;
  return {
    next_due_date: null,
    next_due_meter:
      rule.next_due_meter ?? (intervalMeter !== null ? baseMeter + intervalMeter : null),
  };
}

export interface CompleteCareRuleResult {
  rule: CareRule;
  asset: Asset | null;
  log: CareServiceLog;
}

/**
 * Conclui uma regra de cuidado aplicando a regra pura de cada gatilho:
 * - `flexible_days`: reinicia sempre a partir da data real de conclusão (`performed_at`) no fuso do perfil
 * - `meter`: recalcula `next_due_meter = confirmed_meter + interval_meter` e atualiza `asset.current_meter` se maior
 * - `annual_date`: calcula próxima ocorrência respeitando anos não bissextos (29/02 -> 28/02)
 */
export function applyCareRuleCompletion(params: {
  rule: CareRule;
  asset: Asset | null;
  input: CompleteCareRuleInput;
  timezone?: string;
  now?: Date;
  mutationId?: string;
}): CompleteCareRuleResult {
  const safeTz = resolveTimezone(params.timezone);
  const nowDate = params.now ?? new Date();
  const performedAtIso = params.input.performed_at ?? nowDate.toISOString();
  const performedDateObj = new Date(performedAtIso);
  const performedLocalDate = getLocalDateString(
    Number.isNaN(performedDateObj.getTime()) ? nowDate : performedDateObj,
    safeTz,
  );
  const updatedAtIso = nowDate.toISOString();

  const confirmedMeter =
    params.input.confirmed_meter !== undefined && params.input.confirmed_meter !== null
      ? params.input.confirmed_meter
      : (params.asset?.current_meter ?? params.rule.last_done_meter ?? null);

  const log: CareServiceLog = {
    id: createUuid(),
    performed_at: performedAtIso,
    meter_value: confirmedMeter,
    workshop_or_parts: params.input.workshop_or_parts?.trim() || null,
    cost_note: params.input.cost_note?.trim() || null,
  };

  let nextDueDate = params.rule.next_due_date;
  let nextDueMeter = params.rule.next_due_meter;

  if (params.rule.trigger_type === 'flexible_days') {
    const days =
      params.rule.interval_days && params.rule.interval_days > 0
        ? params.rule.interval_days
        : 30;
    // Sempre reinicia a partir da data real de conclusão, nunca da data prevista anterior
    nextDueDate = addDaysToIsoDate(performedLocalDate, days);
  } else if (params.rule.trigger_type === 'annual_date') {
    const month = params.rule.annual_month ?? 1;
    const day = params.rule.annual_day ?? 1;
    nextDueDate = computeNextAnnualDate(month, day, performedLocalDate, {
      allowSameDay: false,
    });
  } else if (params.rule.trigger_type === 'meter') {
    if (
      confirmedMeter !== null &&
      params.rule.interval_meter !== null &&
      params.rule.interval_meter > 0
    ) {
      nextDueMeter = confirmedMeter + params.rule.interval_meter;
    }
  }

  const updatedRule: CareRule = {
    ...params.rule,
    last_done_at: performedAtIso,
    last_done_meter: confirmedMeter,
    next_due_date: nextDueDate,
    next_due_meter: nextDueMeter,
    service_history: [log, ...params.rule.service_history],
    updated_at: updatedAtIso,
    client_mutation_id: params.mutationId ?? params.rule.client_mutation_id,
  };

  let updatedAsset = params.asset;
  if (
    params.asset &&
    confirmedMeter !== null &&
    (params.asset.current_meter === null || confirmedMeter > params.asset.current_meter)
  ) {
    updatedAsset = {
      ...params.asset,
      current_meter: confirmedMeter,
      meter_updated_at: performedAtIso,
      updated_at: updatedAtIso,
      client_mutation_id: createUuid(),
    };
  }

  return { rule: updatedRule, asset: updatedAsset, log };
}

/**
 * Detecta garantias de ativos que vencem nos próximos `withinDays` dias (padrão 30) no fuso do perfil.
 */
export function getUpcomingWarrantyAlertsForAssets(
  assets: Asset[],
  options: {
    withinDays?: number;
    now?: Date;
    timezone?: string;
  } = {},
): WarrantyAlertSummary[] {
  const withinDays = options.withinDays ?? 30;
  const safeTz = resolveTimezone(options.timezone);
  const todayIso = getLocalDateString(options.now ?? new Date(), safeTz);

  const alerts: WarrantyAlertSummary[] = [];

  for (const asset of assets) {
    if (asset.deleted_at || !asset.warranty_expires_at) continue;
    const daysRemaining = diffDaysBetweenIsoDates(todayIso, asset.warranty_expires_at);
    if (daysRemaining >= 0 && daysRemaining <= withinDays) {
      alerts.push({
        asset_id: asset.id,
        asset_name: asset.name,
        expires_at: asset.warranty_expires_at,
        days_remaining: daysRemaining,
      });
    }
  }

  return alerts.sort((a, b) => a.days_remaining - b.days_remaining);
}
