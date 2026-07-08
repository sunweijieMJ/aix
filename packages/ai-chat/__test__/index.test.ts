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
      'TriggerMenu',
      'Suggestions',
    ]) {
      expect(api).toHaveProperty(name);
    }
    expect(api.useChat).toBeTypeOf('function');
    expect(api.useTriggerDetect).toBeTypeOf('function');
    expect(api.detectTrigger).toBeTypeOf('function');
    expect(api.resolvePosition).toBeTypeOf('function');
    expect(api.getCaretRect).toBeTypeOf('function');
    expect(api.normalizeSuggestions).toBeTypeOf('function');
  });
  it('default 是带 install 的插件', () => {
    expect(plugin.install).toBeTypeOf('function');
  });

  // 锁定文档化命名决策（README「全局注册」章节）：install 以 Aix 前缀注册全部组件。
  // 防回归：前缀模板串或 components 映射被改坏时，现有测试不报、业务方全局注册解析失败才暴露。
  // 断言清单须与 src/index.ts 的 components 映射逐一对齐（当前 20 个），新增/移除组件时同步改这里，
  // 不再硬编码标题数字，避免清单漂移而标题未跟着变。
  it('install 以 Aix 前缀全局注册全部组件', () => {
    const app = createApp({ render: () => null });
    app.use(plugin);
    const registered = app._context.components;
    const names = [
      'AiChat',
      'AttachmentCard',
      'Bubble',
      'BubbleActions',
      'BubbleList',
      'Conversations',
      'LoadingDots',
      'MarkdownRenderer',
      'ModelSelector',
      'Prompts',
      'QuoteChip',
      'QuoteMenu',
      'Sender',
      'SenderSkeleton',
      'Skeleton',
      'Thinking',
      'ThoughtChain',
      'Welcome',
      'TriggerMenu',
      'Suggestions',
    ];
    expect(names).toHaveLength(20); // 与 src/index.ts 的 components 映射条目数一致，防少加/多加
    for (const name of names) {
      expect(registered, `Aix${name} 未全局注册`).toHaveProperty(`Aix${name}`);
    }
  });
});
