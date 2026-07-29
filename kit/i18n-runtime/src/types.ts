/** 单个文本节点的翻译状态，用于 MutationObserver 防环路判断 */
export interface NodeState {
  originalText: string;
  translatedText: string;
  lang: string;
}

export interface PackEntry {
  translation: string;
  /**
   * 该词条最近一次“写入 L2”的时间戳（setMany 落盘 / 远端 pack 拉取时更新），
   * 命中读取（PackStore.get）时并不刷新。因此 LocalStorageAdapter 的淘汰实际是
   * 按“最久未写入”排序，是对 LRU 的近似而非严格 LRU——命中读取不刷新时间戳是
   * 有意为之，避免每次读命中都触发一次 localStorage 写放大。
   */
  lastUsedAt: number;
}

export interface PackData {
  version: string;
  entries: Record<string, PackEntry>;
}

export interface PackStorageAdapter {
  get(lang: string): Promise<PackData | null>;
  set(lang: string, data: PackData): Promise<void>;
  clear?(lang: string): Promise<void>;
}

export interface RemotePack {
  version: string;
  entries: Record<string, string>; // hash -> translation
}

export interface TranslateBatchRequest {
  items: Array<{ hash: string; text: string }>;
  sourceLang: string;
  targetLang: string;
  /** 当前页面路由路径，后端可据此按页面分组缓存翻译结果 */
  path?: string;
  glossary?: string[];
}

export interface TranslateBatchResult {
  translations: Array<{ hash: string; translation: string }>;
}

export interface TranslateProvider {
  readonly name: string;
  translate(req: TranslateBatchRequest): Promise<TranslateBatchResult>;
}

export type ProviderName = 'backend' | 'libretranslate';

export type TranslatableAttr = 'placeholder' | 'title' | 'alt';

/**
 * 按内容/DOM 位置决定某段文本是否参与翻译，返回 false 则整条候选被丢弃——
 * 既不会发给翻译服务，也不会被写回 DOM。
 *
 * 主要用途是敏感信息脱敏：运行时按设计会把页面上所有可见文本发送到配置的翻译服务，
 * 姓名、邮箱、地址等个人信息也不例外。`translate="no"` / `data-i18n-skip` 只能按
 * DOM 区域静态排除，这个钩子补上"按内容动态判断"的能力。
 *
 * @param text 归一化前的原文
 * @param node 文本候选传 Text 节点；属性候选传属性所在的 Element
 */
export type ShouldTranslate = (text: string, node: Node) => boolean;

/**
 * 固定译文术语表：原文 -> {lang: 固定译文}。用于品牌名/标题等需要人工指定译法、
 * 不依赖机翻的场景，命中后直接替换、不出网、不落 packStore 缓存。
 * 按精确原文字符串匹配，不做数字占位符归一化，只适合不含变量的固定文案。
 */
export type Terminology = Record<string, Record<string, string>>;

export interface TranslationCandidate {
  kind: 'text' | 'attr';
  node: Text | Element;
  attrName?: string;
  hash: string;
  normalizedText: string;
  /** Scanner 收集候选那一刻实际使用的原文（归一化前），engine 写回译文时必须用这份快照
   *  记录 originalText，不能事后从 DOM/registry 重新猜测——猜测在并发改写场景下会记错 */
  originalText: string;
  restore: (translated: string) => string;
}
