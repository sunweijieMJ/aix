import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createLocale, LOCALE_INJECTION_KEY } from '@aix/hooks';
import { locale } from '../src/locale';
import Sender from '../src/components/Sender.vue';
import Bubble from '../src/components/Bubble.vue';

describe('locale', () => {
  it('中英文 key 完全一致', () => {
    expect(Object.keys(locale['zh-CN']).sort()).toEqual(Object.keys(locale['en-US']).sort());
  });
  it('包含必要文案', () => {
    expect(locale['zh-CN'].senderPlaceholder).toBeTruthy();
    expect(locale['en-US'].sendButton).toBeTruthy();
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
