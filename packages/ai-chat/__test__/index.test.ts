import { describe, it, expect } from 'vitest';
import { createApp } from 'vue';
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

  // 锁定文档化命名决策（README「全局注册」章节）：install 以 Aix 前缀注册全部组件。
  // 防回归：前缀模板串或 components 映射被改坏时，现有测试不报、业务方全局注册解析失败才暴露。
  it('install 以 Aix 前缀全局注册全部 14 个组件', () => {
    const app = createApp({ render: () => null });
    app.use(plugin);
    const registered = app._context.components;
    for (const name of [
      'AiChat',
      'AttachmentCard',
      'Bubble',
      'BubbleActions',
      'BubbleList',
      'Conversations',
      'MarkdownRenderer',
      'ModelSelector',
      'Prompts',
      'Sender',
      'Skeleton',
      'Thinking',
      'ThoughtChain',
      'Welcome',
    ]) {
      expect(registered, `Aix${name} 未全局注册`).toHaveProperty(`Aix${name}`);
    }
  });
});
