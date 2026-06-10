import { defineComponent, h, ref, watch } from 'vue';
import type { MarkdownRenderers } from './markdownWalker';

/** mermaid 库最小接口（v10/v11 兼容；依赖注入，不直接耦合其类型声明） */
export interface MermaidLike {
  initialize(config: Record<string, unknown>): void;
  parse(text: string): Promise<unknown>;
  render(id: string, text: string): Promise<{ svg: string }>;
}

// 渲染结果缓存：source → svg（LRU 上限 50）。虚拟列表重挂载 / 同图复现时不重渲染。
const svgCache = new Map<string, string>();
const CACHE_MAX = 50;
const cacheGet = (key: string): string | undefined => {
  const hit = svgCache.get(key);
  if (hit !== undefined) {
    svgCache.delete(key);
    svgCache.set(key, hit); // 刷新热度
  }
  return hit;
};
const cacheSet = (key: string, svg: string) => {
  svgCache.set(key, svg);
  // LRU 淘汰：Map 迭代顺序即插入顺序（ES2015 规范保证），keys().next() 取到最旧键；
  // cacheGet 命中时会 delete+set 把热键移到末尾，故此处淘汰的恒为最久未访问项。
  if (svgCache.size > CACHE_MAX) svgCache.delete(svgCache.keys().next().value!);
};

// mermaid.render 要求全局唯一 id
let renderSeq = 0;

/** 测试用：清空 SVG 缓存 */
export function __resetMermaidCache() {
  svgCache.clear();
}

/**
 * 据注入的 mermaid 实例产出 `fence:mermaid` 渲染器。
 * 流式期（块未 committed）按代码块逐字展示；块固化后 parse 校验 → 异步 SVG 替换
 * （形态切换的高度跳变由 MarkdownBlock 的 FLIP 过渡平滑）；
 * 校验/渲染失败维持代码块（--error 修饰类），不抛错不破坏整段渲染。
 */
export function createDiagramRenderers(mermaid: MermaidLike): MarkdownRenderers {
  // strict：节点标签经 mermaid 内部 sanitize，SVG 注入与 KaTeX 输出同信任级别
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });

  const MermaidBlock = defineComponent({
    name: 'AixMermaidBlock',
    props: {
      code: { type: String, required: true },
      settled: { type: Boolean, required: true },
    },
    setup(props) {
      const svg = ref<string | null>(null);
      const failed = ref(false);
      watch(
        () => [props.code, props.settled] as const,
        async ([code, settled], prev) => {
          // code 变更（如已出图后整段替换）：先复位旧 SVG 与失败态，按新代码重走渲染流程。
          // 流式 append-only 期间 settled=false、svg 恒为空，复位不产生任何重渲染回退。
          if (prev && code !== prev[0]) {
            svg.value = null;
            failed.value = false;
          }
          if (!settled || svg.value) return;
          const hit = cacheGet(code);
          if (hit !== undefined) {
            svg.value = hit;
            return;
          }
          try {
            await mermaid.parse(code);
            const { svg: out } = await mermaid.render(`aix-mermaid-${renderSeq++}`, code);
            if (code !== props.code) return; // 异步期间内容已变（防御）：丢弃过期结果
            cacheSet(code, out);
            svg.value = out;
          } catch {
            // 语法错误 / 渲染失败（含 jsdom 无布局）：维持代码块展示
            if (code === props.code) failed.value = true;
          }
        },
        { immediate: true },
      );
      return () => {
        if (svg.value) {
          return h('div', { class: 'aix-md-mermaid', innerHTML: svg.value });
        }
        return h(
          'pre',
          { class: ['aix-md-mermaid-source', failed.value && 'aix-md-mermaid-source--error'] },
          h('code', props.code),
        );
      };
    },
  });

  return {
    'fence:mermaid': ({ token, info }) =>
      h(MermaidBlock, {
        code: token.content,
        // committed 未注入（直接使用 walker）时按非流式即固化处理
        settled: info.committed ?? !info.streaming,
      }),
  };
}
