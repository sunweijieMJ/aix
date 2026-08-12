import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { h, nextTick } from 'vue';
import AiChat from '../src/components/AiChat.vue';
import Sender from '../src/components/Sender.vue';
import type { SenderSlotScope, SenderAttachmentsSlotScope } from '../src/components/Sender.vue';
import { useAttachments } from '../src/composables/useAttachments';
import type { VoiceRecognizer, VoiceRecognizerCtx } from '../src/types';

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

const instantUpload = vi.fn(async (f: File) => ({ name: f.name, url: `/f/${f.name}` }));

const fakeRecognizer = () => {
  let ctx: VoiceRecognizerCtx | null = null;
  const recognizer: VoiceRecognizer = (c) => {
    ctx = c;
    return { stop: () => ctx?.onEnd() };
  };
  return recognizer;
};

/** 用可识别 class 的桩组件区分「自定义图标」与内置图标 */
const StubIcon = (cls: string) => ({ render: () => h('svg', { class: cls }) });

/** 捕获 #toolbar 作用域，供命令式断言 */
function mountWithScope(props: Record<string, unknown> = {}) {
  let scope!: SenderSlotScope;
  const w = mount(Sender, {
    props,
    slots: {
      toolbar: (s: SenderSlotScope) => {
        scope = s;
        return h('span', { class: 'probe' });
      },
    },
  });
  return { w, getScope: () => scope };
}

// ============ A：自定义按钮完整替代内置项所需的动作与状态 ============

describe('Sender — slotScope 的附件 / 语音出口（A）', () => {
  it('未启用附件 / 语音时，状态字段如实反映，动作为安全空操作', async () => {
    const { w, getScope } = mountWithScope();
    expect(getScope().attachmentsEnabled).toBe(false);
    expect(getScope().voiceSupported).toBe(false);
    expect(getScope().attachmentCount).toBe(0);
    expect(getScope().attachmentsOpen).toBe(false);

    // 不抛错、也不会凭空开出面板
    getScope().toggleAttachments();
    getScope().toggleVoice();
    await nextTick();
    expect(w.find('.aix-attachments-panel').exists()).toBe(false);
    expect(getScope().attachmentsOpen).toBe(false);
  });

  it('toggleAttachments 真的开合附件面板，且 attachmentsOpen 同步', async () => {
    const { w, getScope } = mountWithScope({ attachments: { upload: instantUpload } });
    expect(getScope().attachmentsEnabled).toBe(true);
    expect(getScope().attachmentsOpen).toBe(false);

    getScope().toggleAttachments();
    await nextTick();
    expect(w.find('.aix-attachments-panel').exists()).toBe(true);
    expect(getScope().attachmentsOpen).toBe(true);

    getScope().toggleAttachments();
    await nextTick();
    expect(getScope().attachmentsOpen).toBe(false);
  });

  it('toggleVoice 真的起停聆听，recording 同步', async () => {
    const { getScope } = mountWithScope({ voice: { recognizer: fakeRecognizer() } });
    expect(getScope().voiceSupported).toBe(true);
    expect(getScope().recording).toBe(false);

    getScope().toggleVoice();
    await nextTick();
    expect(getScope().recording).toBe(true);

    getScope().toggleVoice();
    await nextTick();
    expect(getScope().recording).toBe(false);
  });

  /**
   * 关键守卫：内置按钮靠模板上的 :disabled 拦住点击，而这两条是命令式入口，绕得过 DOM 禁用态。
   * 守卫若漏写，业务在表单提交期间（:disabled=true）仍能开出面板 / 启动录音。
   */
  it('disabled 时两个动作均为空操作（命令式入口绕不过禁用态）', async () => {
    const { w, getScope } = mountWithScope({
      disabled: true,
      attachments: { upload: instantUpload },
      voice: { recognizer: fakeRecognizer() },
    });
    getScope().toggleAttachments();
    getScope().toggleVoice();
    await nextTick();
    expect(w.find('.aix-attachments-panel').exists()).toBe(false);
    expect(getScope().attachmentsOpen).toBe(false);
    expect(getScope().recording).toBe(false);
  });

  it('attachmentCount 反映待发附件数（自定义按钮做角标用）', async () => {
    const { w, getScope } = mountWithScope({ attachments: { upload: instantUpload } });
    expect(getScope().attachmentCount).toBe(0);

    const input = w.find('input[type="file"]');
    const file = new File(['x'], 'a.txt', { type: 'text/plain' });
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
    await input.trigger('change');
    await nextTick();
    expect(getScope().attachmentCount).toBe(1);
  });

  it('defineExpose 同样给出两个动作（Sender 之外放入口时用）', async () => {
    const w = mount(Sender, { props: { attachments: { upload: instantUpload } } });
    const vm = w.vm as unknown as { toggleAttachments: () => void; toggleVoice: () => void };
    expect(typeof vm.toggleAttachments).toBe('function');
    expect(typeof vm.toggleVoice).toBe('function');
    vm.toggleAttachments();
    await nextTick();
    expect(w.find('.aix-attachments-panel').exists()).toBe(true);
  });

  // 此前 slotScope 只给了 attachmentCount：自绘工具栏看得见有几个附件，却没有任何清空入口，
  // 想在关闭面板 / 切会话时回收服务端资源只能整份改用注入实例。
  it('clearAttachments 清空待发附件并逐条走 onRemove', async () => {
    const onRemove = vi.fn();
    const { w, getScope } = mountWithScope({
      attachments: { upload: instantUpload, onRemove },
    });
    const input = w.find('input[type="file"]');
    Object.defineProperty(input.element, 'files', {
      value: [new File(['x'], 'a.txt'), new File(['y'], 'b.txt')],
      configurable: true,
    });
    await input.trigger('change');
    await nextTick();
    expect(getScope().attachmentCount).toBe(2);

    getScope().clearAttachments();
    await nextTick();
    expect(getScope().attachmentCount).toBe(0);
    expect(onRemove).toHaveBeenCalledTimes(2);
  });

  it('clearAttachments 在未启用附件 / disabled 时为安全空操作', async () => {
    // 未启用附件
    expect(() => mountWithScope().getScope().clearAttachments()).not.toThrow();

    // disabled：与面板内 onPanelRemove 同口径，禁用态下列表整体不可变更
    const onRemove = vi.fn();
    const { w, getScope } = mountWithScope({ attachments: { upload: instantUpload, onRemove } });
    const input = w.find('input[type="file"]');
    Object.defineProperty(input.element, 'files', {
      value: [new File(['x'], 'a.txt')],
      configurable: true,
    });
    await input.trigger('change');
    await nextTick();
    await w.setProps({ disabled: true });

    getScope().clearAttachments();
    await nextTick();
    expect(getScope().attachmentCount).toBe(1);
    expect(onRemove).not.toHaveBeenCalled();
  });
});

