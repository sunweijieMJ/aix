import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadMarkdownEngine,
  __resetMarkdownEngineCache,
} from '../src/composables/useMarkdownRenderer';

// mermaid 由 __test__/setup.ts 全局 mock 提供（轻量假实现）
describe('loadMarkdownEngine（mermaid 可用）', () => {
  beforeEach(() => __resetMarkdownEngineCache());

  it('装配 fence:mermaid 图表渲染器', async () => {
    const engine = await loadMarkdownEngine();
    expect(engine).not.toBeNull();
    expect(engine!.diagramRenderers['fence:mermaid']).toBeTypeOf('function');
  });
});
