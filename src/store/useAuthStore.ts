import { create } from 'zustand';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  createHouseholdInvite,
  createLocalFallbackProfile,
  fetchCurrentProfile,
  redeemHouseholdInvite,
  signInWithEmailPassword,
  signOutSession,
  signUpWithEmailPassword,
  updateProfileSettings,
} from '@/services/authService';
import { syncDevicePushToken } from '@/services/pushTokenService';
import type {
  HouseholdInvite,
  PartnerSummary,
  PausePreference,
  UserProfile,
} from '@/types';

const LOCAL_PROFILE_STORAGE_KEY = 'meu-dia.local-profile.v1';
const LOCAL_INVITE_STORAGE_KEY = 'meu-dia.local-invite.v1';

function readStoredLocalProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as UserProfile;
    }
  } catch {
    // ignore storage errors
  }
  const initial = createLocalFallbackProfile('Você');
  try {
    localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(initial));
  } catch {
    // ignore
  }
  return initial;
}

function persistLocalProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // ignore
  }
}

interface AuthStoreState {
  initialized: boolean;
  cloudConfigured: boolean;
  loading: boolean;
  error: string | null;
  profile: UserProfile;
  partner: PartnerSummary | null;
  activeInvite: HouseholdInvite | null;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (
    patch: Partial<Pick<UserProfile, 'display_name' | 'timezone' | 'pause_preferences'>>,
  ) => Promise<void>;
  generateInvite: () => Promise<HouseholdInvite>;
  redeemInvite: (code: string) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  initialized: false,
  cloudConfigured: isSupabaseConfigured(),
  loading: false,
  error: null,
  profile: readStoredLocalProfile(),
  partner: null,
  activeInvite: null,

  initialize: async () => {
    if (get().initialized) return;
    set({ loading: true, error: null });

    try {
      if (isSupabaseConfigured() && supabase) {
        const { profile, partner } = await fetchCurrentProfile();
        if (profile) {
          persistLocalProfile(profile);
          set({ profile, partner, initialized: true, loading: false });
          void syncDevicePushToken(profile.id);
        } else {
          set({ initialized: true, loading: false });
        }

        supabase.auth.onAuthStateChange(async () => {
          const next = await fetchCurrentProfile();
          if (next.profile) {
            persistLocalProfile(next.profile);
            set({ profile: next.profile, partner: next.partner });
            void syncDevicePushToken(next.profile.id);
          }
        });
        return;
      }

      try {
        const storedInvite = localStorage.getItem(LOCAL_INVITE_STORAGE_KEY);
        if (storedInvite) {
          set({ activeInvite: JSON.parse(storedInvite) as HouseholdInvite });
        }
      } catch {
        // ignore
      }

      set({ initialized: true, loading: false });
    } catch (err) {
      set({
        initialized: true,
        loading: false,
        error: err instanceof Error ? err.message : 'Erro ao carregar sessão.',
      });
    }
  },

  signIn: async (email, password) => {
    set({ loading: true, error: null });
    try {
      await signInWithEmailPassword(email, password);
      const { profile, partner } = await fetchCurrentProfile();
      if (profile) {
        persistLocalProfile(profile);
        set({ profile, partner });
        void syncDevicePushToken(profile.id);
      }
      set({ loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Não foi possível entrar.',
      });
      throw err;
    }
  },

  signUp: async (email, password, displayName) => {
    set({ loading: true, error: null });
    try {
      await signUpWithEmailPassword(email, password, displayName);
      const { profile, partner } = await fetchCurrentProfile();
      if (profile) {
        persistLocalProfile(profile);
        set({ profile, partner });
        void syncDevicePushToken(profile.id);
      }
      set({ loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Não foi possível criar a conta.',
      });
      throw err;
    }
  },

  signOut: async () => {
    set({ loading: true, error: null });
    await signOutSession();
    const fallback = createLocalFallbackProfile('Você');
    persistLocalProfile(fallback);
    set({ profile: fallback, partner: null, activeInvite: null, loading: false });
  },

  updateProfile: async (patch) => {
    const current = get().profile;
    const nextName = patch.display_name?.trim() || current.display_name;
    const updated: UserProfile = {
      ...current,
      ...patch,
      display_name: nextName,
      avatar_initial: nextName.charAt(0).toUpperCase(),
      pause_preferences:
        (patch.pause_preferences as PausePreference | undefined) ??
        current.pause_preferences,
      updated_at: new Date().toISOString(),
    };

    persistLocalProfile(updated);
    set({ profile: updated, error: null });

    if (isSupabaseConfigured()) {
      await updateProfileSettings(current.id, patch);
    }
  },

  generateInvite: async () => {
    set({ loading: true, error: null });
    try {
      const current = get().profile;
      const invite = await createHouseholdInvite(current.id, current.household_id);
      const updatedProfile: UserProfile = {
        ...current,
        household_id: invite.household_id,
        updated_at: new Date().toISOString(),
      };
      persistLocalProfile(updatedProfile);
      try {
        localStorage.setItem(LOCAL_INVITE_STORAGE_KEY, JSON.stringify(invite));
      } catch {
        // ignore
      }
      set({ profile: updatedProfile, activeInvite: invite, loading: false });
      return invite;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao gerar convite.';
      set({ loading: false, error: message });
      throw err;
    }
  },

  redeemInvite: async (code) => {
    set({ loading: true, error: null });
    try {
      const householdId = await redeemHouseholdInvite(code);
      const current = get().profile;
      const updatedProfile: UserProfile = {
        ...current,
        household_id: householdId,
        updated_at: new Date().toISOString(),
      };
      persistLocalProfile(updatedProfile);

      if (isSupabaseConfigured()) {
        const refreshed = await fetchCurrentProfile();
        set({
          profile: refreshed.profile ?? updatedProfile,
          partner: refreshed.partner,
          loading: false,
        });
      } else {
        set({
          profile: updatedProfile,
          partner: {
            id: '00000000-0000-4000-8000-000000000002',
            display_name: 'Esposa',
            avatar_initial: 'E',
          },
          loading: false,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Convite inválido ou expirado.';
      set({ loading: false, error: message });
      throw err;
    }
  },

  clearError: () => set({ error: null }),
}));
