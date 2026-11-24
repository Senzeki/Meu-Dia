import { describe, expect, it } from 'vitest';
import {
  calculateScaledDimensions,
  compressImageForUpload,
  platformAdapter,
} from '@/lib/platform';

describe('Abstração de plataforma Web vs. Capacitor', () => {
  it('executa em modo web com fallback silencioso para plugins nativos', async () => {
    const runtime = platformAdapter.getRuntimeInfo();
    expect(runtime.platform).toBe('web');
    expect(runtime.is_native).toBe(false);

    await expect(platformAdapter.triggerHaptic('medium')).resolves.toBeUndefined();
    await expect(
      platformAdapter.scheduleLocalAlarm({
        job_id: '00000000-0000-4000-8000-000000000099',
        title: 'Teste',
        body: 'Corpo',
        scheduled_for: new Date(Date.now() + 60_000).toISOString(),
        delivery_mode: 'call_alarm',
      }),
    ).resolves.toBeUndefined();
    await expect(
      platformAdapter.cancelLocalAlarm('00000000-0000-4000-8000-000000000099'),
    ).resolves.toBeUndefined();

    const diag = await platformAdapter.getNotificationDiagnostics();
    expect(diag.platform).toBe('web');
    expect(diag.exact_alarms_allowed).toBe('not_applicable');
    expect(diag.full_screen_intent_allowed).toBe('not_applicable');
  });

  it('redimensiona imagens mantendo proporção dentro do limite de 1440px', () => {
    expect(calculateScaledDimensions(2880, 1440, 1440)).toEqual({
      width: 1440,
      height: 720,
    });
    expect(calculateScaledDimensions(800, 600, 1440)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('preserva blobs leves (<=150 KB) intactos sem reprocessamento desnecessário', async () => {
    const smallBlob = new Blob([new Uint8Array(12_000)], { type: 'image/webp' });
    const result = await compressImageForUpload(smallBlob);
    expect(result.byte_size).toBe(12_000);
    expect(result.mime_type).toBe('image/webp');
  });
});
