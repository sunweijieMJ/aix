/** 单个文本节点的翻译状态，用于 MutationObserver 防环路判断 */
export interface NodeState {
  originalText: string;
  translatedText: string;
  lang: string;
}

export interface PackEntry {
  translation: string;
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

export interface TranslationCandidate {
  kind: 'text' | 'attr';
  node: Text | Element;
  attrName?: TranslatableAttr;
  hash: string;
  normalizedText: string;
  /** Scanner 收集候选那一刻实际使用的原文（归一化前），engine 写回译文时必须用这份快照
   *  记录 originalText，不能事后从 DOM/registry 重新猜测——猜测在并发改写场景下会记错 */
  originalText: string;
  restore: (translated: string) => string;
}
