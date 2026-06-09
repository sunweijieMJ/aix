import { defineComponent, h, ref, watch } from 'vue';
import type { MarkdownRenderers } from './markdownWalker';

/** highlight.js 最小接口（v11 兼容；依赖注入，不直接耦合其类型声明） */
export interface HljsLike {
  /** 按指定语言高亮，返回安全转义后的 HTML（含 hljs-* span） */
  highlight(
    code: string,
    options: { language: string; ignoreIllegals?: boolean },
  ): { value: string };
  /** 自动检测语言并高亮 */
  highlightAuto(code: string): { value: string; language?: string };
  /** 查询语言是否已注册（决定走 highlight 还是 highlightAuto） */
  getLanguage(name: string): unknown;
}

// 高亮结果缓存（LRU 上限 50）。虚拟列表重挂载 / 同段复现时不重高亮。
const htmlCache = new Map<string, string>();
const CACHE_MAX = 50;
const cacheGet = (key: string): string | undefined => {
  const hit = htmlCache.get(key);
  if (hit !== undefined) {
    htmlCache.delete(key);
    htmlCache.set(key, hit); // 刷新热度
  }
  return hit;
};
const cacheSet = (key: string, html: string) => {
  htmlCache.set(key, html);
  // LRU 淘汰：Map 迭代顺序即插入顺序，keys().next() 取最旧键；cacheGet 命中会把热键移到末尾。
  if (htmlCache.size > CACHE_MAX) htmlCache.delete(htmlCache.keys().next().value!);
};

/** 缓存键：lang 与 code 用空格连接。lang 取自 token.info 首段（已 trim 无空格），故分隔唯一无碰撞。 */
const cacheKey = (lang: string, code: string): string => `${lang} ${code}`;

/** 测试用：清空高亮缓存 */
export function __resetHighlightCache() {
  htmlCache.clear();
}

/**
 * 据注入的 highlight.js 实例产出通用 `fence` 渲染器。
 * 流式期（块未 committed）按纯代码块逐字展示；块固化后再同步高亮（避免逐帧重高亮、闪烁）。
 * 已注册语言走 `highlight(language)`，否则 `highlightAuto` 自动检测；高亮抛错则降级纯代码块。
 * hljs 输出已转义代码内容、仅注入自身 span，innerHTML 注入与 mermaid SVG 同信任级别。
 */
export function createHighlightRenderers(hljs: HljsLike): MarkdownRenderers {
  const CodeBlock = defineComponent({
    name: 'AixCodeBlock',
    props: {
      code: { type: String, required: true },
      lang: { type: String, default: '' },
      settled: { type: Boolean, required: true },
    },
    setup(props) {
      const html = ref<string | null>(null);
      watch(
        () => [props.code, props.lang, props.settled] as const,
        ([code, lang, settled]) => {
          // 未固化（流式中）：维持纯代码块，逐字可见、零高亮开销
          if (!settled) {
            html.value = null;
            return;
          }
          const key = cacheKey(lang, code);
          const hit = cacheGet(key);
          if (hit !== undefined) {
            html.value = hit;
            return;
          }
          try {
            const out =
              lang && hljs.getLanguage(lang)
                ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
                : hljs.highlightAuto(code).value;
            cacheSet(key, out);
            html.value = out;
          } catch {
            // 高亮失败（非法代码 / 语言加载异常）：维持纯代码块，不破坏整段渲染
            html.value = null;
          }
        },
        { immediate: true },
      );
      return () => {
        const langClass = props.lang ? `language-${props.lang}` : undefined;
        if (html.value !== null) {
          return h(
            'pre',
            { class: 'aix-md-code' },
            h('code', { class: ['hljs', langClass], innerHTML: html.value }),
          );
        }
        return h('pre', { class: 'aix-md-code' }, h('code', { class: langClass }, props.code));
      };
    },
  });

  return {
    fence: ({ token, info }) =>
      h(CodeBlock, {
        code: token.content,
        // 围栏语言取 info 首段（如 js 标记的代码块 → js）
        lang: token.info.trim().split(/\s+/)[0] ?? '',
        // committed 未注入（直接使用 walker）时按非流式即固化处理
        settled: info.committed ?? !info.streaming,
      }),
  };
}
