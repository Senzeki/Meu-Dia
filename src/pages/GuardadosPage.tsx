import { useEffect, useMemo, useState } from 'react';
import {
  ExternalLink,
  Eye,
  FileImage,
  Plus,
  Trash2,
} from 'lucide-react';
import { VaultItemModal } from '@/components/guardados/VaultItemModal';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { triggerHaptic } from '@/lib/platform';
import { useDataStore } from '@/store/useDataStore';
import type { VaultCategory, VaultItem } from '@/types';

const CATEGORIES: Array<{ id: 'all' | VaultCategory; label: string }> = [
  { id: 'all', label: 'Tudo' },
  { id: 'print', label: 'Prints' },
  { id: 'link', label: 'Links' },
  { id: 'study', label: 'Estudos' },
  { id: 'work', label: 'Trabalho' },
];

const CATEGORY_LABELS: Record<VaultCategory, string> = {
  print: 'Prints',
  link: 'Links',
  study: 'Estudos',
  work: 'Trabalho',
};

export function GuardadosPage() {
  const vaultItems = useDataStore((s) => s.vaultItems);
  const localMediaUrls = useDataStore((s) => s.localMediaUrls);
  const resolveMediaUrl = useDataStore((s) => s.resolveMediaUrl);
  const deleteVaultItem = useDataStore((s) => s.deleteVaultItem);

  const [selected, setSelected] = useState<'all' | VaultCategory>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VaultItem | null>(null);
  const [previewItem, setPreviewItem] = useState<VaultItem | null>(null);
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});

  const filteredItems = useMemo(
    () =>
      vaultItems.filter(
        (item) =>
          !item.deleted_at &&
          (selected === 'all' || item.category === selected),
      ),
    [vaultItems, selected],
  );

  useEffect(() => {
    let active = true;
    for (const item of filteredItems) {
      if (
        item.media_path &&
        !item.local_preview_url &&
        !localMediaUrls[item.media_path] &&
        !resolvedUrls[item.media_path]
      ) {
        const path = item.media_path;
        void resolveMediaUrl(path).then((url) => {
          if (active && url) {
            setResolvedUrls((prev) => ({ ...prev, [path]: url }));
          }
        });
      }
    }
    return () => {
      active = false;
    };
  }, [filteredItems, localMediaUrls, resolvedUrls, resolveMediaUrl]);

  function getItemMediaUrl(item: VaultItem | null): string | null {
    if (!item) return null;
    if (item.local_preview_url) return item.local_preview_url;
    if (item.media_path) {
      return (
        localMediaUrls[item.media_path] ||
        resolvedUrls[item.media_path] ||
        null
      );
    }
    return null;
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2.5 min-w-0">
        <div
          role="tablist"
          aria-label="Categorias de guardados"
          className="flex items-center gap-1.5 overflow-x-auto pb-1 min-w-0"
        >
          {CATEGORIES.map((cat) => {
            const active = selected === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelected(cat.id)}
                className={`min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors ${
                  active
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-surface-2 border border-border text-text-muted hover:text-text'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            void triggerHaptic('light');
            setEditingItem(null);
            setModalOpen(true);
          }}
          className="min-h-[40px] px-3.5 rounded-full bg-accent text-accent-foreground text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-accent-hover transition-colors shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Guardar</span>
        </button>
      </div>

      {filteredItems.length === 0 ? (
        <div className="surface-card p-6 text-center space-y-2">
          <p className="text-sm text-text-secondary">
            Nenhum item guardado nesta categoria.
          </p>
          <p className="text-xs text-text-muted">
            Envie prints ou links na Conversa ou toque em &ldquo;Guardar&rdquo; acima.
          </p>
        </div>
      ) : (
        <div className="surface-card divide-y divide-border-soft">
          {filteredItems.map((item) => {
            const mediaUrl = getItemMediaUrl(item);
            const dateLabel = new Date(item.created_at).toLocaleDateString(
              'pt-BR',
              {
                day: '2-digit',
                month: 'short',
              },
            );

            return (
              <div
                key={item.id}
                className="p-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-surface-3/30 transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {mediaUrl ? (
                    <button
                      type="button"
                      onClick={() => setPreviewItem(item)}
                      aria-label={`Ampliar print: ${item.title}`}
                      className="h-12 w-12 rounded-xl overflow-hidden border border-border bg-surface-3 shrink-0"
                    >
                      <img
                        src={mediaUrl}
                        alt={item.title}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ) : item.category === 'print' ? (
                    <button
                      type="button"
                      onClick={() => setPreviewItem(item)}
                      aria-label={`Visualizar print: ${item.title}`}
                      className="h-11 w-11 rounded-xl border border-border bg-surface-3 flex items-center justify-center text-accent shrink-0"
                    >
                      <FileImage className="h-4 w-4" />
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => {
                      setEditingItem(item);
                      setModalOpen(true);
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-accent">
                        {CATEGORY_LABELS[item.category]}
                      </span>
                      <span className="text-[11px] text-text-dim">
                        • {dateLabel}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-text truncate mt-0.5">
                      {item.title}
                    </p>
                    {item.body ? (
                      <p className="text-xs text-text-muted line-clamp-2 mt-0.5">
                        {item.body}
                      </p>
                    ) : null}
                  </button>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {item.category === 'print' || item.media_path || mediaUrl ? (
                    <button
                      type="button"
                      onClick={() => setPreviewItem(item)}
                      aria-label={`Ampliar ${item.title}`}
                      className="min-h-[40px] px-3 rounded-full bg-surface-3 border border-border text-xs font-medium text-text-secondary hover:text-text inline-flex items-center gap-1"
                    >
                      <Eye className="h-3.5 w-3.5 text-accent" />
                      <span>Ver</span>
                    </button>
                  ) : null}

                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[40px] px-3 rounded-full bg-surface-3 border border-border text-xs font-medium text-accent hover:bg-surface-4 inline-flex items-center gap-1"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>Abrir</span>
                    </a>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => {
                      void triggerHaptic('warning');
                      void deleteVaultItem(item.id);
                    }}
                    aria-label={`Excluir ${item.title}`}
                    title="Excluir item"
                    className="h-10 w-10 rounded-full bg-surface-3 border border-border-soft flex items-center justify-center text-text-muted hover:text-danger hover:border-danger/35 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de visualização ampliada de Print */}
      <ModalDialog
        open={Boolean(previewItem)}
        onClose={() => setPreviewItem(null)}
        title={previewItem?.title ?? 'Print guardado'}
        subtitle="Imagem mantida intacta sem recorte ou OCR."
      >
        {previewItem ? (
          <div className="space-y-3">
            {getItemMediaUrl(previewItem) ? (
              <div className="rounded-2xl overflow-hidden border border-border bg-black/30 text-center">
                <img
                  src={getItemMediaUrl(previewItem)!}
                  alt={previewItem.title}
                  className="max-h-[65dvh] w-auto mx-auto object-contain"
                />
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-surface-3 border border-border-soft text-center text-xs text-text-muted">
                Print registrado ({previewItem.media_path || 'imagem local'}).
              </div>
            )}
            {previewItem.body ? (
              <p className="text-xs text-text-secondary whitespace-pre-wrap">
                {previewItem.body}
              </p>
            ) : null}
          </div>
        ) : null}
      </ModalDialog>

      <VaultItemModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialItem={editingItem}
        defaultCategory={selected === 'all' ? 'work' : selected}
      />
    </div>
  );
}
