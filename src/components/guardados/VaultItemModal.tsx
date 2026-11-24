import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { triggerHaptic } from '@/lib/platform';
import { useDataStore } from '@/store/useDataStore';
import type { VaultCategory, VaultItem } from '@/types';

interface VaultItemModalProps {
  open: boolean;
  onClose: () => void;
  initialItem?: VaultItem | null;
  defaultCategory?: VaultCategory;
}

const VAULT_CATEGORIES: Array<{ id: VaultCategory; label: string }> = [
  { id: 'print', label: 'Prints' },
  { id: 'link', label: 'Links' },
  { id: 'study', label: 'Estudos' },
  { id: 'work', label: 'Trabalho' },
];

function VaultItemModalForm({
  onClose,
  initialItem,
  defaultCategory,
}: Omit<VaultItemModalProps, 'open'>) {
  const saveVaultItem = useDataStore((s) => s.saveVaultItem);
  const deleteVaultItem = useDataStore((s) => s.deleteVaultItem);

  const formId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [category, setCategory] = useState<VaultCategory>(
    initialItem?.category ?? defaultCategory ?? 'work',
  );
  const [title, setTitle] = useState(initialItem?.title ?? '');
  const [url, setUrl] = useState(initialItem?.url ?? '');
  const [body, setBody] = useState(initialItem?.body ?? '');
  const [imageBlob, setImageBlob] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImageBlob(file);
    if (file && !title.trim()) {
      setTitle(file.name.replace(/\.[^.]+$/, ''));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cleanTitle =
      title.trim() ||
      (imageBlob ? imageBlob.name : '') ||
      (url.trim() ? url.trim() : '');
    if (!cleanTitle || saving) return;

    setSaving(true);
    try {
      void triggerHaptic('success');
      await saveVaultItem({
        id: initialItem?.id,
        category,
        title: cleanTitle,
        url: url.trim() || null,
        body: body.trim() || null,
        image_blob: imageBlob,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initialItem || saving) return;
    setSaving(true);
    try {
      void triggerHaptic('warning');
      await deleteVaultItem(initialItem.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <fieldset className="space-y-1.5 border-0 p-0 m-0">
        <legend className="text-xs font-medium text-text-secondary">
          Categoria
        </legend>
        <div className="grid grid-cols-4 gap-1.5">
          {VAULT_CATEGORIES.map((cat) => {
            const active = category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(cat.id)}
                className={`min-h-[40px] px-2 rounded-xl border text-xs font-medium transition-colors ${
                  active
                    ? 'bg-accent text-accent-foreground border-accent'
                    : 'bg-surface-3 border-border-soft text-text-secondary hover:text-text'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-1">
        <label
          htmlFor={`${formId}-title`}
          className="block text-xs font-medium text-text-secondary"
        >
          Título ou identificação *
        </label>
        <input
          id={`${formId}-title`}
          name="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Tabela de bitolas, Medidas da janela, Repositório..."
          required
          autoFocus
          className="w-full h-11 px-3.5 rounded-xl bg-surface-3 border border-border text-sm text-text placeholder:text-text-dim"
        />
      </div>

      {category === 'print' ? (
        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-text-secondary">
            Imagem do print
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[42px] px-4 rounded-xl bg-surface-3 border border-border text-xs font-medium text-text-secondary hover:text-text inline-flex items-center gap-2"
          >
            <ImagePlus className="h-4 w-4 text-accent" />
            <span>
              {imageBlob
                ? imageBlob.name
                : initialItem?.media_path
                  ? 'Trocar imagem do print'
                  : 'Selecionar print ou foto'}
            </span>
          </button>
        </div>
      ) : null}

      {category === 'link' || category === 'study' || category === 'work' ? (
        <div className="space-y-1">
          <label
            htmlFor={`${formId}-url`}
            className="block text-xs font-medium text-text-secondary"
          >
            Link / URL {category === 'link' ? '*' : '(opcional)'}
          </label>
          <input
            id={`${formId}-url`}
            name="url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required={category === 'link'}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="https://..."
            className="w-full h-11 px-3.5 rounded-xl bg-surface-3 border border-border text-sm text-text placeholder:text-text-dim"
          />
        </div>
      ) : null}

      <div className="space-y-1">
        <label
          htmlFor={`${formId}-body`}
          className="block text-xs font-medium text-text-secondary"
        >
          Anotação ou detalhes (opcional)
        </label>
        <textarea
          id={`${formId}-body`}
          name="body"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Medidas, contato do fornecedor, resumo..."
          className="w-full p-3 rounded-xl bg-surface-3 border border-border text-sm text-text placeholder:text-text-dim"
        />
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
        {initialItem ? (
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
            {initialItem ? 'Salvar' : 'Guardar'}
          </button>
        </div>
      </div>
    </form>
  );
}

export function VaultItemModal({
  open,
  onClose,
  initialItem = null,
  defaultCategory = 'work',
}: VaultItemModalProps) {
  const formKey = `${open ? 'open' : 'closed'}-${initialItem?.id ?? 'new'}-${defaultCategory}`;

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={initialItem ? 'Editar item guardado' : 'Guardar em Guardados'}
      subtitle="Prints são guardados intactos, sem processamento automático invasivo."
    >
      <VaultItemModalForm
        key={formKey}
        onClose={onClose}
        initialItem={initialItem}
        defaultCategory={defaultCategory}
      />
    </ModalDialog>
  );
}
