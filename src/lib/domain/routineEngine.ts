import {
  DEFAULT_TIMEZONE,
  addDaysToIsoDate,
  getLocalDateString,
  getWeekdayFromIsoDate,
  resolveTimezone,
} from '@/lib/timezone';
import type {
  HouseRoutine,
  ISODateString,
  RoutineCompletionLog,
  UUID,
} from '@/types';

const MAX_RECENT_COMPLETIONS = 10;

/**
 * Encontra o próximo dia da semana configurado (0 = Dom .. 6 = Sáb) a partir de `fromIsoDate`.
 * Por padrão busca estritamente após `fromIsoDate` (para cálculo após conclusão).
 */
export function computeNextFixedWeekdayDate(
  weekdays: number[] | null | undefined,
  fromIsoDate: ISODateString,
  options: { includeSameDay?: boolean } = {},
): ISODateString {
  const validWeekdays = new Set(
    (weekdays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
  );

  if (validWeekdays.size === 0) {
    return addDaysToIsoDate(fromIsoDate, 7);
  }

  const startOffset = options.includeSameDay ? 0 : 1;
  for (let offset = startOffset; offset <= 7; offset += 1) {
    const candidate = addDaysToIsoDate(fromIsoDate, offset);
    if (validWeekdays.has(getWeekdayFromIsoDate(candidate))) {
      return candidate;
    }
  }

  return addDaysToIsoDate(fromIsoDate, 7);
}

/**
 * Calcula `next_due_date` inicial ao criar uma rotina sem data explícita.
 */
export function computeInitialRoutineDueDate(
  routine: Pick<HouseRoutine, 'mode' | 'weekdays' | 'cycle_days'>,
  now: Date = new Date(),
  timezone: string = DEFAULT_TIMEZONE,
): ISODateString {
  const todayIso = getLocalDateString(now, resolveTimezone(timezone));
  if (routine.mode === 'fixed_weekdays') {
    return computeNextFixedWeekdayDate(routine.weekdays, todayIso, {
      includeSameDay: true,
    });
  }
  return todayIso;
}

/**
 * Conclui uma rotina da casa mantendo modelagem enxuta:
 * guarda apenas a regra + próximo `next_due_date` + até 10 conclusões recentes.
 */
export function applyHouseRoutineCompletion(params: {
  routine: HouseRoutine;
  completedBy: UUID;
  note?: string;
  completedAt?: string;
  timezone?: string;
  now?: Date;
  mutationId?: string;
}): HouseRoutine {
  const safeTz = resolveTimezone(params.timezone);
  const nowDate = params.now ?? new Date();
  const completedAtIso = params.completedAt ?? nowDate.toISOString();
  const completedDateObj = new Date(completedAtIso);
  const completedLocalDate = getLocalDateString(
    Number.isNaN(completedDateObj.getTime()) ? nowDate : completedDateObj,
    safeTz,
  );

  const nextDueDate =
    params.routine.mode === 'fixed_weekdays'
      ? computeNextFixedWeekdayDate(params.routine.weekdays, completedLocalDate, {
          includeSameDay: false,
        })
      : addDaysToIsoDate(
          completedLocalDate,
          params.routine.cycle_days && params.routine.cycle_days > 0
            ? params.routine.cycle_days
            : 1,
        );

  const entry: RoutineCompletionLog = {
    completed_at: completedAtIso,
    completed_by: params.completedBy,
    note: params.note?.trim() || null,
  };

  const recentCompletions = [entry, ...params.routine.recent_completions].slice(
    0,
    MAX_RECENT_COMPLETIONS,
  );

  return {
    ...params.routine,
    next_due_date: nextDueDate,
    last_completed_at: completedAtIso,
    recent_completions: recentCompletions,
    updated_at: nowDate.toISOString(),
    client_mutation_id: params.mutationId ?? params.routine.client_mutation_id,
  };
}
