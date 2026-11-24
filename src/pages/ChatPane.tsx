import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { CloudOff, History, ImagePlus, Send, X } from 'lucide-react';
import { AudioRecorderButton } from '@/components/chat/AudioRecorderButton';
import { ChatBubble } from '@/components/chat/ChatBubble';
import { triggerHaptic } from '@/lib/platform';
import { getLocalDateString, resolveTimezone } from '@/lib/timezone';
import { useAuthStore } from '@/store/useAuthStore';
import { useDataStore } from '@/store/useDataStore';
import { useUiStore } from '@/store/useUiStore';

function formatMessageTime(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: resolveTimezone(timezone),
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

function formatDayChip(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return 'Hoje';
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  return `${d}/${m}/${y}`;
}

export function ChatPane() {
  const profile = useAuthStore((s) => s.profile);
  const focusedMessageId = useUiStore((s) => s.focusedMessageId);
  const focusChatMessage = useUiStore((s) => s.focusChatMessage);
  const hydrated = useDataStore((s) => s.hydrated);
  const messages = useDataStore((s) => s.messages);
  const hasOlderMessages = useDataStore((s) => s.hasOlderMessages);
  const pendingAudioCount = useDataStore((s) => s.pendingAudioCount);
  const loadOlderMessages = useDataStore((s) => s.loadOlderMessages);
  const sendChatInput = useDataStore((s) => s.sendChatInput);
  const triggerWeeklyCheckinIfDue = useDataStore(
    (s) => s.triggerWeeklyCheckinIfDue,
  );

  const [draft, setDraft] = useState('');
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(
    null,
  );
  const [audioErrorNotice, setAudioErrorNotice] = useState<string | null>(null);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const lastCompositionEndRef = useRef<number | null>(null);
  const checkinCheckedRef = useRef(false);
  const chatInputId = useId();

  const todayStr = getLocalDateString(new Date(), profile.timezone);

  useEffect(() => {
    if (focusedMessageId) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, focusedMessageId]);

  useEffect(() => {
    if (!focusedMessageId) return;
    const container = listRef.current;
    if (container) {
      const targetEl = container.querySelector<HTMLElement>(
        `[data-message-id="${focusedMessageId}"]`,
      );
      if (targetEl && typeof targetEl.scrollIntoView === 'function') {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    const timer = window.setTimeout(() => {
      focusChatMessage(null);
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [focusedMessageId, messages.length, focusChatMessage]);

  useEffect(() => {
    if (!hydrated || checkinCheckedRef.current) return;
    checkinCheckedRef.current = true;
    if (typeof triggerWeeklyCheckinIfDue === 'function') {
      void triggerWeeklyCheckinIfDue();
    }
  }, [hydrated, triggerWeeklyCheckinIfDue]);

  useEffect(() => {
    return () => {
      if (pendingPreviewUrl) {
        URL.revokeObjectURL(pendingPreviewUrl);
      }
    };
  }, [pendingPreviewUrl]);

  async function handleLoadOlder() {
    if (loadingOlder) return;
    setLoadingOlder(true);
    try {
      await loadOlderMessages();
    } finally {
      setLoadingOlder(false);
    }
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    // Se não houver texto sendo digitado, envia o print imediatamente em 1 toque
    if (!draft.trim()) {
      setSending(true);
      try {
        void triggerHaptic('light');
        await sendChatInput({
          image_blob: file,
          image_title: file.name || 'Print guardado',
        });
      } finally {
        setSending(false);
      }
      return;
    }

    if (pendingPreviewUrl) {
      URL.revokeObjectURL(pendingPreviewUrl);
    }
    const preview =
      typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(file)
        : null;
    setPendingImage(file);
    setPendingPreviewUrl(preview);
  }

  function clearPendingImage() {
    if (pendingPreviewUrl) {
      URL.revokeObjectURL(pendingPreviewUrl);
    }
    setPendingImage(null);
    setPendingPreviewUrl(null);
  }

  async function handleAudioReady(blob: Blob, durationSeconds: number) {
    setSending(true);
    try {
      await sendChatInput({
        audio_blob: blob,
        audio_duration_seconds: durationSeconds,
      });
    } finally {
      setSending(false);
    }
  }

  async function submitCurrentInput() {
    const trimmed = draft.trim();
    if ((!trimmed && !pendingImage) || sending) return;

    const imageToSend = pendingImage;
    setDraft('');
    clearPendingImage();
    setSending(true);

    try {
      void triggerHaptic('light');
      await sendChatInput({
        text: trimmed || undefined,
        image_blob: imageToSend,
        image_title: trimmed || imageToSend?.name || undefined,
      });
    } finally {
      setSending(false);
    }
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    void submitCurrentInput();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) {
        return;
      }
      if (
        lastCompositionEndRef.current !== null &&
        Math.abs(e.timeStamp - lastCompositionEndRef.current) < 50
      ) {
        return;
      }
      void submitCurrentInput();
    }
  }

  return (
    <section
      aria-label="Conversa"
      className="h-full flex flex-col bg-bg/60 min-h-0"
    >
      {/* Cabeçalho discreto exclusivo do painel direito no PC */}
      <div className="hidden lg:flex items-center justify-between px-5 py-3 border-b border-border bg-surface-1/60">
        <div>
          <h2 className="text-sm font-semibold text-text">Conversa</h2>
          <p className="text-xs text-text-muted">
            Texto, links, fotos e áudios rápidos
          </p>
        </div>
      </div>

      {/* Histórico cronológico */}
      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3"
      >
        {hasOlderMessages ? (
          <div className="text-center pb-1">
            <button
              type="button"
              disabled={loadingOlder}
              onClick={() => void handleLoadOlder()}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-full bg-surface-2 border border-border text-xs font-medium text-text-secondary hover:text-text hover:bg-surface-3 transition-colors"
            >
              <History className="h-3.5 w-3.5 text-accent" />
              <span>
                {loadingOlder
                  ? 'Carregando...'
                  : 'Carregar mensagens anteriores'}
              </span>
            </button>
          </div>
        ) : null}

        {messages.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <span className="inline-block px-3 py-0.5 rounded-full bg-surface-2 border border-border-soft text-[11px] text-text-muted">
              Hoje
            </span>
            <p className="text-xs text-text-muted max-w-xs mx-auto leading-relaxed">
              Envie uma anotação rápida, link, quilometragem, áudio curto ou foto de print para guardar e organizar.
            </p>
          </div>
        ) : null}

        {messages.map((msg, idx) => {
          const msgDay = getLocalDateString(
            new Date(msg.created_at),
            profile.timezone,
          );
          const prevDay =
            idx > 0
              ? getLocalDateString(
                  new Date(messages[idx - 1].created_at),
                  profile.timezone,
                )
              : '';
          const showDayHeader = msgDay !== prevDay;

          return (
            <div key={msg.id} data-message-id={msg.id} className="space-y-3">
              {showDayHeader ? (
                <div className="text-center">
                  <span className="inline-block px-3 py-0.5 rounded-full bg-surface-2 border border-border-soft text-[11px] text-text-muted">
                    {formatDayChip(msgDay, todayStr)}
                  </span>
                </div>
              ) : null}

              <ChatBubble
                message={msg}
                highlighted={focusedMessageId === msg.id}
                formattedTime={formatMessageTime(
                  msg.created_at,
                  profile.timezone,
                )}
              />
            </div>
          );
        })}
      </div>

      {/* Chip discreto de áudios aguardando conexão offline para transcrição */}
      {pendingAudioCount > 0 ? (
        <div
          role="status"
          className="mx-3 mb-2 px-3.5 py-2 rounded-2xl bg-warning-soft border border-warning/30 flex items-center gap-2 text-xs text-warning"
        >
          <CloudOff className="h-3.5 w-3.5 shrink-0" />
          <span>
            {pendingAudioCount}{' '}
            {pendingAudioCount === 1
              ? 'áudio aguardando conexão para transcrição'
              : 'áudios aguardando conexão para transcrição'}
          </span>
        </div>
      ) : null}

      {/* Aviso gentil caso o navegador bloqueie ou não possua microfone */}
      {audioErrorNotice ? (
        <div
          role="status"
          className="mx-3 mb-2 px-3.5 py-2.5 rounded-2xl bg-surface-2 border border-border flex items-center justify-between gap-2 text-xs text-text-secondary"
        >
          <span>{audioErrorNotice}</span>
          <button
            type="button"
            onClick={() => setAudioErrorNotice(null)}
            aria-label="Fechar aviso de microfone"
            className="h-8 w-8 rounded-full bg-surface-3 flex items-center justify-center text-text-muted hover:text-text shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {/* Prévia opcional quando imagem foi escolhida junto com texto */}
      {pendingImage ? (
        <div className="mx-3 mb-2 p-2.5 rounded-2xl bg-surface-2 border border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {pendingPreviewUrl ? (
              <img
                src={pendingPreviewUrl}
                alt="Prévia do anexo"
                className="h-10 w-10 rounded-lg object-cover border border-border-soft shrink-0"
              />
            ) : null}
            <span className="text-xs text-text truncate">
              {pendingImage.name}
            </span>
          </div>
          <button
            type="button"
            onClick={clearPendingImage}
            aria-label="Remover imagem selecionada"
            className="h-8 w-8 rounded-full bg-surface-3 flex items-center justify-center text-text-muted hover:text-text shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {/* Barra de entrada */}
      <form
        onSubmit={handleFormSubmit}
        className="shrink-0 p-3 border-t border-border bg-surface-1 flex items-center gap-2"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => void handleFileChange(e)}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Anexar foto ou print"
          title="Foto ou print"
          className={`${
            isRecordingAudio ? 'hidden' : 'flex'
          } h-11 w-11 rounded-full bg-surface-2 border border-border items-center justify-center text-text-secondary hover:text-text hover:bg-surface-3 transition-colors shrink-0`}
        >
          <ImagePlus className="h-4 w-4" />
        </button>

        <label htmlFor={chatInputId} className="visually-hidden">
          Mensagem para a conversa
        </label>
        <input
          id={chatInputId}
          name="chat_message"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onCompositionEnd={(e) => {
            lastCompositionEndRef.current = e.timeStamp;
          }}
          onKeyDown={handleKeyDown}
          enterKeyHint="send"
          placeholder="Escreva uma anotação, link ou km..."
          className={`${
            isRecordingAudio ? 'hidden' : 'block'
          } flex-1 min-w-0 h-11 px-4 rounded-full bg-surface-2 border border-border text-sm text-text placeholder:text-text-dim`}
        />

        <AudioRecorderButton
          disabled={sending}
          onAudioReady={handleAudioReady}
          onErrorNotice={setAudioErrorNotice}
          onRecordingChange={setIsRecordingAudio}
        />

        <button
          type="submit"
          disabled={(!draft.trim() && !pendingImage) || sending}
          aria-label="Enviar mensagem"
          className={`${
            isRecordingAudio ? 'hidden' : 'flex'
          } h-11 px-4 rounded-full bg-accent text-accent-foreground text-xs font-semibold items-center gap-1.5 hover:bg-accent-hover disabled:opacity-45 transition-all shrink-0`}
        >
          <Send className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Enviar</span>
        </button>
      </form>
    </section>
  );
}
