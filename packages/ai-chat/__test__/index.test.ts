import { describe, it, expect } from 'vitest';
import * as api from '../src/index';
import plugin from '../src/index';

describe('包入口', () => {
  it('导出组件（无 Aix 前缀）与 hooks', () => {
    for (const name of [
      'Bubble',
      'BubbleList',
      'Sender',
      'Welcome',
      'Prompts',
      'Thinking',
      'AiChat',
      'MarkdownRenderer',
    ]) {
      expect(api).toHaveProperty(name);
    }
    expect(api.useChat).toBeTypeOf('function');
  });
  it('default 是带 install 的插件', () => {
    expect(plugin.install).toBeTypeOf('function');
  });
});
