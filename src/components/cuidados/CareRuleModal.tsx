import { useId, useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { triggerHaptic } from '@/lib/platform';
import { useDataStore } from '@/store/useDataStore';
import type { Asset, CareRule, CareTriggerType } from '@/types';

interface CareRuleModalProps {
  open: boolean;
  onClose: () => void;
  asset: Asset | null;
  initialRule?: CareRule | null;
}

const MONTHS = [
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

function CareRuleModalForm({
  onClose,
  asset,
  initialRule,
}: Omit<CareRuleModalProps, 'open'>) {
  const saveCareRule = useDataStore((s) => s.saveCareRule);
  const deleteCareRule = useDataStore((s) => s.deleteCareRule);

  const defaultTrigger: CareTriggerType =
    initialRule?.trigger_type ??
    (asset?.meter_unit && asset.meter_unit !== 'none'
      ? 'meter'
      : 'flexible_days');

  const suggestedNextMeter =
    initialRule?.next_due_meter ??
    (asset?.current_meter != null ? asset.current_meter + 3000 : 3000);

  const formId = useId();
  const [title, setTitle] = useState(initialRule?.title ?? '');
  const [triggerType, setTriggerType] =
    useState<CareTriggerType>(defaultTrigger);
  const [intervalDays, setIntervalDays] = useState(
    String(initialRule?.interval_days ?? 30),
  );
  const [intervalMeter, setIntervalMeter] = useState(
    String(initialRule?.interval_meter ?? 3000),
  );
  const [nextDueMeter, setNextDueMeter] = useState(String(suggestedNextMeter));
  const [nextDueDate, setNextDueDate] = useState(
    initialRule?.next_due_date ?? '',
  );
  const [annualMonth, setAnnualMonth] = useState(
    String(initialRule?.annual_month ?? 8),
  );
  const [annualDay, setAnnualDay] = useState(
    String(initialRule?.annual_day ?? 15),
  );
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!asset || !title.trim() || saving) return;

    setSaving(true);
    try {
      const parsedDays = Math.max(1, parseInt(intervalDays, 10) || 30);
      const parsedIntervalMeter = Math.max(
        1,
        parseInt(intervalMeter.replace(/\./g, ''), 10) || 1000,
      );
      const parsedNextMeter = nextDueMeter.trim()
        ? parseInt(nextDueMeter.replace(/\./g, ''), 10)
        : (asset.current_meter ?? 0) + parsedIntervalMeter;

      void triggerHaptic('success');
      await saveCareRule({
        id: initialRule?.id,
        asset_id: asset.id,
        scope: asset.scope,
        title: title.trim(),
        trigger_type: triggerType,
        interval_days: triggerType === 'flexible_days' ? parsedDays : null,
        interval_meter: triggerType === 'meter' ? parsedIntervalMeter : null,
        next_due_meter: triggerType === 'meter' ? parsedNextMeter : null,
        next_due_date:
          triggerType === 'flexible_days' ? nextDueDate || null : null,
        annual_month:
          triggerType === 'annual_date'
            ? Math.min(12, Math.max(1, parseInt(annualMonth, 10) || 1))
            : null,
        annual_day:
          triggerType === 'annual_date'
            ? Math.min(31, Math.max(1, parseInt(annualDay, 10) || 1))
            : null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initialRule || saving) return;
    setSaving(true);
    try {
      void triggerHaptic('warning');
      await deleteCareRule(initialRule.id);
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
          O que precisa ser acompanhado? *
        </label>
        <input
          id={`${formId}-title`}
          name="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Troca de óleo, Limpar filtro, Licenciamento..."
          required
          autoFocus
          className="w-full h-11 px-3.5 rounded-xl bg-surface-3 border border-border text-sm text-text placeholder:text-text-dim"
        />
      </div>

      <fieldset className="space-y-1.5 border-0 p-0 m-0">
        <legend className="text-xs font-medium text-text-secondary">
          Gatilho da manutenção
        </legend>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            aria-pressed={triggerType === 'flexible_days'}
            onClick={() => setTriggerType('flexible_days')}
            className={`min-h-[40px] px-2 rounded-xl border text-xs font-medium transition-colors ${
              triggerType === 'flexible_days'
                ? 'bg-accent text-accent-foreground border-accent'
                : 'bg-surface-3 border-border-soft text-text-secondary'
            }`}
          >
            Dias flexíveis
          </button>
          <button
            type="button"
            aria-pressed={triggerType === 'meter'}
            onClick={() => setTriggerType('meter')}
            className={`min-h-[40px] px-2 rounded-xl border text-xs font-medium transition-colors ${
              triggerType === 'meter'
                ? 'bg-accent text-accent-foreground border-accent'
                : 'bg-surface-3 border-border-soft text-text-secondary'
            }`}
          >
            Medidor ({asset?.meter_unit === 'hours' ? 'horas' : 'km'})
          </button>
          <button
            type="button"
            aria-pressed={triggerType === 'annual_date'}
            onClick={() => setTriggerType('annual_date')}
            className={`min-h-[40px] px-2 rounded-xl border text-xs font-medium transition-colors ${
              triggerType === 'annual_date'
                ? 'bg-accent text-accent-foreground border-accent'
                : 'bg-surface-3 border-border-soft text-text-secondary'
            }`}
          >
            Data anual
          </button>
        </div>
      </fieldset>

      {triggerType === 'flexible_days' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-surface-3 border border-border-soft">
          <div className="space-y-1">
            <label
              htmlFor={`${formId}-interval-days`}
              className="block text-xs font-medium text-text-secondary"
            >
              Intervalo em dias (após concluir)
            </label>
            <input
              id={`${formId}-interval-days`}
              name="interval_days"
              type="text"
              inputMode="numeric"
              value={intervalDays}
              onChange={(e) =>
                setIntervalDays(e.target.value.replace(/[^\d]/g, ''))
              }
              className="w-full h-10 px-3 rounded-xl bg-surface-2 border border-border text-sm text-text"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor={`${formId}-next-date`}
              className="block text-xs font-medium text-text-secondary"
            >
              Próxima data (opcional)
            </label>
            <input
              id={`${formId}-next-date`}
              name="next_due_date"
              type="date"
              value={nextDueDate}
              onChange={(e) => setNextDueDate(e.target.value)}
              className="w-full h-10 px-3 rounded-xl bg-surface-2 border border-border text-sm text-text"
            />
          </div>
        </div>
      ) : null}

      {triggerType === 'meter' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-surface-3 border border-border-soft">
          <div className="space-y-1">
            <label
              htmlFor={`${formId}-interval-meter`}
              className="block text-xs font-medium text-text-secondary"
            >
              A cada quantos {asset?.meter_unit === 'hours' ? 'horas' : 'km'}?
            </label>
            <input
              id={`${formId}-interval-meter`}
              name="interval_meter"
              type="text"
              inputMode="numeric"
              value={intervalMeter}
              onChange={(e) =>
                setIntervalMeter(e.target.value.replace(/[^\d]/g, ''))
              }
              className="w-full h-10 px-3 rounded-xl bg-surface-2 border border-border text-sm text-text"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor={`${formId}-next-meter`}
              className="block text-xs font-medium text-text-secondary"
            >
              Próximo marco ({asset?.meter_unit === 'hours' ? 'h' : 'km'})
            </label>
            <input
              id={`${formId}-next-meter`}
              name="next_due_meter"
              type="text"
              inputMode="numeric"
              value={nextDueMeter}
              onChange={(e) =>
                setNextDueMeter(e.target.value.replace(/[^\d]/g, ''))
              }
              className="w-full h-10 px-3 rounded-xl bg-surface-2 border border-border text-sm text-text"
            />
          </div>
        </div>
      ) : null}

      {triggerType === 'annual_date' ? (
        <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-surface-3 border border-border-soft">
          <div className="space-y-1">
            <label
              htmlFor={`${formId}-annual-month`}
              className="block text-xs font-medium text-text-secondary"
            >
              Mês anual
            </label>
            <select
              id={`${formId}-annual-month`}
              name="annual_month"
              value={annualMonth}
              onChange={(e) => setAnnualMonth(e.target.value)}
              className="w-full h-10 px-3 rounded-xl bg-surface-2 border border-border text-sm text-text"
            >
              {MONTHS.map((m, idx) => (
                <option key={m} value={String(idx + 1)}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor={`${formId}-annual-day`}
              className="block text-xs font-medium text-text-secondary"
            >
              Dia do mês
            </label>
            <input
              id={`${formId}-annual-day`}
              name="annual_day"
              type="text"
              inputMode="numeric"
              value={annualDay}
              onChange={(e) =>
                setAnnualDay(e.target.value.replace(/[^\d]/g, ''))
              }
              className="w-full h-10 px-3 rounded-xl bg-surface-2 border border-border text-sm text-text"
            />
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
        {initialRule ? (
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
            {initialRule ? 'Salvar regra' : 'Adicionar regra'}
          </button>
        </div>
      </div>
    </form>
  );
}

export function CareRuleModal({
  open,
  onClose,
  asset,
  initialRule = null,
}: CareRuleModalProps) {
  const formKey = `${open ? 'open' : 'closed'}-${asset?.id ?? 'no-asset'}-${initialRule?.id ?? 'new'}`;

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={
        initialRule
          ? 'Editar regra de cuidado'
          : `Nova regra para ${asset?.name ?? 'ativo'}`
      }
      subtitle="Escolha entre ciclo de dias flexíveis, medidor ou data anual."
    >
      <CareRuleModalForm
        key={formKey}
        onClose={onClose}
        asset={asset}
        initialRule={initialRule}
      />
    </ModalDialog>
  );
}
