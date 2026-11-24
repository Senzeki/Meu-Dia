import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_PATH = path.resolve(
  import.meta.dirname,
  '../../supabase/migrations/0001_initial_schema.sql',
);

const ALL_TABLES = [
  'households',
  'profiles',
  'household_invites',
  'invite_redeem_attempts',
  'device_push_tokens',
  'chat_messages',
  'tasks',
  'house_routines',
  'mural_notes',
  'assets',
  'care_rules',
  'vault_items',
  'notification_jobs',
];

function collectSrcFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSrcFiles(full));
    } else if (/\.(ts|tsx|css)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

describe('Auditoria de Segurança SQL, RLS, Bucket Privado e Zero Segredos', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf-8');

  it('habilita Row Level Security (RLS) em todas as 12 tabelas do schema', () => {
    for (const table of ALL_TABLES) {
      const regex = new RegExp(
        `alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`,
        'i',
      );
      expect(sql).toMatch(regex);
    }
  });

  it('isola estritamente Conversa e Guardados apenas ao dono (parceiro nunca lê)', () => {
    expect(sql).toMatch(
      /create policy chat_messages_owner_all on public\.chat_messages[\s\S]*?using \(user_id = auth\.uid\(\)\)[\s\S]*?with check \(user_id = auth\.uid\(\)\)/i,
    );
    expect(sql).toMatch(
      /create policy vault_items_owner_all on public\.vault_items[\s\S]*?using \(owner_id = auth\.uid\(\)\)[\s\S]*?with check \(owner_id = auth\.uid\(\)\)/i,
    );
  });

  it('impõe CHECK constraint impedindo vazamento de itens pessoais para household_id', () => {
    expect(sql).toContain('chk_tasks_scope_isolation');
    expect(sql).toContain('chk_assets_scope_isolation');
    expect(sql).toContain('chk_care_rules_scope_isolation');
  });

  it('configura fuso padrão America/Sao_Paulo, trava SKIP LOCKED, revoke explícito e cancelamento automático de notification_jobs', () => {
    expect(sql).toContain("default 'America/Sao_Paulo'");
    expect(sql).toContain('for update skip locked');
    expect(sql).toContain(
      'revoke all on function public.claim_due_notification_jobs(int) from public, anon, authenticated;',
    );
    expect(sql).toContain(
      'revoke all on function public.cleanup_old_notification_jobs() from public, anon, authenticated;',
    );
    expect(sql).toContain('trg_tasks_cancel_notification_jobs');
    expect(sql).toContain('trg_mural_cancel_notification_jobs');
    expect(sql).toContain('trg_care_cancel_notification_jobs');
    expect(sql).toContain('trg_assets_cancel_notification_jobs');
    expect(sql).toContain('prevent_owner_id_mutation');
    expect(sql).toContain("interval '30 days'");
  });

  it('cria bucket meu-dia-media estritamente privado (public = false) e sem getPublicUrl no cliente', () => {
    expect(sql).toMatch(/'meu-dia-media'[\s\S]*?false/);

    const srcFiles = collectSrcFiles(path.resolve(import.meta.dirname, '../../src'));
    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toContain('getPublicUrl');
      expect(content).not.toContain('SUPABASE_SERVICE_ROLE');
      expect(content).not.toContain('GROQ_API_KEY');
      expect(content).not.toContain('GEMINI_API_KEY');
    }
  });
});
