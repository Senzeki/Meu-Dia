import { useState, type FormEvent } from 'react';
import { ArrowUpRight, ImagePlus, Mic, Send } from 'lucide-react';
import { useUiStore } from '@/store/useUiStore';

interface PreviewMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  time: string;
  linkLabel?: string;
  linkTab?: 'agenda' | 'casa' | 'cuidados' | 'guardados';
}

const INITIAL_SHELL_MESSAGES: PreviewMessage[] = [
  {
    id: 'm1',
    sender: 'user',
    text: 'https://github.com/exemplo/painel — guardar em links',
    time: '20:40',
  },
  {
    id: 'm2',
    sender: 'assistant',
    text: 'Salvo em Guardados → Links.',
    time: '20:40',
    linkLabel: 'Abrir Guardados',
    linkTab: 'guardados',
  },
  {
    id: 'm3',
    sender: 'assistant',
    text: 'Passou uma semana. Quantos km estão a sua moto e a moto da sua esposa hoje?',
    time: '08:00',
    linkLabel: 'Ver Cuidados',
    linkTab: 'cuidados',
  },
];

export function ChatPane() {
  const navigateToArea = useUiStore((s) => s.navigateToArea);
  const [messages, setMessages] = useState<PreviewMessage[]>(INITIAL_SHELL_MESSAGES);
  const [draft, setDraft] = useState('');

  function handleSend(e: FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    const time = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-u`,
        sender: 'user',
        text: trimmed,
        time,
      },
      {
        id: `${Date.now()}-a`,
        sender: 'assistant',
        text: 'Anotado em Hoje.',
        time,
        linkLabel: 'Abrir Agenda',
        linkTab: 'agenda',
      },
    ]);
    setDraft('');
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
          <p className="text-xs text-text-muted">Texto, links, fotos e áudios rápidos</p>
        </div>
      </div>

      {/* Histórico cronológico */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        <div className="text-center">
          <span className="inline-block px-3 py-0.5 rounded-full bg-surface-2 border border-border-soft text-[11px] text-text-muted">
            Hoje
          </span>
        </div>

        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div
              key={msg.id}
              className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div className="max-w-[84%] space-y-1">
                <div
                  className={`px-3.5 py-2.5 text-sm leading-relaxed space-y-2 ${
                    isUser ? 'chat-bubble-user font-medium' : 'chat-bubble-assistant'
                  }`}
                >
                  <p className="break-words">{msg.text}</p>

                  {msg.linkLabel && msg.linkTab ? (
                    <div className="pt-0.5">
                      <button
                        type="button"
                        onClick={() => navigateToArea(msg.linkTab!)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-3 border border-border text-xs font-medium text-text hover:bg-surface-4 transition-colors"
                      >
                        <ArrowUpRight className="h-3.5 w-3.5 text-accent" />
                        <span>{msg.linkLabel}</span>
                      </button>
                    </div>
                  ) : null}
                </div>

                <p
                  className={`text-[11px] text-text-dim px-1 ${
                    isUser ? 'text-right' : 'text-left'
                  }`}
                >
                  {msg.time}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Barra de entrada */}
      <form
        onSubmit={handleSend}
        className="shrink-0 p-3 border-t border-border bg-surface-1 flex items-center gap-2"
      >
        <button
          type="button"
          aria-label="Anexar foto ou print"
          title="Foto ou print"
          className="h-10 w-10 rounded-full bg-surface-2 border border-border flex items-center justify-center text-text-secondary hover:text-text hover:bg-surface-3 transition-colors shrink-0"
        >
          <ImagePlus className="h-4 w-4" />
        </button>

        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escreva uma anotação, link ou recado..."
          className="flex-1 min-w-0 h-10 px-4 rounded-full bg-surface-2 border border-border text-sm text-text placeholder:text-text-dim"
        />

        <button
          type="button"
          aria-label="Gravar áudio curto"
          title="Áudio curto"
          className="h-10 w-10 rounded-full bg-surface-2 border border-border flex items-center justify-center text-text-secondary hover:text-text hover:bg-surface-3 transition-colors shrink-0"
        >
          <Mic className="h-4 w-4" />
        </button>

        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Enviar mensagem"
          className="h-10 px-4 rounded-full bg-accent text-accent-foreground text-xs font-semibold flex items-center gap-1.5 hover:bg-accent-hover disabled:opacity-45 transition-all shrink-0"
        >
          <Send className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Enviar</span>
        </button>
      </form>
    </section>
  );
}
