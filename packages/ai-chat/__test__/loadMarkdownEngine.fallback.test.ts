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

  // 回归：失败结果（resolve null 的 Promise）被 engineCache 永久缓存——发版 stale chunk
  // 404 / 弱网抖动一次，整页 markdown 永久降级纯文本直到刷新。失败不缓存，后续调用可重试
  //（本用例 import 持续失败，以「每次调用都重新装配并各告警一次」证明缓存已被清除）
  it('失败结果不缓存：再次调用重新尝试装配（告警随重试再次出现）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await loadMarkdownEngine()).toBeNull();
    expect(await loadMarkdownEngine()).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
