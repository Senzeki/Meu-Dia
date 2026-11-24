import { compareChatMessagesAsc, getAllRecords } from '@/lib/db/localDb';
import { resolveTimezone } from '@/lib/timezone';
import type {
  Asset,
  BackupExportPayload,
  CareRule,
  ChatMessage,
  HouseRoutine,
  MuralNote,
  Task,
  UserProfile,
  VaultItem,
} from '@/types';

export interface BuildBackupInput {
  profile: UserProfile;
  tasks: Task[];
  houseRoutines: HouseRoutine[];
  muralNotes: MuralNote[];
  assets: Asset[];
  careRules: CareRule[];
  vaultItems: VaultItem[];
  messages: ChatMessage[];
  exportedAt?: string;
}

export function buildBackupExportPayload(input: BuildBackupInput): BackupExportPayload {
  const cleanMessage = (msg: ChatMessage): ChatMessage => {
    const copy = { ...msg };
    delete copy.local_preview_url;
    return copy;
  };

  const cleanVault = (item: VaultItem): VaultItem => {
    const copy = { ...item };
    delete copy.local_preview_url;
    return copy;
  };

  return {
    app: 'Meu Dia',
    schema_version: 1,
    exported_at: input.exportedAt ?? new Date().toISOString(),
    timezone: resolveTimezone(input.profile.timezone),
    profile: {
      id: input.profile.id,
      display_name: input.profile.display_name,
      timezone: resolveTimezone(input.profile.timezone),
      pause_preferences: input.profile.pause_preferences,
    },
    tasks: input.tasks.filter((t) => !t.deleted_at),
    house_routines: input.houseRoutines.filter((r) => !r.deleted_at),
    mural_notes: input.muralNotes.filter((n) => !n.deleted_at),
    assets: input.assets.filter((a) => !a.deleted_at),
    care_rules: input.careRules.filter((c) => !c.deleted_at),
    vault_items: input.vaultItems.filter((v) => !v.deleted_at).map(cleanVault),
    recent_messages: input.messages
      .filter((m) => !m.deleted_at)
      .sort(compareChatMessagesAsc)
      .map(cleanMessage),
  };
}

export async function exportBackupFromLocalDb(
  profile: UserProfile,
): Promise<BackupExportPayload> {
  const [tasks, houseRoutines, muralNotes, assets, careRules, vaultItems, messages] =
    await Promise.all([
      getAllRecords('tasks'),
      getAllRecords('house_routines'),
      getAllRecords('mural_notes'),
      getAllRecords('assets'),
      getAllRecords('care_rules'),
      getAllRecords('vault_items'),
      getAllRecords('chat_messages'),
    ]);

  return buildBackupExportPayload({
    profile,
    tasks,
    houseRoutines,
    muralNotes,
    assets,
    careRules,
    vaultItems,
    messages,
  });
}
