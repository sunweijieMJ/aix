import { describe, it, expect, beforeEach, vi } from 'vitest';
// 模拟 highlight.js 未安装（import 抛错）。引擎应静默降级——
// 不注册代码高亮渲染器（fence 维持纯 pre>code）、不告警（与 katex/mermaid 缺失同级：可选增强、无显式开关）。
vi.mock('highlight.js', () => {
  throw new Error('Cannot find module highlight.js');
});
import {
  loadMarkdownEngine,
  __resetMarkdownEngineCache,
} from '../src/composables/useMarkdownRenderer';

describe('loadMarkdownEngine 降级（highlight.js 缺失）', () => {
  beforeEach(() => __resetMarkdownEngineCache());

  it('引擎可用、codeRenderers 为空、静默无告警', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = await loadMarkdownEngine();
    expect(engine).not.toBeNull();
    expect(engine!.codeRenderers).toEqual({});
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
