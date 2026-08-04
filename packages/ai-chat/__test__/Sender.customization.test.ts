import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { h, nextTick } from 'vue';
import AiChat from '../src/components/AiChat.vue';
import Sender from '../src/components/Sender.vue';
import type { SenderSlotScope } from '../src/components/Sender.vue';
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

  it('不传 icons 时行为完全不变（内置 mask 图标照常）', () => {
    const w = mount(Sender, {
      props: { attachments: { upload: instantUpload }, voice: { recognizer: fakeRecognizer() } },
    });
    const icon = w.find('.aix-sender__send-icon');
    expect(icon.exists()).toBe(true);
    expect(icon.attributes('style')).toContain('mask-image');
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
