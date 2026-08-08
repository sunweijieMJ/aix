import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { h, nextTick } from 'vue';
import AiChat from '../src/components/AiChat.vue';
import AttachmentsPanel from '../src/components/AttachmentsPanel.vue';
import Bubble from '../src/components/Bubble.vue';
import Sender from '../src/components/Sender.vue';
import { createMessageTree, ROOT_ID } from '../src/composables/messageTree';
import type { ChatMessage } from '../src/types';
import { defineBlockRenderer } from '../src/utils/defineBlockRenderer';
import { resolveIcon } from '../src/utils/resolveIcon';

vi.mock('virtua/vue', () => ({
  Virtualizer: {
    name: 'Virtualizer',
    props: ['data', 'keepMounted'],
    setup(
      props: { data: unknown[] },
      { slots }: { slots: Record<string, (p: unknown) => unknown> },
    ) {
      return () => props.data.map((item, i) => slots.default?.({ item, index: i }));
    },
  },
}));

/** 永不 resolve 的 request：只为让 AiChat 挂得起来，这些用例不关心流本身 */
const idleRequest = () => new Promise<Response>(() => {});

// ==================== 1.2 errorText ====================
describe('errorText（批次1）', () => {
  it('不传时回退 i18n 兜底文案：默认不把 extra.error 直出给终端用户', () => {
    const w = mount(Bubble, { props: { status: 'error', content: [] } });
    expect(w.find('.aix-bubble__error-text').text()).toBe('出错了，请重试');
  });

  it('传入时展示业务解析后的文案', () => {
    const w = mount(Bubble, {
      props: { status: 'error', content: [], errorText: '登录已过期，请重新登录' },
    });
    expect(w.find('.aix-bubble__error-text').text()).toBe('登录已过期，请重新登录');
  });

  it('AiChat 的 errorText 仅对出错态消息调用（避免流式期逐帧空跑业务解析器）', async () => {
    const seen: string[] = [];
    const messages: ChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        status: 'success',
        content: [{ id: 'b1', type: 'text', text: 'hi' }],
      },
      { id: 'a1', role: 'ai', status: 'error', content: [], extra: { error: new Error('限流了') } },
    ];
    mount(AiChat, {
      props: {
        request: idleRequest,
        messages,
        errorText: (m: ChatMessage) => {
          seen.push(m.id);
          return (m.extra?.error as Error)?.message ?? '';
        },
      },
    });
    await nextTick();
    expect(seen).toEqual(['a1']);
  });
});

// ==================== 1.3 createdAt ====================
describe('createdAt（批次1）', () => {
  it('入树时自动补写', () => {
    const tree = createMessageTree();
    tree.appendMessage(ROOT_ID, { id: 'm1', role: 'user', content: [] });
    expect(typeof tree.getMessage('m1')!.createdAt).toBe('number');
  });

  it('已有值保留：导入历史不会把真实时间压成「本次加载时刻」', () => {
    const past = Date.parse('2024-01-01T00:00:00Z');
    const tree = createMessageTree();
    tree.importFlat([
      { id: 'h1', role: 'user', content: [], createdAt: past },
      { id: 'h2', role: 'ai', content: [] },
    ]);
    expect(tree.getMessage('h1')!.createdAt).toBe(past);
    // 缺失的那条才补，且补的是「现在」
    expect(tree.getMessage('h2')!.createdAt).toBeGreaterThan(past);
  });
});

// ==================== 1.4 abort 空内容占位 ====================
describe('abort 空消息占位（批次1）', () => {
  it('中断且一个内容块都没有时给出占位，避免纯空白气泡', () => {
    const w = mount(Bubble, { props: { status: 'abort', content: [] } });
    expect(w.find('.aix-bubble__aborted').text()).toBe('已停止生成');
  });

  it('停在思考阶段（已有 reasoning 块）不算空气泡，不叠占位', () => {
    const w = mount(Bubble, {
      props: { status: 'abort', content: [{ id: 'r1', type: 'reasoning', text: '想一下' }] },
    });
    expect(w.find('.aix-bubble__aborted').exists()).toBe(false);
  });

  it('非 abort 态不出占位（回归）', () => {
    const w = mount(Bubble, { props: { status: 'success', content: [] } });
    expect(w.find('.aix-bubble__aborted').exists()).toBe(false);
  });
});

