import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { FileImage, Trash2 } from 'lucide-react';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { triggerHaptic } from '@/lib/platform';
import { useDataStore } from '@/store/useDataStore';
import type {
  Asset,
  AssetCategory,
  AssetMeterUnit,
  EntityScope,
} from '@/types';

interface AssetModalProps {
  open: boolean;
  onClose: () => void;
  initialAsset?: Asset | null;
}

const CATEGORIES: Array<{ id: AssetCategory; label: string }> = [
  { id: 'vehicle', label: 'Veículo / Moto' },
  { id: 'appliance', label: 'Eletrodoméstico' },
  { id: 'tool', label: 'Ferramenta' },
  { id: 'yard', label: 'Quintal / Casa' },
  { id: 'document', label: 'Documento' },
  { id: 'other', label: 'Outro' },
];

const METER_UNITS: Array<{ id: AssetMeterUnit; label: string }> = [
  { id: 'none', label: 'Nenhum' },
  { id: 'km', label: 'Quilômetros (km)' },
  { id: 'hours', label: 'Horas de uso' },
];

function AssetModalForm({
  onClose,
  initialAsset,
}: Omit<AssetModalProps, 'open'>) {
  const saveAsset = useDataStore((s) => s.saveAsset);
  const deleteAsset = useDataStore((s) => s.deleteAsset);

  const formId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState(initialAsset?.name ?? '');
  const [category, setCategory] = useState<AssetCategory>(
    initialAsset?.category ?? 'vehicle',
  );
  const [scope, setScope] = useState<EntityScope>(
    initialAsset?.scope ?? 'personal',
  );
  const [meterUnit, setMeterUnit] = useState<AssetMeterUnit>(
    initialAsset?.meter_unit ?? 'km',
  );
  const [currentMeter, setCurrentMeter] = useState(
    initialAsset?.current_meter != null
      ? String(initialAsset.current_meter)
      : '',
  );
  const [purchasedAt, setPurchasedAt] = useState(
    initialAsset?.purchased_at ?? '',
  );
  const [warrantyExpiresAt, setWarrantyExpiresAt] = useState(
    initialAsset?.warranty_expires_at ?? '',
  );
  const [receiptBlob, setReceiptBlob] = useState<File | null>(null);
  const [notes, setNotes] = useState(initialAsset?.notes ?? '');
  const [saving, setSaving] = useState(false);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setReceiptBlob(file);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName || saving) return;

    setSaving(true);
    try {
      const parsedMeter =
        meterUnit !== 'none' && currentMeter.trim() !== ''
          ? Number(currentMeter.replace(/\./g, '').replace(',', '.'))
          : null;

      void triggerHaptic('success');
      await saveAsset({
        id: initialAsset?.id,
        name: cleanName,
        category,
        scope,
        meter_unit: meterUnit,
        current_meter:
          parsedMeter != null && !Number.isNaN(parsedMeter)
            ? parsedMeter
            : null,
        purchased_at: purchasedAt || null,
        warranty_expires_at: warrantyExpiresAt || null,
        receipt_blob: receiptBlob,
        notes: notes.trim() || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initialAsset || saving) return;
    setSaving(true);
    try {
      void triggerHaptic('warning');
      await deleteAsset(initialAsset.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div className="space-y-1">
        <label
          htmlFor={`${formId}-name`}
          className="block text-xs font-medium text-text-secondary"
        >
          Nome do bem ou item *
        </label>
        <input
          id={`${formId}-name`}
          name="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Minha Moto, Ar-condicionado da Sala..."
          required
          autoFocus
          className="w-full h-11 px-3.5 rounded-xl bg-surface-3 border border-border text-sm text-text placeholder:text-text-dim"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label
            htmlFor={`${formId}-category`}
            className="block text-xs font-medium text-text-secondary"
          >
            Categoria
          </label>
          <select
            id={`${formId}-category`}
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as AssetCategory)}
            className="w-full h-11 px-3 rounded-xl bg-surface-3 border border-border text-sm text-text"
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="space-y-1 border-0 p-0 m-0">
          <legend className="text-xs font-medium text-text-secondary">
            Visibilidade
          </legend>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              aria-pressed={scope === 'personal'}
              onClick={() => setScope('personal')}
              className={`h-11 px-2.5 rounded-xl border text-xs font-medium transition-colors ${
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
              className={`h-11 px-2.5 rounded-xl border text-xs font-medium transition-colors ${
                scope === 'shared'
                  ? 'bg-shared text-accent-foreground border-shared'
                  : 'bg-surface-3 border-border-soft text-text-secondary'
              }`}
            >
              Compartilhado
            </button>
          </div>
        </fieldset>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label
            htmlFor={`${formId}-meter-unit`}
            className="block text-xs font-medium text-text-secondary"
          >
            Medidor de uso
          </label>
          <select
            id={`${formId}-meter-unit`}
            name="meter_unit"
            value={meterUnit}
            onChange={(e) => setMeterUnit(e.target.value as AssetMeterUnit)}
            className="w-full h-11 px-3 rounded-xl bg-surface-3 border border-border text-sm text-text"
          >
            {METER_UNITS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>

        {meterUnit !== 'none' ? (
          <div className="space-y-1">
            <label
              htmlFor={`${formId}-current-meter`}
              className="block text-xs font-medium text-text-secondary"
            >
              Medição atual ({meterUnit === 'km' ? 'km' : 'horas'})
            </label>
            <input
              id={`${formId}-current-meter`}
              name="current_meter"
              type="text"
              inputMode="numeric"
              value={currentMeter}
              onChange={(e) =>
                setCurrentMeter(e.target.value.replace(/[^\d.,]/g, ''))
              }
              placeholder={meterUnit === 'km' ? 'Ex: 34200' : 'Ex: 120'}
              className="w-full h-11 px-3 rounded-xl bg-surface-3 border border-border text-sm text-text"
            />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label
            htmlFor={`${formId}-purchased`}
            className="block text-xs font-medium text-text-secondary"
          >
            Data da compra
          </label>
          <input
            id={`${formId}-purchased`}
            name="purchased_at"
            type="date"
            value={purchasedAt}
            onChange={(e) => setPurchasedAt(e.target.value)}
            className="w-full h-11 px-3 rounded-xl bg-surface-3 border border-border text-sm text-text"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor={`${formId}-warranty`}
            className="block text-xs font-medium text-text-secondary"
          >
            Fim da garantia
          </label>
          <input
            id={`${formId}-warranty`}
            name="warranty_expires_at"
            type="date"
            value={warrantyExpiresAt}
            onChange={(e) => setWarrantyExpiresAt(e.target.value)}
            className="w-full h-11 px-3 rounded-xl bg-surface-3 border border-border text-sm text-text"
          />
        </div>
      </div>

      {/* Upload de nota fiscal */}
      <div className="space-y-1.5">
        <span className="block text-xs font-medium text-text-secondary">
          Foto da nota fiscal (opcional)
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleFileChange}
        />
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[40px] px-3.5 rounded-xl bg-surface-3 border border-border text-xs font-medium text-text-secondary hover:text-text inline-flex items-center gap-2"
          >
            <FileImage className="h-4 w-4 text-accent" />
            <span>
              {receiptBlob
                ? receiptBlob.name
                : initialAsset?.receipt_path
                  ? 'Substituir foto da nota fiscal'
                  : 'Anexar foto da nota fiscal'}
            </span>
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <label
          htmlFor={`${formId}-notes`}
          className="block text-xs font-medium text-text-secondary"
        >
          Observações técnicas (opcional)
        </label>
        <textarea
          id={`${formId}-notes`}
          name="notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Especificação de óleo, loja, número de série..."
          className="w-full p-3 rounded-xl bg-surface-3 border border-border text-sm text-text placeholder:text-text-dim"
        />
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
        {initialAsset ? (
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
            {initialAsset ? 'Salvar ativo' : 'Cadastrar ativo'}
          </button>
        </div>
      </div>
    </form>
  );
}

export function AssetModal({
  open,
  onClose,
  initialAsset = null,
}: AssetModalProps) {
  const formKey = `${open ? 'open' : 'closed'}-${initialAsset?.id ?? 'new'}`;

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={initialAsset ? 'Editar ativo' : 'Novo ativo em Cuidados'}
      subtitle="Cadastre veículos, aparelhos, garantias e notas fiscais."
    >
      <AssetModalForm
        key={formKey}
        onClose={onClose}
        initialAsset={initialAsset}
      />
    </ModalDialog>
  );
}
