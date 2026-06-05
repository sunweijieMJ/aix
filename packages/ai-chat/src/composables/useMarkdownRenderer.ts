import { createMathRenderers, type KatexLike } from '../utils/mathRenderers';
import { createHtmlRenderers, type DomPurifyLike } from '../utils/htmlRenderers';
import { createDiagramRenderers, type MermaidLike } from '../utils/diagramRenderers';
import type { MarkdownRenderers, MdToken } from '../utils/markdownWalker';

/**
 * 内部共享：动态加载 markdown-it 并尽力挂载 KaTeX 插件。
 * 可选增强：KaTeX 插件渲染数学公式（行内 $...$ / 块级 $$...$$）。
 * 未安装 katex 插件时静默跳过——markdown 仍正常工作，仅公式降级为原样文本，
 * 与 markdown-it 缺失时的整体降级风格一致（零额外体积、按需启用）。
 * markdown-it 本身缺失时抛错，由调用方降级。
 */
async function createMarkdownIt(html: boolean) {
  const mod = await import('markdown-it');
  const MarkdownIt = mod.default ?? mod;
  const md = new MarkdownIt({ html, linkify: true, breaks: true });
  let katexEnabled = false;
  try {
    const katexMod = await import('@vscode/markdown-it-katex');
    // CJS/ESM 互操作：实际插件函数可能位于 default.default（类型声明不保证嵌套 default，故经 unknown 收窄）
    const interop = katexMod as unknown as { default?: { default?: unknown } };
    const katexPlugin = interop.default?.default ?? katexMod.default ?? katexMod;
    // throwOnError:false：残缺/非法公式（含流式中途）渲染为提示而非抛错，避免整段渲染中断
    md.use(katexPlugin as Parameters<typeof md.use>[0], { throwOnError: false });
    katexEnabled = true;
  } catch {
    // katex 插件不可用：保留纯 markdown 能力，不影响其它渲染
  }
  return { md, katexEnabled };
}

/**
 * 流式 markdown 渲染引擎：暴露 token→VNode walker 所需的 markdown-it 解析能力 + 数学渲染器。
 * 只返回"零件"，由 MarkdownRenderer 装配。
 */
export interface MarkdownEngine {
  /** markdown-it 解析能力（供 splitMarkdownBlocks 与按块取 token） */
  md: { parse(src: string, env: unknown): MdToken[] };
  /** 数学渲染器（katex 可用时含 math_inline/math_block，否则为空 → 公式降级为文本） */
  mathRenderers: MarkdownRenderers;
  /** 原始 HTML 渲染器（allowHtml 且 dompurify 可用时含 html_block，否则为空 → 裸 HTML 转义为文本） */
  htmlRenderers: MarkdownRenderers;
  /** 图表渲染器（mermaid 可用时含 fence:mermaid，否则为空 → mermaid 围栏维持代码块） */
  diagramRenderers: MarkdownRenderers;
}

// 按 allowHtml 分别缓存（html:true/false 解析行为不同，不可混用同一实例）
const engineCache = new Map<boolean, MarkdownEngine | null>();

/**
 * 动态装配 markdown 引擎；未安装 markdown-it 返回 null（调用方降级纯文本）。
 * @param allowHtml 是否允许原始 HTML（启用 markdown-it html:true 并经 DOMPurify 消毒），默认 false
 */
export async function loadMarkdownEngine(allowHtml = false): Promise<MarkdownEngine | null> {
  const cached = engineCache.get(allowHtml);
  if (cached !== undefined) return cached;
  let engine: MarkdownEngine | null;
  try {
    const { md, katexEnabled } = await createMarkdownIt(allowHtml);
    let mathRenderers: MarkdownRenderers = {};
    if (katexEnabled) {
      try {
        const katexLib = await import('katex');
        const katex = (katexLib.default ?? katexLib) as unknown as KatexLike;
        mathRenderers = createMathRenderers(katex);
        // 自动注入 KaTeX 样式（副作用式 import）：装了 katex 即获得正确排版，无需手动引入。
        // 打包器不支持 CSS import / SSR 等场景失败时忽略——回退为手动 `import 'katex/dist/katex.min.css'`。
        try {
          await import('katex/dist/katex.min.css');
        } catch {
          // CSS 自动注入失败：请在应用入口手动引入 katex/dist/katex.min.css
        }
      } catch {
        // 插件已挂载但 katex 库不可用：math token 无渲染器 → walker 兜底降级为文本
      }
    }
    let htmlRenderers: MarkdownRenderers = {};
    if (allowHtml) {
      try {
        const purifyMod = await import('dompurify');
        const purify = (purifyMod.default ?? purifyMod) as unknown as DomPurifyLike;
        htmlRenderers = createHtmlRenderers(purify);
      } catch {
        // 安全兜底：allowHtml 但无 dompurify → 不提供 html 渲染器，裸 HTML 经 walker 兜底转义为文本
        console.warn(
          '[ai-chat] allowHtml 需要 dompurify，未安装 → 原始 HTML 降级为转义文本。如需启用请安装 dompurify。',
        );
      }
    }
    let diagramRenderers: MarkdownRenderers = {};
    try {
      const mermaidMod = await import('mermaid');
      const mermaid = (mermaidMod.default ?? mermaidMod) as unknown as MermaidLike;
      diagramRenderers = createDiagramRenderers(mermaid);
    } catch {
      // 未安装 mermaid：```mermaid 围栏维持默认代码块（本身即合理展示），与 katex 缺失同样静默
    }
    engine = {
      md: md as unknown as MarkdownEngine['md'],
      mathRenderers,
      htmlRenderers,
      diagramRenderers,
    };
  } catch {
    console.warn(
      '[ai-chat] 未安装 markdown-it，Markdown 渲染降级为纯文本。如需启用请安装 markdown-it。',
    );
    engine = null;
  }
  engineCache.set(allowHtml, engine);
  return engine;
}

/** 测试用：重置引擎缓存 */
export function __resetMarkdownEngineCache() {
  engineCache.clear();
}
