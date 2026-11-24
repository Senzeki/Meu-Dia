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
