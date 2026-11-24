import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Edit3,
  FileText,
  Gauge,
  History,
  Plus,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { AssetModal } from '@/components/cuidados/AssetModal';
import { CareRuleModal } from '@/components/cuidados/CareRuleModal';
import { CompleteCareModal } from '@/components/cuidados/CompleteCareModal';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { triggerHaptic } from '@/lib/platform';
import { getLocalDateString } from '@/lib/timezone';
import { useAuthStore } from '@/store/useAuthStore';
import { useDataStore } from '@/store/useDataStore';
import type { Asset, CareRule } from '@/types';

const MONTHS_SHORT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

function formatNumberPtBr(val: number | null | undefined): string {
  if (val == null) return '0';
  return new Intl.NumberFormat('pt-BR').format(val);
}

function formatDatePtBr(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

function formatRuleSummary(rule: CareRule, asset: Asset): string {
  if (rule.trigger_type === 'meter' && rule.next_due_meter != null) {
    const unit = asset.meter_unit === 'hours' ? 'h' : 'km';
    if (asset.current_meter != null) {
      const diff = rule.next_due_meter - asset.current_meter;
      if (diff <= 0) {
        return `Marco atingido (${formatNumberPtBr(rule.next_due_meter)} ${unit})`;
      }
      return `Próx: ${formatNumberPtBr(rule.next_due_meter)} ${unit} (faltam ${formatNumberPtBr(diff)} ${unit})`;
    }
    return `Próx: ${formatNumberPtBr(rule.next_due_meter)} ${unit}`;
  }
  if (rule.trigger_type === 'flexible_days') {
    const base = `A cada ~${rule.interval_days ?? 30} dias`;
    return rule.next_due_date
      ? `${base} • Próx: ${formatDatePtBr(rule.next_due_date)}`
      : base;
  }
  if (rule.trigger_type === 'annual_date') {
    const monthLabel = MONTHS_SHORT[(rule.annual_month || 1) - 1] ?? '';
    return `Anual (${String(rule.annual_day || 1).padStart(2, '0')}/${monthLabel})${
      rule.next_due_date ? ` • Próx: ${formatDatePtBr(rule.next_due_date)}` : ''
    }`;
  }
  return '';
}

export function CuidadosPage() {
  const profile = useAuthStore((s) => s.profile);
  const assets = useDataStore((s) => s.assets);
  const careRules = useDataStore((s) => s.careRules);
  const localMediaUrls = useDataStore((s) => s.localMediaUrls);
  const updateAssetMeter = useDataStore((s) => s.updateAssetMeter);
  const getUpcomingWarrantyAlerts = useDataStore(
    (s) => s.getUpcomingWarrantyAlerts,
  );
  const resolveMediaUrl = useDataStore((s) => s.resolveMediaUrl);

  const [openId, setOpenId] = useState<string | null>(null);
  const [meterDrafts, setMeterDrafts] = useState<Record<string, string>>({});
  const [resolvedReceipts, setResolvedReceipts] = useState<
    Record<string, string>
  >({});
  const [previewReceiptAsset, setPreviewReceiptAsset] = useState<Asset | null>(
    null,
  );

  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);

  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [ruleTargetAsset, setRuleTargetAsset] = useState<Asset | null>(null);
  const [editingRule, setEditingRule] = useState<CareRule | null>(null);

  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [completeTargetAsset, setCompleteTargetAsset] = useState<Asset | null>(
    null,
  );
  const [completeTargetRule, setCompleteTargetRule] =
    useState<CareRule | null>(null);

  const activeAssets = useMemo(
    () => assets.filter((a) => !a.deleted_at),
    [assets],
  );

  const warrantyAlerts = getUpcomingWarrantyAlerts(30);
  const warrantyAlertsMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of warrantyAlerts) {
      map.set(a.asset_id, a.days_remaining);
    }
    return map;
  }, [warrantyAlerts]);

  const todayStr = getLocalDateString(new Date(), profile.timezone);

  useEffect(() => {
    if (!openId) return;
    const asset = activeAssets.find((a) => a.id === openId);
    if (!asset?.receipt_path) return;
    if (
      localMediaUrls[asset.receipt_path] ||
      resolvedReceipts[asset.receipt_path]
    ) {
      return;
    }
    let mounted = true;
    void resolveMediaUrl(asset.receipt_path).then((url) => {
      if (mounted && url && asset.receipt_path) {
        setResolvedReceipts((prev) => ({
          ...prev,
          [asset.receipt_path!]: url,
        }));
      }
    });
    return () => {
      mounted = false;
    };
  }, [openId, activeAssets, localMediaUrls, resolvedReceipts, resolveMediaUrl]);

  async function handleQuickMeterUpdate(asset: Asset) {
    const raw =
      meterDrafts[asset.id] ??
      (asset.current_meter != null ? String(asset.current_meter) : '');
    const parsed = Number(raw.replace(/\./g, '').replace(',', '.'));
    if (Number.isNaN(parsed) || parsed < 0) return;
    void triggerHaptic('success');
    await updateAssetMeter(asset.id, parsed);
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text">
            Bens, manutenções e garantias
          </h2>
          <p className="text-xs text-text-muted">
            Toque em um item para atualizar medidor, ver nota fiscal e registrar serviços
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            void triggerHaptic('light');
            setEditingAsset(null);
            setAssetModalOpen(true);
          }}
          className="min-h-[40px] px-3.5 rounded-full bg-accent text-accent-foreground text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-accent-hover transition-colors shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Novo ativo</span>
        </button>
      </div>

      {activeAssets.length === 0 ? (
        <div className="surface-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-text">Minha Moto</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-3 text-text-muted">
              Exemplo pronto para cadastro
            </span>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">
            Cadastre seus veículos, eletrodomésticos ou cuidados do quintal para acompanhar quilometragem, revisões e garantias.
          </p>
          <button
            type="button"
            onClick={() => {
              setEditingAsset(null);
              setAssetModalOpen(true);
            }}
            className="min-h-[40px] px-4 rounded-full bg-accent text-accent-foreground text-xs font-semibold"
          >
            Cadastrar primeiro ativo
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {activeAssets.map((asset) => {
            const isOpen = openId === asset.id;
            const rules = careRules.filter(
              (c) => c.asset_id === asset.id && !c.deleted_at,
            );
            const warrantyDays = warrantyAlertsMap.get(asset.id);

            // Detecta se alguma regra está próxima ou vencida
            const hasSoonRule = rules.some((r) => {
              if (
                r.trigger_type === 'meter' &&
                r.next_due_meter != null &&
                asset.current_meter != null
              ) {
                const threshold = asset.meter_unit === 'hours' ? 20 : 500;
                return r.next_due_meter - asset.current_meter <= threshold;
              }
              if (r.next_due_date) {
                const diffMs =
                  new Date(`${r.next_due_date}T12:00:00`).getTime() -
                  new Date(`${todayStr}T12:00:00`).getTime();
                const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
                return diffDays <= 7;
              }
              return false;
            });

            const isWarning = warrantyDays !== undefined || hasSoonRule;

            // Linha única de resumo para divulgação progressiva
            const summaryParts: string[] = [];
            if (asset.meter_unit !== 'none' && asset.current_meter != null) {
              summaryParts.push(
                `${formatNumberPtBr(asset.current_meter)} ${
                  asset.meter_unit === 'hours' ? 'horas' : 'km'
                }`,
              );
            }
            if (rules[0]) {
              summaryParts.push(
                `${rules[0].title}: ${formatRuleSummary(rules[0], asset)}`,
              );
            } else if (asset.warranty_expires_at) {
              summaryParts.push(
                `Garantia até ${formatDatePtBr(asset.warranty_expires_at)}`,
              );
            } else if (asset.notes) {
              summaryParts.push(asset.notes);
            }

            const summaryLine =
              summaryParts.join(' • ') ||
              'Toque para adicionar regras de manutenção ou garantia';

            const allServiceLogs = rules
              .flatMap((r) =>
                (r.service_history ?? []).map((log) => ({
                  ...log,
                  ruleTitle: r.title,
                })),
              )
              .sort((a, b) => b.performed_at.localeCompare(a.performed_at))
              .slice(0, 5);

            const receiptUrl = asset.receipt_path
              ? localMediaUrls[asset.receipt_path] ||
                resolvedReceipts[asset.receipt_path] ||
                null
              : null;

            return (
              <div key={asset.id} className="surface-card overflow-hidden">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenId(isOpen ? null : asset.id)}
                  className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-surface-3/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-text truncate">
                        {asset.name}
                      </span>
                      {asset.scope === 'shared' ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-shared-soft text-shared font-medium">
                          Compartilhado
                        </span>
                      ) : null}
                      {warrantyDays !== undefined ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-warning-soft text-warning font-medium inline-flex items-center gap-1">
                          <ShieldAlert className="h-3 w-3" />
                          <span>Garantia: {warrantyDays}d</span>
                        </span>
                      ) : null}
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                          isWarning
                            ? 'bg-warning-soft text-warning'
                            : 'bg-success-soft text-success'
                        }`}
                      >
                        {isWarning ? 'Atenção próxima' : 'Em dia'}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted mt-1 truncate">
                      {summaryLine}
                    </p>
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

                {/* Divulgação progressiva: .t-acc-panel + .t-acc-panel-inner sem padding no 0fr */}
                <div
                  data-open={isOpen ? 'true' : 'false'}
                  className="t-acc-panel"
                >
                  <div className="t-acc-panel-inner">
                    <div className="px-4 pb-4 pt-3 border-t border-border-soft space-y-4">
                      {/* 1. Atualização rápida do medidor */}
                      {asset.meter_unit !== 'none' ? (
                        <div className="p-3 surface-item flex flex-wrap items-center justify-between gap-2.5">
                          <div className="flex items-center gap-2">
                            <Gauge className="h-4 w-4 text-accent shrink-0" />
                            <span className="text-xs font-medium text-text-secondary">
                              Medidor atual (
                              {asset.meter_unit === 'hours' ? 'horas' : 'km'}):
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              inputMode="numeric"
                              aria-label={`Atualizar medidor de ${asset.name}`}
                              value={
                                meterDrafts[asset.id] ??
                                (asset.current_meter != null
                                  ? String(asset.current_meter)
                                  : '')
                              }
                              onChange={(e) =>
                                setMeterDrafts((prev) => ({
                                  ...prev,
                                  [asset.id]: e.target.value.replace(
                                    /[^\d.,]/g,
                                    '',
                                  ),
                                }))
                              }
                              className="w-28 h-10 px-3 rounded-xl bg-surface-2 border border-border text-xs font-semibold text-text"
                            />
                            <button
                              type="button"
                              onClick={() => void handleQuickMeterUpdate(asset)}
                              className="min-h-[40px] px-3.5 rounded-xl bg-accent text-accent-foreground text-xs font-semibold hover:bg-accent-hover transition-colors"
                            >
                              Atualizar
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {/* 2. Compra, garantia, nota fiscal e edição do ativo */}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-secondary">
                        <div className="space-y-0.5">
                          {asset.purchased_at ? (
                            <p>
                              • Compra: {formatDatePtBr(asset.purchased_at)}
                            </p>
                          ) : null}
                          {asset.warranty_expires_at ? (
                            <p>
                              • Garantia até:{' '}
                              {formatDatePtBr(asset.warranty_expires_at)}
                            </p>
                          ) : null}
                          {asset.notes ? <p>• {asset.notes}</p> : null}
                        </div>

                        <div className="flex items-center gap-2">
                          {asset.receipt_path ? (
                            <button
                              type="button"
                              onClick={() => setPreviewReceiptAsset(asset)}
                              className="min-h-[38px] px-3 rounded-full bg-surface-3 border border-border text-xs font-medium text-accent inline-flex items-center gap-1.5"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              <span>Ver nota fiscal</span>
                            </button>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => {
                              setEditingAsset(asset);
                              setAssetModalOpen(true);
                            }}
                            className="min-h-[38px] px-3 rounded-full bg-surface-3 border border-border text-xs font-medium text-text-secondary hover:text-text inline-flex items-center gap-1.5"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>Editar ativo</span>
                          </button>
                        </div>
                      </div>

                      {receiptUrl ? (
                        <div className="p-2 rounded-xl bg-surface-3 border border-border-soft inline-block">
                          <img
                            src={receiptUrl}
                            alt={`Nota fiscal de ${asset.name}`}
                            loading="lazy"
                            onClick={() => setPreviewReceiptAsset(asset)}
                            className="h-20 w-auto rounded-lg object-cover cursor-pointer"
                          />
                        </div>
                      ) : null}

                      {/* 3. Regras de cuidado vinculadas */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                            <Wrench className="h-3.5 w-3.5 text-accent" />
                            <span>Regras de cuidado</span>
                          </span>

                          <button
                            type="button"
                            onClick={() => {
                              setRuleTargetAsset(asset);
                              setEditingRule(null);
                              setRuleModalOpen(true);
                            }}
                            className="min-h-[38px] px-3 rounded-full bg-surface-3 border border-border text-xs font-semibold text-accent hover:bg-surface-4 inline-flex items-center gap-1"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>Regra</span>
                          </button>
                        </div>

                        {rules.length === 0 ? (
                          <p className="text-xs text-text-dim">
                            Nenhuma regra cadastrada para este item.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {rules.map((rule) => (
                              <div
                                key={rule.id}
                                className="surface-item p-3 flex flex-wrap items-center justify-between gap-2.5"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRuleTargetAsset(asset);
                                    setEditingRule(rule);
                                    setRuleModalOpen(true);
                                  }}
                                  className="min-w-0 flex-1 text-left"
                                >
                                  <p className="text-sm font-medium text-text truncate">
                                    {rule.title}
                                  </p>
                                  <p className="text-xs text-text-muted">
                                    {formatRuleSummary(rule, asset)}
                                  </p>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    void triggerHaptic('light');
                                    setCompleteTargetAsset(asset);
                                    setCompleteTargetRule(rule);
                                    setCompleteModalOpen(true);
                                  }}
                                  className="min-h-[40px] px-3.5 rounded-full bg-surface-2 border border-border text-xs font-semibold text-text hover:bg-surface-4 inline-flex items-center gap-1.5 shrink-0 transition-colors"
                                >
                                  <Check className="h-3.5 w-3.5 text-success" />
                                  <span>Registrar feito</span>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 4. Histórico resumido dos últimos serviços realizados */}
                      {allServiceLogs.length > 0 ? (
                        <div className="pt-2 border-t border-border-soft space-y-1.5">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                            <History className="h-3 w-3" />
                            <span>Últimos serviços realizados</span>
                          </span>
                          <div className="space-y-1">
                            {allServiceLogs.map((log) => (
                              <p
                                key={log.id}
                                className="text-xs text-text-secondary"
                              >
                                • <strong className="text-text">{log.ruleTitle}</strong>{' '}
                                em{' '}
                                {new Date(log.performed_at).toLocaleDateString(
                                  'pt-BR',
                                )}
                                {log.meter_value != null
                                  ? ` (${formatNumberPtBr(log.meter_value)} ${
                                      asset.meter_unit === 'hours' ? 'h' : 'km'
                                    })`
                                  : ''}
                                {log.workshop_or_parts
                                  ? ` — ${log.workshop_or_parts}`
                                  : ''}
                                {log.cost_note ? ` (${log.cost_note})` : ''}
                              </p>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de visualização da Nota Fiscal */}
      <ModalDialog
        open={Boolean(previewReceiptAsset)}
        onClose={() => setPreviewReceiptAsset(null)}
        title={`Nota fiscal — ${previewReceiptAsset?.name ?? ''}`}
        subtitle="Armazenada com acesso privado da sua conta."
      >
        {previewReceiptAsset?.receipt_path ? (
          <div className="space-y-3 text-center">
            {localMediaUrls[previewReceiptAsset.receipt_path] ||
            resolvedReceipts[previewReceiptAsset.receipt_path] ? (
              <img
                src={
                  localMediaUrls[previewReceiptAsset.receipt_path] ||
                  resolvedReceipts[previewReceiptAsset.receipt_path]
                }
                alt={`Nota fiscal de ${previewReceiptAsset.name}`}
                className="max-h-[65dvh] w-auto mx-auto rounded-2xl border border-border object-contain"
              />
            ) : (
              <p className="text-xs text-text-muted py-6">
                Nota fiscal registrada ({previewReceiptAsset.receipt_path}). A imagem completa ficará disponível após sincronizar com o bucket privado.
              </p>
            )}
          </div>
        ) : null}
      </ModalDialog>

      <AssetModal
        open={assetModalOpen}
        onClose={() => setAssetModalOpen(false)}
        initialAsset={editingAsset}
      />

      <CareRuleModal
        open={ruleModalOpen}
        onClose={() => setRuleModalOpen(false)}
        asset={ruleTargetAsset}
        initialRule={editingRule}
      />

      <CompleteCareModal
        open={completeModalOpen}
        onClose={() => setCompleteModalOpen(false)}
        asset={completeTargetAsset}
        rule={completeTargetRule}
      />
    </div>
  );
}
