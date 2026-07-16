import type { PackData, PackStorageAdapter, RemotePack } from '../types.js';

export interface PackStoreOptions {
  storage: PackStorageAdapter;
  fetchRemotePack: (lang: string) => Promise<RemotePack | null>;
}

/**
 * 语言包三层缓存编排：
 * L1 内存 Map（当前会话最快查询）
 * L2 可插拔持久化存储（Task 4，默认 localStorage）
 * L3 后端（权威源，通过 fetchRemotePack 拉取）
 *
 * hydrate() 启动流程：优先用 L2（version 匹配可离线可用），
 * 同时异步请求 L3 校验 version，不一致则整包替换 L1+L2。
 * L3 请求失败静默降级使用已有 L2/L1 缓存，不阻塞、不抛错——
 * 翻译失败不应影响门户页面正常使用。
 */
export class PackStore {
  private readonly memory = new Map<string, Map<string, string>>();
  private readonly options: PackStoreOptions;

  constructor(options: PackStoreOptions) {
    this.options = options;
  }

  async hydrate(lang: string): Promise<void> {
    const cached = await this.options.storage.get(lang);
    if (cached) {
      this.loadIntoMemory(lang, cached);
    }

    try {
      const remote = await this.options.fetchRemotePack(lang);
      if (remote && remote.version !== cached?.version) {
        const data = this.remoteToPackData(remote);
        this.loadIntoMemory(lang, data);
        await this.options.storage.set(lang, data);
      }
    } catch {
      // L3 拉取失败，静默降级使用已有 L2/L1 缓存
    }
  }

  get(lang: string, hash: string): string | undefined {
    return this.memory.get(lang)?.get(hash);
  }

  async setMany(lang: string, translations: Record<string, string>): Promise<void> {
    const bucket = this.memory.get(lang) ?? new Map<string, string>();
    for (const [hash, translation] of Object.entries(translations)) {
      bucket.set(hash, translation);
    }
    this.memory.set(lang, bucket);

    const now = Date.now();
    const existing = (await this.options.storage.get(lang)) ?? { version: '', entries: {} };
    for (const [hash, translation] of Object.entries(translations)) {
      existing.entries[hash] = { translation, lastUsedAt: now };
    }
    await this.options.storage.set(lang, existing);
  }

  private loadIntoMemory(lang: string, data: PackData): void {
    // 合并写入已存在的 Map，不要整体替换成新 Map 对象——hydrate() 的 L3 拉取是异步的，
    // 拉取期间如果有并发的 setMany() 已经往当前这个 Map 引用里写了新词条，整体替换会把
    // 那些还没来得及持久化到 L2 的新词条一并丢弃。用同一个引用逐条覆盖写入，
    // 既能让 L3 的权威数据覆盖过期的 L2 值，又不会抹掉并发写入的其它词条。
    const bucket = this.memory.get(lang) ?? new Map<string, string>();
    for (const [hash, entry] of Object.entries(data.entries)) {
      bucket.set(hash, entry.translation);
    }
    this.memory.set(lang, bucket);
  }

  private remoteToPackData(remote: RemotePack): PackData {
    const now = Date.now();
    const entries: PackData['entries'] = {};
    for (const [hash, translation] of Object.entries(remote.entries)) {
      entries[hash] = { translation, lastUsedAt: now };
    }
    return { version: remote.version, entries };
  }
}
