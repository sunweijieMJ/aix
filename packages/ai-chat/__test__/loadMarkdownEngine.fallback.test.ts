import { describe, it, expect, beforeEach, vi } from 'vitest';
// 模拟 markdown-it 未安装：import 抛错 → loadMarkdownEngine 应返回 null 并告警一次
vi.mock('markdown-it', () => {
  throw new Error('Cannot find module markdown-it');
});
import {
  loadMarkdownEngine,
  __resetMarkdownEngineCache,
} from '../src/composables/useMarkdownRenderer';

describe('loadMarkdownEngine 降级（markdown-it 缺失）', () => {
  beforeEach(() => __resetMarkdownEngineCache());

  it('返回 null 并控制台告警一次', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await loadMarkdownEngine()).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
