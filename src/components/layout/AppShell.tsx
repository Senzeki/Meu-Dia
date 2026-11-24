import { Suspense, lazy, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BottomNav } from './BottomNav';
import { TopBar } from './TopBar';
import { GlobalSearchDialog } from '@/components/modals/GlobalSearchDialog';
import { PauseDialog } from '@/components/modals/PauseDialog';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { ChatPane } from '@/pages/ChatPane';
import { useUiStore } from '@/store/useUiStore';
import type { DesktopLeftTab } from '@/types';

const AgendaPage = lazy(() =>
  import('@/pages/AgendaPage').then((m) => ({ default: m.AgendaPage })),
);
const CasaPage = lazy(() =>
  import('@/pages/CasaPage').then((m) => ({ default: m.CasaPage })),
);
const CuidadosPage = lazy(() =>
  import('@/pages/CuidadosPage').then((m) => ({ default: m.CuidadosPage })),
);
const GuardadosPage = lazy(() =>
  import('@/pages/GuardadosPage').then((m) => ({ default: m.GuardadosPage })),
);

function AreaFallback() {
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      <div className="surface-card p-6 text-center text-xs text-text-muted">
        Carregando área...
      </div>
    </div>
  );
}

function renderAreaContent(tab: DesktopLeftTab) {
  switch (tab) {
    case 'agenda':
      return <AgendaPage />;
    case 'casa':
      return <CasaPage />;
    case 'cuidados':
      return <CuidadosPage />;
    case 'guardados':
      return <GuardadosPage />;
  }
}

export function AppShell() {
  const activeMobileTab = useUiStore((s) => s.activeMobileTab);
  const activeDesktopLeftTab = useUiStore((s) => s.activeDesktopLeftTab);
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setSearchOpen]);

  const currentLeftTab: DesktopLeftTab =
    activeMobileTab === 'chat' ? activeDesktopLeftTab : activeMobileTab;

  return (
    <div className="h-dvh w-full flex flex-col bg-bg text-text overflow-hidden">
      <TopBar />

      {/* Corpo Adaptativo: Mobile 1 painel ativo | PC Split View (Painel esquerdo + Conversa à direita) */}
      <main className="flex-1 min-h-0 flex overflow-hidden">
        {/* Coluna Esquerda no PC / Painéis no Mobile quando != 'chat' */}
        <div
          className={`flex-1 min-w-0 min-h-0 overflow-y-auto ${
            activeMobileTab === 'chat' ? 'hidden lg:block' : 'block'
          }`}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentLeftTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="min-h-full"
            >
              <Suspense fallback={<AreaFallback />}>
                {renderAreaContent(currentLeftTab)}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Coluna da Conversa: tela cheia na aba Conversa no Mobile | sempre visível à direita no PC */}
        <aside
          aria-label="Painel de conversa"
          className={`min-h-0 ${
            activeMobileTab === 'chat'
              ? 'flex flex-col w-full lg:w-[42%] lg:min-w-[380px] lg:max-w-[500px] lg:border-l lg:border-border'
              : 'hidden lg:flex lg:flex-col lg:w-[42%] lg:min-w-[380px] lg:max-w-[500px] lg:border-l lg:border-border'
          }`}
        >
          <ChatPane />
        </aside>
      </main>

      <BottomNav />

      {/* Diálogos nativos acessíveis */}
      <GlobalSearchDialog />
      <PauseDialog />
      <SettingsDialog />
    </div>
  );
}