// ============ B：icons 覆盖内置图标 ============

describe('Sender — icons 覆盖内置图标（B）', () => {
  it('attach / voice 用自定义图标，按钮行为与 aria 文案不变', () => {
    const w = mount(Sender, {
      props: {
        attachments: { upload: instantUpload },
        voice: { recognizer: fakeRecognizer() },
        icons: { attach: StubIcon('my-attach'), voice: StubIcon('my-voice') },
      },
    });
    expect(w.find('svg.my-attach').exists()).toBe(true);
    expect(w.find('svg.my-voice').exists()).toBe(true);
    // 仅换图标：按钮本身与无障碍文案照旧
    expect(w.find('[aria-label="添加附件"]').exists()).toBe(true);
    expect(w.find('[aria-label="语音输入"]').exists()).toBe(true);
    // 图标是装饰性的，可及名只应来自按钮的 aria-label
    expect(w.find('svg.my-attach').attributes('aria-hidden')).toBe('true');
    expect(w.find('svg.my-voice').attributes('aria-hidden')).toBe('true');
  });

  /**
   * 内置发送图标（span）本就带 aria-hidden，自定义分支若漏标就成了「换个图标反而多播报一个图形」
   * 的隐性无障碍回归——这条专门钉住两条分支的一致性。
   */
  it('自定义与内置发送图标都标注 aria-hidden', async () => {
    const custom = mount(Sender, { props: { icons: { send: StubIcon('my-send') } } });
    expect(custom.find('svg.my-send').attributes('aria-hidden')).toBe('true');

    const builtin = mount(Sender);
    expect(builtin.find('.aix-sender__send-icon').attributes('aria-hidden')).toBe('true');
  });

  it('send 自定义时替换内置 mask 图标节点', () => {
    const w = mount(Sender, { props: { icons: { send: StubIcon('my-send') } } });
    expect(w.find('svg.my-send').exists()).toBe(true);
    expect(w.find('.aix-sender__send-icon').exists()).toBe(false);
  });

  /**
   * 内置 mask 图标的图源必须由样式表里的 `--aix-sender-send-icon` / `--aix-sender-stop-icon`
   * 提供，**不得回退成内联 style**。内联样式的优先级压过一切外部样式表：一旦图源写进
   * `style` 属性，宿主想换图标就只能带 `!important`，甚至根本盖不掉——业务改写
   * `background-image` 还会被内置 mask 按纸飞机轮廓裁掉，看着像「换了但形状不对」。
   *
   * 断言「元素上没有任何内联样式」而不是断言样式表内容：jsdom 不解析组件样式，
   * 但「有没有 style 属性」恰好是内联与外部样式表的分界，正好卡住会回归的那一步。
   */
  it('内置发送 / 停止图标不带任何内联样式（图源走 CSS 变量，保证宿主可覆盖）', async () => {
    const w = mount(Sender);
    const icon = w.find('.aix-sender__send-icon');
    expect(icon.exists()).toBe(true);
    expect(icon.attributes('style')).toBeUndefined();

    await w.setProps({ loading: true });
    const stopIcon = w.find('.aix-sender__send-icon');
    expect(stopIcon.exists()).toBe(true);
    expect(stopIcon.attributes('style')).toBeUndefined();
  });

  /**
   * send / stop 必须**各自独立回退**：只给 send 时，流式态不能拿发送图标冒充停止，
   * 否则「正在输出、点此停止」的语义整个反过来。
   */
  it('只提供 send 时，流式态回退内置停止图标而非复用发送图标', async () => {
    const w = mount(Sender, { props: { icons: { send: StubIcon('my-send') } } });
    expect(w.find('svg.my-send').exists()).toBe(true);

    await w.setProps({ loading: true });
    expect(w.find('svg.my-send').exists()).toBe(false); // 没有被复用
    expect(w.find('.aix-sender__send-icon').exists()).toBe(true); // 回退内置
  });

  it('只提供 stop 时，默认态回退内置发送图标', async () => {
    const w = mount(Sender, { props: { icons: { stop: StubIcon('my-stop') } } });
    expect(w.find('.aix-sender__send-icon').exists()).toBe(true);
    expect(w.find('svg.my-stop').exists()).toBe(false);

    await w.setProps({ loading: true });
    expect(w.find('svg.my-stop').exists()).toBe(true);
    expect(w.find('.aix-sender__send-icon').exists()).toBe(false);
  });

  /**
   * 内置图标的 mask 图源已从**内联 style** 迁到样式表（`--aix-sender-send-icon` /
   * `--aix-sender-stop-icon` 的 var() fallback），故这里不再断言内联样式——
   * 内联优先级压过一切外部样式表，正是它让「用 CSS 换图标」这条路走不通
   * （业务写 background-image 会被内置 mask 按纸飞机轮廓裁掉）。
   * 现在的契约是：不传 icons 时渲染内置 span 节点、且**不带任何内联样式**，
   * 外观完全由样式表决定，宿主在任意祖先设变量都能生效。
   */
  it('不传 icons 时渲染内置图标节点，且不再挂内联样式（改由样式表 + CSS 变量驱动）', () => {
    const w = mount(Sender, {
      props: { attachments: { upload: instantUpload }, voice: { recognizer: fakeRecognizer() } },
    });
    const icon = w.find('.aix-sender__send-icon');
    expect(icon.exists()).toBe(true);
    expect(icon.attributes('style')).toBeUndefined();
  });
});

