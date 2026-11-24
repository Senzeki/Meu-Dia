import type { SharedIncomingPayload } from '@/types';
import { MeuDiaNative, type NativeShareEventPayload } from './nativePlugin';
import { getPlatformRuntimeInfo } from './runtime';

const listeners = new Set<(payload: SharedIncomingPayload) => void>();
let nativeBridgeInitialized = false;

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function mapNativeShare(raw: NativeShareEventPayload): SharedIncomingPayload {
  const mime = raw.mime_type || 'image/jpeg';
  return {
    kind: raw.kind,
    title: raw.title ?? null,
    text: raw.text ?? null,
    url: raw.url ?? null,
    mime_type: raw.mime_type ?? null,
    blob: raw.image_base64 ? base64ToBlob(raw.image_base64, mime) : null,
  };
}

function ensureNativeShareListener(): void {
  if (nativeBridgeInitialized) return;
  const runtime = getPlatformRuntimeInfo();
  if (!runtime.is_android) return;
  nativeBridgeInitialized = true;

  void MeuDiaNative.consumePendingShare()
    .then(({ payload }) => {
      if (payload) {
        emitIncomingShare(mapNativeShare(payload));
      }
    })
    .catch(() => undefined);

  void MeuDiaNative.addListener('shareReceived', (payload) => {
    emitIncomingShare(mapNativeShare(payload));
  }).catch(() => undefined);
}

export function subscribeShareTarget(
  listener: (payload: SharedIncomingPayload) => void,
): () => void {
  listeners.add(listener);
  ensureNativeShareListener();
  return () => {
    listeners.delete(listener);
  };
}

export function emitIncomingShare(payload: SharedIncomingPayload): void {
  const runtime = getPlatformRuntimeInfo();
  if (!runtime.is_android && listeners.size === 0) return;
  for (const listener of listeners) {
    listener(payload);
  }
}
