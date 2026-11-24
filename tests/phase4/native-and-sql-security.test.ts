import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '../..');

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

describe('Auditoria Fase 4: SQL Triggers/Cron, Edge Functions, AndroidManifest e Zero Segredos', () => {
  it('valida triggers de notification_jobs (America/Sao_Paulo, garantia 30d) e pg_cron em 0003_phase4_notifications_and_cron.sql', () => {
    const sql = fs.readFileSync(
      path.join(ROOT, 'supabase/migrations/0003_phase4_notifications_and_cron.sql'),
      'utf-8',
    );
    expect(sql).toContain('enqueue_task_notification_job');
    expect(sql).toContain('enqueue_mural_notification_job');
    expect(sql).toContain('enqueue_asset_warranty_notification_job');
    expect(sql).toContain('new.warranty_expires_at - 30');
    expect(sql).toContain("'America/Sao_Paulo'");
    expect(sql).toContain('pg_cron');
    expect(sql).toContain('cleanup_old_notification_jobs()');
  });

  it('valida autenticação estrita e segurança em dispatch-notifications, bridge-rotinas, bridge-passatempos e assistant-ingest', () => {
    const dispatch = fs.readFileSync(
      path.join(ROOT, 'supabase/functions/dispatch-notifications/index.ts'),
      'utf-8',
    );
    expect(dispatch).toContain("Deno.env.get('CRON_SECRET')");
    expect(dispatch).toContain('claim_due_notification_jobs');
    expect(dispatch).toContain('active_pause_until');
    expect(dispatch).toContain("job.delivery_mode === 'push'");
    expect(dispatch).toContain("Deno.env.get('FCM_SERVICE_ACCOUNT_JSON')");
    expect(dispatch).toContain('401');

    const rotinas = fs.readFileSync(
      path.join(ROOT, 'supabase/functions/bridge-rotinas/index.ts'),
      'utf-8',
    );
    expect(rotinas).toContain('authClient.auth.getUser()');
    expect(rotinas).toContain('produtos_armario');
    expect(rotinas).toContain("status: 'falta'");
    expect(rotinas).toContain('na_lista_mercado: true');
    expect(rotinas).toContain('401');

    const passatempos = fs.readFileSync(
      path.join(ROOT, 'supabase/functions/bridge-passatempos/index.ts'),
      'utf-8',
    );
    expect(passatempos).toContain('authClient.auth.getUser()');
    expect(passatempos).toContain(".from('inbox').insert(");
    expect(passatempos).not.toContain(".from('user_data')");
    expect(passatempos).toContain('401');

    const assistant = fs.readFileSync(
      path.join(ROOT, 'supabase/functions/assistant-ingest/index.ts'),
      'utf-8',
    );
    expect(assistant).toContain('maxBase64Chars');
    expect(assistant).toContain('Áudio em base64 malformado.');
  });

  it('valida permissões críticas, Share Target e receivers/activities no AndroidManifest.xml', () => {
    const manifest = fs.readFileSync(
      path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'),
      'utf-8',
    );
    expect(manifest).toContain('android.permission.POST_NOTIFICATIONS');
    expect(manifest).toContain('android.permission.SCHEDULE_EXACT_ALARM');
    expect(manifest).toContain('android.permission.USE_FULL_SCREEN_INTENT');
    expect(manifest).toContain('android.intent.action.SEND');
    expect(manifest).toContain('text/plain');
    expect(manifest).toContain('image/*');
    expect(manifest).toContain('CallAlarmActivity');
    expect(manifest).toContain('CallAlarmReceiver');
    expect(manifest).toContain('NotificationActionReceiver');
  });

  it('garante zero segredos de push ou pontes externas em src/', () => {
    const srcFiles = collectSrcFiles(path.join(ROOT, 'src'));
    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toContain('CRON_SECRET');
      expect(content).not.toContain('FCM_SERVICE_ACCOUNT_JSON');
      expect(content).not.toContain('ROTINAS_SUPABASE_SERVICE_ROLE_KEY');
      expect(content).not.toContain('PASSATEMPOS_SUPABASE_SERVICE_ROLE_KEY');
      expect(content).not.toContain('PASSATEMPOS_BRIDGE_TOKEN');
    }
  });
});