// ============ 经 AiChat 使用时的直通 ============

describe('AiChat — senderIcons 直通', () => {
  it('senderIcons 落到 Sender 的内置按钮上', () => {
    const w = mount(AiChat, {
      props: {
        request: async () => new ReadableStream<Uint8Array>({ start: (c) => c.close() }),
        attachments: { upload: instantUpload },
        senderIcons: { attach: StubIcon('chat-attach'), send: StubIcon('chat-send') },
      },
    });
    expect(w.find('svg.chat-attach').exists()).toBe(true);
    expect(w.find('svg.chat-send').exists()).toBe(true);
    expect(w.find('.aix-sender__send-icon').exists()).toBe(false);
  });
});

// ============ D：icons.attachmentUpload / attachmentClose 覆盖内置附件面板图标 ============
// 此前内置 AttachmentsPanel 的上传占位图标 / 收起按钮图标无法通过 icons 换，只能整个接管
// #attachments-panel 插槽（换 UI）或写 CSS（svg{display:none} + ::before 背景图，脱离主题变色）。
// 现与 attach/voice/send/stop 走同一套「只换图标不必自建 UI」的 icons 通道。

describe('Sender — icons.attachmentUpload / attachmentClose（D）', () => {
  const openPanel = async (w: ReturnType<typeof mount>) => {
    await w.find('.aix-sender__attach-btn').trigger('click');
    await nextTick();
  };

  it('提供时覆盖内置附件面板的上传占位图标与收起按钮图标', async () => {
    const w = mount(Sender, {
      props: {
        attachments: { upload: instantUpload },
        icons: { attachmentUpload: StubIcon('my-upload'), attachmentClose: StubIcon('my-close') },
      },
    });
    await openPanel(w);
    expect(w.find('svg.my-upload').exists()).toBe(true);
    expect(w.find('svg.my-close').exists()).toBe(true);
    // 仅换图标：面板按钮的 aria-label 与内置文案照旧
    expect(w.find('[aria-label="收起附件面板"]').exists()).toBe(true);
  });

  it('未提供时行为不变，回退内置图标（回归）', async () => {
    const w = mount(Sender, { props: { attachments: { upload: instantUpload } } });
    await openPanel(w);
    expect(w.find('.aix-attachments-panel__placeholder-icon svg').exists()).toBe(true);
    expect(w.find('.aix-attachments-panel__close svg').exists()).toBe(true);
  });

  it('提供了 #attachments-panel 插槽（整体换 UI）时不生效——图标是内置面板的实现细节', async () => {
    const w = mount(Sender, {
      props: {
        attachments: { upload: instantUpload },
        icons: { attachmentUpload: StubIcon('my-upload') },
      },
      slots: { 'attachments-panel': () => h('div', { class: 'my-panel' }) },
    });
    await openPanel(w);
    expect(w.find('.my-panel').exists()).toBe(true);
    expect(w.find('svg.my-upload').exists()).toBe(false);
  });
});

