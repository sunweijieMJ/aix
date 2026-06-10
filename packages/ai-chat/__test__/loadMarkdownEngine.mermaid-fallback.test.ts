import { describe, it, expect, beforeEach, vi } from 'vitest';
// 覆盖 setup.ts 的全局 mock：模拟 mermaid 未安装（import 抛错）。
// 引擎应静默降级——不注册图表渲染器、不告警（与 katex 缺失同级：可选增强、无显式开关）。
vi.mock('mermaid', () => {
  throw new Error('Cannot find module mermaid');
});
import {
  loadMarkdownEngine,
  __resetMarkdownEngineCache,
} from '../src/composables/useMarkdownRenderer';

describe('loadMarkdownEngine 降级（mermaid 缺失）', () => {
  beforeEach(() => __resetMarkdownEngineCache());

  it('引擎可用、diagramRenderers 为空、静默无告警', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = await loadMarkdownEngine();
    expect(engine).not.toBeNull();
    expect(engine!.diagramRenderers).toEqual({});
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
