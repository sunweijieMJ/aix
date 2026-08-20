import type { PackData, PackStorageAdapter } from '../../types.js';

const DB_NAME = 'kit-i18n-runtime';
const STORE_NAME = 'packs';
const DB_VERSION = 1;

// 模块级缓存的单例连接：每次 get/set/clear 都新开一个 IndexedDB 连接且从不 close 会导致
// 连接只增不减，还会在未来 DB_VERSION 升级时因为存在未关闭的旧连接而卡在 onblocked 无限期挂起。
// 页面生命周期内只需要一条连接，交给浏览器在页面卸载时自然回收即可。
let dbPromise: Promise<IDBDatabase> | undefined;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = undefined; // 打开失败要允许下次重新尝试，不能一直缓存一个失败的 Promise
        reject(request.error as Error);
      };
    });
  }
  return dbPromise;
}

/**
 * IndexedDB 容量远大于 localStorage（浏览器托管配额），不需要 LRU 淘汰兜底，
 * 适合语言包条目量大、或明确要规避 localStorage 撑满风险的场景。
 */
export class IndexedDbAdapter implements PackStorageAdapter {
  async get(lang: string): Promise<PackData | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(lang);
      request.onsuccess = () => resolve((request.result as PackData | undefined) ?? null);
      request.onerror = () => reject(request.error as Error);
    });
  }

  async set(lang: string, data: PackData): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(data, lang);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error as Error);
    });
  }

  async clear(lang: string): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(lang);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error as Error);
    });
  }
}
