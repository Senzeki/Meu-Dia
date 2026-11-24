import type {
  AgendaHorizon,
  Asset,
  AssetCategory,
  AssetMeterUnit,
  BackupExportPayload,
  CareRule,
  CareTriggerType,
  ChatMessage,
  EntityScope,
  HouseRoutine,
  ISODateString,
  ISOTimestamp,
  LinkedEntityLiveState,
  MuralNote,
  MuralStatus,
  NavigationTab,
  NotificationActionPayload,
  PassatemposSearchCandidate,
  RoutineMode,
  SyncStateSnapshot,
  Task,
  TaskAssignee,
  TaskStatus,
  UUID,
  VaultCategory,
  VaultItem,
  WallClockTime,
} from './index';

export interface SendChatInputParams {
  text?: string;
  image_blob?: Blob | null;
  image_title?: string;
  audio_blob?: Blob | null;
  audio_duration_seconds?: number;
}

export type RedirectActionTarget =
  | { kind: 'undo_delete' }
  | { kind: 'move_task_horizon'; horizon: AgendaHorizon }
  | { kind: 'move_to_casa' }
  | { kind: 'move_to_vault'; category: VaultCategory };

export interface CreateOrUpdateTaskInput {
  id?: UUID;
  scope?: EntityScope;
  title: string;
  notes?: string | null;
  horizon: AgendaHorizon;
  status?: TaskStatus;
  assigned_to?: TaskAssignee | null;
  due_date?: ISODateString | null;
  due_time?: WallClockTime | null;
  waiting_remind_at?: ISOTimestamp | null;
  alarm_call_mode?: boolean;
}

export interface CreateOrUpdateMuralInput {
  id?: UUID;
  recipient_role?: 'partner' | 'me';
  body: string;
  notify_at?: ISOTimestamp | null;
  alarm_call_mode?: boolean;
}

export interface CreateOrUpdateRoutineInput {
  id?: UUID;
  title: string;
  mode: RoutineMode;
  weekdays?: number[] | null;
  cycle_days?: number | null;
  assigned_to: TaskAssignee;
  next_due_date?: ISODateString;
}

export interface CreateOrUpdateAssetInput {
  id?: UUID;
  scope: EntityScope;
  name: string;
  category: AssetCategory;
  meter_unit: AssetMeterUnit;
  current_meter?: number | null;
  purchased_at?: ISODateString | null;
  warranty_expires_at?: ISODateString | null;
  receipt_blob?: Blob | null;
  notes?: string | null;
}

export interface CreateOrUpdateCareRuleInput {
  id?: UUID;
  asset_id: UUID;
  scope?: EntityScope;
  title: string;
  trigger_type: CareTriggerType;
  interval_days?: number | null;
  interval_meter?: number | null;
  annual_month?: number | null;
  annual_day?: number | null;
  next_due_date?: ISODateString | null;
  next_due_meter?: number | null;
}

export interface CompleteCareRuleInput {
  rule_id: UUID;
  confirmed_meter?: number | null;
  workshop_or_parts?: string | null;
  cost_note?: string | null;
  performed_at?: ISOTimestamp;
}

export interface CreateOrUpdateVaultInput {
  id?: UUID;
  category: VaultCategory;
  title: string;
  url?: string | null;
  body?: string | null;
  image_blob?: Blob | null;
}

export interface GlobalSearchResultItem {
  id: UUID;
  area: NavigationTab;
  area_label: string;
  agenda_horizon?: AgendaHorizon;
  title: string;
  subtitle: string;
  updated_at: ISOTimestamp;
}

export interface WarrantyAlertSummary {
  asset_id: UUID;
  asset_name: string;
  expires_at: ISODateString;
  days_remaining: number;
}

export interface DataStoreContract {
  hydrated: boolean;
  syncStatus: SyncStateSnapshot;
  messages: ChatMessage[];
  hasOlderMessages: boolean;
  tasks: Task[];
  houseRoutines: HouseRoutine[];
  muralNotes: MuralNote[];
  assets: Asset[];
  careRules: CareRule[];
  vaultItems: VaultItem[];
  localMediaUrls: Record<string, string>;
  pendingAudioCount: number;

  hydrate: () => Promise<void>;
  loadOlderMessages: () => Promise<number>;
  sendChatInput: (params: SendChatInputParams) => Promise<void>;
  resolveClarification: (messageId: UUID, optionId: string) => Promise<void>;
  editAudioTranscript: (messageId: UUID, correctedText: string) => Promise<void>;
  triggerWeeklyCheckinIfDue: () => Promise<boolean>;
  confirmPassatemposCandidate: (
    messageId: UUID,
    candidate: PassatemposSearchCandidate,
  ) => Promise<void>;
  handleNotificationAction: (payload: NotificationActionPayload) => Promise<void>;
  undoOrRedirectMessageAction: (
    messageId: UUID,
    target: RedirectActionTarget,
  ) => Promise<void>;
  getLinkedEntityLiveState: (
    entityType: string,
    entityId: UUID,
  ) => LinkedEntityLiveState;

  saveTask: (input: CreateOrUpdateTaskInput) => Promise<Task>;
  setTaskStatus: (taskId: UUID, status: TaskStatus) => Promise<void>;
  moveOverdueTask: (
    taskId: UUID,
    action: 'today' | 'week' | 'later' | 'archive',
  ) => Promise<void>;
  deleteTask: (taskId: UUID) => Promise<void>;

  saveMuralNote: (input: CreateOrUpdateMuralInput) => Promise<MuralNote>;
  acknowledgeMuralNote: (noteId: UUID, status?: MuralStatus) => Promise<void>;
  deleteMuralNote: (noteId: UUID) => Promise<void>;

  saveHouseRoutine: (input: CreateOrUpdateRoutineInput) => Promise<HouseRoutine>;
  completeHouseRoutine: (routineId: UUID, note?: string) => Promise<void>;
  deleteHouseRoutine: (routineId: UUID) => Promise<void>;

  saveAsset: (input: CreateOrUpdateAssetInput) => Promise<Asset>;
  updateAssetMeter: (assetId: UUID, meterValue: number) => Promise<void>;
  deleteAsset: (assetId: UUID) => Promise<void>;

  saveCareRule: (input: CreateOrUpdateCareRuleInput) => Promise<CareRule>;
  completeCareRule: (input: CompleteCareRuleInput) => Promise<void>;
  deleteCareRule: (ruleId: UUID) => Promise<void>;

  saveVaultItem: (input: CreateOrUpdateVaultInput) => Promise<VaultItem>;
  deleteVaultItem: (itemId: UUID) => Promise<void>;

  searchAll: (query: string) => GlobalSearchResultItem[];
  getUpcomingWarrantyAlerts: (withinDays?: number) => WarrantyAlertSummary[];
  resolveMediaUrl: (mediaPath: string | null | undefined) => Promise<string | null>;
  flushOfflineQueues: () => Promise<void>;
  exportBackupJson: () => Promise<BackupExportPayload>;
}
