import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowUpRight,
  Check,
  Edit3,
  Gauge,
  HelpCircle,
  Mic,
  RotateCcw,
} from 'lucide-react';
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
  const undoOrRedirectMessageAction = useDataStore(
    (s) => s.undoOrRedirectMessageAction,
  );
  const resolveClarification = useDataStore((s) => s.resolveClarification);
  const editAudioTranscript = useDataStore((s) => s.editAudioTranscript);
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

  const [editingTranscript, setEditingTranscript] = useState(false);
  const [transcriptDraft, setTranscriptDraft] = useState(message.body);

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

  async function handleClarificationSelect(optionId: string) {
    if (busyAction) return;
    setBusyAction(true);
    try {
      void triggerHaptic('success');
      await resolveClarification(message.id, optionId);
    } finally {
      setBusyAction(false);
    }
  }

  async function handleSaveTranscript(e: FormEvent) {
    e.preventDefault();
    const cleaned = transcriptDraft.trim();
    if (!cleaned || busyAction) return;
    setBusyAction(true);
    try {
      void triggerHaptic('success');
      await editAudioTranscript(message.id, cleaned);
      setEditingTranscript(false);
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
          className="inline-flex items-center gap-1 min-h-[40px] px-3 py-1 rounded-full bg-surface-3/60 border border-border-soft text-xs text-text-dim select-none"
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
          className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1 rounded-full bg-success-soft border border-success/30 text-xs font-medium text-success hover:opacity-90 transition-opacity"
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
        className="inline-flex items-center gap-1 min-h-[40px] px-3 py-1 rounded-full bg-surface-3 border border-border text-xs font-medium text-text hover:bg-surface-4 transition-colors"
      >
        <ArrowUpRight className="h-3.5 w-3.5 text-accent shrink-0" />
        <span>{ref.label}</span>
      </button>
    );
  }

  const isUser = message.sender === 'user';
  const isAudioTranscript = message.message_type === 'audio_transcript';
  const isCheckin = message.message_type === 'checkin';
  const clarification = message.clarification_payload;

  const hasUndoableRef = message.linked_entities?.some((ref) => {
    if (!ref.can_undo) return false;
    return getLinkedEntityLiveState(ref.entity_type, ref.entity_id) !== 'removed';
  });

  const selectedClarificationOption = clarification?.resolved
    ? clarification.options.find(
        (opt) => opt.id === clarification.selected_option_id,
      )
    : null;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[86%] space-y-1">
        <div
          className={`px-3.5 py-2.5 text-sm leading-relaxed space-y-2.5 ${
            isUser ? 'chat-bubble-user font-medium' : 'chat-bubble-assistant'
          }`}
        >
          {/* Cabeçalho discreto para Check-in semanal */}
          {isCheckin ? (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-accent">
              <Gauge className="h-3.5 w-3.5 shrink-0" />
              <span>Acompanhamento semanal</span>
            </div>
          ) : null}

          {/* Cabeçalho discreto para Áudio transcrito + ação "Corrigir texto" */}
          {isAudioTranscript ? (
            <div className="flex items-center justify-between gap-2">
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                  isUser ? 'text-accent-foreground/80' : 'text-accent'
                }`}
              >
                <Mic className="h-3 w-3 shrink-0" />
                <span>Áudio transcrito</span>
              </span>

              {message.transcript_editable !== false && !editingTranscript ? (
                <button
                  type="button"
                  onClick={() => {
                    setTranscriptDraft(message.body);
                    setEditingTranscript(true);
                  }}
                  className={`inline-flex items-center gap-1 min-h-[40px] px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                    isUser
                      ? 'bg-black/15 text-accent-foreground hover:bg-black/25'
                      : 'bg-surface-3 border border-border-soft text-text-secondary hover:text-text'
                  }`}
                >
                  <Edit3 className="h-3.5 w-3.5 shrink-0" />
                  <span>Corrigir texto</span>
                </button>
              ) : null}
            </div>
          ) : null}

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

          {/* Edição inline da transcrição de áudio */}
          {editingTranscript ? (
            <form
              onSubmit={(e) => void handleSaveTranscript(e)}
              className="space-y-2 pt-1"
            >
              <textarea
                rows={2}
                value={transcriptDraft}
                onChange={(e) => setTranscriptDraft(e.target.value)}
                aria-label="Editar texto transcrito do áudio"
                autoFocus
                className="w-full p-2.5 rounded-xl bg-surface-2 border border-border text-sm text-text font-normal"
              />
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditingTranscript(false)}
                  className="min-h-[40px] px-3 rounded-full bg-surface-3 border border-border text-xs font-medium text-text-secondary hover:text-text"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busyAction || !transcriptDraft.trim()}
                  className="min-h-[40px] px-3.5 rounded-full bg-accent text-accent-foreground text-xs font-semibold hover:bg-accent-hover"
                >
                  Reprocessar
                </button>
              </div>
            </form>
          ) : message.body ? (
            <p className="break-words whitespace-pre-wrap">{message.body}</p>
          ) : null}

          {/* Ambiguidade (needs_clarification): pergunta + botões rápidos >= 40px */}
          {clarification ? (
            <div className="pt-1 space-y-2">
              {clarification.question &&
              clarification.question !== message.body ? (
                <p className="text-xs text-text-secondary flex items-center gap-1.5">
                  <HelpCircle className="h-3.5 w-3.5 text-warning shrink-0" />
                  <span>{clarification.question}</span>
                </p>
              ) : null}

              {!clarification.resolved ? (
                <div className="flex flex-wrap gap-1.5">
                  {clarification.options.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={busyAction}
                      onClick={() => void handleClarificationSelect(opt.id)}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-full bg-accent text-accent-foreground text-xs font-semibold hover:bg-accent-hover disabled:opacity-50 transition-colors"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ) : selectedClarificationOption ? (
                <div className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1 rounded-full bg-surface-3 border border-border-soft text-xs text-text-secondary">
                  <Check className="h-3.5 w-3.5 text-success shrink-0" />
                  <span>Escolha aplicada: {selectedClarificationOption.label}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Vínculos vivos (suporta multi-intenção com múltiplos linked_entities) */}
          {message.linked_entities && message.linked_entities.length > 0 ? (
            <div className="pt-0.5 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {message.linked_entities.map((ref) => renderLinkedEntity(ref))}

                {hasUndoableRef ? (
                  <button
                    type="button"
                    aria-expanded={menuState === 'open'}
                    onClick={toggleFixMenu}
                    className="inline-flex items-center gap-1 min-h-[40px] px-3 py-1 rounded-full bg-surface-3/80 border border-border-soft text-xs text-text-muted hover:text-text hover:bg-surface-4 transition-colors"
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
                        className="min-h-[40px] px-3 py-1 rounded-xl bg-surface-2 border border-border text-xs font-medium text-text-secondary hover:text-text hover:bg-surface-4 transition-colors"
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
