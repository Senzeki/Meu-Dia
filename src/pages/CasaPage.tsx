import { useMemo, useState } from 'react';
import {
  Bell,
  Check,
  History,
  PhoneCall,
  Plus,
  Repeat,
  ShoppingCart,
} from 'lucide-react';
import { CasaItemModal } from '@/components/casa/CasaItemModal';
import { MuralModal } from '@/components/casa/MuralModal';
import { triggerHaptic } from '@/lib/platform';
import { resolveTimezone } from '@/lib/timezone';
import { useAuthStore } from '@/store/useAuthStore';
import { useDataStore } from '@/store/useDataStore';
import type { HouseRoutine, MuralNote, Task, TaskAssignee } from '@/types';

type FilterMode = 'all' | 'me' | 'partner' | 'both';

const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function formatAssigneeLabel(assignee: TaskAssignee | null): string {
  if (assignee === 'me') return 'Meu';
  if (assignee === 'partner') return 'Dela';
  return 'Os dois';
}

function formatMuralSchedule(notifyAt: string | null, tz: string): string {
  if (!notifyAt) return 'Sem horário';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: resolveTimezone(tz),
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(notifyAt));
  } catch {
    return 'Agendado';
  }
}

function formatRoutineRule(routine: HouseRoutine): string {
  if (routine.mode === 'fixed_weekdays' && routine.weekdays?.length) {
    const days = routine.weekdays.map((d) => WEEKDAY_SHORT[d]).join(', ');
    return `${days} • Próx: ${routine.next_due_date.split('-').reverse().slice(0, 2).join('/')}`;
  }
  return `A cada ${routine.cycle_days ?? 7} dias • Próx: ${routine.next_due_date
    .split('-')
    .reverse()
    .slice(0, 2)
    .join('/')}`;
}

