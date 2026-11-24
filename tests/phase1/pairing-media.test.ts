import { describe, expect, it } from 'vitest';
import {
  INVITE_TTL_MS,
  generateShortInviteCode,
  isInviteValid,
  normalizeInviteCode,
} from '@/services/authService';
import { buildPrivateMediaPath } from '@/services/mediaService';

describe('Pareamento 24h e isolamento de paths do Storage privado', () => {
  it('gera códigos curtos legíveis no formato MD-XXXXXX e normaliza entradas', () => {
    const code = generateShortInviteCode();
    expect(code).toMatch(/^MD-[A-Z0-9]{6}$/);
    expect(normalizeInviteCode('md 7k4p9q')).toBe('MD-7K4P9Q');
    expect(normalizeInviteCode('7k4p9q')).toBe('MD-7K4P9Q');
  });

  it('respeita expiração exata de 24 horas e bloqueia convites já utilizados', () => {
    const created = new Date('2026-11-23T12:00:00.000Z');
    const expiresAt = new Date(created.getTime() + INVITE_TTL_MS).toISOString();

    expect(
      isInviteValid(
        { expires_at: expiresAt, used_at: null },
        new Date('2026-11-24T11:59:59.000Z'),
      ),
    ).toBe(true);

    expect(
      isInviteValid(
        { expires_at: expiresAt, used_at: null },
        new Date('2026-11-24T12:00:00.000Z'),
      ),
    ).toBe(false);

    expect(
      isInviteValid(
        { expires_at: expiresAt, used_at: '2026-11-23T13:00:00.000Z' },
        new Date('2026-11-23T14:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('separa estritamente mídias pessoais de mídias compartilhadas do casal', () => {
    const personalPath = buildPrivateMediaPath({
      scope: 'personal',
      ownerId: '11111111-1111-4111-8111-111111111111',
      folder: 'prints',
      mimeType: 'image/webp',
    });
    expect(personalPath).toMatch(
      /^personal\/11111111-1111-4111-8111-111111111111\/prints\/[0-9a-f-]+\.webp$/,
    );

    expect(() =>
      buildPrivateMediaPath({
        scope: 'shared',
        ownerId: '11111111-1111-4111-8111-111111111111',
        householdId: null,
        folder: 'receipts',
        mimeType: 'image/jpeg',
      }),
    ).toThrow();

    const sharedPath = buildPrivateMediaPath({
      scope: 'shared',
      ownerId: '11111111-1111-4111-8111-111111111111',
      householdId: '22222222-2222-4222-8222-222222222222',
      folder: 'receipts',
      mimeType: 'image/jpeg',
    });
    expect(sharedPath).toMatch(
      /^shared\/22222222-2222-4222-8222-222222222222\/receipts\/[0-9a-f-]+\.jpg$/,
    );
  });
});