describe('AiChat — senderIcons 直通附件面板图标', () => {
  it('senderIcons.attachmentUpload/attachmentClose 落到内置附件面板上', async () => {
    const w = mount(AiChat, {
      props: {
        request: async () => new ReadableStream<Uint8Array>({ start: (c) => c.close() }),
        attachments: { upload: instantUpload },
        senderIcons: {
          attachmentUpload: StubIcon('chat-upload'),
          attachmentClose: StubIcon('chat-close'),
        },
      },
    });
    await w.find('.aix-sender__attach-btn').trigger('click');
    await nextTick();
    expect(w.find('svg.chat-upload').exists()).toBe(true);
    expect(w.find('svg.chat-close').exists()).toBe(true);
  });
});

// ============ 附件面板 UI 定制（C）============
// 内置 AttachmentsPanel 此前是 Sender 的实现细节：无插槽、未导出，业务只能改 CSS。
// 而「自建」路线也是断的——attachments prop 只收配置对象，Sender 内部自持 useAttachments 实例，
// 宿主另建一份的话，发送时的 drain()、上传中禁发守卫、自动收起、根级拖放/粘贴全部对不上。
// 现开放 #attachments-panel 作用域插槽（换 UI、共用同一实例）与实例注入（换持有者）两条路。

describe('Sender — #attachments-panel 插槽（C1：换 UI，共用内部实例）', () => {
  const mountPanel = (slotFn: (s: SenderAttachmentsSlotScope) => unknown, props = {}) =>
    mount(Sender, {
      props: { attachments: { upload: instantUpload, accept: '.png' }, ...props },
      slots: { 'attachments-panel': slotFn as never },
    });

  /** 面板仅在展开时渲染：经 slotScope 的 toggleAttachments 打开 */
  const openPanel = async (w: ReturnType<typeof mountPanel>) => {
    await w.find('.aix-sender__attach-btn').trigger('click');
    await nextTick();
  };

  it('提供插槽时替换内置面板，未提供时回退内置面板', async () => {
    const custom = mountPanel(() => h('div', { class: 'my-panel' }, 'custom'));
    await openPanel(custom);
    expect(custom.find('.my-panel').exists()).toBe(true);
    expect(custom.find('.aix-attachments-panel').exists()).toBe(false);

    const fallback = mount(Sender, { props: { attachments: { upload: instantUpload } } });
    await fallback.find('.aix-sender__attach-btn').trigger('click');
    await nextTick();
    expect(fallback.find('.aix-attachments-panel').exists()).toBe(true);
  });

  it('作用域回传 items / isUploading / accept / disabled 与动作句柄', async () => {
    let scope!: SenderAttachmentsSlotScope;
    const w = mountPanel((s) => {
      scope = s;
      return h('div', { class: 'my-panel' });
    });
    await openPanel(w);
    expect(scope.accept).toBe('.png');
    expect(scope.disabled).toBe(false);
    expect(scope.items).toEqual([]);
    expect(typeof scope.pick).toBe('function');
    expect(typeof scope.add).toBe('function');
    expect(typeof scope.remove).toBe('function');
    expect(typeof scope.retry).toBe('function');
    expect(typeof scope.close).toBe('function');
  });

  it('scope.add 入列的附件参与发送（与内置面板同一份实例，drain 拿得到）', async () => {
    let scope!: SenderAttachmentsSlotScope;
    const w = mountPanel((s) => {
      scope = s;
      return h('div', { class: 'my-panel' });
    });
    await openPanel(w);
    scope.add([new File(['x'], 'a.png', { type: 'image/png' })]);
    await nextTick();
    await nextTick(); // 等 instantUpload 落 done
    expect(scope.items).toHaveLength(1);
    await w.find('textarea').setValue('带附件');
    await w.find('.aix-sender__send').trigger('click');
    const [, attachments] = w.emitted('submit')![0] as [string, unknown[]];
    expect(attachments).toHaveLength(1);
    expect((attachments[0] as { name: string }).name).toBe('a.png');
  });

  it('scope.close 收起面板', async () => {
    let scope!: SenderAttachmentsSlotScope;
    const w = mountPanel((s) => {
      scope = s;
      return h('div', { class: 'my-panel' });
    });
    await openPanel(w);
    expect(w.find('.my-panel').exists()).toBe(true);
    scope.close();
    await nextTick();
    expect(w.find('.my-panel').exists()).toBe(false);
  });

  it('动作句柄继承 disabled 守卫（面板展开后才被禁用时，add 不再入列）', async () => {
    let scope!: SenderAttachmentsSlotScope;
    const w = mountPanel((s) => {
      scope = s;
      return h('div', { class: 'my-panel' });
    });
    await openPanel(w);
    await w.setProps({ disabled: true });
    scope.add([new File(['x'], 'b.png', { type: 'image/png' })]);
    await nextTick();
    expect(scope.items).toHaveLength(0);
  });

  it('插槽内容可以是多个根节点（Transition 的过渡节点由 Sender 自己持有）', async () => {
    const w = mountPanel(() => [h('div', { class: 'r1' }), h('div', { class: 'r2' })]);
    await openPanel(w);
    expect(w.find('.aix-sender__attachments').exists()).toBe(true);
    expect(w.find('.r1').exists()).toBe(true);
    expect(w.find('.r2').exists()).toBe(true);
  });
});

