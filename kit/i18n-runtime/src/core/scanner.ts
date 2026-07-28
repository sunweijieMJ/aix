import type { NodeRegistry } from './node-registry.js';
import { hashText } from './hash.js';
import { isTranslatable, normalize } from './normalizer.js';
import type { ShouldTranslate, TranslatableAttr, TranslationCandidate } from '../types.js';

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
/**
 * 这些元素的**文本内容**是用户表单值而非展示文案，翻译会篡改用户即将提交的数据，
 * 必须跳过；但它们的 placeholder/title 等属性仍然是展示文案，照常翻译——
 * 所以不能放进 SKIP_TAGS（那会连属性一起跳过），只在 collectText 里挡住。
 */
const TEXT_SKIP_SELECTOR = 'textarea, [contenteditable]:not([contenteditable="false"])';
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
export function ensureOriginalAttrRecorded(el: Element, attrName: string, original: string): void {
  const key = ORIGINAL_ATTR_PREFIX + attrName;
  if (!el.hasAttribute(key)) el.setAttribute(key, original);
}

/**
 * engine 每次把译文写回属性后调用：记下这次写回的值，供下次扫描判断属性是否被业务改写过。
 * 每次写回都要覆盖（不像 ensureOriginalAttrRecorded 那样幂等），因为译文本身随语言切换而变化。
 */
export function markAttrTranslated(el: Element, attrName: string, translated: string): void {
  el.setAttribute(TRANSLATED_ATTR_PREFIX + attrName, translated);
}
const DEFAULT_DEBOUNCE_MS = 50;
const DEFAULT_MAX_BATCH_SIZE = 50;
const FULL_SCAN_CHUNK_SIZE = 200;

/**
 * 这两个可选调优参数从 script 标签的 data-* 解析而来时极易变成非法值：
 * `data-debounce-ms="50ms"` → NaN、`data-max-batch-size=""` → 0。二者都会静默劣化攒批：
 * NaN 传给 setTimeout 等价于 0ms 防抖，`queue.length >= 0` 则恒为 true——
 * 结果都是页面上每个文本节点各发一次翻译请求。回落默认值并告警，而不是抛错：
 * 一个可选参数写错，不该让整个页面失去翻译能力。
 * debounceMs 允许 0（立即 flush 是合法配置），maxBatchSize 至少为 1。
 */
function normalizeNumericOption(
  value: number | undefined,
  fallback: number,
  min: number,
  name: string,
): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < min) {
    console.warn(
      `[i18n-runtime] ${name} 需要是不小于 ${min} 的数字，收到 ${String(value)}，已回落为默认值 ${fallback}`,
    );
    return fallback;
  }
  return Math.floor(value);
}

export interface ScannerOptions {
  registry: NodeRegistry;
  sourceLang: string;
  targetLang: string;
  debounceMs?: number;
  maxBatchSize?: number;
  onBatch: (candidates: TranslationCandidate[]) => void;
  /** 除 placeholder/title/alt 之外，额外需要翻译的 HTML 属性名，如 ['data-placeholder'] */
  extraAttrs?: string[];
  /** 默认 requestIdleCallback（降级 setTimeout），测试可注入同步调度器 */
  scheduleIdle?: (work: () => void) => void;
  /** scanFull 首个 chunk 的调度器，默认 requestAnimationFrame（降级 setTimeout），测试可注入同步调度器 */
  scheduleFirst?: (work: () => void) => void;
  /** L1 内存缓存查询——命中时跳过 debounce 队列，立即写回节点，消除"先显原文再显译文"的停顿 */
  getCached?: (hash: string) => string | undefined;
  /** getCached 命中时的同步写回回调 */
  onCacheHit?: (candidate: TranslationCandidate, translation: string) => void;
  /** 是否扫描 open shadow root，默认 true；false 时跳过所有 shadow DOM */
  scanShadowDOM?: boolean;
  /** 按内容决定是否翻译，返回 false 则该候选既不出网也不改写 DOM */
  shouldTranslate?: ShouldTranslate;
}

function defaultScheduleIdle(work: () => void): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => work());
  } else {
    setTimeout(work, 0);
  }
}

function defaultScheduleRaf(work: () => void): void {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => work());
  } else {
    setTimeout(work, 0);
  }
}

function isElementSkipped(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true;
  if (el.getAttribute('translate') === 'no') return true;
  if (el.hasAttribute('data-i18n-skip')) return true;
  // contenteditable 元素的属性仍需翻译（如 data-placeholder），只跳过其文本内容（在 collectText 里处理）
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
 *
 * 上溯必须跨过 shadow 边界：ShadowRoot 的 parentNode 为 null（顶层子元素的 parentElement
 * 也是 null），父链会在这里断掉，导致挂在 shadow host 上的跳过标记对 shadow 内部完全失效。
 * 走到 ShadowRoot 时改走 host 继续往上，才能让 skip 语义在 shadow DOM 里保持一致。
 */
function isInsideSkippedSubtree(node: Node): boolean {
  // 起点直接用 node 自身，循环里再按 nodeType 决定是否参与判定：这样 Text（跳过判定走父链）、
  // Element（判定自身）、ShadowRoot（跳到 host 继续）三种起点都能统一处理。
  // 起点若是 ShadowRoot 而这里先取了 parentNode（恒为 null），就会漏掉 host 上的跳过标记。
  let current: Node | null = node;
  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE && isElementSkipped(current as Element)) return true;
    // 普通节点走 parentNode；ShadowRoot 的 parentNode 为 null，改跳到它的 host 继续上溯
    current = current.parentNode ?? ((current as ShadowRoot).host as Node | undefined) ?? null;
  }
  return false;
}

