import { DEFAULT_TIMEZONE, resolveTimezone } from '@/lib/timezone';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { createUuid } from '@/lib/uuid';
import type {
  HouseholdInvite,
  PartnerSummary,
  PausePreference,
  UUID,
  UserProfile,
} from '@/types';

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_PAUSE_PREFERENCES: PausePreference = {
  weekdays: [2, 4, 6], // Ter, Qui, Sáb
  start_time: '21:30',
  default_duration_minutes: 20,
  mute_non_critical: true,
};

export function normalizeInviteCode(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.startsWith('MD') && clean.length === 8) {
    return `MD-${clean.slice(2)}`;
  }
  if (clean.length === 6) {
    return `MD-${clean}`;
  }
  return raw.trim().toUpperCase();
}

export function generateShortInviteCode(): string {
  const bytes = new Uint8Array(6);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 6; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const chars = Array.from(bytes, (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join('');
  return `MD-${chars}`;
}

export function isInviteValid(
  invite: Pick<HouseholdInvite, 'expires_at' | 'used_at'>,
  now: Date = new Date(),
): boolean {
  if (invite.used_at) return false;
  const expiresMs = new Date(invite.expires_at).getTime();
  if (Number.isNaN(expiresMs)) return false;
  return expiresMs > now.getTime();
}

export function createLocalFallbackProfile(displayName = 'Você'): UserProfile {
  const now = new Date().toISOString();
  const trimmed = displayName.trim() || 'Você';
  return {
    id: '00000000-0000-4000-8000-000000000001',
    email: null,
    display_name: trimmed,
    avatar_initial: trimmed.charAt(0).toUpperCase(),
    household_id: null,
    timezone: DEFAULT_TIMEZONE,
    pause_preferences: { ...DEFAULT_PAUSE_PREFERENCES },
    active_pause_until: null,
    created_at: now,
    updated_at: now,
  };
}

export async function fetchCurrentProfile(): Promise<{
  profile: UserProfile | null;
  partner: PartnerSummary | null;
}> {
  if (!isSupabaseConfigured() || !supabase) {
    return { profile: null, partner: null };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    return { profile: null, partner: null };
  }

  const { data: row, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error || !row) {
    return { profile: null, partner: null };
  }

  const profile: UserProfile = {
    id: row.id as UUID,
    email: session.user.email ?? null,
    display_name: (row.display_name as string) || 'Você',
    avatar_initial:
      (row.avatar_initial as string) ||
      ((row.display_name as string) || 'V').charAt(0).toUpperCase(),
    household_id: (row.household_id as UUID | null) ?? null,
    timezone: resolveTimezone(row.timezone as string | null),
    pause_preferences:
      (row.pause_preferences as PausePreference | null) ?? DEFAULT_PAUSE_PREFERENCES,
    active_pause_until: (row.active_pause_until as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };

  let partner: PartnerSummary | null = null;
  if (profile.household_id) {
    const { data: members } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_initial')
      .eq('household_id', profile.household_id)
      .neq('id', profile.id)
      .limit(1);

    if (members && members.length > 0) {
      partner = {
        id: members[0].id as UUID,
        display_name: members[0].display_name as string,
        avatar_initial: members[0].avatar_initial as string,
      };
    }
  }

  return { profile, partner };
}

export async function signInWithEmailPassword(email: string, password: string): Promise<void> {
  if (!supabase) {
    throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para autenticar na nuvem.');
  }
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw new Error(error.message);
}

export async function signUpWithEmailPassword(
  email: string,
  password: string,
  displayName: string,
): Promise<void> {
  if (!supabase) {
    throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para criar conta na nuvem.');
  }
  const cleanName = displayName.trim() || 'Você';
  const { error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        display_name: cleanName,
        avatar_initial: cleanName.charAt(0).toUpperCase(),
        timezone: DEFAULT_TIMEZONE,
      },
    },
  });
  if (error) throw new Error(error.message);
}

export async function signOutSession(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function updateProfileSettings(
  userId: UUID,
  patch: Partial<Pick<UserProfile, 'display_name' | 'timezone' | 'pause_preferences'>>,
): Promise<void> {
  if (!supabase) return;
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.display_name !== undefined) {
    const clean = patch.display_name.trim() || 'Você';
    payload.display_name = clean;
    payload.avatar_initial = clean.charAt(0).toUpperCase();
  }
  if (patch.timezone !== undefined) {
    payload.timezone = resolveTimezone(patch.timezone);
  }
  if (patch.pause_preferences !== undefined) {
    payload.pause_preferences = patch.pause_preferences;
  }

  const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
  if (error) throw new Error(error.message);
}

export async function createHouseholdInvite(
  currentUserId: UUID,
  existingHouseholdId: UUID | null,
): Promise<HouseholdInvite> {
  if (!supabase) {
    const now = new Date();
    return {
      id: createUuid(),
      household_id: existingHouseholdId ?? createUuid(),
      code: generateShortInviteCode(),
      created_by: currentUserId,
      expires_at: new Date(now.getTime() + INVITE_TTL_MS).toISOString(),
      used_by: null,
      used_at: null,
      created_at: now.toISOString(),
    };
  }

  const { data, error } = await supabase.rpc('create_household_invite');
  if (error) throw new Error(error.message);
  return data as HouseholdInvite;
}

export async function redeemHouseholdInvite(rawCode: string): Promise<UUID> {
  const normalized = normalizeInviteCode(rawCode);
  if (!/^MD-[A-Z0-9]{6}$/.test(normalized)) {
    throw new Error('Informe um código válido no formato MD-XXXXXX.');
  }

  if (!supabase) {
    return createUuid();
  }

  const { data, error } = await supabase.rpc('redeem_household_invite', {
    p_code: normalized,
  });
  if (error) throw new Error(error.message);

  const result = data as { ok: boolean; household_id?: UUID; error?: string } | null;
  if (!result?.ok || !result.household_id) {
    throw new Error(result?.error || 'Não foi possível vincular o convite.');
  }
  return result.household_id;
}
