import type { SharedIncomingPayload } from '@/types';
import { getPlatformRuntimeInfo } from './runtime';

const listeners = new Set<(payload: SharedIncomingPayload) => void>();

export function subscribeShareTarget(
  listener: (payload: SharedIncomingPayload) => void,
): () => void {
  listeners.add(listener);
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
