import type { NodeRegistry } from './node-registry.js';
import { hashText } from './hash.js';
import { isTranslatable, normalize } from './normalizer.js';
import type { TranslatableAttr, TranslationCandidate } from '../types.js';

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
const ATTR_NAMES: TranslatableAttr[] = ['placeholder', 'title', 'alt'];
/** 属性没有 WeakMap 可挂（node-registry 只认 Text 节点），原文存到同名 data-i18n-orig-* 属性上，
 *  跟随元素生命周期，元素销毁时自动一起消失，不需要额外清理 */
const ORIGINAL_ATTR_PREFIX = 'data-i18n-orig-';
/** 记录上次写回的译文，用于判断业务是否在翻译后又改写了这个属性（跟文本节点的 stale 判断对称） */
const TRANSLATED_ATTR_PREFIX = 'data-i18n-translated-';

/**
 * engine（Task 9）应用属性翻译结果前调用：首次翻译某属性时把原文记录到 data-i18n-orig-*，
 * 之后语言切换才能从这里取回真正的原文，而不是把上一次的译文当新原文。幂等，重复调用无副作用。
 */
export function ensureOriginalAttrRecorded(
  el: Element,
  attrName: TranslatableAttr,
  original: string,
): void {
  const key = ORIGINAL_ATTR_PREFIX + attrName;
  if (!el.hasAttribute(key)) el.setAttribute(key, original);
}

/**
 * engine 每次把译文写回属性后调用：记下这次写回的值，供下次扫描判断属性是否被业务改写过。
 * 每次写回都要覆盖（不像 ensureOriginalAttrRecorded 那样幂等），因为译文本身随语言切换而变化。
 */
export function markAttrTranslated(
  el: Element,
  attrName: TranslatableAttr,
  translated: string,
): void {
  el.setAttribute(TRANSLATED_ATTR_PREFIX + attrName, translated);
}
const DEFAULT_DEBOUNCE_MS = 200;
const DEFAULT_MAX_BATCH_SIZE = 50;
const FULL_SCAN_CHUNK_SIZE = 200;

export interface ScannerOptions {
  registry: NodeRegistry;
  sourceLang: string;
  targetLang: string;
  debounceMs?: number;
  maxBatchSize?: number;
  onBatch: (candidates: TranslationCandidate[]) => void;
  /** 默认 requestIdleCallback（降级 setTimeout），测试可注入同步调度器 */
  scheduleIdle?: (work: () => void) => void;
}

function defaultScheduleIdle(work: () => void): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => work());
  } else {
    setTimeout(work, 0);
  }
}

function isElementSkipped(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true;
  if (el.getAttribute('translate') === 'no') return true;
  if (el.hasAttribute('data-i18n-skip')) return true;
  if (el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false') {
    return true;
  }
  return false;
}

function acceptNode(node: Node): number {
  if (node.nodeType === Node.ELEMENT_NODE) {
    if (isElementSkipped(node as Element)) return NodeFilter.FILTER_REJECT;
    // 元素本身也 ACCEPT（供属性扫描），且允许继续遍历子节点
    return NodeFilter.FILTER_ACCEPT;
  }
  return NodeFilter.FILTER_ACCEPT;
}

/**
 * MutationObserver 增量扫描专用：判断 node 自身或其任意祖先是否处于排除区域内。
 *
 * scanFull() 的 TreeWalker 从 document.body 出发一路往下走，天然会先经过跳过标记所在的
 * 祖先节点、被 FILTER_REJECT 挡住整棵子树，不需要额外的祖先链检查。但 MutationObserver
 * 场景不同：新增/变化的节点本身就是遍历的起点（TreeWalker 的 root 从不参与自身的 filter
 * 判定），如果排除标记挂在一个早就存在于 DOM 里的祖先容器上（容器本身没变化，只是它内部
 * 增量新增/修改了内容），只检查新增节点自身永远发现不了这层排除关系。必须显式沿父链向上找。
 */
