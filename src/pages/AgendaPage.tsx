import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Leaf,
  PhoneCall,
  Plus,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { TaskModal } from '@/components/agenda/TaskModal';
import { formatRemainingPauseTime } from '@/components/modals/PauseDialog';
import { triggerHaptic } from '@/lib/platform';
import {
  getLocalDateString,
  isBeforeLocalToday,
  resolveTimezone,
} from '@/lib/timezone';
import { useAuthStore } from '@/store/useAuthStore';
import { useDataStore } from '@/store/useDataStore';
import { useUiStore } from '@/store/useUiStore';
import type { AgendaHorizon, Task } from '@/types';

const HORIZONS: Array<{ id: AgendaHorizon; label: string }> = [
  { id: 'today', label: 'Hoje' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mês' },
  { id: 'later', label: 'Depois' },
];

const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKDAY_FULL = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];
const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function addDaysToIsoDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekdayFromIsoDate(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

function formatDayMonthPtBr(isoDate: string): string {
  const [, m, d] = isoDate.split('-').map(Number);
  const shortMonth = MONTH_NAMES[(m || 1) - 1]?.slice(0, 3) ?? '';
  return `${String(d).padStart(2, '0')} ${shortMonth}`;
}

function formatWaitingBadge(remindAt: string | null): string {
  if (!remindAt) return 'Aguardando';
  const diffDays = Math.ceil(
    (new Date(remindAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays <= 0) return 'Retorno pendente hoje';
  if (diffDays === 1) return 'Lembrar amanhã';
  return `Lembrar em ${diffDays} dias`;
}

export function AgendaPage() {
  const profile = useAuthStore((s) => s.profile);
  const agendaHorizon = useUiStore((s) => s.agendaHorizon);
  const setAgendaHorizon = useUiStore((s) => s.setAgendaHorizon);
  const pauseSession = useUiStore((s) => s.pauseSession);
  const setPauseModalOpen = useUiStore((s) => s.setPauseModalOpen);
  const endPause = useUiStore((s) => s.endPause);

  const tasks = useDataStore((s) => s.tasks);
  const houseRoutines = useDataStore((s) => s.houseRoutines);
  const careRules = useDataStore((s) => s.careRules);
  const assets = useDataStore((s) => s.assets);
  const setTaskStatus = useDataStore((s) => s.setTaskStatus);
  const moveOverdueTask = useDataStore((s) => s.moveOverdueTask);
  const getUpcomingWarrantyAlerts = useDataStore((s) => s.getUpcomingWarrantyAlerts);

  const [previousOpen, setPreviousOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [, setPauseTick] = useState(0);

  const tz = resolveTimezone(profile.timezone);
  const todayStr = getLocalDateString(new Date(), tz);
  const [todayYear, todayMonth] = todayStr.split('-').map(Number);

  const [calendarYear, setCalendarYear] = useState(todayYear);
  const [calendarMonth, setCalendarMonth] = useState(todayMonth); // 1..12

  useEffect(() => {
    if (!pauseSession.active || !pauseSession.ends_at) return;
    const timer = window.setInterval(() => {
      const { remainingSeconds } = formatRemainingPauseTime(pauseSession.ends_at);
      if (remainingSeconds <= 0) {
        endPause();
      } else {
        setPauseTick((v) => v + 1);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pauseSession.active, pauseSession.ends_at, endPause]);

  const activeTasks = useMemo(
    () => tasks.filter((t) => !t.deleted_at && t.status !== 'archived'),
    [tasks],
  );

  const overdueTasks = useMemo(
    () =>
      activeTasks.filter(
        (t) =>
          t.status === 'open' &&
          Boolean(t.due_date) &&
          isBeforeLocalToday(t.due_date!, new Date(), tz),
      ),
    [activeTasks, tz],
  );

  const todayTasks = useMemo(
    () =>
      activeTasks.filter((t) => {
        if (t.status === 'waiting') return false;
        if (
          t.status === 'open' &&
          t.due_date &&
          isBeforeLocalToday(t.due_date, new Date(), tz)
        ) {
          return false;
        }
        return t.due_date === todayStr || (t.horizon === 'today' && !t.due_date);
      }),
    [activeTasks, todayStr, tz],
  );

  const waitingTasks = useMemo(
    () => activeTasks.filter((t) => t.status === 'waiting'),
    [activeTasks],
  );

  const laterTasks = useMemo(
    () =>
      activeTasks.filter(
        (t) => t.horizon === 'later' && t.status !== 'waiting',
      ),
    [activeTasks],
  );

  const warrantyAlerts = getUpcomingWarrantyAlerts(30);

  // Próximos 7 dias em America/Sao_Paulo
  const nextSevenDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const dateStr = addDaysToIsoDate(todayStr, i);
      const weekday = getWeekdayFromIsoDate(dateStr);
      const isWeekend = weekday === 0 || weekday === 6;

      const dayTasks = activeTasks.filter(
        (t) => t.due_date === dateStr && t.status !== 'waiting',
      );
      const dayRoutines = houseRoutines.filter((r) => {
        if (r.deleted_at) return false;
        if (r.next_due_date === dateStr) return true;
        if (r.mode === 'fixed_weekdays' && r.weekdays?.includes(weekday)) {
          return true;
        }
        return false;
      });
      const dayCareRules = careRules.filter(
        (c) => !c.deleted_at && c.next_due_date === dateStr,
      );

      return {
        dateStr,
        weekday,
        weekdayName: i === 0 ? `Hoje • ${WEEKDAY_FULL[weekday]}` : WEEKDAY_FULL[weekday],
        dateLabel: formatDayMonthPtBr(dateStr),
        isWeekend,
        dayTasks,
        dayRoutines,
        dayCareRules,
      };
    });
  }, [todayStr, activeTasks, houseRoutines, careRules]);

  const unscheduledWeekTasks = useMemo(
    () =>
      activeTasks.filter(
        (t) => t.horizon === 'week' && !t.due_date && t.status !== 'waiting',
      ),
    [activeTasks],
  );

  // Dados do calendário mensal
  const monthCalendar = useMemo(() => {
    const firstWeekday = new Date(
      Date.UTC(calendarYear, calendarMonth - 1, 1, 12, 0, 0),
    ).getUTCDay();
    const daysInMonth = new Date(
      Date.UTC(calendarYear, calendarMonth, 0, 12, 0, 0),
    ).getUTCDate();

    const monthPrefix = `${calendarYear}-${String(calendarMonth).padStart(2, '0')}`;
    const eventDays = new Set<number>();

    for (const t of activeTasks) {
      if (t.due_date?.startsWith(monthPrefix)) {
        const d = Number(t.due_date.split('-')[2]);
        if (d) eventDays.add(d);
      }
    }
    for (const r of houseRoutines) {
      if (!r.deleted_at && r.next_due_date?.startsWith(monthPrefix)) {
        const d = Number(r.next_due_date.split('-')[2]);
        if (d) eventDays.add(d);
      }
    }
    for (const c of careRules) {
      if (c.deleted_at) continue;
      if (c.next_due_date?.startsWith(monthPrefix)) {
        const d = Number(c.next_due_date.split('-')[2]);
        if (d) eventDays.add(d);
      }
      if (c.trigger_type === 'annual_date' && c.annual_month === calendarMonth) {
        eventDays.add(Math.min(c.annual_day || 1, daysInMonth));
      }
    }
    for (const a of assets) {
      if (!a.deleted_at && a.warranty_expires_at?.startsWith(monthPrefix)) {
        const d = Number(a.warranty_expires_at.split('-')[2]);
        if (d) eventDays.add(d);
      }
    }

    const monthTasks = activeTasks.filter(
      (t) =>
        t.due_date?.startsWith(monthPrefix) ||
        (t.horizon === 'month' && !t.due_date),
    );

    const annualCareRules = careRules.filter(
      (c) =>
        !c.deleted_at &&
        (c.trigger_type === 'annual_date' ||
          c.next_due_date?.startsWith(monthPrefix)),
    );

    return {
      firstWeekday,
      daysInMonth,
      monthPrefix,
      eventDays,
      monthTasks,
      annualCareRules,
    };
  }, [calendarYear, calendarMonth, activeTasks, houseRoutines, careRules, assets]);

  function openCreateModal() {
    void triggerHaptic('light');
    setEditingTask(null);
    setModalOpen(true);
  }

  function openEditModal(task: Task) {
    void triggerHaptic('light');
    setEditingTask(task);
    setModalOpen(true);
  }

  function shiftMonth(delta: number) {
    let nextMonth = calendarMonth + delta;
    let nextYear = calendarYear;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    setCalendarMonth(nextMonth);
    setCalendarYear(nextYear);
  }

  const pausePrefs = profile.pause_preferences;
  const pauseDaysLabel = pausePrefs.weekdays
    .map((d) => WEEKDAY_SHORT[d])
    .filter(Boolean)
    .join(', ');

  if (pauseSession.active) {
    const { formatted } = formatRemainingPauseTime(pauseSession.ends_at);
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-5">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-success-soft border border-success/25 text-success flex items-center justify-center">
          <Leaf className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-text">Modo descanso ativo</h2>
          <p
            aria-live="polite"
            className="text-3xl font-mono font-bold text-success tracking-tight"
          >
            {formatted}
          </p>
          <p className="text-sm text-text-muted max-w-md mx-auto leading-relaxed">
            As listas do dia ficam recolhidas durante os {pauseSession.duration_minutes}{' '}
            minutos de pausa para você desacelerar.
          </p>
        </div>
        <button
          type="button"
          onClick={endPause}
          className="min-h-[42px] px-5 rounded-full bg-surface-2 border border-border text-xs font-medium text-text hover:bg-surface-3 transition-colors"
        >
          Encerrar pausa e voltar para a agenda
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
          onClick={openCreateModal}
          aria-label="Novo item"
          className="h-11 w-11 sm:w-auto sm:px-4 rounded-full bg-accent text-accent-foreground text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-accent-hover transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Novo item</span>
        </button>
      </div>

      {/* ==================== ABA: HOJE ==================== */}
      {agendaHorizon === 'today' ? (
        <div className="space-y-4">
          {/* Banner discreto e recolhível de dias anteriores — Zero vermelho */}
          {overdueTasks.length > 0 ? (
            <div className="surface-card overflow-hidden">
              <button
                type="button"
                aria-expanded={previousOpen}
                onClick={() => setPreviousOpen((v) => !v)}
                className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-surface-3/60 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="h-2 w-2 rounded-full bg-accent shrink-0" />
                  <span className="text-xs font-medium text-text-secondary truncate">
                    {overdueTasks.length}{' '}
                    {overdueTasks.length === 1
                      ? 'item de dias anteriores'
                      : 'itens de dias anteriores'}{' '}
                    • Revisar
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
                  <div className="px-4 pb-3.5 pt-2 border-t border-border-soft divide-y divide-border-soft">
                    {overdueTasks.map((task) => (
                      <div
                        key={task.id}
                        className="py-2.5 first:pt-1 last:pb-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5"
                      >
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => openEditModal(task)}
                            className="text-sm font-medium text-text hover:text-accent text-left truncate block max-w-full"
                          >
                            {task.title}
                          </button>
                          {task.due_date ? (
                            <p className="text-[11px] text-text-muted">
                              Previsto em {formatDayMonthPtBr(task.due_date)}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {(
                            [
                              ['today', 'Hoje'],
                              ['week', 'Semana'],
                              ['later', 'Depois'],
                              ['archive', 'Arquivar'],
                            ] as const
                          ).map(([actionKey, label]) => (
                            <button
                              key={actionKey}
                              type="button"
                              onClick={() => {
                                void triggerHaptic('light');
                                void moveOverdueTask(task.id, actionKey);
                              }}
                              className="min-h-[40px] px-3 rounded-full bg-surface-3 border border-border text-xs font-medium text-text-secondary hover:text-text hover:bg-surface-4 transition-colors"
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Lista de Hoje */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between px-0.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Para hoje
              </h2>
              <span className="text-xs text-text-dim">
                {todayTasks.filter((t) => t.status === 'done').length}/{todayTasks.length}
              </span>
            </div>

            {todayTasks.length === 0 ? (
              <div className="surface-card p-5 text-center space-y-2">
                <p className="text-sm text-text-secondary">
                  Nenhum item pendente para hoje.
                </p>
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="min-h-[40px] px-4 rounded-full bg-surface-3 border border-border text-xs font-medium text-text hover:bg-surface-4"
                >
                  Adicionar tarefa de hoje
                </button>
              </div>
            ) : (
              <div className="surface-card divide-y divide-border-soft">
                {todayTasks.map((task) => {
                  const isDone = task.status === 'done';
                  return (
                    <div
                      key={task.id}
                      className="p-3.5 flex items-center justify-between gap-3 hover:bg-surface-3/40 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={isDone}
                          aria-label={`Marcar "${task.title}" como ${
                            isDone ? 'aberta' : 'concluída'
                          }`}
                          onClick={() => {
                            void triggerHaptic(isDone ? 'light' : 'success');
                            void setTaskStatus(task.id, isDone ? 'open' : 'done');
                          }}
                          className={`t-check h-6 w-6 rounded-lg border flex items-center justify-center shrink-0 ${
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
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditModal(task)}
                          className={`text-sm text-left truncate flex-1 min-w-0 ${
                            isDone
                              ? 'line-through text-text-muted'
                              : 'font-medium text-text'
                          }`}
                        >
                          {task.title}
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {task.alarm_call_mode ? (
                          <span
                            title="Modo ligação ativo"
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-danger-soft text-danger font-medium"
                          >
                            <PhoneCall className="h-3 w-3" />
                            <span className="hidden sm:inline">Ligação</span>
                          </span>
                        ) : null}

                        {task.due_time ? (
                          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-surface-3 border border-border-soft text-text-secondary">
                            {task.due_time}
                          </span>
                        ) : null}

                        <span
                          className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium ${
                            task.scope === 'shared'
                              ? 'bg-shared-soft text-shared'
                              : 'bg-surface-3 border border-border-soft text-text-muted'
                          }`}
                        >
                          {task.scope === 'shared' ? 'Casa' : 'Pessoal'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Aguardando retorno */}
          <section className="space-y-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted px-0.5">
              Aguardando retorno
            </h2>
            {waitingTasks.length === 0 ? (
              <div className="surface-card p-3.5 text-xs text-text-muted">
                Nenhum orçamento, entrega ou resposta aguardando retorno no momento.
              </div>
            ) : (
              <div className="surface-card divide-y divide-border-soft">
                {waitingTasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-3.5 flex flex-wrap items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => openEditModal(task)}
                      className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                    >
                      <Clock className="h-4 w-4 text-warning shrink-0" />
                      <span className="text-sm font-medium text-text truncate">
                        {task.title}
                      </span>
                    </button>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-warning-soft text-warning font-medium">
                        {formatWaitingBadge(task.waiting_remind_at)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          void triggerHaptic('success');
                          void setTaskStatus(task.id, 'done');
                        }}
                        className="min-h-[40px] px-3 rounded-full bg-surface-3 border border-border text-xs font-medium text-text-secondary hover:text-text hover:bg-surface-4 transition-colors"
                      >
                        Concluir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Resumo discreto das pausas habituais */}
          <div className="surface-item p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-success-soft text-success flex items-center justify-center shrink-0">
                <Leaf className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-text">Pausas da semana</p>
                <p className="text-xs text-text-muted truncate">
                  {pauseDaysLabel || 'Dias livres'} • {pausePrefs.start_time} (
                  {pausePrefs.default_duration_minutes} min)
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPauseModalOpen(true)}
              className="min-h-[40px] px-3.5 rounded-full bg-surface-2 border border-border text-xs font-medium text-text hover:bg-surface-4 shrink-0 transition-colors"
            >
              Descansar
            </button>
          </div>
        </div>
      ) : null}

      {/* ==================== ABA: SEMANA ==================== */}
      {agendaHorizon === 'week' ? (
        <div className="space-y-3">
          {unscheduledWeekTasks.length > 0 ? (
            <div className="surface-card p-4 space-y-2.5">
              <p className="text-xs font-semibold text-accent">
                Nesta semana (sem dia fixo)
              </p>
              <div className="divide-y divide-border-soft">
                {unscheduledWeekTasks.map((t) => (
                  <div
                    key={t.id}
                    className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => openEditModal(t)}
                      className={`text-sm text-left truncate ${
                        t.status === 'done'
                          ? 'line-through text-text-muted'
                          : 'text-text font-medium'
                      }`}
                    >
                      {t.title}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void setTaskStatus(
                          t.id,
                          t.status === 'done' ? 'open' : 'done',
                        )
                      }
                      className="min-h-[38px] px-3 rounded-full bg-surface-3 border border-border text-xs text-text-secondary hover:text-text"
                    >
                      {t.status === 'done' ? 'Reabrir' : 'Concluir'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {nextSevenDays.map((day) => {
            const totalItems =
              day.dayTasks.length +
              day.dayRoutines.length +
              day.dayCareRules.length;

            return (
              <div
                key={day.dateStr}
                className={`surface-card p-4 space-y-2.5 ${
                  day.isWeekend ? 'border-accent/30 bg-surface-2/95' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-semibold text-accent">
                      {day.weekdayName}
                    </p>
                    {day.isWeekend ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent-soft text-accent font-medium">
                        Fim de semana
                      </span>
                    ) : null}
                  </div>
                  <span className="text-xs text-text-muted">{day.dateLabel}</span>
                </div>

                {totalItems === 0 ? (
                  <p className="text-xs text-text-dim">Dia livre</p>
                ) : (
                  <div className="space-y-1.5">
                    {day.dayTasks.map((t) => (
                      <div
                        key={t.id}
                        className="surface-item px-3 py-2 flex items-center justify-between gap-2"
                      >
                        <button
                          type="button"
                          onClick={() => openEditModal(t)}
                          className={`text-sm text-left truncate ${
                            t.status === 'done'
                              ? 'line-through text-text-muted'
                              : 'text-text font-medium'
                          }`}
                        >
                          {t.title}
                        </button>
                        <span className="text-[11px] text-text-muted shrink-0">
                          {t.due_time || 'Agenda'}
                        </span>
                      </div>
                    ))}

                    {day.dayRoutines.map((r) => (
                      <div
                        key={r.id}
                        className="surface-item px-3 py-2 flex items-center justify-between gap-2"
                      >
                        <span className="text-sm text-text truncate">{r.title}</span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-shared-soft text-shared font-medium shrink-0">
                          Casa • Rotina
                        </span>
                      </div>
                    ))}

                    {day.dayCareRules.map((c) => {
                      const asset = assets.find((a) => a.id === c.asset_id);
                      return (
                        <div
                          key={c.id}
                          className="surface-item px-3 py-2 flex items-center justify-between gap-2"
                        >
                          <span className="text-sm text-text truncate">
                            {c.title}
                            {asset ? ` (${asset.name})` : ''}
                          </span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-warning-soft text-warning font-medium shrink-0">
                            Cuidados
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* ==================== ABA: MÊS ==================== */}
      {agendaHorizon === 'month' ? (
        <div className="space-y-4">
          {/* Calendário mensal limpo */}
          <div className="surface-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-accent" />
                <h2 className="text-sm font-semibold text-text">
                  {MONTH_NAMES[calendarMonth - 1]} de {calendarYear}
                </h2>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  aria-label="Mês anterior"
                  className="h-9 w-9 rounded-full bg-surface-3 border border-border flex items-center justify-center text-text-secondary hover:text-text"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCalendarYear(todayYear);
                    setCalendarMonth(todayMonth);
                  }}
                  className="h-9 px-3 rounded-full bg-surface-3 border border-border text-xs font-medium text-text-secondary hover:text-text"
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  aria-label="Próximo mês"
                  className="h-9 w-9 rounded-full bg-surface-3 border border-border flex items-center justify-center text-text-secondary hover:text-text"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-text-muted pt-1">
              {WEEKDAY_SHORT.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {Array.from({ length: monthCalendar.firstWeekday }, (_, idx) => (
                <div key={`empty-${idx}`} className="h-9" />
              ))}

              {Array.from({ length: monthCalendar.daysInMonth }, (_, idx) => {
                const dayNum = idx + 1;
                const iso = `${monthCalendar.monthPrefix}-${String(dayNum).padStart(
                  2,
                  '0',
                )}`;
                const isToday = iso === todayStr;
                const hasEvent = monthCalendar.eventDays.has(dayNum);

                return (
                  <div
                    key={dayNum}
                    className={`h-9 rounded-xl flex flex-col items-center justify-center text-xs border ${
                      isToday
                        ? 'bg-accent text-accent-foreground border-accent font-semibold'
                        : 'bg-surface-3/70 border-border-soft text-text-secondary'
                    }`}
                  >
                    <span>{dayNum}</span>
                    {hasEvent ? (
                      <span
                        className={`h-1 w-1 rounded-full mt-0.5 ${
                          isToday ? 'bg-accent-foreground' : 'bg-accent'
                        }`}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Vencimentos de garantia nos próximos 30 dias (destacados suavemente em --warning) */}
          {warrantyAlerts.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-warning px-0.5">
                Garantias próximas do vencimento (30 dias)
              </h3>
              <div className="space-y-2">
                {warrantyAlerts.map((alert) => (
                  <div
                    key={alert.asset_id}
                    className="p-3.5 rounded-2xl bg-warning-soft border border-warning/35 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ShieldAlert className="h-4 w-4 text-warning shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text truncate">
                          Garantia: {alert.asset_name}
                        </p>
                        <p className="text-xs text-text-secondary">
                          Vence em {formatDayMonthPtBr(alert.expires_at)}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-surface-2 text-warning shrink-0">
                      {alert.days_remaining <= 0
                        ? 'Vence hoje'
                        : `${alert.days_remaining} dias`}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Compromissos futuros e manutenções anuais */}
          <div className="surface-card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-text">
              Compromissos futuros e manutenções anuais
            </h3>

            {monthCalendar.monthTasks.length === 0 &&
            monthCalendar.annualCareRules.length === 0 ? (
              <p className="text-xs text-text-muted">
                Nenhum compromisso ou revisão anual listado para este mês.
              </p>
            ) : (
              <div className="space-y-2 text-sm">
                {monthCalendar.monthTasks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openEditModal(t)}
                    className="w-full surface-item p-3 flex items-center justify-between gap-3 text-left hover:bg-surface-4 transition-colors"
                  >
                    <span className="text-text font-medium truncate">
                      {t.title}
                      {t.due_time ? ` às ${t.due_time}` : ''}
                    </span>
                    <span className="text-xs text-text-muted shrink-0">
                      {t.due_date ? formatDayMonthPtBr(t.due_date) : 'No mês'}
                    </span>
                  </button>
                ))}

                {monthCalendar.annualCareRules.map((c) => {
                  const asset = assets.find((a) => a.id === c.asset_id);
                  const dateBadge = c.next_due_date
                    ? formatDayMonthPtBr(c.next_due_date)
                    : c.annual_month
                      ? `${MONTH_NAMES[(c.annual_month || 1) - 1]?.slice(0, 3)}`
                      : 'Anual';
                  return (
                    <div
                      key={c.id}
                      className="surface-item p-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Wrench className="h-3.5 w-3.5 text-accent shrink-0" />
                        <span className="text-text truncate">
                          {c.title}
                          {asset ? ` • ${asset.name}` : ''}
                        </span>
                      </div>
                      <span className="text-xs text-text-muted shrink-0">
                        {dateBadge}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* ==================== ABA: DEPOIS ==================== */}
      {agendaHorizon === 'later' ? (
        <div className="surface-card p-4 space-y-3">
          <p className="text-xs text-text-muted">
            Itens sem data fixa — ficam guardados aqui até fazer sentido trazer para o dia.
          </p>

          {laterTasks.length === 0 ? (
            <div className="py-4 text-center space-y-2">
              <p className="text-sm text-text-secondary">
                Nenhum item guardado para depois.
              </p>
              <button
                type="button"
                onClick={openCreateModal}
                className="min-h-[40px] px-4 rounded-full bg-surface-3 border border-border text-xs font-medium text-text"
              >
                Adicionar ideia ou tarefa sem data
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {laterTasks.map((task) => {
                const isDone = task.status === 'done';
                return (
                  <div
                    key={task.id}
                    className="surface-item p-3 flex flex-wrap items-center justify-between gap-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => openEditModal(task)}
                      className={`text-sm text-left flex-1 min-w-0 truncate ${
                        isDone
                          ? 'line-through text-text-muted'
                          : 'font-medium text-text'
                      }`}
                    >
                      {task.title}
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          void triggerHaptic('light');
                          void moveOverdueTask(task.id, 'today');
                        }}
                        className="min-h-[40px] px-3 rounded-full bg-surface-2 border border-border text-xs font-medium text-accent hover:bg-surface-4 transition-colors"
                      >
                        Hoje
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          void triggerHaptic('success');
                          void setTaskStatus(task.id, isDone ? 'open' : 'done');
                        }}
                        aria-label={`Concluir ${task.title}`}
                        className="min-h-[40px] px-3 rounded-full bg-surface-2 border border-border text-xs font-medium text-text-secondary hover:text-text inline-flex items-center gap-1"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>{isDone ? 'Reabrir' : 'Concluir'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      <TaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialTask={editingTask}
        defaultHorizon={agendaHorizon}
      />
    </div>
  );
}
