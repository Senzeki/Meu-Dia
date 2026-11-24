import { useId, useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { triggerHaptic } from '@/lib/platform';
import { getLocalDateString } from '@/lib/timezone';
import { useAuthStore } from '@/store/useAuthStore';
import { useDataStore } from '@/store/useDataStore';
import type { HouseRoutine, RoutineMode, Task, TaskAssignee } from '@/types';

interface CasaItemModalProps {
  open: boolean;
  onClose: () => void;
  editingRoutine?: HouseRoutine | null;
  editingTask?: Task | null;
}

const WEEKDAYS: Array<{ day: number; label: string }> = [
  { day: 0, label: 'Dom' },
  { day: 1, label: 'Seg' },
  { day: 2, label: 'Ter' },
  { day: 3, label: 'Qua' },
  { day: 4, label: 'Qui' },
  { day: 5, label: 'Sex' },
  { day: 6, label: 'Sáb' },
];

function CasaItemModalForm({
  onClose,
  editingRoutine,
  editingTask,
}: Omit<CasaItemModalProps, 'open'>) {
  const profile = useAuthStore((s) => s.profile);
  const saveTask = useDataStore((s) => s.saveTask);
  const deleteTask = useDataStore((s) => s.deleteTask);
  const saveHouseRoutine = useDataStore((s) => s.saveHouseRoutine);
  const deleteHouseRoutine = useDataStore((s) => s.deleteHouseRoutine);

  const todayStr = getLocalDateString(new Date(), profile.timezone);

  const formId = useId();
  const [itemKind, setItemKind] = useState<'task' | 'routine'>(
    editingTask && !editingRoutine ? 'task' : 'routine',
  );
  const [title, setTitle] = useState(
    editingRoutine?.title ?? editingTask?.title ?? '',
  );
  const [assignedTo, setAssignedTo] = useState<TaskAssignee>(
    editingRoutine?.assigned_to ?? editingTask?.assigned_to ?? 'both',
  );
  const [routineMode, setRoutineMode] = useState<RoutineMode>(
    editingRoutine?.mode ?? 'fixed_weekdays',
  );
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>(
    editingRoutine?.weekdays ?? [6],
  );
  const [cycleDays, setCycleDays] = useState(
    String(editingRoutine?.cycle_days ?? 7),
  );
  const [nextDueDate, setNextDueDate] = useState(
    editingRoutine
      ? editingRoutine.next_due_date || todayStr
      : editingTask
        ? editingTask.due_date ?? ''
        : todayStr,
  );
  const [saving, setSaving] = useState(false);

  const isEditing = Boolean(editingRoutine || editingTask);

  function toggleWeekday(day: number) {
    setSelectedWeekdays((prev) =>
      prev.includes(day)
        ? prev.length > 1
          ? prev.filter((d) => d !== day)
          : prev
        : [...prev, day].sort((a, b) => a - b),
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle || saving) return;

    setSaving(true);
    try {
      void triggerHaptic('success');
      if (itemKind === 'task') {
        await saveTask({
          id: editingTask?.id,
          scope: 'shared',
          title: cleanTitle,
          horizon: 'today',
          assigned_to: assignedTo,
          due_date: nextDueDate || null,
        });
      } else {
        const parsedCycle = Math.max(1, parseInt(cycleDays, 10) || 7);
        await saveHouseRoutine({
          id: editingRoutine?.id,
          title: cleanTitle,
          mode: routineMode,
          weekdays:
            routineMode === 'fixed_weekdays' ? selectedWeekdays : null,
          cycle_days: routineMode === 'cyclic_days' ? parsedCycle : null,
          assigned_to: assignedTo,
          next_due_date: nextDueDate || todayStr,
        });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (saving) return;
    setSaving(true);
    try {
      void triggerHaptic('warning');
      if (editingRoutine) {
        await deleteHouseRoutine(editingRoutine.id);
      } else if (editingTask) {
        await deleteTask(editingTask.id);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      {!isEditing ? (
        <fieldset className="space-y-1.5 border-0 p-0 m-0">
          <legend className="text-xs font-medium text-text-secondary">
            Tipo de item
          </legend>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={itemKind === 'routine'}
              onClick={() => setItemKind('routine')}
              className={`min-h-[40px] px-3 rounded-xl border text-xs font-medium transition-colors ${
                itemKind === 'routine'
                  ? 'bg-accent text-accent-foreground border-accent'
                  : 'bg-surface-3 border-border-soft text-text-secondary'
              }`}
            >
              Rotina recorrente
            </button>
            <button
              type="button"
              aria-pressed={itemKind === 'task'}
              onClick={() => setItemKind('task')}
              className={`min-h-[40px] px-3 rounded-xl border text-xs font-medium transition-colors ${
                itemKind === 'task'
                  ? 'bg-accent text-accent-foreground border-accent'
                  : 'bg-surface-3 border-border-soft text-text-secondary'
              }`}
            >
              Tarefa avulsa da casa
            </button>
          </div>
        </fieldset>
      ) : null}

      <div className="space-y-1">
        <label
          htmlFor={`${formId}-title`}
          className="block text-xs font-medium text-text-secondary"
        >
          Descrição *
        </label>
        <input
          id={`${formId}-title`}
          name="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Tirar lixo reciclável, Trocar roupa de cama..."
          required
          autoFocus
          className="w-full h-11 px-3.5 rounded-xl bg-surface-3 border border-border text-sm text-text placeholder:text-text-dim"
        />
      </div>

      <fieldset className="space-y-1.5 border-0 p-0 m-0">
        <legend className="text-xs font-medium text-text-secondary">
          Responsável
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['me', 'Meu'],
              ['partner', 'Dela'],
              ['both', 'Os dois'],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              aria-pressed={assignedTo === val}
              onClick={() => setAssignedTo(val)}
              className={`min-h-[40px] px-2.5 rounded-xl border text-xs font-medium transition-colors ${
                assignedTo === val
                  ? 'bg-shared text-accent-foreground border-shared'
                  : 'bg-surface-3 border-border-soft text-text-secondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      {itemKind === 'routine' ? (
        <div className="space-y-3 p-3.5 rounded-2xl bg-surface-3 border border-border-soft">
          <fieldset className="space-y-1.5 border-0 p-0 m-0">
            <legend className="text-xs font-medium text-text-secondary">
              Regra de repetição
            </legend>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={routineMode === 'fixed_weekdays'}
                onClick={() => setRoutineMode('fixed_weekdays')}
                className={`min-h-[40px] px-2.5 rounded-xl border text-xs font-medium transition-colors ${
                  routineMode === 'fixed_weekdays'
                    ? 'bg-accent text-accent-foreground border-accent'
                    : 'bg-surface-2 border-border text-text-secondary'
                }`}
              >
                Dias fixos da semana
              </button>
              <button
                type="button"
                aria-pressed={routineMode === 'cyclic_days'}
                onClick={() => setRoutineMode('cyclic_days')}
                className={`min-h-[40px] px-2.5 rounded-xl border text-xs font-medium transition-colors ${
                  routineMode === 'cyclic_days'
                    ? 'bg-accent text-accent-foreground border-accent'
                    : 'bg-surface-2 border-border text-text-secondary'
                }`}
              >
                A cada N dias
              </button>
            </div>
          </fieldset>

          {routineMode === 'fixed_weekdays' ? (
            <div className="space-y-1.5">
              <span className="block text-xs text-text-muted">
                Toque nos dias da semana:
              </span>
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map((w) => {
                  const active = selectedWeekdays.includes(w.day);
                  return (
                    <button
                      key={w.day}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleWeekday(w.day)}
                      className={`min-h-[40px] rounded-xl border text-xs font-semibold transition-colors ${
                        active
                          ? 'bg-accent text-accent-foreground border-accent'
                          : 'bg-surface-2 border-border-soft text-text-muted hover:text-text'
                      }`}
                    >
                      {w.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <label
                htmlFor={`${formId}-cycle`}
                className="block text-xs text-text-muted"
              >
                Repetir a cada quantos dias após concluir?
              </label>
              <input
                id={`${formId}-cycle`}
                name="cycle_days"
                type="text"
                inputMode="numeric"
                value={cycleDays}
                onChange={(e) =>
                  setCycleDays(e.target.value.replace(/[^\d]/g, ''))
                }
                className="w-28 h-10 px-3 rounded-xl bg-surface-2 border border-border text-sm text-text"
              />
            </div>
          )}
        </div>
      ) : null}

      <div className="space-y-1">
        <label
          htmlFor={`${formId}-due`}
          className="block text-xs font-medium text-text-secondary"
        >
          {itemKind === 'routine'
            ? 'Próxima ocorrência prevista'
            : 'Data prevista (opcional)'}
        </label>
        <input
          id={`${formId}-due`}
          name="next_due_date"
          type="date"
          value={nextDueDate}
          onChange={(e) => setNextDueDate(e.target.value)}
          className="w-full h-11 px-3 rounded-xl bg-surface-3 border border-border text-sm text-text"
        />
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
        {isEditing ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleDelete()}
            className="min-h-[40px] px-3.5 rounded-full bg-danger-soft border border-danger/35 text-xs font-semibold text-danger inline-flex items-center gap-1.5"
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
            {isEditing ? 'Salvar' : 'Adicionar'}
          </button>
        </div>
      </div>
    </form>
  );
}

export function CasaItemModal({
  open,
  onClose,
  editingRoutine = null,
  editingTask = null,
}: CasaItemModalProps) {
  const isEditing = Boolean(editingRoutine || editingTask);
  const formKey = `${open ? 'open' : 'closed'}-${editingRoutine?.id ?? editingTask?.id ?? 'new'}`;

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={
        isEditing
          ? 'Editar item da Casa'
          : 'Adicionar tarefa ou rotina da Casa'
      }
      subtitle="Itens da Casa ficam visíveis e compartilhados entre os dois."
    >
      <CasaItemModalForm
        key={formKey}
        onClose={onClose}
        editingRoutine={editingRoutine}
        editingTask={editingTask}
      />
    </ModalDialog>
  );
}
