import type { PackData, PackStorageAdapter } from '../../types.js';

const KEY_PREFIX = 'i18n-pack:';
const DEFAULT_MAX_ENTRIES = 2000;

export interface LocalStorageAdapterOptions {
  maxEntries?: number;
}

/**
 * evict() 用 `length <= limit` 判断 + `slice(0, limit)`，limit 一旦是 NaN 或 <= 0，
 * 前者恒为 false、后者返回空数组，结果是每次写入都把整包淘汰干净——L2 永久失效、
 * 每次访问都全量重翻，而且完全没有报错，极难察觉。
 *
 * 非法值主要来自 script 标签接入：`data-max-entries="2k"` 会 Number() 成 NaN，
 * `data-max-entries=""` 会成 0，都是很容易写出来的笔误。这里回落默认值并告警，
 * 而不是抛错——一个可选调优参数写错，不该让整个页面失去翻译能力。
 */
function normalizeMaxEntries(value: number | undefined): number {
  if (value === undefined) return DEFAULT_MAX_ENTRIES;
  if (!Number.isFinite(value) || value <= 0) {
    console.warn(
      `[i18n-runtime] maxEntries 需要是正数，收到 ${String(value)}，已回落为默认值 ${DEFAULT_MAX_ENTRIES}`,
    );
    return DEFAULT_MAX_ENTRIES;
  }
  return Math.floor(value);
}

/**
 * localStorage 是缓存而非权威源（L3 后端才是），配额溢出时按 lastUsedAt 排序淘汰旧词条
 * 而不是放弃整个缓存：被淘汰的词条下次命中时重新走翻译流程，只影响命中率不影响正确性。
 *
 * 注意：lastUsedAt 只在写入时更新、读命中不刷新（见 PackEntry 注释），所以这里是按
 * “最久未写入”排序的近似 LRU，而非严格意义的 LRU。对缓存命中率无实质影响，属有意取舍。
 */
export class LocalStorageAdapter implements PackStorageAdapter {
  private readonly maxEntries: number;

  constructor(options: LocalStorageAdapterOptions = {}) {
    this.maxEntries = normalizeMaxEntries(options.maxEntries);
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
