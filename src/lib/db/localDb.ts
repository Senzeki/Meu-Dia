import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  Asset,
  CareRule,
  ChatMessage,
  HouseRoutine,
  MediaUploadTask,
  MuralNote,
  OutboxMutation,
  Task,
  VaultItem,
} from '@/types';

export interface LocalMediaBlobRecord {
  storage_path: string;
  mime_type: string;
  blob: Blob;
  updated_at: string;
}

export interface LocalMetaRecord {
  key: string;
  value: unknown;
}

export type LocalEntityStoreName =
  | 'chat_messages'
  | 'tasks'
  | 'house_routines'
  | 'mural_notes'
  | 'assets'
  | 'care_rules'
  | 'vault_items';

export type LocalStoreName =
  | LocalEntityStoreName
  | 'outbox_mutations'
  | 'media_uploads'
  | 'media_blobs'
  | 'meta';

interface MeuDiaDbSchema extends DBSchema {
  chat_messages: { key: string; value: ChatMessage };
  tasks: { key: string; value: Task };
  house_routines: { key: string; value: HouseRoutine };
  mural_notes: { key: string; value: MuralNote };
  assets: { key: string; value: Asset };
  care_rules: { key: string; value: CareRule };
  vault_items: { key: string; value: VaultItem };
  outbox_mutations: { key: string; value: OutboxMutation };
  media_uploads: { key: string; value: MediaUploadTask };
  media_blobs: { key: string; value: LocalMediaBlobRecord };
  meta: { key: string; value: LocalMetaRecord };
}

type StoreValueMap = {
  chat_messages: ChatMessage;
  tasks: Task;
  house_routines: HouseRoutine;
  mural_notes: MuralNote;
  assets: Asset;
  care_rules: CareRule;
  vault_items: VaultItem;
  outbox_mutations: OutboxMutation;
  media_uploads: MediaUploadTask;
  media_blobs: LocalMediaBlobRecord;
  meta: LocalMetaRecord;
};

const DB_NAME = 'meu-dia-local-v1';
const DB_VERSION = 1;
export const CHAT_PAGE_SIZE = 50;

const ALL_STORES: LocalStoreName[] = [
  'chat_messages',
  'tasks',
  'house_routines',
  'mural_notes',
  'assets',
  'care_rules',
  'vault_items',
  'outbox_mutations',
  'media_uploads',
  'media_blobs',
  'meta',
];

const KEY_PATHS: Record<LocalStoreName, string> = {
  chat_messages: 'id',
  tasks: 'id',
  house_routines: 'id',
  mural_notes: 'id',
  assets: 'id',
  care_rules: 'id',
  vault_items: 'id',
  outbox_mutations: 'client_mutation_id',
  media_uploads: 'id',
  media_blobs: 'storage_path',
  meta: 'key',
};

// Fallback transparente em memória quando IndexedDB não está disponível (jsdom / Vitest)
const memoryStores: Record<LocalStoreName, Map<string, unknown>> = {
  chat_messages: new Map(),
  tasks: new Map(),
  house_routines: new Map(),
  mural_notes: new Map(),
  assets: new Map(),
  care_rules: new Map(),
  vault_items: new Map(),
  outbox_mutations: new Map(),
  media_uploads: new Map(),
  media_blobs: new Map(),
  meta: new Map(),
};

let dbPromise: Promise<IDBPDatabase<MeuDiaDbSchema>> | null = null;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

async function getDb(): Promise<IDBPDatabase<MeuDiaDbSchema> | null> {
  if (!hasIndexedDb()) return null;

  if (!dbPromise) {
    dbPromise = openDB<MeuDiaDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const storeName of ALL_STORES) {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: KEY_PATHS[storeName] });
          }
        }
      },
    });
  }

  return dbPromise;
}

function getRecordKey<S extends LocalStoreName>(
  storeName: S,
  record: StoreValueMap[S],
): string {
  const keyField = KEY_PATHS[storeName] as keyof StoreValueMap[S];
  return String(record[keyField]);
}

