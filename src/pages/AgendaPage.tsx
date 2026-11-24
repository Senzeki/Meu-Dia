import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Clock, Leaf, Plus } from 'lucide-react';
import { useUiStore } from '@/store/useUiStore';
import type { AgendaHorizon } from '@/types';

const HORIZONS: Array<{ id: AgendaHorizon; label: string }> = [
  { id: 'today', label: 'Hoje' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mês' },
  { id: 'later', label: 'Depois' },
];

export function AgendaPage() {
  const agendaHorizon = useUiStore((s) => s.agendaHorizon);
  const setAgendaHorizon = useUiStore((s) => s.setAgendaHorizon);
  const pauseSession = useUiStore((s) => s.pauseSession);
  const endPause = useUiStore((s) => s.endPause);

  const [previousOpen, setPreviousOpen] = useState(false);

  if (pauseSession.active) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-4">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-success-soft border border-success/25 text-success flex items-center justify-center">
          <Leaf className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-text">Modo descanso ativo</h2>
          <p className="text-sm text-text-muted max-w-md mx-auto leading-relaxed">
            As listas do dia ficam recolhidas durante os {pauseSession.duration_minutes}{' '}
            minutos de pausa.
          </p>
        </div>
        <button
          type="button"
          onClick={endPause}
          className="h-10 px-4 rounded-full bg-surface-2 border border-border text-xs font-medium text-text hover:bg-surface-3 transition-colors"
        >
          Voltar para a agenda
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      {/* Seletor temporal + criação manual (sem overflow em 390px e alvos >= 40px) */}
      <div className="flex items-center justify-between gap-2.5 min-w-0">
        <div
          role="tablist"
          aria-label="Horizonte da agenda"
          className="inline-flex flex-1 min-w-0 sm:flex-none p-1 rounded-full bg-track border border-border"
        >
          {HORIZONS.map((h) => {
            const selected = agendaHorizon === h.id;
            return (
              <button
                key={h.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setAgendaHorizon(h.id)}
                className={`relative flex-1 min-w-0 sm:flex-none min-h-[40px] px-2.5 sm:px-3.5 rounded-full text-xs font-medium flex items-center justify-center transition-colors ${
                  selected ? 'text-accent-foreground' : 'text-text-muted hover:text-text'
                }`}
              >
                {selected ? (
                  <motion.span
                    layoutId="agenda-horizon-pill"
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0 rounded-full bg-accent"
                  />
                ) : null}
                <span className="relative z-10 truncate">{h.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          aria-label="Novo item"
          className="h-11 w-11 sm:w-auto sm:px-4 rounded-full bg-accent text-accent-foreground text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-accent-hover transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Novo item</span>
        </button>
      </div>

      {agendaHorizon === 'today' ? (
        <div className="space-y-4">
          {/* Banner discreto e recolhível de dias anteriores — Zero vermelho */}
          <div className="surface-card overflow-hidden">
            <button
              type="button"
              aria-expanded={previousOpen}
              onClick={() => setPreviousOpen((v) => !v)}
              className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-surface-3/60 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="h-2 w-2 rounded-full bg-accent shrink-0" />
                <span className="text-xs font-medium text-text-secondary truncate">
                  1 item de dias anteriores • Revisar
                </span>
              </div>
              <svg
                viewBox="0 0 16 16"
                fill="none"
                data-open={previousOpen ? 'true' : 'false'}
                className="t-acc-chevron h-4 w-4 text-text-muted shrink-0"
              >
                <path
                  d="M4 6L8 10L12 6"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </button>

            <div data-open={previousOpen ? 'true' : 'false'} className="t-acc-panel">
              <div className="t-acc-panel-inner">
                <div className="px-4 pb-3.5 pt-1 border-t border-border-soft flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                  <p className="text-sm text-text">Comprar fita isolante na elétrica</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {['Hoje', 'Semana', 'Depois', 'Arquivar'].map((action) => (
                      <button
                        key={action}
                        type="button"
                        className="min-h-[40px] px-3.5 rounded-full bg-surface-3 border border-border text-xs font-medium text-text-secondary hover:text-text hover:bg-surface-4"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Lista de Hoje */}
          <section className="space-y-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted px-0.5">
              Para hoje
            </h2>

            <div className="surface-card divide-y divide-border-soft">
              <label className="p-3.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-surface-3/40 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <input type="checkbox" className="h-4 w-4 rounded" />
                  <span className="text-sm font-medium text-text truncate">
                    Conferir óleo e relação da moto
                  </span>
                </div>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-surface-3 border border-border-soft text-text-muted shrink-0">
                  Pessoal
                </span>
              </label>

              <label className="p-3.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-surface-3/40 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <input type="checkbox" className="h-4 w-4 rounded" />
                  <span className="text-sm font-medium text-text truncate">
                    Revisar medidas da obra no computador à noite
                  </span>
                </div>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-surface-3 border border-border-soft text-text-muted shrink-0">
                  20:30
                </span>
              </label>
            </div>
          </section>

          {/* Aguardando retorno */}
          <section className="space-y-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted px-0.5">
              Aguardando retorno
            </h2>
            <div className="surface-card p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Clock className="h-4 w-4 text-warning shrink-0" />
                <span className="text-sm text-text truncate">
                  Orçamento da oficina da moto
                </span>
              </div>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-warning-soft text-warning font-medium shrink-0">
                Lembrar em 2 dias
              </span>
            </div>
          </section>
        </div>
      ) : null}

      {agendaHorizon === 'week' ? (
        <div className="space-y-3">
          <div className="surface-card p-4 space-y-2">
            <p className="text-xs font-semibold text-accent">Quarta-feira</p>
            <p className="text-sm text-text">Passar na loja de material elétrico</p>
          </div>
          <div className="surface-card p-4 space-y-2">
            <p className="text-xs font-semibold text-accent">Sábado • Fim de semana</p>
            <p className="text-sm text-text">Cortar a grama do quintal (~15 dias)</p>
            <p className="text-sm text-text-secondary">Limpar filtro do ar-condicionado</p>
          </div>
        </div>
      ) : null}

      {agendaHorizon === 'month' ? (
        <div className="surface-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">Próximos compromissos e vencimentos</h2>
            <ChevronDown className="h-4 w-4 text-text-muted" />
          </div>
          <div className="space-y-2 text-sm">
            <div className="surface-item p-3 flex items-center justify-between">
              <span className="text-text">Consulta médica às 14:00</span>
              <span className="text-xs text-text-muted">05 Dez</span>
            </div>
            <div className="surface-item p-3 flex items-center justify-between">
              <span className="text-text">Licenciamento anual da moto</span>
              <span className="text-xs text-text-muted">Ago/2027</span>
            </div>
          </div>
        </div>
      ) : null}

      {agendaHorizon === 'later' ? (
        <div className="surface-card p-4 space-y-2.5">
          <p className="text-xs text-text-muted">Itens sem data definida</p>
          <div className="surface-item p-3 text-sm text-text">
            Trocar revestimento da área de serviço
          </div>
        </div>
      ) : null}
    </div>
  );
}
