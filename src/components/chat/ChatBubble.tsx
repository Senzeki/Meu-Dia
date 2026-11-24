import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, RotateCcw } from 'lucide-react';
import { triggerHaptic } from '@/lib/platform';
import { useDataStore } from '@/store/useDataStore';
import { useUiStore } from '@/store/useUiStore';
import type { ChatMessage, LinkedEntityRef, RedirectActionTarget } from '@/types';

interface ChatBubbleProps {
  message: ChatMessage;
  formattedTime: string;
}

const REDIRECT_OPTIONS: Array<{ label: string; target: RedirectActionTarget }> = [
  { label: 'Desfazer', target: { kind: 'undo_delete' } },
  { label: 'Mover p/ Semana', target: { kind: 'move_task_horizon', horizon: 'week' } },
  { label: 'Mover p/ Depois', target: { kind: 'move_task_horizon', horizon: 'later' } },
  { label: 'Mover p/ Casa', target: { kind: 'move_to_casa' } },
  { label: 'Guardar em Links', target: { kind: 'move_to_vault', category: 'link' } },
  { label: 'Guardar em Trabalho', target: { kind: 'move_to_vault', category: 'work' } },
];

export function ChatBubble({ message, formattedTime }: ChatBubbleProps) {
  const navigateToArea = useUiStore((s) => s.navigateToArea);
  const getLinkedEntityLiveState = useDataStore((s) => s.getLinkedEntityLiveState);
  const undoOrRedirectMessageAction = useDataStore((s) => s.undoOrRedirectMessageAction);
  const localMediaUrls = useDataStore((s) => s.localMediaUrls);
  const resolveMediaUrl = useDataStore((s) => s.resolveMediaUrl);

  // Subscribe to store slices so live_state re-renders immediately when entities change
  useDataStore((s) => s.tasks);
  useDataStore((s) => s.houseRoutines);
  useDataStore((s) => s.muralNotes);
  useDataStore((s) => s.assets);
  useDataStore((s) => s.careRules);
  useDataStore((s) => s.vaultItems);

  const [resolvedImgUrl, setResolvedImgUrl] = useState<string | null>(null);
  const [menuState, setMenuState] = useState<'closed' | 'open' | 'closing'>('closed');
  const [busyAction, setBusyAction] = useState(false);

  const directPreviewUrl =
    message.local_preview_url ||
    (message.media_path ? localMediaUrls[message.media_path] : null) ||
    resolvedImgUrl;

  useEffect(() => {
    let active = true;
    if (
      message.media_path &&
      !message.local_preview_url &&
      !localMediaUrls[message.media_path]
    ) {
      void resolveMediaUrl(message.media_path).then((url) => {
        if (active && url) {
          setResolvedImgUrl(url);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [message.media_path, message.local_preview_url, localMediaUrls, resolveMediaUrl]);

  function toggleFixMenu() {
    if (menuState === 'open') {
      closeFixMenu();
    } else {
      setMenuState('open');
    }
  }

  function closeFixMenu() {
    setMenuState('closing');
    setTimeout(() => {
      setMenuState((prev) => (prev === 'closing' ? 'closed' : prev));
    }, 150);
  }

  async function handleRedirect(target: RedirectActionTarget) {
    if (busyAction) return;
    setBusyAction(true);
    try {
      void triggerHaptic('light');
      await undoOrRedirectMessageAction(message.id, target);
      closeFixMenu();
    } finally {
      setBusyAction(false);
    }
  }

  function renderLinkedEntity(ref: LinkedEntityRef) {
    const liveState = getLinkedEntityLiveState(ref.entity_type, ref.entity_id);

    if (liveState === 'removed') {
      return (
        <span
          key={`${ref.entity_type}-${ref.entity_id}`}
          className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1 rounded-full bg-surface-3/60 border border-border-soft text-xs text-text-dim select-none"
        >
          Item removido
        </span>
      );
    }

    if (liveState === 'done') {
      return (
        <button
          key={`${ref.entity_type}-${ref.entity_id}`}
          type="button"
          onClick={() => {
            void triggerHaptic('light');
            navigateToArea(ref.tab, ref.agenda_horizon);
          }}
          className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1 rounded-full bg-success-soft border border-success/30 text-xs font-medium text-success hover:opacity-90 transition-opacity"
        >
          <Check className="h-3.5 w-3.5 shrink-0" />
          <span>Concluído</span>
        </button>
      );
    }

    return (
      <button
        key={`${ref.entity_type}-${ref.entity_id}`}
        type="button"
        onClick={() => {
          void triggerHaptic('light');
          navigateToArea(ref.tab, ref.agenda_horizon);
        }}
        className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1 rounded-full bg-surface-3 border border-border text-xs font-medium text-text hover:bg-surface-4 transition-colors"
      >
        <ArrowUpRight className="h-3.5 w-3.5 text-accent shrink-0" />
        <span>{ref.label}</span>
      </button>
    );
  }

  const isUser = message.sender === 'user';
  const hasUndoableRef = message.linked_entities?.some((ref) => {
    if (!ref.can_undo) return false;
    return getLinkedEntityLiveState(ref.entity_type, ref.entity_id) !== 'removed';
  });

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[86%] space-y-1">
        <div
          className={`px-3.5 py-2.5 text-sm leading-relaxed space-y-2.5 ${
            isUser ? 'chat-bubble-user font-medium' : 'chat-bubble-assistant'
          }`}
        >
          {directPreviewUrl ? (
            <div className="overflow-hidden rounded-xl border border-black/15 bg-black/20">
              <img
                src={directPreviewUrl}
                alt={message.body || 'Imagem anexada na conversa'}
                loading="lazy"
                className="max-h-56 w-auto max-w-full object-contain rounded-xl block"
              />
            </div>
          ) : null}

          {message.body ? (
            <p className="break-words whitespace-pre-wrap">{message.body}</p>
          ) : null}

          {message.linked_entities && message.linked_entities.length > 0 ? (
            <div className="pt-0.5 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {message.linked_entities.map((ref) => renderLinkedEntity(ref))}

                {hasUndoableRef ? (
                  <button
                    type="button"
                    aria-expanded={menuState === 'open'}
                    onClick={toggleFixMenu}
                    className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1 rounded-full bg-surface-3/80 border border-border-soft text-xs text-text-muted hover:text-text hover:bg-surface-4 transition-colors"
                  >
                    <RotateCcw className="h-3 w-3 shrink-0" />
                    <span>Corrigir / Desfazer</span>
                  </button>
                ) : null}
              </div>

              {menuState !== 'closed' ? (
                <div
                  data-origin="top-left"
                  className={`t-dropdown ${
                    menuState === 'open' ? 'is-open' : 'is-closing'
                  } p-2 rounded-2xl bg-surface-3 border border-border-strong shadow-lg space-y-1.5`}
                >
                  <p className="text-[11px] font-medium text-text-muted px-1">
                    Escolha a correção rápida:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {REDIRECT_OPTIONS.map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        disabled={busyAction}
                        onClick={() => void handleRedirect(opt.target)}
                        className="min-h-[36px] px-2.5 py-1 rounded-xl bg-surface-2 border border-border text-xs font-medium text-text-secondary hover:text-text hover:bg-surface-4 transition-colors"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <p
          className={`text-[11px] text-text-dim px-1 ${
            isUser ? 'text-right' : 'text-left'
          }`}
        >
          {formattedTime}
        </p>
      </div>
    </div>
  );
}
