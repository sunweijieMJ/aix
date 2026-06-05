import { normalizeMathDelimiters } from '../utils/markdown';

export type MarkdownRenderFn = (src: string) => string;

let cached: MarkdownRenderFn | null | undefined;

/** 动态加载 markdown-it；未安装则返回 null（调用方降级为纯文本） */
export async function loadMarkdownRenderer(): Promise<MarkdownRenderFn | null> {
  if (cached !== undefined) return cached;
  try {
    const mod = await import('markdown-it');
    const MarkdownIt = mod.default ?? mod;
    const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
    // 可选增强：加载 KaTeX 插件渲染数学公式（行内 $...$ / 块级 $$...$$）。
    // 未安装 katex / 插件时静默跳过——markdown 仍正常工作，仅公式降级为原样文本，
    // 与 markdown-it 缺失时的整体降级风格一致（零额外体积、按需启用）。
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
    // 启用 KaTeX 时先把 \[..\] / \(..\) 归一化为 $$..$$ / $..$（插件只认美元定界符），
    // 让 OpenAI 系常见的反斜杠括号公式也能渲染；未启用时原样渲染（公式降级为文本）。
    cached = (src: string) => md.render(katexEnabled ? normalizeMathDelimiters(src) : src);
  } catch {
    console.warn(
      '[ai-chat] 未安装 markdown-it，Markdown 渲染降级为纯文本。如需启用请安装 markdown-it。',
    );
    cached = null;
  }
  return cached;
}

/** 测试用：重置缓存 */
export function __resetMarkdownCache() {
  cached = undefined;
}
