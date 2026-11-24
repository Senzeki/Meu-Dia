import type { ISOTimestamp, UUID, WallClockTime } from './common';

export interface PausePreference {
  /** Dias fixos de desaceleração (0 = Dom .. 6 = Sáb) */
  weekdays: number[];
  /** Horário habitual de desaceleração (ex: "21:30") */
  start_time: WallClockTime;
  /** Duração padrão em minutos (15 | 20 | 30) */
  default_duration_minutes: 15 | 20 | 30;
  /** Silenciar avisos não críticos durante o descanso */
  mute_non_critical: boolean;
}

export interface UserProfile {
  id: UUID;
  email?: string | null;
  display_name: string;
  avatar_initial: string;
  household_id: UUID | null;
  timezone: string;
  pause_preferences: PausePreference;
  active_pause_until?: ISOTimestamp | null;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface Household {
  id: UUID;
  name: string;
  created_by: UUID;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface PartnerSummary {
  id: UUID;
  display_name: string;
  avatar_initial: string;
}

export interface HouseholdInvite {
  id: UUID;
  household_id: UUID;
  code: string;
  created_by: UUID;
  expires_at: ISOTimestamp;
  used_by: UUID | null;
  used_at: ISOTimestamp | null;
  created_at: ISOTimestamp;
}
