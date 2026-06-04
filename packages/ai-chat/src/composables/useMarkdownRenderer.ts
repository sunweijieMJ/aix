export type MarkdownRenderFn = (src: string) => string;

let cached: MarkdownRenderFn | null | undefined;

/** 动态加载 markdown-it；未安装则返回 null（调用方降级为纯文本） */
export async function loadMarkdownRenderer(): Promise<MarkdownRenderFn | null> {
  if (cached !== undefined) return cached;
  try {
    const mod = await import('markdown-it');
    const MarkdownIt = mod.default ?? mod;
    const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
    cached = (src: string) => md.render(src);
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
