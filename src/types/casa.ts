import type { ISODateString, ISOTimestamp, SyncBaseEntity, UUID } from './common';
import type { TaskAssignee } from './agenda';

export type MuralStatus = 'scheduled' | 'sent' | 'acknowledged' | 'dismissed';

export interface MuralNote extends SyncBaseEntity {
  owner_id: UUID;
  household_id: UUID | null;
  author_id: UUID;
  recipient_id: UUID | null;
  body: string;
  notify_at: ISOTimestamp | null;
  alarm_call_mode: boolean;
  status: MuralStatus;
  source_message_id: UUID | null;
}

export type RoutineMode = 'fixed_weekdays' | 'cyclic_days';

export interface RoutineCompletionLog {
  completed_at: ISOTimestamp;
  completed_by: UUID;
  note?: string | null;
}

export interface HouseRoutine extends SyncBaseEntity {
  owner_id: UUID;
  household_id: UUID | null;
  created_by: UUID;
  title: string;
  mode: RoutineMode;
  /** 0 = Dom .. 6 = Sáb (quando mode === 'fixed_weekdays') */
  weekdays: number[] | null;
  /** Intervalo em dias (quando mode === 'cyclic_days') */
  cycle_days: number | null;
  assigned_to: TaskAssignee;
  assigned_user_id: UUID | null;
  next_due_date: ISODateString;
  last_completed_at: ISOTimestamp | null;
  recent_completions: RoutineCompletionLog[];
}
