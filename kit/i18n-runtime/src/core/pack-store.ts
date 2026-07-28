import type { PackData, PackStorageAdapter, RemotePack } from '../types.js';

export interface PackStoreOptions {
  storage: PackStorageAdapter;
  /** 语言包按语言整包拉取，不按路由分片——L2 存储与 version 比对都只以 lang 为粒度 */
  fetchRemotePack: (lang: string) => Promise<RemotePack | null>;
}

/**
 * 空译文一律不进缓存。机翻引擎对纯符号、超长截断、后端异常等输入会返回空串或纯空白，
 * 而下游 engine 是按"查得到就写回 DOM"工作的——写回等于把页面文本和 placeholder
 * 直接抹掉。在这里（唯一的数据入口）挡住，L1/L2 就永远不含空译文，下游所有消费点
 * 不必各自防御；被丢掉的 hash 视为未翻译，下次扫描会自然重新入队重试。
 *
 * 判空用 trim() 而不是 falsy：`'0'` 是合法译文（计数、编号、纯数字标签），
 * 用 `!translation` 会把它连带误杀。注意只用于判定可用性，不改写译文本身，
 * 前后空白对某些语言（如需要空格分隔的拼接场景）是有意义的。
 */
function isUsableTranslation(translation: string): boolean {
  return typeof translation === 'string' && translation.trim() !== '';
}

/**
 * 语言包三层缓存编排：
 * L1 内存 Map（当前会话最快查询）
 * L2 可插拔持久化存储（Task 4，默认 localStorage）
 * L3 后端（权威源，通过 fetchRemotePack 拉取）
 *
 * hydrate() 启动流程：优先用 L2（version 匹配可离线可用），
 * 同时异步请求 L3 校验 version，不一致则把 L3 整包合并进 L1+L2（同 hash 以 L3 为准）。
 * 注意是合并而非替换：并发的 setMany() 结果可能还没落盘，整包覆盖会把它们冲掉
 * （见 loadIntoMemory / persistMerge 注释）。代价是远端删除的词条不会同步删除，
 * 只会等 LocalStorageAdapter 的 maxEntries 淘汰——这是有意的取舍。
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
    const cached = await this.readCache(lang);
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

  /** 已经缓存过的语言（L1 视角），供 clearCache() 在不指定语言时全量清理 */
  cachedLanguages(): string[] {
    return [...this.memory.keys()];
  }

  /**
   * 清空某个语言的 L1 + L2。用于用户登出等场景：译文里可能含有页面上的个人信息，
   * 需要能主动从浏览器本地缓存中抹掉。L2 的 clear 是 PackStorageAdapter 上的可选方法，
   * 自定义 adapter 可以不实现——那种情况下至少保证 L1 被清掉，且不抛错。
   */
  async clear(lang: string): Promise<void> {
    this.memory.delete(lang);
    try {
      await this.options.storage.clear?.(lang);
    } catch (err) {
      console.warn('[i18n-runtime] 本地语言包缓存清理失败:', err);
    }
  }

  async setMany(lang: string, translations: Record<string, string>): Promise<void> {
    const accepted = Object.entries(translations).filter(([, translation]) =>
      isUsableTranslation(translation),
    );

    const bucket = this.memory.get(lang) ?? new Map<string, string>();
    for (const [hash, translation] of accepted) {
      bucket.set(hash, translation);
    }
    this.memory.set(lang, bucket);

    const now = Date.now();
    const entries: PackData['entries'] = {};
    for (const [hash, translation] of accepted) {
      entries[hash] = { translation, lastUsedAt: now };
    }
    await this.persistMerge(lang, { version: '', entries }, { keepVersion: true });
  }

  /**
   * L2 是缓存不是权威源：读失败必须静默降级成"本地没有缓存"，继续走 L1/L3。
   *
   * IndexedDB 在隐私模式、企业策略禁用、跨域 iframe 里 open 就会抛；localStorage 在
   * 部分浏览器的无痕模式下 getItem 同样会抛。这个异常若原样抛出去，engine.setLanguage()
   * 会整体 reject、后面的 scanFull() 根本不执行——一个纯缓存层不可用，却导致全站不翻译。
   * 路由回调里的 hydrate 还是 void 调用，抛出去就是一次未捕获的 Promise rejection。
   */
  private async readCache(lang: string): Promise<PackData | null> {
    try {
      return await this.options.storage.get(lang);
    } catch (err) {
      console.warn('[i18n-runtime] 本地语言包缓存读取失败，已降级为仅使用远端语言包:', err);
      return null;
    }
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
        const existing = (await this.readCache(lang)) ?? { version: '', entries: {} };
        const merged: PackData = {
          version: options.keepVersion ? existing.version : patch.version,
          entries: { ...existing.entries, ...patch.entries },
        };
        try {
          await this.options.storage.set(lang, merged);
        } catch (err) {
          // 同理，落盘失败只损失下次会话的命中率，L1 里的译文已经可用。
          // 不吞掉的话 setMany 会 reject，engine 那边会把它当成"批量翻译失败"记日志，
          // 而实际上翻译是成功的，误导排查方向。
          console.warn('[i18n-runtime] 本地语言包缓存写入失败，本次译文仅保留在内存中:', err);
        }
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
      if (!isUsableTranslation(translation)) continue;
      entries[hash] = { translation, lastUsedAt: now };
    }
    return { version: remote.version, entries };
  }
}
