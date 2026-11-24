import { useState } from 'react';
import { Plus } from 'lucide-react';

interface AssetPreview {
  id: string;
  name: string;
  shared?: boolean;
  summary: string;
  statusLabel: string;
  statusTone: 'ok' | 'soon';
  details: string[];
}

const PREVIEW_ASSETS: AssetPreview[] = [
  {
    id: 'moto-1',
    name: 'Minha Moto',
    summary: '34.200 km • Faltam 300 km para a troca de óleo',
    statusLabel: 'Próximo',
    statusTone: 'soon',
    details: [
      'Próxima troca de óleo: 34.500 km',
      'Revisão geral prevista: 36.000 km',
      'Licenciamento anual: Agosto',
    ],
  },
  {
    id: 'ac-sala',
    name: 'Ar-condicionado da Sala',
    shared: true,
    summary: 'Limpar filtro em 8 dias • Garantia até 23/11/2027',
    statusLabel: 'Em dia',
    statusTone: 'ok',
    details: [
      'Compra: 23/11/2026 • Garantia de 12 meses (aviso 30 dias antes)',
      'Ciclo flexível do filtro: a cada 60 dias após conclusão',
      'Nota fiscal armazenada em área privada',
    ],
  },
];

export function CuidadosPage() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text">Bens, manutenções e garantias</h2>
          <p className="text-xs text-text-muted">Toque em um item para ver garantia, nota fiscal e histórico</p>
        </div>

        <button
          type="button"
          className="h-9 px-3.5 rounded-full bg-accent text-accent-foreground text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-accent-hover transition-colors shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Novo ativo</span>
        </button>
      </div>

      <div className="space-y-2.5">
        {PREVIEW_ASSETS.map((asset) => {
          const isOpen = openId === asset.id;
          return (
            <div key={asset.id} className="surface-card overflow-hidden">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenId(isOpen ? null : asset.id)}
                className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-surface-3/40 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-text truncate">
                      {asset.name}
                    </span>
                    {asset.shared ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-shared-soft text-shared font-medium">
                        Compartilhado
                      </span>
                    ) : null}
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        asset.statusTone === 'soon'
                          ? 'bg-warning-soft text-warning'
                          : 'bg-success-soft text-success'
                      }`}
                    >
                      {asset.statusLabel}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted mt-1 truncate">{asset.summary}</p>
                </div>

                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  data-open={isOpen ? 'true' : 'false'}
                  className="t-acc-chevron h-4 w-4 text-text-muted shrink-0"
                >
                  <path
                    d="M4 6L8 10L12 6"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              </button>

              <div data-open={isOpen ? 'true' : 'false'} className="t-acc-panel">
                <div className="t-acc-panel-inner">
                  <div className="px-4 pb-4 pt-2 border-t border-border-soft space-y-1.5">
                    {asset.details.map((line) => (
                      <p key={line} className="text-xs text-text-secondary">
                        • {line}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
