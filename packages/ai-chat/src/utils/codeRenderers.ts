import { useLocale } from '@aix/hooks';
import { Copy, Check } from '@aix/icons';
import { defineComponent, h, ref, watch, onScopeDispose } from 'vue';
import { locale } from '../locale';
import { copyText } from './clipboard';
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
 * 固化后在代码块顶部渲染头部条：左侧语言标签 + 右侧一键复制按钮（复制原始代码）。
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
      const { t } = useLocale(locale);

      // 复制态：成功复制后短暂显示「已复制」，1.5s 后复位（与 BubbleActions 一致）
      const copied = ref(false);
      let copyTimer: ReturnType<typeof setTimeout> | null = null;
      const onCopy = async () => {
        // copyText 内含 Clipboard API + execCommand 兜底（兼容 HTTP / 旧浏览器）；两者皆失败则不给反馈
        if (!(await copyText(props.code))) return;
        copied.value = true;
        if (copyTimer) clearTimeout(copyTimer);
        copyTimer = setTimeout(() => {
          copied.value = false;
        }, 1500);
      };
      onScopeDispose(() => {
        if (copyTimer) clearTimeout(copyTimer);
      });

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
        const codeNode =
          html.value !== null
            ? h('code', { class: ['hljs', langClass], innerHTML: html.value })
            : h('code', { class: langClass }, props.code);
        const pre = h('pre', { class: 'aix-md-code' }, codeNode);

        // 头部：有语言名 或 已固化（可复制）时显示；流式且无语言时维持纯代码块外观
        if (!props.lang && !props.settled) return pre;

        const label = copied.value ? t.value.copiedButton : t.value.copyButton;
        const header = h('div', { class: 'aix-md-codeblock__header' }, [
          h('span', { class: 'aix-md-codeblock__lang' }, props.lang || ''),
          // 复制按钮仅在固化后出现，避免复制到半截流式代码
          props.settled
            ? h(
                'button',
                {
                  type: 'button',
                  class: 'aix-md-codeblock__copy',
                  'aria-label': label,
                  title: label,
                  onClick: onCopy,
                },
                [h(copied.value ? Check : Copy), h('span', label)],
              )
            : null,
        ]);
        return h('div', { class: 'aix-md-codeblock' }, [header, pre]);
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