export function CasaPage() {
  const profile = useAuthStore((s) => s.profile);
  const partner = useAuthStore((s) => s.partner);

  const muralNotes = useDataStore((s) => s.muralNotes);
  const houseRoutines = useDataStore((s) => s.houseRoutines);
  const tasks = useDataStore((s) => s.tasks);
  const acknowledgeMuralNote = useDataStore((s) => s.acknowledgeMuralNote);
  const completeHouseRoutine = useDataStore((s) => s.completeHouseRoutine);
  const setTaskStatus = useDataStore((s) => s.setTaskStatus);

  const [filter, setFilter] = useState<FilterMode>('all');
  const [muralModalOpen, setMuralModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<MuralNote | null>(null);

  const [casaItemModalOpen, setCasaItemModalOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<HouseRoutine | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [expandedRoutineId, setExpandedRoutineId] = useState<string | null>(null);

  const partnerName = partner?.display_name || 'Esposa';

  const activeMuralNotes = useMemo(
    () =>
      muralNotes.filter(
        (n) =>
          !n.deleted_at &&
          n.status !== 'acknowledged' &&
          n.status !== 'dismissed',
      ),
    [muralNotes],
  );

  const sharedTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          !t.deleted_at &&
          t.scope === 'shared' &&
          t.status !== 'archived' &&
          (filter === 'all' ||
            t.assigned_to === filter ||
            t.assigned_to === 'both' ||
            (!t.assigned_to && filter === 'both')),
      ),
    [tasks, filter],
  );

  const filteredRoutines = useMemo(
    () =>
      houseRoutines.filter(
        (r) =>
          !r.deleted_at &&
          (filter === 'all' ||
            r.assigned_to === filter ||
            r.assigned_to === 'both'),
      ),
    [houseRoutines, filter],
  );

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      {/* 1. Mural com Horário */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-text">Mural</h2>
            <p className="text-xs text-text-muted">
              Recados com notificação no horário combinado
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void triggerHaptic('light');
              setEditingNote(null);
              setMuralModalOpen(true);
            }}
            className="min-h-[40px] px-3.5 rounded-full bg-shared-soft border border-shared/30 text-shared text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-shared/20 transition-colors shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Novo recado</span>
          </button>
        </div>

        {activeMuralNotes.length === 0 ? (
          <div className="surface-card p-4 text-xs text-text-muted">
            Nenhum recado pendente no Mural. Toque em &ldquo;Novo recado&rdquo; para agendar um aviso.
          </div>
        ) : (
          <div className="surface-card divide-y divide-border-soft">
            {activeMuralNotes.map((note) => {
              const isToPartner = note.recipient_id !== profile.id;
              const directionLabel = isToPartner
                ? `Você → ${partnerName}`
                : `${partnerName} → Você`;

              return (
                <div
                  key={note.id}
                  className="p-3.5 flex flex-wrap items-center justify-between gap-3"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setEditingNote(note);
                      setMuralModalOpen(true);
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="text-xs text-shared font-medium">
                      {directionLabel}
                    </p>
                    <p className="text-sm text-text font-medium truncate mt-0.5">
                      {note.body}
                    </p>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    {note.alarm_call_mode ? (
                      <span
                        title="Modo ligação"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-danger-soft text-danger text-[11px] font-medium"
                      >
                        <PhoneCall className="h-3 w-3" />
                        <span>Ligação</span>
                      </span>
                    ) : null}

                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-3 border border-border-soft text-xs text-text-secondary">
                      <Bell className="h-3 w-3 text-shared" />
                      {formatMuralSchedule(note.notify_at, profile.timezone)}
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        void triggerHaptic('success');
                        void acknowledgeMuralNote(note.id, 'acknowledged');
                      }}
                      aria-label={`Concluir recado: ${note.body}`}
                      className="min-h-[40px] px-3 rounded-full bg-surface-3 border border-border text-xs font-medium text-text-secondary hover:text-text hover:bg-surface-4 inline-flex items-center gap-1 transition-colors"
                    >
                      <Check className="h-3.5 w-3.5 text-success" />
                      <span>Feito</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. Tarefas & Rotinas da Casa */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <h2 className="text-sm font-semibold text-text">
            Tarefas e rotinas da casa
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex p-0.5 rounded-full bg-track border border-border">
              {(
                [
                  ['all', 'Tudo'],
                  ['me', 'Meu'],
                  ['partner', 'Dela'],
                  ['both', 'Os dois'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`min-h-[40px] px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    filter === key
                      ? 'bg-accent text-accent-foreground'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                void triggerHaptic('light');
                setEditingRoutine(null);
                setEditingTask(null);
                setCasaItemModalOpen(true);
              }}
              className="min-h-[40px] px-3.5 rounded-full bg-accent text-accent-foreground text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-accent-hover transition-colors shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Adicionar</span>
            </button>
          </div>
        </div>

        {/* Rotinas recorrentes (modelagem enxuta: regra + próxima ocorrência + últimas conclusões) */}
        {filteredRoutines.length > 0 ? (
          <div className="space-y-2">
            {filteredRoutines.map((routine) => {
              const historyOpen = expandedRoutineId === routine.id;
              return (
                <div key={routine.id} className="surface-card overflow-hidden">
                  <div className="p-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRoutine(routine);
                            setEditingTask(null);
                            setCasaItemModalOpen(true);
                          }}
                          className="text-sm font-semibold text-text hover:text-accent text-left truncate"
                        >
                          {routine.title}
                        </button>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-3 border border-border-soft text-text-muted">
                          {formatAssigneeLabel(routine.assigned_to)}
                        </span>
                      </div>
                      <p className="text-xs text-text-muted mt-0.5 flex items-center gap-1.5">
                        <Repeat className="h-3 w-3 text-accent shrink-0" />
                        <span>{formatRoutineRule(routine)}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {routine.recent_completions.length > 0 ? (
                        <button
                          type="button"
                          aria-expanded={historyOpen}
                          onClick={() =>
                            setExpandedRoutineId(historyOpen ? null : routine.id)
                          }
                          title="Últimas conclusões"
                          className="min-h-[40px] px-2.5 rounded-full bg-surface-3 border border-border-soft text-xs text-text-muted hover:text-text inline-flex items-center gap-1"
                        >
                          <History className="h-3.5 w-3.5" />
                          <span>{routine.recent_completions.length}</span>
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => {
                          void triggerHaptic('success');
                          void completeHouseRoutine(routine.id);
                        }}
                        className="min-h-[40px] px-3.5 rounded-full bg-surface-3 border border-border text-xs font-medium text-text hover:bg-surface-4 inline-flex items-center gap-1.5 transition-colors"
                      >
                        <Check className="h-3.5 w-3.5 text-success" />
                        <span>Concluir ciclo</span>
                      </button>
                    </div>
                  </div>

                  <div
                    data-open={historyOpen ? 'true' : 'false'}
                    className="t-acc-panel"
                  >
                    <div className="t-acc-panel-inner">
                      <div className="px-4 pb-3 pt-2 border-t border-border-soft space-y-1">
                        <p className="text-[11px] font-medium text-text-muted">
                          Últimas conclusões registradas:
                        </p>
                        {routine.recent_completions.slice(0, 5).map((log, idx) => (
                          <p
                            key={`${log.completed_at}-${idx}`}
                            className="text-xs text-text-secondary"
                          >
                            •{' '}
                            {new Date(log.completed_at).toLocaleDateString(
                              'pt-BR',
                            )}
                            {log.note ? ` — ${log.note}` : ''}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Tarefas avulsas da casa */}
        {sharedTasks.length > 0 ? (
          <div className="surface-card divide-y divide-border-soft">
            {sharedTasks.map((item) => {
              const isDone = item.status === 'done';
              return (
                <div
                  key={item.id}
                  className="p-3.5 flex items-center justify-between gap-3 hover:bg-surface-3/40 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isDone}
                      aria-label={`Marcar "${item.title}" como ${
                        isDone ? 'aberta' : 'concluída'
                      }`}
                      onClick={() => {
                        void triggerHaptic(isDone ? 'light' : 'success');
                        void setTaskStatus(item.id, isDone ? 'open' : 'done');
                      }}
                      className="t-check h-10 w-10 -ml-1.5 rounded-xl flex items-center justify-center shrink-0"
                    >
                      <span
                        className={`h-6 w-6 rounded-lg border flex items-center justify-center transition-colors ${
                          isDone
                            ? 'bg-accent border-accent text-accent-foreground'
                            : 'bg-surface-3 border-border-strong text-transparent hover:border-accent'
                        }`}
                      >
                        <svg
                          viewBox="0 0 10.1668 10.1668"
                          className="h-3.5 w-3.5"
                          fill="none"
                        >
                          <path
                            d="M1 5.52L3.92 9.17L9.17 1"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingTask(item);
                        setEditingRoutine(null);
                        setCasaItemModalOpen(true);
                      }}
                      className={`text-sm text-left truncate flex-1 ${
                        isDone
                          ? 'line-through text-text-muted'
                          : 'font-medium text-text'
                      }`}
                    >
                      {item.title}
                    </button>
                  </div>

                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-surface-3 border border-border-soft text-text-muted shrink-0">
                    {formatAssigneeLabel(item.assigned_to)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        {filteredRoutines.length === 0 && sharedTasks.length === 0 ? (
          <div className="surface-card p-5 text-center text-xs text-text-muted">
            Nenhuma tarefa ou rotina da casa para este filtro.
          </div>
        ) : null}
      </section>

      {/* Ponte informativa para o Rotinas de Casa */}
      <div className="surface-item p-4 flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-text-secondary shrink-0">
          <ShoppingCart className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs font-semibold text-text">
            Lista de mercado no Rotinas de Casa
          </p>
          <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
            A lista de compras permanece lá. Quando precisar, avise na Conversa que um item acabou para enviar direto.
          </p>
        </div>
      </div>

      <MuralModal
        open={muralModalOpen}
        onClose={() => setMuralModalOpen(false)}
        initialNote={editingNote}
      />

      <CasaItemModal
        open={casaItemModalOpen}
        onClose={() => setCasaItemModalOpen(false)}
        editingRoutine={editingRoutine}
        editingTask={editingTask}
      />
    </div>
  );
}