/**
 * TreeWalker 全量扫描（首屏）+ MutationObserver 增量扫描，统一喂给同一个攒批队列。
 * MutationObserver 只监听 childList + characterData，不监听 attributes
 * （原因见本文件所在任务的说明：写属性不产生 mutation，天然无环路问题）。
 */
export class Scanner {
  private readonly options: Required<
    Omit<
      ScannerOptions,
      | 'scheduleIdle'
      | 'scheduleFirst'
      | 'targetLang'
      | 'getCached'
      | 'onCacheHit'
      | 'shouldTranslate'
    >
  > & {
    scheduleIdle: (work: () => void) => void;
    scheduleFirst: (work: () => void) => void;
    getCached?: (hash: string) => string | undefined;
    onCacheHit?: (candidate: TranslationCandidate, translation: string) => void;
    shouldTranslate?: ShouldTranslate;
  };
  private targetLang: string;
  private readonly queue: TranslationCandidate[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly observers: MutationObserver[] = [];
  /**
   * 已建立观察的根节点，用于防止同一个 root 被重复 observe。
   * shadow host 随父容器反复进出 DOM（v-if / keep-alive）时，每次进入都会被 scanSubtree
   * 重新走到，但它的 shadowRoot 始终是同一个对象、上一个 observer 也仍然有效——不去重就会
   * 线性堆积 observer，同一次 mutation 被回调 N 次，候选成倍放大。
   */
  private readonly observedRoots = new WeakSet<Node>();
  private stopped = false;

  constructor(options: ScannerOptions) {
    this.options = {
      registry: options.registry,
      sourceLang: options.sourceLang,
      debounceMs: normalizeNumericOption(options.debounceMs, DEFAULT_DEBOUNCE_MS, 0, 'debounceMs'),
      maxBatchSize: normalizeNumericOption(
        options.maxBatchSize,
        DEFAULT_MAX_BATCH_SIZE,
        1,
        'maxBatchSize',
      ),
      onBatch: options.onBatch,
      extraAttrs: options.extraAttrs ?? [],
      scanShadowDOM: options.scanShadowDOM ?? true,
      scheduleIdle: options.scheduleIdle ?? defaultScheduleIdle,
      scheduleFirst: options.scheduleFirst ?? options.scheduleIdle ?? defaultScheduleRaf,
      getCached: options.getCached,
      onCacheHit: options.onCacheHit,
      shouldTranslate: options.shouldTranslate,
    };
    this.targetLang = options.targetLang;
  }

  /** 语言切换时调用：后续扫描按新的目标语言判断哪些节点需要重新翻译 */
  setTargetLang(lang: string): void {
    this.targetLang = lang;
  }

  /**
   * @param options.includeRoot 是否连 root 自身的属性一起采集。默认 false：常规全量扫描
   *   传的是 document.body 这类容器，采集它自身的属性没有意义。addRoot() 场景必须传 true——
   *   业务把待翻译的元素本身交了过来，漏掉它自己的 placeholder/title 等于这次调用白调。
   */
  scanFull(root: Node, options: { includeRoot?: boolean } = {}): void {
    // root 自身（或它的某个祖先）带跳过标记时整体放弃，和 scanSubtree 保持对称。
    // TreeWalker 的 root 从不参与自身的 filter 判定，不在这里显式挡一次的话，
    // root 上的跳过标记对它自己的属性和整棵子树都会失效（<body data-i18n-skip> 直接没用）。
    if (isInsideSkippedSubtree(root)) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode,
    });

    // TreeWalker 从不 yield 自己的 root，root 自身的属性和它挂着的 shadow root 都得显式
    // 处理一次。漏掉这一步时 addRoot(element) 会整体失效——业务传进来待翻译的那个元素本身，
    // 属性不会被采集，shadow root 也完全扫不到。
    // 注意 shadow 递归与 includeRoot 无关：进入 root 的 shadow 树扫的是"root 内部的内容"，
    // 不是"root 自身"，document.body 这类容器也没有 shadow root，放开不会有副作用。
    let rootHandled = false;

