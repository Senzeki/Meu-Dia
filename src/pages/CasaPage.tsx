import { useState } from 'react';
import { Bell, Plus, ShoppingCart } from 'lucide-react';

type FilterMode = 'all' | 'me' | 'partner' | 'both';

export function CasaPage() {
  const [filter, setFilter] = useState<FilterMode>('all');

  const tasks = [
    { id: '1', title: 'Trocar luminária do banheiro', assignee: 'me' as const, label: 'Meu' },
    { id: '2', title: 'Recolher roupa do varal antes de sair', assignee: 'partner' as const, label: 'Dela' },
    { id: '3', title: 'Organizar armário da área de serviço', assignee: 'both' as const, label: 'Os dois' },
  ].filter((t) => filter === 'all' || t.assignee === filter || t.assignee === 'both');

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Mural com horário */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-text">Mural</h2>
            <p className="text-xs text-text-muted">Recados com notificação no horário combinado</p>
          </div>
          <button
            type="button"
            className="h-9 px-3.5 rounded-full bg-shared-soft border border-shared/30 text-shared text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-shared/20 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Novo recado</span>
          </button>
        </div>

        <div className="surface-card divide-y divide-border-soft">
          <div className="p-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-shared font-medium">Você → Esposa</p>
              <p className="text-sm text-text truncate mt-0.5">Estender a roupa do varal</p>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-3 border border-border-soft text-xs text-text-secondary shrink-0">
              <Bell className="h-3 w-3 text-shared" />
              15:00
            </span>
          </div>
        </div>
      </section>

      {/* Tarefas & Rotinas da Casa */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-text">Tarefas e rotinas da casa</h2>

          <div className="inline-flex p-0.5 rounded-full bg-track border border-border">
            {(
              [
                ['all', 'Tudo'],
                ['me', 'Meu'],
                ['partner', 'Dela'],
                ['both', 'Os dois'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  filter === key
                    ? 'bg-accent text-accent-foreground'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="surface-card divide-y divide-border-soft">
          {tasks.map((item) => (
            <label
              key={item.id}
              className="p-3.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-surface-3/40 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <input type="checkbox" className="h-4 w-4 rounded" />
                <span className="text-sm font-medium text-text truncate">{item.title}</span>
              </div>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-surface-3 border border-border-soft text-text-muted shrink-0">
                {item.label}
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* Ponte informativa para o Rotinas de Casa */}
      <div className="surface-item p-4 flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-text-secondary shrink-0">
          <ShoppingCart className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs font-semibold text-text">Lista de mercado no Rotinas de Casa</p>
          <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
            A lista de compras permanece lá. Quando precisar, avise na Conversa que um item acabou para enviar direto.
          </p>
        </div>
      </div>
    </div>
  );
}
