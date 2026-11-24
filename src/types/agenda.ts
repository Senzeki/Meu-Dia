import type {
  AgendaHorizon,
  EntityScope,
  ISODateString,
  ISOTimestamp,
  SyncBaseEntity,
  UUID,
  WallClockTime,
} from './common';

export type TaskStatus = 'open' | 'waiting' | 'done' | 'archived';

export type TaskAssignee = 'me' | 'partner' | 'both';

export interface Task extends SyncBaseEntity {
  owner_id: UUID;
  household_id: UUID | null;
  scope: EntityScope;
  title: string;
  notes: string | null;
  horizon: AgendaHorizon;
  status: TaskStatus;
  assigned_to: TaskAssignee | null;
  assigned_user_id: UUID | null;
  due_date: ISODateString | null;
  due_time: WallClockTime | null;
  waiting_remind_at: ISOTimestamp | null;
  alarm_call_mode: boolean;
  completed_at: ISOTimestamp | null;
  source_message_id: UUID | null;
}

export interface PauseSession {
  active: boolean;
  started_at: ISOTimestamp | null;
  ends_at: ISOTimestamp | null;
  duration_minutes: 15 | 20 | 30;
  mute_non_critical: boolean;
}
