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
  /** 按 lang 串行化 L2 的读-改-写，避免并发 setMany/hydrate 互相用旧快照整体覆盖丢失对方的词条 */
  private readonly writeQueue = new Map<string, Promise<void>>();

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
        await this.persistMerge(lang, data);
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
    const entries: PackData['entries'] = {};
    for (const [hash, translation] of Object.entries(translations)) {
      entries[hash] = { translation, lastUsedAt: now };
    }
    await this.persistMerge(lang, { version: '', entries }, { keepVersion: true });
  }

  /**
   * 把 L2 的"读旧数据 -> 合并 -> 写回"接到同一个 lang 的队尾串行执行，
   * 保证同一时刻只有一次读改写在途，后写入的一定合并在先写入的结果之上，不会互相覆盖丢词条。
   * hydrate 场景默认用 patch.version 更新版本号；setMany 场景传 keepVersion 保留已持久化的版本号。
   */
  private persistMerge(
    lang: string,
    patch: PackData,
    options: { keepVersion?: boolean } = {},
  ): Promise<void> {
    const previous = this.writeQueue.get(lang) ?? Promise.resolve();
    const next = previous
      .catch(() => {
        // 上一次写入失败不应该让队列永久卡死，后续写入仍要能正常执行
      })
      .then(async () => {
        const existing = (await this.options.storage.get(lang)) ?? { version: '', entries: {} };
        const merged: PackData = {
          version: options.keepVersion ? existing.version : patch.version,
          entries: { ...existing.entries, ...patch.entries },
        };
        await this.options.storage.set(lang, merged);
      });
    this.writeQueue.set(lang, next);
    return next;
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
