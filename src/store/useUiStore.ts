import { create } from 'zustand';
import type { AgendaHorizon, DesktopLeftTab, NavigationTab, PauseSession } from '@/types';

interface UiStoreState {
  activeMobileTab: NavigationTab;
  activeDesktopLeftTab: DesktopLeftTab;
  agendaHorizon: AgendaHorizon;
  searchOpen: boolean;
  pauseModalOpen: boolean;
  settingsOpen: boolean;
  pauseSession: PauseSession;
  setMobileTab: (tab: NavigationTab) => void;
  setDesktopLeftTab: (tab: DesktopLeftTab) => void;
  navigateToArea: (tab: NavigationTab, horizon?: AgendaHorizon) => void;
  setAgendaHorizon: (horizon: AgendaHorizon) => void;
  setSearchOpen: (open: boolean) => void;
  setPauseModalOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  startPause: (durationMinutes: 15 | 20 | 30) => void;
  endPause: () => void;
}

export const useUiStore = create<UiStoreState>((set) => ({
  activeMobileTab: 'chat',
  activeDesktopLeftTab: 'agenda',
  agendaHorizon: 'today',
  searchOpen: false,
  pauseModalOpen: false,
  settingsOpen: false,
  pauseSession: {
    active: false,
    started_at: null,
    ends_at: null,
    duration_minutes: 20,
    mute_non_critical: true,
  },

  setMobileTab: (tab) =>
    set((state) => ({
      activeMobileTab: tab,
      activeDesktopLeftTab: tab === 'chat' ? state.activeDesktopLeftTab : tab,
    })),

  setDesktopLeftTab: (tab) =>
    set({
      activeDesktopLeftTab: tab,
      activeMobileTab: tab,
    }),

  navigateToArea: (tab, horizon) =>
    set((state) => ({
      activeMobileTab: tab,
      activeDesktopLeftTab: tab === 'chat' ? state.activeDesktopLeftTab : tab,
      agendaHorizon: horizon ?? state.agendaHorizon,
    })),

  setAgendaHorizon: (horizon) => set({ agendaHorizon: horizon }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setPauseModalOpen: (open) => set({ pauseModalOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  startPause: (durationMinutes) => {
    const now = new Date();
    const endsAt = new Date(now.getTime() + durationMinutes * 60 * 1000);
    set({
      pauseModalOpen: false,
      pauseSession: {
        active: true,
        started_at: now.toISOString(),
        ends_at: endsAt.toISOString(),
        duration_minutes: durationMinutes,
        mute_non_critical: true,
      },
    });
  },

  endPause: () =>
    set((state) => ({
      pauseSession: {
        ...state.pauseSession,
        active: false,
        started_at: null,
        ends_at: null,
      },
    })),
}));
