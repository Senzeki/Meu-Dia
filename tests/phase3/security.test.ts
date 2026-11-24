import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const EDGE_INDEX_PATH = path.resolve(
  import.meta.dirname,
  '../../supabase/functions/assistant-ingest/index.ts',
);

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

describe('Segurança da Fase 3: JWT obrigatório na Edge Function e zero segredos no cliente', () => {
  it('exige Authorization Bearer + auth.getUser() e descarta buffer de áudio após transcrição', () => {
    const code = fs.readFileSync(EDGE_INDEX_PATH, 'utf-8');
    expect(code).toContain("authHeader.startsWith('Bearer ')");
    expect(code).toContain('authClient.auth.getUser()');
    expect(code).toContain('status = 200');
    expect(code).toContain('401');
    expect(code).toContain("Deno.env.get('GROQ_API_KEY')");
    expect(code).toContain('audioBytes = null');
    expect(code).toContain('body.audio_base64 = undefined');
  });

  it('garante zero chaves de API ou service role em src/', () => {
    const srcFiles = collectSrcFiles(path.resolve(import.meta.dirname, '../../src'));
    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toContain('GROQ_API_KEY');
      expect(content).not.toContain('GEMINI_API_KEY');
      expect(content).not.toContain('SUPABASE_SERVICE_ROLE');
      expect(content).not.toContain('gsk_');
      expect(content).not.toContain('AIza');
    }
  });
});
