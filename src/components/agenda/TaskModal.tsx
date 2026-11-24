import { useId, useState, type FormEvent } from 'react';
import { PhoneCall, Trash2 } from 'lucide-react';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { triggerHaptic } from '@/lib/platform';
import { useDataStore } from '@/store/useDataStore';
import type { AgendaHorizon, EntityScope, Task, TaskStatus } from '@/types';

interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  initialTask?: Task | null;
  defaultHorizon?: AgendaHorizon;
  defaultScope?: EntityScope;
}

const HORIZON_OPTIONS: Array<{ id: AgendaHorizon; label: string }> = [
  { id: 'today', label: 'Hoje' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mês' },
  { id: 'later', label: 'Depois' },
];

function computeRemindDaysFromIso(iso: string | null | undefined): number {
  if (!iso) return 2;
  const diffMs = new Date(iso).getTime() - Date.now();
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
  return days > 0 ? days : 2;
}

function TaskModalForm({
  onClose,
  initialTask,
  defaultHorizon,
  defaultScope,
}: Omit<TaskModalProps, 'open'>) {
  const saveTask = useDataStore((s) => s.saveTask);
  const deleteTask = useDataStore((s) => s.deleteTask);

  const formId = useId();
  const [title, setTitle] = useState(initialTask?.title ?? '');
  const [notes, setNotes] = useState(initialTask?.notes ?? '');
  const [horizon, setHorizon] = useState<AgendaHorizon>(
    initialTask?.horizon ?? defaultHorizon ?? 'today',
  );
  const [scope, setScope] = useState<EntityScope>(
    initialTask?.scope ?? defaultScope ?? 'personal',
  );
  const [dueDate, setDueDate] = useState(initialTask?.due_date ?? '');
  const [dueTime, setDueTime] = useState(initialTask?.due_time ?? '');
  const [status, setStatus] = useState<TaskStatus>(
    initialTask?.status === 'waiting' ? 'waiting' : 'open',
  );
  const [remindDays, setRemindDays] = useState(() =>
    String(computeRemindDaysFromIso(initialTask?.waiting_remind_at)),
  );
  const [alarmCallMode, setAlarmCallMode] = useState(
    Boolean(initialTask?.alarm_call_mode),
  );
  const [toggleInit, setToggleInit] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle || saving) return;

    setSaving(true);
    try {
      const parsedDays = Math.max(1, parseInt(remindDays, 10) || 2);
      const waitingRemindAt =
        status === 'waiting'
          ? new Date(Date.now() + parsedDays * 24 * 60 * 60 * 1000).toISOString()
          : null;

      void triggerHaptic('success');
      await saveTask({
        id: initialTask?.id,
        title: cleanTitle,
        notes: notes.trim() || null,
        horizon,
        scope,
        status,
        assigned_to:
          initialTask?.assigned_to ?? (scope === 'shared' ? 'both' : 'me'),
        due_date: dueDate || null,
        due_time: dueTime || null,
        waiting_remind_at: waitingRemindAt,
        alarm_call_mode: alarmCallMode,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initialTask || saving) return;
    setSaving(true);
    try {
      void triggerHaptic('warning');
      await deleteTask(initialTask.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div className="space-y-1">
        <label
          htmlFor={`${formId}-title`}
          className="block text-xs font-medium text-text-secondary"
        >
          O que precisa ser feito? *
        </label>
        <input
          id={`${formId}-title`}
          name="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Conferir óleo da moto, orçamento..."
          required
          autoFocus
          className="w-full h-11 px-3.5 rounded-xl bg-surface-3 border border-border text-sm text-text placeholder:text-text-dim"
        />
      </div>

      <fieldset className="space-y-1.5 border-0 p-0 m-0">
        <legend className="text-xs font-medium text-text-secondary">
          Quando olhar para isso
        </legend>
        <div className="grid grid-cols-4 gap-1.5">
          {HORIZON_OPTIONS.map((opt) => {
            const active = horizon === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setHorizon(opt.id)}
                aria-pressed={active}
                className={`min-h-[40px] px-2 rounded-xl border text-xs font-medium transition-colors ${
                  active
                    ? 'bg-accent text-accent-foreground border-accent'
                    : 'bg-surface-3 border-border-soft text-text-secondary hover:text-text'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <fieldset className="space-y-1.5 border-0 p-0 m-0">
          <legend className="text-xs font-medium text-text-secondary">
            Visibilidade
          </legend>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              aria-pressed={scope === 'personal'}
              onClick={() => setScope('personal')}
              className={`min-h-[40px] px-2.5 rounded-xl border text-xs font-medium transition-colors ${
                scope === 'personal'
                  ? 'bg-accent text-accent-foreground border-accent'
                  : 'bg-surface-3 border-border-soft text-text-secondary'
              }`}
            >
              Pessoal
            </button>
            <button
              type="button"
              aria-pressed={scope === 'shared'}
              onClick={() => setScope('shared')}
              className={`min-h-[40px] px-2.5 rounded-xl border text-xs font-medium transition-colors ${
                scope === 'shared'
                  ? 'bg-shared text-accent-foreground border-shared'
                  : 'bg-surface-3 border-border-soft text-text-secondary'
              }`}
            >
              Compartilhado
            </button>
          </div>
        </fieldset>

        <fieldset className="space-y-1.5 border-0 p-0 m-0">
          <legend className="text-xs font-medium text-text-secondary">
            Estado
          </legend>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              aria-pressed={status !== 'waiting'}
              onClick={() => setStatus('open')}
              className={`min-h-[40px] px-2.5 rounded-xl border text-xs font-medium transition-colors ${
                status !== 'waiting'
                  ? 'bg-accent text-accent-foreground border-accent'
                  : 'bg-surface-3 border-border-soft text-text-secondary'
              }`}
            >
              Para fazer
            </button>
            <button
              type="button"
              aria-pressed={status === 'waiting'}
              onClick={() => setStatus('waiting')}
              className={`min-h-[40px] px-2.5 rounded-xl border text-xs font-medium transition-colors ${
                status === 'waiting'
                  ? 'bg-warning text-accent-foreground border-warning'
                  : 'bg-surface-3 border-border-soft text-text-secondary'
              }`}
            >
              Aguardando
            </button>
          </div>
        </fieldset>
      </div>

      {status === 'waiting' ? (
        <div className="p-3 rounded-xl bg-warning-soft border border-warning/30 space-y-1.5">
          <label
            htmlFor={`${formId}-remind-days`}
            className="block text-xs font-medium text-warning"
          >
            Lembrar de cobrar retorno em quantos dias?
          </label>
          <input
            id={`${formId}-remind-days`}
            name="remind_days"
            type="text"
            inputMode="numeric"
            value={remindDays}
            onChange={(e) =>
              setRemindDays(e.target.value.replace(/[^\d]/g, ''))
            }
            className="w-28 h-10 px-3 rounded-xl bg-surface-2 border border-border text-sm text-text"
          />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label
            htmlFor={`${formId}-due-date`}
            className="block text-xs font-medium text-text-secondary"
          >
            Data (opcional)
          </label>
          <input
            id={`${formId}-due-date`}
            name="due_date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full h-11 px-3 rounded-xl bg-surface-3 border border-border text-sm text-text"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor={`${formId}-due-time`}
            className="block text-xs font-medium text-text-secondary"
          >
            Horário (opcional)
          </label>
          <input
            id={`${formId}-due-time`}
            name="due_time"
            type="time"
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
            className="w-full h-11 px-3 rounded-xl bg-surface-3 border border-border text-sm text-text"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label
          htmlFor={`${formId}-notes`}
          className="block text-xs font-medium text-text-secondary"
        >
          Observações (opcional)
        </label>
        <textarea
          id={`${formId}-notes`}
          name="notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Medidas, endereço, telefone..."
          className="w-full p-3 rounded-xl bg-surface-3 border border-border text-sm text-text placeholder:text-text-dim"
        />
      </div>

      {/* Toggle estritamente Opt-in para Modo Ligação (usa --danger quando ativo) */}
      <div
        className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-colors ${
          alarmCallMode
            ? 'bg-danger-soft border-danger/40'
            : 'bg-surface-3 border-border-soft'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <PhoneCall
            className={`h-4 w-4 shrink-0 ${
              alarmCallMode ? 'text-danger' : 'text-text-muted'
            }`}
          />
          <div className="min-w-0">
            <p
              className={`text-xs font-semibold ${
                alarmCallMode ? 'text-danger' : 'text-text'
              }`}
            >
              Tocar como ligação
            </p>
            <p className="text-[11px] text-text-muted">
              Despertador contínuo apenas para compromissos urgentes
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={alarmCallMode}
          aria-label="Tocar como ligação"
          data-on={alarmCallMode ? 'true' : 'false'}
          onClick={() => {
            setToggleInit(true);
            setAlarmCallMode((v) => !v);
          }}
          className={`t-toggle ${
            toggleInit ? 'is-init' : ''
          } h-7 w-11 rounded-full p-1 flex items-center shrink-0 border ${
            alarmCallMode
              ? 'bg-danger border-danger'
              : 'bg-surface-2 border-border'
          }`}
        >
          <span className="t-toggle-thumb h-5 w-5 rounded-full bg-white block shadow-sm" />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
        {initialTask ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleDelete()}
            className="min-h-[40px] px-3.5 rounded-full bg-danger-soft border border-danger/35 text-xs font-semibold text-danger inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Excluir</span>
          </button>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 rounded-full bg-surface-3 border border-border text-xs font-medium text-text-secondary hover:text-text"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-[40px] px-5 rounded-full bg-accent text-accent-foreground text-xs font-semibold hover:bg-accent-hover transition-colors"
          >
            {initialTask ? 'Salvar alterações' : 'Adicionar'}
          </button>
        </div>
      </div>
    </form>
  );
}

export function TaskModal({
  open,
  onClose,
  initialTask = null,
  defaultHorizon = 'today',
  defaultScope = 'personal',
}: TaskModalProps) {
  const formKey = `${open ? 'open' : 'closed'}-${initialTask?.id ?? 'new'}-${defaultHorizon}-${defaultScope}`;

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={initialTask ? 'Editar item da agenda' : 'Novo item na agenda'}
      subtitle="Defina horizonte, data opcional e se aguarda resposta de alguém."
    >
      <TaskModalForm
        key={formKey}
        onClose={onClose}
        initialTask={initialTask}
        defaultHorizon={defaultHorizon}
        defaultScope={defaultScope}
      />
    </ModalDialog>
  );
}