export async function getAllRecords<S extends LocalStoreName>(
  storeName: S,
): Promise<StoreValueMap[S][]> {
  const db = await getDb();
  if (!db) {
    return Array.from(memoryStores[storeName].values()) as StoreValueMap[S][];
  }
  return (await db.getAll(storeName)) as StoreValueMap[S][];
}

export async function getRecord<S extends LocalStoreName>(
  storeName: S,
  key: string,
): Promise<StoreValueMap[S] | undefined> {
  const db = await getDb();
  if (!db) {
    return memoryStores[storeName].get(key) as StoreValueMap[S] | undefined;
  }
  return (await db.get(storeName, key)) as StoreValueMap[S] | undefined;
}

export async function putRecord<S extends LocalStoreName>(
  storeName: S,
  record: StoreValueMap[S],
): Promise<void> {
  const db = await getDb();
  if (!db) {
    memoryStores[storeName].set(getRecordKey(storeName, record), record);
    return;
  }
  await db.put(storeName, record);
}

export async function putRecords<S extends LocalStoreName>(
  storeName: S,
  records: StoreValueMap[S][],
): Promise<void> {
  if (records.length === 0) return;
  const db = await getDb();
  if (!db) {
    for (const record of records) {
      memoryStores[storeName].set(getRecordKey(storeName, record), record);
    }
    return;
  }
  const tx = db.transaction(storeName, 'readwrite');
  for (const record of records) {
    await tx.store.put(record);
  }
  await tx.done;
}

export async function deleteRecord<S extends LocalStoreName>(
  storeName: S,
  key: string,
): Promise<void> {
  const db = await getDb();
  if (!db) {
    memoryStores[storeName].delete(key);
    return;
  }
  await db.delete(storeName, key);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const record = await getRecord('meta', key);
  return record?.value as T | undefined;
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  await putRecord('meta', { key, value });
}

export function compareChatMessagesAsc(a: ChatMessage, b: ChatMessage): number {
  if (a.created_at !== b.created_at) {
    return a.created_at < b.created_at ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export async function getLatestChatMessagesPage(
  limit: number = CHAT_PAGE_SIZE,
): Promise<{ items: ChatMessage[]; hasOlder: boolean }> {
  const all = (await getAllRecords('chat_messages'))
    .filter((m) => !m.deleted_at)
    .sort(compareChatMessagesAsc);

  if (all.length <= limit) {
    return { items: all, hasOlder: false };
  }

  return {
    items: all.slice(all.length - limit),
    hasOlder: true,
  };
}

export async function getOlderChatMessagesPage(params: {
  oldestLoaded: Pick<ChatMessage, 'created_at' | 'id'>;
  limit?: number;
}): Promise<{ items: ChatMessage[]; hasOlder: boolean }> {
  const limit = params.limit ?? CHAT_PAGE_SIZE;
  const all = (await getAllRecords('chat_messages'))
    .filter((m) => !m.deleted_at)
    .sort(compareChatMessagesAsc);

  const older = all.filter(
    (m) =>
      compareChatMessagesAsc(m, params.oldestLoaded as ChatMessage) < 0,
  );

  if (older.length <= limit) {
    return { items: older, hasOlder: false };
  }

  return {
    items: older.slice(older.length - limit),
    hasOlder: true,
  };
}

/**
 * Limpa todas as stores locais (IndexedDB e fallback em memória) para testes isolados.
 */
export async function resetLocalDbForTests(): Promise<void> {
  for (const storeName of ALL_STORES) {
    memoryStores[storeName].clear();
  }

  if (hasIndexedDb()) {
    if (dbPromise) {
      try {
        const db = await dbPromise;
        for (const storeName of ALL_STORES) {
          await db.clear(storeName);
        }
        db.close();
      } catch {
        // ignore cleanup errors in tests
      }
      dbPromise = null;
    }
  }
}
