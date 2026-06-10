import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// 模拟 dompurify 未安装：import 时抛错，触发 loadMarkdownEngine 的安全兜底分支——
// allowHtml=true 时不提供 html 渲染器（裸 HTML 经 walker 兜底转义为文本）并告警。
// markdown-it / katex 不 mock，仍真实加载，验证降级仅影响 html 渲染能力。
vi.mock('dompurify', () => {
  throw new Error('Cannot find module dompurify');
});
import {
  loadMarkdownEngine,
  __resetMarkdownEngineCache,
} from '../src/composables/useMarkdownRenderer';

describe('dompurify 缺失时 allowHtml 引擎的降级', () => {
  beforeEach(() => __resetMarkdownEngineCache());
  afterEach(() => vi.restoreAllMocks());

  it('allowHtml=true：引擎仍可用且 markdown 解析正常，但不提供 html 渲染器并告警', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = await loadMarkdownEngine(true);
    expect(engine).not.toBeNull();
    // 安全兜底：无 dompurify → htmlRenderers 为空，裸 HTML 交由 walker 转义为文本
    expect(engine!.htmlRenderers).toEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('dompurify'));
    // markdown 解析能力不受影响
    const tokens = engine!.md.parse('# 标题', {});
    expect(tokens.some((t) => t.type === 'heading_open')).toBe(true);
  });

  it('allowHtml=false：不触达 dompurify，无告警', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = await loadMarkdownEngine(false);
    expect(engine).not.toBeNull();
    expect(engine!.htmlRenderers).toEqual({});
    expect(warn).not.toHaveBeenCalled();
  });
});
