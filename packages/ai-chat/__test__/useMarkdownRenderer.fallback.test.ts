import { describe, it, expect, vi, beforeEach } from 'vitest';

// 模拟 markdown-it 未安装：import 时抛错，触发 loadMarkdownRenderer 的 catch 降级分支
vi.mock('markdown-it', () => {
  throw new Error('Cannot find module markdown-it');
});

import { loadMarkdownRenderer, __resetMarkdownCache } from '../src/composables/useMarkdownRenderer';

describe('loadMarkdownRenderer 降级路径', () => {
  beforeEach(() => __resetMarkdownCache());

  it('依赖缺失时返回 null 并控制台告警一次', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const render = await loadMarkdownRenderer();
    expect(render).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('降级结果被缓存：重复调用不再重复加载/告警', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await loadMarkdownRenderer();
    await loadMarkdownRenderer();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
