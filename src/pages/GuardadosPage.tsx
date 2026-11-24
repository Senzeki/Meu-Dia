import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { VaultCategory } from '@/types';

const CATEGORIES: Array<{ id: 'all' | VaultCategory; label: string }> = [
  { id: 'all', label: 'Tudo' },
  { id: 'print', label: 'Prints' },
  { id: 'link', label: 'Links' },
  { id: 'study', label: 'Estudos' },
  { id: 'work', label: 'Trabalho' },
];

export function GuardadosPage() {
  const [selected, setSelected] = useState<'all' | VaultCategory>('all');

  const items = [
    { id: 'v1', category: 'print' as const, label: 'Prints', title: 'Tabela de bitolas e disjuntores', when: 'Ontem' },
    { id: 'v2', category: 'link' as const, label: 'Links', title: 'Repositório de referência para painel web', when: 'Ontem' },
    { id: 'v3', category: 'work' as const, label: 'Trabalho', title: 'Medidas do vão da janela e contato do serralheiro', when: 'Hoje' },
  ].filter((x) => selected === 'all' || x.category === selected);

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => {
            const active = selected === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelected(cat.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors ${
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
          className="h-9 px-3.5 rounded-full bg-accent text-accent-foreground text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-accent-hover transition-colors shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Guardar</span>
        </button>
      </div>

      <div className="surface-card divide-y divide-border-soft">
        {items.map((item) => (
          <div key={item.id} className="p-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[11px] font-medium text-accent">{item.label}</span>
              <p className="text-sm font-medium text-text truncate mt-0.5">{item.title}</p>
            </div>
            <span className="text-xs text-text-dim shrink-0">{item.when}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
