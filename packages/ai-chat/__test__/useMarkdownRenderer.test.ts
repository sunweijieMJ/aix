import { describe, it, expect, vi } from 'vitest';

vi.mock('markdown-it', () => ({
  default: class {
    render(src: string) {
      return `<p>${src}</p>`;
    }
  },
}));

import { loadMarkdownRenderer } from '../src/composables/useMarkdownRenderer';

describe('loadMarkdownRenderer', () => {
  it('依赖存在时返回渲染函数', async () => {
    const render = await loadMarkdownRenderer();
    expect(render).toBeTypeOf('function');
    expect(render!('hi')).toBe('<p>hi</p>');
  });
});
