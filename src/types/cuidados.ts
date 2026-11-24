import type { EntityScope, ISODateString, ISOTimestamp, SyncBaseEntity, UUID } from './common';

export type AssetMeterUnit = 'km' | 'hours' | 'none';

export type AssetCategory = 'vehicle' | 'appliance' | 'tool' | 'yard' | 'document' | 'other';

export interface Asset extends SyncBaseEntity {
  owner_id: UUID;
  household_id: UUID | null;
  scope: EntityScope;
  name: string;
  category: AssetCategory;
  meter_unit: AssetMeterUnit;
  current_meter: number | null;
  meter_updated_at: ISOTimestamp | null;
  purchased_at: ISODateString | null;
  warranty_expires_at: ISODateString | null;
  receipt_path: string | null;
  notes: string | null;
}

export type CareTriggerType = 'flexible_days' | 'meter' | 'annual_date';

export interface CareServiceLog {
  id: UUID;
  performed_at: ISOTimestamp;
  meter_value: number | null;
  workshop_or_parts: string | null;
  cost_note: string | null;
}

export interface CareRule extends SyncBaseEntity {
  asset_id: UUID;
  owner_id: UUID;
  household_id: UUID | null;
  scope: EntityScope;
  title: string;
  trigger_type: CareTriggerType;
  interval_days: number | null;
  interval_meter: number | null;
  annual_month: number | null;
  annual_day: number | null;
  last_done_at: ISOTimestamp | null;
  last_done_meter: number | null;
  next_due_date: ISODateString | null;
  next_due_meter: number | null;
  service_history: CareServiceLog[];
}
