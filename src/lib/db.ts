/**
 * db.ts —— IndexedDB 轻封装（零第三方依赖）
 * 题库变大（每科数百题以上）时 IndexedDB 比 localStorage 更稳：异步、容量大、不阻塞渲染。
 * 另含自动本地备份：每次启动写一份快照到 backups 表，仅保留最近 3 份。
 */
import type { BackupBundle, BackupMeta } from '../types';

const DB_NAME = 'kaoyan-exam-db';
const DB_VERSION = 2;

export const STORES = [
  'questions',
  'knowledgePoints',
  'wrongQuestions',
  'records',
  'exams',
  'checkins',
  'settings',
  'achievements',
  'backups',
] as const;
export type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      STORES.forEach((name) => {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const idb = {
  async getAll<T>(store: StoreName): Promise<T[]> {
    return tx<T[]>(store, 'readonly', (s) => s.getAll());
  },
  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return tx<T>(store, 'readonly', (s) => s.get(key));
  },
  async put<T extends { id: string }>(store: StoreName, value: T): Promise<void> {
    await tx(store, 'readwrite', (s) => s.put(value));
  },
  async bulkPut<T extends { id: string }>(store: StoreName, items: T[]): Promise<void> {
    if (!items.length) return;
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(store, 'readwrite');
      const s = t.objectStore(store);
      items.forEach((it) => s.put(it));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
  async delete(store: StoreName, key: string): Promise<void> {
    await tx(store, 'readwrite', (s) => s.delete(key));
  },
  async clear(store: StoreName): Promise<void> {
    await tx(store, 'readwrite', (s) => s.clear());
  },
  async clearAll(): Promise<void> {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(STORES.filter((s) => s !== 'settings'), 'readwrite');
      STORES.filter((s) => s !== 'settings').forEach((name) => t.objectStore(name).clear());
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
};

/** 导出全库为备份包 */
export async function exportBundle(meta?: { version: number }): Promise<BackupBundle> {
  const [questions, knowledgePoints, wrongQuestions, records, exams, checkins, settingsRows, achievements] =
    await Promise.all([
      idb.getAll<BackupBundle['questions'][number]>('questions'),
      idb.getAll<BackupBundle['knowledgePoints'][number]>('knowledgePoints'),
      idb.getAll<BackupBundle['wrongQuestions'][number]>('wrongQuestions'),
      idb.getAll<BackupBundle['records'][number]>('records'),
      idb.getAll<BackupBundle['exams'][number]>('exams'),
      idb.getAll<BackupBundle['checkins'][number]>('checkins'),
      idb.getAll<BackupBundle['settings']>('settings'),
      idb.getAll<BackupBundle['achievements'][number]>('achievements'),
    ]);
  return {
    version: meta?.version ?? 2,
    exportedAt: Date.now(),
    app: '408exam',
    questions,
    knowledgePoints,
    wrongQuestions,
    records,
    exams,
    checkins,
    settings: settingsRows[0],
    achievements,
  };
}

/** 从备份包恢复（先清空再写入） */
export async function importBundle(bundle: BackupBundle): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORES, 'readwrite');
    STORES.forEach((name) => t.objectStore(name).clear());
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  await Promise.all([
    idb.bulkPut('questions', bundle.questions ?? []),
    idb.bulkPut('knowledgePoints', bundle.knowledgePoints ?? []),
    idb.bulkPut('wrongQuestions', bundle.wrongQuestions ?? []),
    idb.bulkPut('records', bundle.records ?? []),
    idb.bulkPut('exams', bundle.exams ?? []),
    idb.bulkPut('checkins', bundle.checkins ?? []),
    idb.bulkPut('achievements', bundle.achievements ?? []),
  ]);
  if (bundle.settings) await idb.put('settings', { ...bundle.settings, id: 'singleton' });
}

/** 启动时自动备份，仅保留最近 3 份 */
export async function autoBackup(): Promise<BackupMeta | null> {
  try {
    const bundle = await exportBundle();
    const payload = JSON.stringify(bundle);
    const meta: BackupMeta & { payload: string } = {
      id: 'bk_' + bundle.exportedAt,
      at: bundle.exportedAt,
      size: payload.length,
      payload,
    };
    await idb.put('backups', meta);
    const all = await idb.getAll<BackupMeta>('backups');
    const sorted = all.sort((a, b) => b.at - a.at);
    await Promise.all(sorted.slice(3).map((m) => idb.delete('backups', m.id)));
    return { id: meta.id, at: meta.at, size: meta.size };
  } catch (e) {
    console.warn('[autoBackup] 失败', e);
    return null;
  }
}

export async function listBackups(): Promise<(BackupMeta & { payload?: string })[]> {
  return (await idb.getAll<BackupMeta & { payload?: string }>('backups')).sort((a, b) => b.at - a.at);
}
