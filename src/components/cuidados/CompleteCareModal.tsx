import { useId, useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { triggerHaptic } from '@/lib/platform';
import { useDataStore } from '@/store/useDataStore';
import type { Asset, CareRule } from '@/types';

interface CompleteCareModalProps {
  open: boolean;
  onClose: () => void;
  asset: Asset | null;
  rule: CareRule | null;
}

function CompleteCareModalForm({
  onClose,
  asset,
  rule,
}: Omit<CompleteCareModalProps, 'open'>) {
  const completeCareRule = useDataStore((s) => s.completeCareRule);

  const formId = useId();
  const [confirmedMeter, setConfirmedMeter] = useState(
    asset?.current_meter != null ? String(asset.current_meter) : '',
  );
  const [workshopOrParts, setWorkshopOrParts] = useState('');
  const [costNote, setCostNote] = useState('');
  const [saving, setSaving] = useState(false);

  const showMeterField =
    rule?.trigger_type === 'meter' ||
    Boolean(asset && asset.meter_unit !== 'none');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!rule || saving) return;

    setSaving(true);
    try {
      const parsedMeter =
        showMeterField && confirmedMeter.trim() !== ''
          ? Number(confirmedMeter.replace(/\./g, '').replace(',', '.'))
          : null;

      void triggerHaptic('success');
      await completeCareRule({
        rule_id: rule.id,
        confirmed_meter:
          parsedMeter != null && !Number.isNaN(parsedMeter)
            ? parsedMeter
            : null,
        workshop_or_parts: workshopOrParts.trim() || null,
        cost_note: costNote.trim() || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      {showMeterField ? (
        <div className="space-y-1">
          <label
            htmlFor={`${formId}-meter`}
            className="block text-xs font-medium text-text-secondary"
          >
            Medição real no momento do serviço (
            {asset?.meter_unit === 'hours' ? 'horas' : 'km'})
          </label>
          <input
            id={`${formId}-meter`}
            name="confirmed_meter"
            type="text"
            inputMode="numeric"
            value={confirmedMeter}
            onChange={(e) =>
              setConfirmedMeter(e.target.value.replace(/[^\d.,]/g, ''))
            }
            autoFocus
            className="w-full h-11 px-3.5 rounded-xl bg-surface-3 border border-border text-sm text-text"
          />
        </div>
      ) : null}

      <div className="space-y-1">
        <label
          htmlFor={`${formId}-workshop`}
          className="block text-xs font-medium text-text-secondary"
        >
          Oficina ou peça utilizada (opcional)
        </label>
        <input
          id={`${formId}-workshop`}
          name="workshop_or_parts"
          type="text"
          value={workshopOrParts}
          onChange={(e) => setWorkshopOrParts(e.target.value)}
          placeholder="Ex: Oficina do João • Óleo 10W30 + filtro"
          className="w-full h-11 px-3.5 rounded-xl bg-surface-3 border border-border text-sm text-text placeholder:text-text-dim"
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor={`${formId}-cost`}
          className="block text-xs font-medium text-text-secondary"
        >
          Valor ou observação (opcional)
        </label>
        <input
          id={`${formId}-cost`}
          name="cost_note"
          type="text"
          value={costNote}
          onChange={(e) => setCostNote(e.target.value)}
          placeholder="Ex: R$ 85,00 • Tudo em ordem"
          className="w-full h-11 px-3.5 rounded-xl bg-surface-3 border border-border text-sm text-text placeholder:text-text-dim"
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
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
          className="min-h-[40px] px-5 rounded-full bg-success text-accent-foreground text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity"
        >
          <Check className="h-4 w-4" />
          <span>Confirmar conclusão</span>
        </button>
      </div>
    </form>
  );
}

export function CompleteCareModal({
  open,
  onClose,
  asset,
  rule,
}: CompleteCareModalProps) {
  const formKey = `${open ? 'open' : 'closed'}-${asset?.id ?? 'no-asset'}-${rule?.id ?? 'no-rule'}-${asset?.current_meter ?? ''}`;

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={`Registrar feito: ${rule?.title ?? 'Manutenção'}`}
      subtitle={
        asset
          ? `${asset.name} • O próximo ciclo será recalculado a partir de hoje.`
          : undefined
      }
      maxWidthClass="max-w-[440px]"
    >
      <CompleteCareModalForm
        key={formKey}
        onClose={onClose}
        asset={asset}
        rule={rule}
      />
    </ModalDialog>
  );
}
