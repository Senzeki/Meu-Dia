import { useId, useState } from 'react';
import { ArrowUpRight, Search } from 'lucide-react';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { triggerHaptic } from '@/lib/platform';
import { useDataStore } from '@/store/useDataStore';
import { useUiStore } from '@/store/useUiStore';
import type { GlobalSearchResultItem } from '@/types';

export function GlobalSearchDialog() {
  const open = useUiStore((s) => s.searchOpen);
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const navigateToArea = useUiStore((s) => s.navigateToArea);
  const focusChatMessage = useUiStore((s) => s.focusChatMessage);
  const searchAll = useDataStore((s) => s.searchAll);

  // Subscribe to entity arrays so live results stay current
  useDataStore((s) => s.tasks);
  useDataStore((s) => s.houseRoutines);
  useDataStore((s) => s.muralNotes);
  useDataStore((s) => s.assets);
  useDataStore((s) => s.careRules);
  useDataStore((s) => s.vaultItems);
  useDataStore((s) => s.messages);

  const [query, setQuery] = useState('');
  const searchInputId = useId();

  const trimmed = query.trim();
  const results = trimmed ? searchAll(trimmed) : [];

  function handleClose() {
    setQuery('');
    setSearchOpen(false);
  }

  function handleSelect(hit: GlobalSearchResultItem) {
    void triggerHaptic('light');
    setQuery('');
    setSearchOpen(false);
    navigateToArea(hit.area, hit.agenda_horizon);
    if (hit.area === 'chat') {
      focusChatMessage(hit.id);
    }
  }

  return (
    <ModalDialog
      open={open}
      onClose={handleClose}
      title="Busca rápida"
      subtitle="Procure em Conversa, Agenda, Casa, Cuidados e Guardados."
    >
      <div role="search" className="space-y-3">
        <div className="relative">
          <label htmlFor={searchInputId} className="visually-hidden">
            Termo de busca
          </label>
          <Search className="h-4 w-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id={searchInputId}
            name="global_query"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex: óleo da moto, ar-condicionado, nota fiscal..."
            autoFocus
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
            className="w-full h-11 pl-10 pr-4 rounded-xl bg-surface-3 border border-border text-sm text-text placeholder:text-text-dim"
          />
        </div>

        {!trimmed ? (
          <div className="py-4 text-center text-xs text-text-muted">
            Digite um termo para localizar qualquer anotação, ativo, print ou recado.
          </div>
        ) : results.length === 0 ? (
          <div className="py-4 text-center text-xs text-text-muted">
            Nenhum item encontrado para &ldquo;{trimmed}&rdquo;.
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
            {results.map((hit) => (
              <button
                key={`${hit.area}-${hit.id}`}
                type="button"
                onClick={() => handleSelect(hit)}
                className="w-full p-3 rounded-xl bg-surface-3 border border-border-soft flex items-center justify-between gap-3 text-left hover:bg-surface-4 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-accent">
                      {hit.area_label}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-text truncate mt-0.5">
                    {hit.title}
                  </p>
                  {hit.subtitle ? (
                    <p className="text-xs text-text-muted truncate">
                      {hit.subtitle}
                    </p>
                  ) : null}
                </div>
                <ArrowUpRight className="h-4 w-4 text-text-muted shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </ModalDialog>
  );
}
