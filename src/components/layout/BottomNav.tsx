import { motion } from 'framer-motion';
import {
  Bookmark,
  CalendarDays,
  Home,
  MessageSquare,
  Wrench,
} from 'lucide-react';
import { triggerHaptic } from '@/lib/platform';
import { useUiStore } from '@/store/useUiStore';
import type { NavigationTab } from '@/types';

const MOBILE_TABS: Array<{
  id: NavigationTab;
  label: string;
  icon: typeof MessageSquare;
}> = [
  { id: 'chat', label: 'Conversa', icon: MessageSquare },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'casa', label: 'Casa', icon: Home },
  { id: 'cuidados', label: 'Cuidados', icon: Wrench },
  { id: 'guardados', label: 'Guardados', icon: Bookmark },
];

export function BottomNav() {
  const activeMobileTab = useUiStore((s) => s.activeMobileTab);
  const setMobileTab = useUiStore((s) => s.setMobileTab);

  return (
    <nav
      aria-label="Navegação principal"
      className="lg:hidden shrink-0 bg-surface-1/95 backdrop-blur-md border-t border-border px-2 pt-1.5"
      style={{ paddingBottom: 'max(8px, var(--safe-bottom))' }}
    >
      <div role="tablist" className="grid grid-cols-5 gap-1">
        {MOBILE_TABS.map((tab) => {
          const Icon = tab.icon;
          const selected = activeMobileTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                void triggerHaptic('light');
                setMobileTab(tab.id);
              }}
              className={`relative min-h-[48px] py-1.5 px-1 rounded-2xl flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                selected ? 'text-accent' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {selected ? (
                <motion.span
                  layoutId="mobile-bottom-pill"
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-0 rounded-2xl bg-accent-soft border border-accent/20"
                />
              ) : null}
              <Icon className="relative z-10 h-[18px] w-[18px]" strokeWidth={selected ? 2.2 : 1.9} />
              <span className="relative z-10 leading-none truncate max-w-full">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
