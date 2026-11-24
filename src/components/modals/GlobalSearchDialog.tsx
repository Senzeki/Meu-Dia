import { useState } from 'react';
import { Search } from 'lucide-react';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { useUiStore } from '@/store/useUiStore';

export function GlobalSearchDialog() {
  const open = useUiStore((s) => s.searchOpen);
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const [query, setQuery] = useState('');

  return (
    <ModalDialog
      open={open}
      onClose={() => setSearchOpen(false)}
      title="Busca rápida"
      subtitle="Procure em Conversa, Agenda, Casa, Cuidados e Guardados."
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="h-4 w-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex: óleo da moto, ar-condicionado, nota fiscal..."
            autoFocus
            className="w-full h-11 pl-10 pr-4 rounded-xl bg-surface-3 border border-border text-sm text-text placeholder:text-text-dim"
          />
        </div>

        <div className="py-4 text-center text-xs text-text-muted">
          {query.trim()
            ? 'A indexação local unificada entra em operação com o banco offline na Fase 2.'
            : 'Digite um termo para localizar qualquer anotação, ativo, print ou recado.'}
        </div>
      </div>
    </ModalDialog>
  );
}
