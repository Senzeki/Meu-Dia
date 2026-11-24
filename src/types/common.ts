export type UUID = string;

/** ISO-8601 date string YYYY-MM-DD in profile timezone */
export type ISODateString = string;

/** ISO-8601 timestamp with offset or UTC */
export type ISOTimestamp = string;

/** HH:mm wall-clock time in profile timezone */
export type WallClockTime = string;

export type EntityScope = 'personal' | 'shared';

export type NavigationTab = 'chat' | 'agenda' | 'casa' | 'cuidados' | 'guardados';

export type DesktopLeftTab = Exclude<NavigationTab, 'chat'>;

export type AgendaHorizon = 'today' | 'week' | 'month' | 'later';

export interface SyncBaseEntity {
  id: UUID;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  deleted_at: ISOTimestamp | null;
  client_mutation_id?: UUID | null;
}
