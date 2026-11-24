import { motion } from 'framer-motion';
import {
  Bookmark,
  CalendarDays,
  CloudOff,
  Home,
  Leaf,
  RefreshCw,
  Search,
  Settings,
  Wrench,
} from 'lucide-react';
import { formatHeaderDatePtBr } from '@/lib/timezone';
import { triggerHaptic } from '@/lib/platform';
import { useAuthStore } from '@/store/useAuthStore';
import { useDataStore } from '@/store/useDataStore';
import { useUiStore } from '@/store/useUiStore';
import type { DesktopLeftTab, NavigationTab } from '@/types';

const TAB_LABELS: Record<NavigationTab, string> = {
  chat: 'Conversa',
  agenda: 'Agenda',
  casa: 'Casa',
  cuidados: 'Cuidados',
  guardados: 'Guardados',
};

const DESKTOP_TABS: Array<{
  id: DesktopLeftTab;
  label: string;
  icon: typeof CalendarDays;
}> = [
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'casa', label: 'Casa', icon: Home },
  { id: 'cuidados', label: 'Cuidados', icon: Wrench },
  { id: 'guardados', label: 'Guardados', icon: Bookmark },
];

export function TopBar() {
  const profile = useAuthStore((s) => s.profile);
  const partner = useAuthStore((s) => s.partner);
  const syncStatus = useDataStore((s) => s.syncStatus);
  const flushOfflineQueues = useDataStore((s) => s.flushOfflineQueues);

  const activeMobileTab = useUiStore((s) => s.activeMobileTab);
  const activeDesktopLeftTab = useUiStore((s) => s.activeDesktopLeftTab);
  const pauseSession = useUiStore((s) => s.pauseSession);
  const setDesktopLeftTab = useUiStore((s) => s.setDesktopLeftTab);
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const setPauseModalOpen = useUiStore((s) => s.setPauseModalOpen);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);

  const formattedDate = formatHeaderDatePtBr(new Date(), profile.timezone);
  const subtitle = partner
    ? `${profile.display_name} & ${partner.display_name} • ${formattedDate}`
    : `${formattedDate}`;

  const showSyncBadge =
    !syncStatus.online ||
    syncStatus.pending_mutations > 0 ||
    syncStatus.pending_uploads > 0;

  const totalPending =
    syncStatus.pending_mutations + syncStatus.pending_uploads;

  return (
    <header
      className="shrink-0 bg-surface-1/90 backdrop-blur-md border-b border-border px-3.5 sm:px-4 lg:px-6"
      style={{ paddingTop: 'var(--safe-top)' }}
    >
      <div className="h-[60px] flex items-center justify-between gap-2.5 min-w-0">
        {/* Identidade + contexto da área */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => {
              void triggerHaptic('light');
              setSettingsOpen(true);
            }}
            aria-label="Abrir configurações e pareamento"
            className="h-10 w-10 rounded-full bg-accent-soft border border-accent/25 text-accent flex items-center justify-center text-sm font-semibold hover:bg-accent/20 transition-colors shrink-0"
          >
            {profile.avatar_initial}
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-text truncate lg:hidden">
                {TAB_LABELS[activeMobileTab]}
              </span>
              <span className="hidden lg:inline text-[15px] font-semibold text-text truncate">
                Meu Dia
              </span>
              {partner ? (
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-shared-soft text-shared">
                  Casa conectada
                </span>
              ) : null}
            </div>
            <p className="text-xs text-text-muted truncate">{subtitle}</p>
          </div>
        </div>

        {/* Seletor de painel esquerdo no PC (Split View) */}
        <nav
          aria-label="Painel principal no computador"
          className="hidden lg:inline-flex items-center p-1 rounded-full bg-track border border-border"
        >
          {DESKTOP_TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = activeDesktopLeftTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDesktopLeftTab(tab.id)}
                aria-current={selected ? 'page' : undefined}
                className={`relative px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  selected
                    ? 'text-accent-foreground'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                {selected ? (
                  <motion.span
                    layoutId="desktop-left-pill"
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0 rounded-full bg-accent"
                  />
                ) : null}
                <Icon className="relative z-10 h-3.5 w-3.5" />
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Ações transversais: Status offline/pendências, Busca Global, Descansar e Configurações */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {showSyncBadge ? (
            <button
              type="button"
              onClick={() => {
                if (syncStatus.online) {
                  void flushOfflineQueues();
                }
              }}
              title={
                !syncStatus.online
                  ? 'Modo offline ativo — alterações salvas no aparelho'
                  : `${totalPending} pendência(s) para sincronizar`
              }
              className="h-10 px-2.5 rounded-full bg-surface-2 border border-border text-[11px] font-medium text-text-secondary inline-flex items-center gap-1.5 hover:bg-surface-3 transition-colors"
            >
              {!syncStatus.online ? (
                <>
                  <CloudOff className="h-3.5 w-3.5 text-warning shrink-0" />
                  <span className="hidden sm:inline">Offline</span>
                  {totalPending > 0 ? <span>({totalPending})</span> : null}
                </>
              ) : (
                <>
                  <RefreshCw
                    className={`h-3.5 w-3.5 text-accent shrink-0 ${
                      syncStatus.syncing ? 'animate-spin' : ''
                    }`}
                  />
                  <span>{totalPending}</span>
                </>
              )}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => {
              void triggerHaptic('light');
              setSearchOpen(true);
            }}
            aria-label="Busca global"
            title="Buscar em tudo (Ctrl+K)"
            className="h-10 w-10 rounded-full bg-surface-2 border border-border flex items-center justify-center text-text-secondary hover:text-text hover:bg-surface-3 transition-colors"
          >
            <Search className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              void triggerHaptic('light');
              setPauseModalOpen(true);
            }}
            className={`h-10 px-3 sm:px-3.5 rounded-full border text-xs font-medium flex items-center gap-1.5 transition-colors ${
              pauseSession.active
                ? 'bg-success-soft border-success/35 text-success'
                : 'bg-surface-2 border-border text-text-secondary hover:text-text hover:bg-surface-3'
            }`}
          >
            <Leaf className="h-3.5 w-3.5 shrink-0" />
            <span>{pauseSession.active ? 'Em pausa' : 'Descansar'}</span>
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Configurações"
            title="Configurações e pareamento"
            className="hidden sm:flex h-10 w-10 rounded-full bg-surface-2 border border-border items-center justify-center text-text-secondary hover:text-text hover:bg-surface-3 transition-colors"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