// ==================== 2.1 welcome 配置透传 ====================
describe('welcome 配置透传（批次2）', () => {
  it('align / fillHeight 落到 Welcome 的修饰类上（此前从 AiChat 根本触达不到）', () => {
    const w = mount(AiChat, {
      props: {
        request: idleRequest,
        welcome: { title: '你好', align: 'start', fillHeight: false },
      },
    });
    expect(w.find('.aix-welcome--start').exists()).toBe(true);
    expect(w.find('.aix-welcome.is-fill-height').exists()).toBe(false);
    expect(w.find('.aix-welcome__title').text()).toBe('你好');
  });

  it('不传 welcome 时保持默认居中 + 撑满（既有接入方行为不变）', () => {
    const w = mount(AiChat, { props: { request: idleRequest, welcomeTitle: 'hi' } });
    expect(w.find('.aix-welcome--center').exists()).toBe(true);
    expect(w.find('.aix-welcome.is-fill-height').exists()).toBe(true);
  });

  it('welcome.title 优先于扁平的 welcomeTitle', () => {
    const w = mount(AiChat, {
      props: { request: idleRequest, welcomeTitle: '旧', welcome: { title: '新' } },
    });
    expect(w.find('.aix-welcome__title').text()).toBe('新');
  });
});

// ==================== 2.2 Sender 周边区域插槽 ====================
describe('Sender 周边插槽（批次2）', () => {
  it('sender-before / bottom 渲染在 Sender 盒外', () => {
    const w = mount(AiChat, {
      props: { request: idleRequest },
      slots: {
        'sender-before': () => h('i', { class: 'ip' }),
        bottom: () => h('p', { class: 'disclaimer' }, '内容由 AI 生成'),
      },
    });
    expect(w.find('.aix-ai-chat__sender-before .ip').exists()).toBe(true);
    expect(w.find('.aix-ai-chat__bottom .disclaimer').text()).toBe('内容由 AI 生成');
    // 关键：不能落进 Sender 内部（那正是它们区别于 sender-header/footer 的理由）
    expect(w.find('.aix-sender .ip').exists()).toBe(false);
    expect(w.find('.aix-sender .disclaimer').exists()).toBe(false);
  });

  it('sender-header / sender-footer 落进 Sender 盒内对应区域', () => {
    const w = mount(AiChat, {
      props: { request: idleRequest },
      slots: {
        'sender-header': () => h('span', { class: 'ctx-chip' }),
        'sender-footer': () => h('span', { class: 'counter' }),
      },
    });
    expect(w.find('.aix-sender__header .ctx-chip').exists()).toBe(true);
    expect(w.find('.aix-sender__footer .counter').exists()).toBe(true);
  });

  it('四个插槽都不会被当块插槽下传到气泡里（保留插槽登记回归）', () => {
    const messages: ChatMessage[] = [
      { id: 'a1', role: 'ai', status: 'success', content: [{ id: 'b1', type: 'text', text: 'x' }] },
    ];
    const w = mount(AiChat, {
      props: { request: idleRequest, messages },
      slots: {
        bottom: () => h('p', { class: 'disclaimer' }),
        'sender-before': () => h('i', { class: 'ip' }),
      },
    });
    expect(w.findAll('.disclaimer')).toHaveLength(1);
    expect(w.findAll('.ip')).toHaveLength(1);
    expect(w.find('.aix-bubble .disclaimer').exists()).toBe(false);
  });
});

// ==================== 2.4 row-before 行级插槽 ====================
describe('row-before 行级插槽（批次2）', () => {
  it('渲染在气泡之外，作用域给出 item / index / prev', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', status: 'success', content: [], createdAt: 1000 },
      { id: 'a1', role: 'ai', status: 'success', content: [], createdAt: 2000 },
    ];
    const seen: Array<[string, number, string | undefined]> = [];
    const w = mount(AiChat, {
      props: { request: idleRequest, messages },
      slots: {
        'row-before': (sp: { item: ChatMessage; index: number; prev?: ChatMessage }) => {
          seen.push([sp.item.id, sp.index, sp.prev?.id]);
          return h('time', { class: 'ts' }, String(sp.item.createdAt));
        },
      },
    });
    expect(seen).toEqual([
      ['u1', 0, undefined],
      ['a1', 1, 'u1'],
    ]);
    expect(w.findAll('.aix-bubble-list__row-before .ts')).toHaveLength(2);
    // 关键：在气泡之外，不受气泡自身左右对齐的约束
    expect(w.find('.aix-bubble .ts').exists()).toBe(false);
  });

  it('不提供时不产生任何额外节点（回归）', () => {
    const messages: ChatMessage[] = [{ id: 'u1', role: 'user', status: 'success', content: [] }];
    const w = mount(AiChat, { props: { request: idleRequest, messages } });
    expect(w.find('.aix-bubble-list__row-before').exists()).toBe(false);
  });
});

