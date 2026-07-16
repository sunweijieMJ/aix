import type { PackData, PackStorageAdapter } from '../../types.js';

const KEY_PREFIX = 'i18n-pack:';
const DEFAULT_MAX_ENTRIES = 2000;

export interface LocalStorageAdapterOptions {
  maxEntries?: number;
}

/**
 * localStorage 是缓存而非权威源（L3 后端才是），配额溢出时按 lastUsedAt 做 LRU 淘汰
 * 而不是放弃整个缓存：被淘汰的词条下次命中时重新走翻译流程，只影响命中率不影响正确性。
 */
export class LocalStorageAdapter implements PackStorageAdapter {
  private readonly maxEntries: number;

  constructor(options: LocalStorageAdapterOptions = {}) {
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  async get(lang: string): Promise<PackData | null> {
    const raw = localStorage.getItem(KEY_PREFIX + lang);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PackData;
    } catch {
      return null;
    }
  }

  async set(lang: string, data: PackData): Promise<void> {
    const trimmed = this.evict(data, this.maxEntries);
    if (this.tryWrite(lang, trimmed)) return;

    // 首次写入触发配额异常，缩容一半再重试一次；仍失败则放弃本次持久化
    const shrunk = this.evict(trimmed, Math.floor(this.maxEntries / 2));
    this.tryWrite(lang, shrunk);
  }

  async clear(lang: string): Promise<void> {
    localStorage.removeItem(KEY_PREFIX + lang);
  }

  private tryWrite(lang: string, data: PackData): boolean {
    try {
      localStorage.setItem(KEY_PREFIX + lang, JSON.stringify(data));
      return true;
    } catch (err) {
      if (this.isQuotaExceeded(err)) return false;
      throw err;
    }
  }

  private evict(data: PackData, limit: number): PackData {
    const hashes = Object.keys(data.entries);
    if (hashes.length <= limit) return data;

    const kept = hashes
      .sort((a, b) => data.entries[b]!.lastUsedAt - data.entries[a]!.lastUsedAt)
      .slice(0, limit);

    const entries: PackData['entries'] = {};
    for (const hash of kept) {
      entries[hash] = data.entries[hash]!;
    }
    return { version: data.version, entries };
  }

  private isQuotaExceeded(err: unknown): boolean {
    return (
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    );
  }
}
