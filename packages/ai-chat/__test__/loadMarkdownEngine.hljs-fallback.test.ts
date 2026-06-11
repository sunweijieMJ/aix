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
    // 时序调整说明：hljs 改为后台增量合入，须等全部增强 settle（engine.ready）后再断言
    // 「降级为空」——否则装配中途 codeRenderers 必然为空，断言空洞。降级契约本身不变。
    await engine!.ready;
    expect(engine!.codeRenderers).toEqual({});
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
