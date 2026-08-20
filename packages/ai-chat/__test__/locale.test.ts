import { createLocale, LOCALE_INJECTION_KEY } from '@aix/hooks';
import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import AiChat from '../src/components/AiChat.vue';
import Bubble from '../src/components/Bubble.vue';
import Sender from '../src/components/Sender.vue';
import { provideAiChatLocaleMessages } from '../src/composables/useAiChatLocale';
import { locale } from '../src/locale';
import type { AiChatLocale } from '../src/locale';

describe('locale', () => {
  it('中英文 key 完全一致', () => {
    expect(Object.keys(locale['zh-CN']).sort()).toEqual(Object.keys(locale['en-US']).sort());
  });
  it('包含必要文案', () => {
    expect(locale['zh-CN'].senderPlaceholder).toBeTruthy();
    expect(locale['en-US'].sendButton).toBeTruthy();
    expect(locale['zh-CN'].deleteButton).toBeTruthy();
  });

  it('运行时切换 locale：Sender 占位符随 setLocale 更新为对应语言', async () => {
    const loc = createLocale('zh-CN');
    const w = mount(Sender, {
      global: { provide: { [LOCALE_INJECTION_KEY]: loc.localeContext } },
    });
    expect(w.find('textarea').attributes('placeholder')).toBe('输入消息…');
    loc.localeContext.setLocale('en-US');
    await nextTick();
    expect(w.find('textarea').attributes('placeholder')).toBe('Type a message…');
  });

  it('运行时切换 locale：Bubble 错误态重试按钮文案随之更新', async () => {
    const loc = createLocale('zh-CN');
    const w = mount(Bubble, {
      props: { status: 'error' },
      global: { provide: { [LOCALE_INJECTION_KEY]: loc.localeContext } },
    });
    expect(w.find('.aix-bubble__retry').text()).toBe('重试');
    loc.localeContext.setLocale('en-US');
    await nextTick();
    expect(w.find('.aix-bubble__retry').text()).toBe('Retry');
  });
});

describe('文案覆盖（messages / localeMessages）', () => {
  it('应用级覆盖：createLocale messages 只改覆盖的 key，其余回退内置', () => {
    const loc = createLocale('zh-CN', {
      messages: { 'ai-chat': { 'zh-CN': { senderPlaceholder: '问问小助手…' } } },
    });
    const w = mount(Sender, {
      global: { provide: { [LOCALE_INJECTION_KEY]: loc.localeContext } },
    });
    expect(w.find('textarea').attributes('placeholder')).toBe('问问小助手…');
    // 未覆盖的 key 仍是内置文案
    expect(w.find('[aria-label="发送"]').exists()).toBe(true);
  });

  it('应用级覆盖只作用于对应语言，切语言后不泄漏', async () => {
    const loc = createLocale('zh-CN', {
      messages: { 'ai-chat': { 'zh-CN': { senderPlaceholder: '问问小助手…' } } },
    });
    const w = mount(Sender, {
      global: { provide: { [LOCALE_INJECTION_KEY]: loc.localeContext } },
    });
    loc.localeContext.setLocale('en-US');
    await nextTick();
    expect(w.find('textarea').attributes('placeholder')).toBe('Type a message…');
  });

  it('mergeMessages 运行时合入（异步拉文案场景），已挂载组件即时生效', async () => {
    const loc = createLocale('zh-CN');
    const w = mount(Sender, {
      global: { provide: { [LOCALE_INJECTION_KEY]: loc.localeContext } },
    });
    expect(w.find('textarea').attributes('placeholder')).toBe('输入消息…');
    loc.localeContext.mergeMessages({ 'ai-chat': { 'zh-CN': { senderPlaceholder: '来问吧' } } });
    await nextTick();
    expect(w.find('textarea').attributes('placeholder')).toBe('来问吧');
  });

  it('provideAiChatLocaleMessages：独立使用导出子组件时可从上层注入覆盖', () => {
    const messages = ref<Partial<AiChatLocale>>({ senderPlaceholder: '独立 Sender 覆盖' });
    const Host = defineComponent({
      setup() {
        provideAiChatLocaleMessages(messages);
        return () => h(Sender);
      },
    });
    const w = mount(Host);
    expect(w.find('textarea').attributes('placeholder')).toBe('独立 Sender 覆盖');
  });

  it('AiChat localeMessages prop：透传给内部子组件，且随 prop 变化响应式更新', async () => {
    const request = vi.fn(async () => new ReadableStream<Uint8Array>({ start: (c) => c.close() }));
    const w = mount(AiChat, {
      props: { request, localeMessages: { senderPlaceholder: '实例级覆盖' } },
    });
    expect(w.find('textarea').attributes('placeholder')).toBe('实例级覆盖');

    await w.setProps({ localeMessages: { senderPlaceholder: '改了' } });
    expect(w.find('textarea').attributes('placeholder')).toBe('改了');

    // 清掉后回退内置文案
    await w.setProps({ localeMessages: undefined });
    expect(w.find('textarea').attributes('placeholder')).toBe('输入消息…');
  });

  it('优先级：实例级 localeMessages > 应用级 messages > 内置', async () => {
    const loc = createLocale('zh-CN', {
      messages: {
        'ai-chat': { 'zh-CN': { senderPlaceholder: '应用级', sendButton: '发问' } },
      },
    });
    const request = vi.fn(async () => new ReadableStream<Uint8Array>({ start: (c) => c.close() }));
    const w = mount(AiChat, {
      props: { request, localeMessages: { senderPlaceholder: '实例级' } },
      global: { provide: { [LOCALE_INJECTION_KEY]: loc.localeContext } },
    });
    // 同一 key：实例级盖过应用级
    expect(w.find('textarea').attributes('placeholder')).toBe('实例级');
    // 实例级未覆盖的 key 吃到应用级（发送按钮 aria-label = t.sendButton）
    expect(w.find('[aria-label="发问"]').exists()).toBe(true);
  });
});
