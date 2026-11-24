import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_0002_PATH = path.resolve(
  import.meta.dirname,
  '../../supabase/migrations/0002_phase2_refinements.sql',
);

describe('Refinamentos SQL da Fase 2 (0002_phase2_refinements.sql)', () => {
  const sql = fs.readFileSync(MIGRATION_0002_PATH, 'utf-8');

  it('permite resgate de convite para usuário solo com household de 1 membro e migra itens compartilhados', () => {
    expect(sql).toMatch(/create or replace function public\.redeem_household_invite\(p_code text\)/i);
    expect(sql).toContain('if v_caller_member_count > 1 then');
    expect(sql).toContain('update public.house_routines');
    expect(sql).toContain('update public.mural_notes');
    expect(sql).toContain('update public.tasks');
    expect(sql).toContain('update public.assets');
    expect(sql).toContain('update public.care_rules');
    expect(sql).toContain('delete from public.households');
    expect(sql).toContain(
      'revoke all on function public.redeem_household_invite(text) from public, anon;',
    );
    expect(sql).toContain(
      'grant execute on function public.redeem_household_invite(text) to authenticated;',
    );
  });

  it('atualiza cleanup_old_notification_jobs para limpar invite_redeem_attempts > 24h mantendo permissão restrita a service_role', () => {
    expect(sql).toMatch(/create or replace function public\.cleanup_old_notification_jobs\(\)/i);
    expect(sql).toContain('delete from public.invite_redeem_attempts');
    expect(sql).toContain("interval '24 hours'");
    expect(sql).toContain(
      'revoke all on function public.cleanup_old_notification_jobs() from public, anon, authenticated;',
    );
    expect(sql).toContain(
      'grant execute on function public.cleanup_old_notification_jobs() to service_role;',
    );
  });
});