// ==================== 4.1 defineBlockRenderer ====================
describe('defineBlockRenderer（批次4）', () => {
  it('自动声明契约 props：渲染函数拿得到 block（手写时漏声明则恒为 undefined）', () => {
    const Custom = defineBlockRenderer((p) =>
      h('div', { class: 'res' }, String((p.block as unknown as { text: string }).text)),
    );
    const w = mount(Bubble, {
      props: {
        content: [{ id: 'b1', type: 'text', text: '命中' }],
        blockRenderers: { text: Custom },
      },
    });
    expect(w.find('.res').text()).toBe('命中');
  });

  it('关闭属性继承：注册表注入的 info / typing 不会糊成根元素上的无效 DOM 属性', () => {
    const Probe = defineBlockRenderer(() => h('div', { class: 'probe' }));
    const w = mount(Bubble, {
      props: {
        content: [{ id: 'b1', type: 'text', text: 'x' }],
        blockRenderers: { text: Probe },
        status: 'success',
      },
    });
    const el = w.find('.probe').element;
    expect(el.getAttribute('info')).toBeNull();
    expect(el.getAttribute('typing')).toBeNull();
  });
});

// ==================== 4.2 icons 接受组件或图片地址 ====================
describe('icons 接受组件或图片地址（批次4）', () => {
  it('同一地址复用同一组件：避免 <component :is> 每帧认作新组件而重挂', () => {
    const fallback = { render: () => h('svg') };
    expect(resolveIcon('/i/send.svg', fallback)).toBe(resolveIcon('/i/send.svg', fallback));
  });

  it('空值回退内置图标', () => {
    const fallback = { render: () => h('svg') };
    expect(resolveIcon(undefined, fallback)).toBe(fallback);
  });

  it('传 URL 时渲染 img，按钮 a11y 文案不变', () => {
    const w = mount(Sender, {
      props: {
        attachments: { upload: vi.fn(async (f: File) => ({ name: f.name, url: '/x' })) },
        icons: { attach: '/i/clip.png' },
      },
    });
    const img = w.find('.aix-sender__attach-btn img');
    expect(img.attributes('src')).toBe('/i/clip.png');
    // 图标是纯装饰，可及名只应来自按钮的 aria-label
    expect(img.attributes('alt')).toBe('');
    expect(img.attributes('aria-hidden')).toBe('true');
    expect(w.find('[aria-label="添加附件"]').exists()).toBe(true);
  });

  it('传组件时行为不变（回归）', () => {
    const w = mount(Sender, {
      props: { icons: { send: { render: () => h('svg', { class: 'c' }) } } },
    });
    expect(w.find('svg.c').exists()).toBe(true);
  });
});

// ==================== 4.4 附件面板 placeholder 子插槽 ====================
describe('attachments-placeholder 子插槽（批次4）', () => {
  const doneItem = {
    id: 'f1',
    name: 'a.png',
    status: 'done',
    progress: 100,
    file: new File([''], 'a.png'),
  };

  it('只替换占位区，面板其余部分（列表 / 收起按钮）保留', () => {
    const w = mount(AttachmentsPanel, {
      props: { items: [doneItem] as never },
      slots: { placeholder: () => h('button', { class: 'my-upload' }, '选文件') },
    });
    expect(w.find('.my-upload').exists()).toBe(true);
    expect(w.find('.aix-attachments-panel__placeholder').exists()).toBe(false);
    expect(w.find('.aix-attachments-panel__list').exists()).toBe(true);
    expect(w.find('.aix-attachments-panel__close').exists()).toBe(true);
  });

  it('作用域给出 pick / dragIn，自定义 UI 能触发文件选择', async () => {
    const w = mount(AttachmentsPanel, {
      props: { items: [] },
      slots: {
        placeholder: (sp: { pick: () => void; dragIn: boolean }) =>
          h('button', { class: 'my-upload', onClick: sp.pick }, String(sp.dragIn)),
      },
    });
    expect(w.find('.my-upload').text()).toBe('false');
    await w.find('.my-upload').trigger('click');
    expect(w.emitted('pick')).toHaveLength(1);
  });

  it('不提供插槽时用内置三段式占位（回归）', () => {
    const w = mount(AttachmentsPanel, { props: { items: [] } });
    expect(w.find('.aix-attachments-panel__placeholder-title').exists()).toBe(true);
  });
});