    const step = (): void => {
      if (this.stopped) return;
      if (!rootHandled) {
        rootHandled = true;
        if (options.includeRoot) this.collect(root);
        if (this.options.scanShadowDOM && root.nodeType === Node.ELEMENT_NODE) {
          const rootShadow = (root as Element).shadowRoot;
          if (rootShadow) this.enterShadowRoot(rootShadow);
        }
      }
      let processed = 0;
      let node: Node | null;
      while (processed < FULL_SCAN_CHUNK_SIZE && (node = walker.nextNode())) {
        this.collect(node);
        if (this.options.scanShadowDOM && node.nodeType === Node.ELEMENT_NODE) {
          const sr = (node as Element).shadowRoot;
          if (sr) this.enterShadowRoot(sr);
        }
        processed += 1;
      }
      if (processed === FULL_SCAN_CHUNK_SIZE) {
        this.options.scheduleIdle(step);
      }
    };

    this.options.scheduleFirst(step);
  }

  observe(root: Node): void {
    this.observeRoot(root);
    if (!this.options.scanShadowDOM) return;
    // 对已存在的 shadow root 也建立观察；同样要带 acceptNode（对齐 scanFull/scanSubtree），
    // 否则会给标记了跳过的 host 也建起 observer，白白观察一棵永远不会被采集的子树
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, { acceptNode });
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const sr = (node as Element).shadowRoot;
      if (sr) this.observeRoot(sr);
    }
  }

  /**
   * 进入一棵 shadow 树：扫描内容 + 建立观察，两件事必须成对做。
   *
   * observe() 的 TreeWalker 跨不过 shadow 边界，MutationObserver 也不穿透 shadow 边界，
   * 所以嵌套 shadow root（shadow 里再挂 shadow）唯一能被发现的路径就是这里的手动递归。
   * 只扫不观察的话，这类 shadow 树只在首屏被采集一次，之后的动态内容永远翻译不到。
   */
  private enterShadowRoot(shadowRoot: ShadowRoot): void {
    this.scanFull(shadowRoot);
    this.observeRoot(shadowRoot);
  }

  /** 为单个根节点（含 shadow root）建立 MutationObserver；同一个 root 只会建立一次 */
  private observeRoot(root: Node): void {
    if (this.observedRoots.has(root)) return;
    this.observedRoots.add(root);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
          if (!isInsideSkippedSubtree(mutation.target)) this.collect(mutation.target);
          continue;
        }
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((added) => {
            this.scanSubtree(added);
            // 新增节点如果带 shadow root，也要进入扫描和观察
            if (this.options.scanShadowDOM && added.nodeType === Node.ELEMENT_NODE) {
              const sr = (added as Element).shadowRoot;
              if (sr) this.enterShadowRoot(sr);
            }
          });
        }
      }
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    this.observers.push(observer);
  }

  /** 手动注册额外的根节点（用于 closed shadow root 或业务已知的 shadow root） */
  addRoot(root: Node): void {
    // includeRoot：业务显式交过来的这个节点本身也要翻，不能只翻它的子孙
    this.scanFull(root, { includeRoot: true });
    this.observeRoot(root);
  }

  disconnect(): void {
    this.observers.forEach((obs) => obs.disconnect());
    this.observers.length = 0;
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
    while ((node = walker.nextNode())) {
      this.collect(node);
      // TreeWalker 无法穿越 shadow DOM 边界，遇到 shadow host 时手动递归进入
      if (this.options.scanShadowDOM && node.nodeType === Node.ELEMENT_NODE) {
        const sr = (node as Element).shadowRoot;
        if (sr) this.enterShadowRoot(sr);
      }
    }
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
    // 跳过 textarea / contenteditable 内的文本节点（用户表单值，不是展示文案）
    if (node.parentElement?.closest(TEXT_SKIP_SELECTOR)) {
      return;
    }

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
    // 业务级排除（敏感信息脱敏等）：在入队之前拦掉，保证被拒的文本既不出网也不改写 DOM
    if (this.options.shouldTranslate && !this.options.shouldTranslate(text, node)) return;
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
    const allAttrs = [...ATTR_NAMES, ...(this.options.extraAttrs ?? [])] as string[];
    for (const attrName of allAttrs) {
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
      if (this.options.shouldTranslate && !this.options.shouldTranslate(original, el)) continue;

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
    if (this.stopped) return;

    // 目标语言就是源语言：要显示的内容就是 candidate.originalText 本身（registry 或
    // data-i18n-orig-* 里已经记着），本地直接还原即可，不需要也不应该经过翻译服务——
    // 走网络的话既白打一次 sourceLang === targetLang 的请求，页面文案还会变成后端
    // 对"翻译成自己"这种输入的任意返回值，而不是用户最初写的原文。
    if (this.targetLang === this.options.sourceLang) {
      this.options.onCacheHit?.(candidate, candidate.originalText);
      return;
    }

    // L1 缓存命中：同步写回，跳过 debounce 队列，消除"先显原文再显译文"的停顿
    if (this.options.getCached && this.options.onCacheHit) {
      const cached = this.options.getCached(candidate.hash);
      if (cached !== undefined) {
        this.options.onCacheHit(candidate, cached);
        return;
      }
    }

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
