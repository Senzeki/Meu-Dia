import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIMEZONE,
  getLocalDateString,
  getLocalIsoNow,
  isBeforeLocalToday,
  resolveTimezone,
} from '@/lib/timezone';

describe('Timezone explícito America/Sao_Paulo', () => {
  it('mantém a data local correta às 22:30 BRT mesmo quando UTC já virou o dia', () => {
    // 2026-11-23T22:30:00-03:00 === 2026-11-24T01:30:00Z
    const instant = new Date('2026-11-24T01:30:00.000Z');
    expect(getLocalDateString(instant, DEFAULT_TIMEZONE)).toBe('2026-11-23');
    expect(getLocalDateString(instant, 'UTC')).toBe('2026-11-24');
  });

  it('gera local_iso_now com offset explícito -03:00 para a IA na nuvem', () => {
    const instant = new Date('2026-11-24T01:15:09.000Z');
    const iso = getLocalIsoNow(instant, 'America/Sao_Paulo');
    expect(iso).toBe('2026-11-23T22:15:09-03:00');
  });

  it('faz fallback seguro para America/Sao_Paulo se timezone for inválida', () => {
    expect(resolveTimezone('Invalid/Zone')).toBe('America/Sao_Paulo');
    expect(resolveTimezone('')).toBe('America/Sao_Paulo');
  });

  it('identifica itens de dias anteriores sem depender do fuso do servidor UTC', () => {
    const now = new Date('2026-11-24T01:10:00.000Z'); // ainda 23/11 em SP
    expect(isBeforeLocalToday('2026-11-22', now, 'America/Sao_Paulo')).toBe(true);
    expect(isBeforeLocalToday('2026-11-23', now, 'America/Sao_Paulo')).toBe(false);
  });
});