function isInsideSkippedSubtree(node: Node): boolean {
  let el: Element | null =
    node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  while (el) {
    if (isElementSkipped(el)) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * TreeWalker 全量扫描（首屏）+ MutationObserver 增量扫描，统一喂给同一个攒批队列。
 * MutationObserver 只监听 childList + characterData，不监听 attributes
 * （原因见本文件所在任务的说明：写属性不产生 mutation，天然无环路问题）。
 */
export class Scanner {
  private readonly options: Required<Omit<ScannerOptions, 'scheduleIdle' | 'targetLang'>> & {
    scheduleIdle: (work: () => void) => void;
  };
  private targetLang: string;
  private readonly queue: TranslationCandidate[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private observer: MutationObserver | undefined;
  private stopped = false;

  constructor(options: ScannerOptions) {
    this.options = {
      registry: options.registry,
      sourceLang: options.sourceLang,
      debounceMs: options.debounceMs ?? DEFAULT_DEBOUNCE_MS,
      maxBatchSize: options.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE,
      onBatch: options.onBatch,
      scheduleIdle: options.scheduleIdle ?? defaultScheduleIdle,
    };
    this.targetLang = options.targetLang;
  }

  /** 语言切换时调用：后续扫描按新的目标语言判断哪些节点需要重新翻译 */
  setTargetLang(lang: string): void {
    this.targetLang = lang;
  }

  scanFull(root: Node): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode,
    });

    const step = (): void => {
      if (this.stopped) return; // disconnect() 之后不再继续这条分片扫描链
      let processed = 0;
      let node: Node | null;
      while (processed < FULL_SCAN_CHUNK_SIZE && (node = walker.nextNode())) {
        this.collect(node);
        processed += 1;
      }
      if (processed === FULL_SCAN_CHUNK_SIZE) {
        this.options.scheduleIdle(step);
      }
    };

    this.options.scheduleIdle(step);
  }

  observe(root: Node): void {
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
          if (!isInsideSkippedSubtree(mutation.target)) this.collect(mutation.target);
          continue;
        }
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((added) => this.scanSubtree(added));
        }
      }
    });
    this.observer.observe(root, { childList: true, subtree: true, characterData: true });
  }

  disconnect(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.stopped = true;
    clearTimeout(this.debounceTimer);
    this.queue.length = 0; // 丢弃尚未 flush 的候选，避免 stop 之后还持有 DOM 引用、还写 DOM
  }

  private scanSubtree(root: Node): void {
    // root 自身携带跳过标记，或者身处一个早就存在的跳过容器内部（容器本身没变化，只是
    // 内部增量新增/修改了内容）：两种情况都必须整体放弃，不能只挡 root 自己却继续遍历子孙。
    if (isInsideSkippedSubtree(root)) return;

    if (root.nodeType === Node.TEXT_NODE) {
      this.collect(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode,
    });
    this.collect(root);
    let node: Node | null;
    while ((node = walker.nextNode())) this.collect(node);
  }

  private collect(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      this.collectText(node as Text);
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      this.collectAttrs(node as Element);
    }
  }

  private collectText(node: Text): void {
    // 翻译源优先取已记录的原文——但仅当 textContent 与上次写回的译文一致时才可信
    // （说明自那以后没人动过这个节点，语言切换场景下必须从真正的原文重新翻译，
    // 否则会把上一次的译文当成新原文做"二次翻译"）。
    // 如果 textContent 已经和记录的译文对不上，说明业务代码改写了这个节点，
    // 记录的 originalText 已经过期（stale），必须改用当前 textContent 作为新原文，
    // 否则会用一份过期的原文覆盖业务刚写入的新内容。
    const state = this.options.registry.get(node);
    const stale = state !== undefined && node.textContent !== state.translatedText;
    const text = state && !stale ? state.originalText : (node.textContent ?? '');
    if (!isTranslatable(text)) return;
    if (this.options.registry.shouldSkip(node, this.targetLang)) return;

    const { normalized, restore } = normalize(text);
    const hash = hashText(`${normalized}:${this.options.sourceLang}`);
    this.enqueue({
      kind: 'text',
      node,
      hash,
      normalizedText: normalized,
      originalText: text,
      restore,
    });
  }

  private collectAttrs(el: Element): void {
    for (const attrName of ATTR_NAMES) {
      const origKey = ORIGINAL_ATTR_PREFIX + attrName;
      const translatedKey = TRANSLATED_ATTR_PREFIX + attrName;
      const storedOriginal = el.getAttribute(origKey);
      const storedTranslated = el.getAttribute(translatedKey);
      const current = el.getAttribute(attrName);

      // 只有当前属性值仍等于上次写回的译文时，才信任已记录的原文——
      // 跟文本节点的 stale 判断对称：业务改写了属性就必须把当前值当新原文，
      // 否则会用陈旧的 data-i18n-orig-* 把业务刚设置的新内容覆盖回旧译文。
      const stale = storedOriginal !== null && current !== storedTranslated;
      const original = storedOriginal !== null && !stale ? storedOriginal : current;
      if (!original || !isTranslatable(original)) continue;

      const { normalized, restore } = normalize(original);
      const hash = hashText(`${normalized}:${this.options.sourceLang}`);
      this.enqueue({
        kind: 'attr',
        node: el,
        attrName,
        hash,
        normalizedText: normalized,
        originalText: original,
        restore,
      });
    }
  }

  private enqueue(candidate: TranslationCandidate): void {
    // 不按 hash 去重丢弃候选——内容相同的多个节点/属性都要各自入队，否则排在后面的会被
    // 静默丢弃、永远翻译不到。真正的去重（避免同一 hash 重复请求翻译服务）在 engine 的
    // handleBatch 里按 hash 对请求体做，而不是在这里对候选本身做。
    this.queue.push(candidate);

    if (this.queue.length >= this.options.maxBatchSize) {
      this.flush();
      return;
    }

    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.flush(), this.options.debounceMs);
  }

  private flush(): void {
    clearTimeout(this.debounceTimer);
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.queue.length);
    this.options.onBatch(batch);
  }
}