describe('Sender — attachments 接受已创建实例（C2：换持有者）', () => {
  it('注入实例后与宿主共用 items，发送时 drain 同一份', async () => {
    const inst = useAttachments({ upload: instantUpload, accept: '.png' });
    const w = mount(Sender, { props: { attachments: inst } });
    // 宿主侧直接入列（模拟 Sender 之外的自绘上传区）
    inst.add([new File(['x'], 'outside.png', { type: 'image/png' })]);
    await nextTick();
    await nextTick();
    expect(inst.items.value).toHaveLength(1);
    await w.find('textarea').setValue('hi');
    await w.find('.aix-sender__send').trigger('click');
    const [, attachments] = w.emitted('submit')![0] as [string, unknown[]];
    expect((attachments[0] as { name: string }).name).toBe('outside.png');
    // drain 走的是同一份实例，宿主侧列表随之清空
    expect(inst.items.value).toHaveLength(0);
  });

  it('注入实例时 accept 仍喂给原生 input（回归：实例不含 accept 会静默丢过滤）', () => {
    const inst = useAttachments({ upload: instantUpload, accept: '.pdf,.png' });
    const w = mount(Sender, { props: { attachments: inst } });
    expect(w.find('input[type=file]').attributes('accept')).toBe('.pdf,.png');
  });

  it('传配置对象时行为不变（回归）', () => {
    const w = mount(Sender, { props: { attachments: { upload: instantUpload, accept: '.pdf' } } });
    expect(w.find('input[type=file]').attributes('accept')).toBe('.pdf');
  });
});

// ============ variant：外观形态（批次3-3.1） ============
describe('Sender — variant 外观形态', () => {
  it('默认 card：根节点带 --card 修饰类（既有接入方行为不变）', () => {
    const w = mount(Sender);
    expect(w.find('.aix-sender--card').exists()).toBe(true);
    expect(w.find('.aix-sender--plain').exists()).toBe(false);
  });

  it('plain：换成 --plain 修饰类，卡片视觉（边框/圆角/阴影）随之整组失效', () => {
    const w = mount(Sender, { props: { variant: 'plain' } });
    expect(w.find('.aix-sender--plain').exists()).toBe(true);
    expect(w.find('.aix-sender--card').exists()).toBe(false);
  });

  it('variant 可运行时切换（不是 setup 快照）', async () => {
    const w = mount(Sender, { props: { variant: 'card' } });
    await w.setProps({ variant: 'plain' });
    expect(w.find('.aix-sender--plain').exists()).toBe(true);
  });
});
