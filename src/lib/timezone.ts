import type { ISODateString, ISOTimestamp } from '@/types';

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export function resolveTimezone(tz?: string | null): string {
  const candidate = tz?.trim() || DEFAULT_TIMEZONE;
  try {
    Intl.DateTimeFormat('pt-BR', { timeZone: candidate });
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/**
 * Retorna YYYY-MM-DD na timezone explícita do perfil (padrão America/Sao_Paulo),
 * evitando desvios de virada de dia às 21h BRT quando comparado com UTC.
 */
export function getLocalDateString(
  date: Date = new Date(),
  timezone: string = DEFAULT_TIMEZONE,
): ISODateString {
  const safeTz = resolveTimezone(timezone);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

/**
 * Retorna ISO-8601 local com offset explícito (ex: 2026-11-23T22:25:00-03:00)
 * para envio obrigatório em `local_iso_now` na Edge Function `assistant-ingest`.
 */
export function getLocalIsoNow(
  date: Date = new Date(),
  timezone: string = DEFAULT_TIMEZONE,
): ISOTimestamp {
  const safeTz = resolveTimezone(timezone);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  });

  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  const rawOffset = get('timeZoneName').replace('GMT', '');
  const offset = rawOffset === '' ? '+00:00' : rawOffset;

  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}${offset}`;
}

export function formatHeaderDatePtBr(
  date: Date = new Date(),
  timezone: string = DEFAULT_TIMEZONE,
): string {
  const safeTz = resolveTimezone(timezone);
  const raw = new Intl.DateTimeFormat('pt-BR', {
    timeZone: safeTz,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(date);

  const cleaned = raw.replace(/\./g, '').replace(',', ',');
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function isBeforeLocalToday(
  isoDate: ISODateString,
  now: Date = new Date(),
  timezone: string = DEFAULT_TIMEZONE,
): boolean {
  const today = getLocalDateString(now, timezone);
  return isoDate < today;
}

export function parseIsoDateParts(isoDate: ISODateString): {
  year: number;
  month: number;
  day: number;
} {
  const [y, m, d] = isoDate.split('-').map((n) => Number.parseInt(n, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new Error(`Data ISO inválida: ${isoDate}`);
  }
  return { year: y, month: m, day: d };
}

export function formatIsoDateParts(year: number, month: number, day: number): ISODateString {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function getDaysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/**
 * Soma (ou subtrai) dias em uma data calendário YYYY-MM-DD sem desvios de fuso/DST.
 */
export function addDaysToIsoDate(isoDate: ISODateString, days: number): ISODateString {
  const { year, month, day } = parseIsoDateParts(isoDate);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return formatIsoDateParts(
    utc.getUTCFullYear(),
    utc.getUTCMonth() + 1,
    utc.getUTCDate(),
  );
}

/**
 * Retorna dia da semana (0 = Dom .. 6 = Sáb) para uma data YYYY-MM-DD.
 */
export function getWeekdayFromIsoDate(isoDate: ISODateString): number {
  const { year, month, day } = parseIsoDateParts(isoDate);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Diferença em dias inteiros (toIsoDate - fromIsoDate).
 */
export function diffDaysBetweenIsoDates(
  fromIsoDate: ISODateString,
  toIsoDate: ISODateString,
): number {
  const from = parseIsoDateParts(fromIsoDate);
  const to = parseIsoDateParts(toIsoDate);
  const fromMs = Date.UTC(from.year, from.month - 1, from.day);
  const toMs = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((toMs - fromMs) / 86_400_000);
}
