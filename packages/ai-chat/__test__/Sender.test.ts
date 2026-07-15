import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextTick, h } from 'vue';
import Sender from '../src/components/Sender.vue';
import type { SenderSlotScope } from '../src/components/Sender.vue';
import type { VoiceRecognizerCtx, VoiceRecognizer } from '../src/types';

describe('Sender', () => {
  it('Enter 提交并清空，emit submit', async () => {
    const w = mount(Sender);
    const ta = w.find('textarea');
    await ta.setValue('你好');
    await ta.trigger('keydown', { key: 'Enter' });
    expect(w.emitted('submit')![0]).toEqual(['你好']);
    expect((ta.element as HTMLTextAreaElement).value).toBe('');
  });

  it('Shift+Enter 不提交', async () => {
    const w = mount(Sender);
    const ta = w.find('textarea');
    await ta.setValue('多行');
    await ta.trigger('keydown', { key: 'Enter', shiftKey: true });
    expect(w.emitted('submit')).toBeUndefined();
  });

  it('loading 时点击发送按钮 emit cancel', async () => {
    const w = mount(Sender, { props: { loading: true } });
    await w.find('.aix-sender__send').trigger('click');
    expect(w.emitted('cancel')).toBeTruthy();
  });

  it('shiftEnter 模式：普通 Enter 不提交，Shift+Enter 才提交', async () => {
    const w = mount(Sender, { props: { submitType: 'shiftEnter' } });
    const ta = w.find('textarea');
    await ta.setValue('草稿');
    await ta.trigger('keydown', { key: 'Enter' });
    expect(w.emitted('submit')).toBeUndefined();
    await ta.trigger('keydown', { key: 'Enter', shiftKey: true });
    expect(w.emitted('submit')![0]).toEqual(['草稿']);
  });

  it('IME 组词中按 Enter 不提交（isComposing 守卫）', async () => {
    const w = mount(Sender);
    const ta = w.find('textarea');
    await ta.setValue('pinyin');
    await ta.trigger('keydown', { key: 'Enter', isComposing: true });
    expect(w.emitted('submit')).toBeUndefined();
  });

  describe('autosize（隐藏镜像元素测量高度，不直接塌陷/撑高真实输入框自身）', () => {
    /**
     * 回归动机：直接在真实（可能正聚焦）输入框上做 height:auto→scrollHeight 的两段式重排，
     * 在内容很重的长会话/虚拟列表页面上，曾观测到会牵连整个 flex 布局并导致输入框瞬间
     * blur→重新 focus（中文拼音组词因此被打断）。改为镜像元素测量后，真实输入框的高度
     * 只会被单向赋成目标像素值，不会经历中间的塌陷态，也不牵连页面其余布局。
     */
    // 镜像挂在组件自己的根节点下（非 document.body），查询一律限定在 w.element 子树内，
    // 避免同文件里其它未调用 unmount() 的用例残留的镜像节点造成串扰。
    it('用隐藏镜像 textarea 测量高度：真实输入框的高度取自镜像的 scrollHeight，而非自身', async () => {
      const w = mount(Sender, { attachTo: document.body });
      const taEl = w.find('textarea').element as HTMLTextAreaElement;
      // 镜像由挂载时 modelValue 的 immediate watch 经 nextTick(autosize) 延迟创建，需先等一轮
      await nextTick();

      const mirror = w.element.querySelector(
        'textarea[aria-hidden="true"]',
      ) as HTMLTextAreaElement | null;
      expect(mirror).toBeTruthy();
      expect(mirror).not.toBe(taEl);

      // 真实输入框自身的 scrollHeight 故意 mock 成与镜像不同的值：若高度仍从它自己身上量，
      // 结果会是 9999px——只有走镜像才会得到 88px，藉此证明测量路径确实换到了镜像上。
      Object.defineProperty(taEl, 'scrollHeight', { configurable: true, get: () => 9999 });
      Object.defineProperty(mirror!, 'scrollHeight', { configurable: true, get: () => 88 });

      await w.find('textarea').setValue('第一行\n第二行');

      expect(mirror!.value).toBe('第一行\n第二行'); // 内容同步给镜像用于测量
      expect(taEl.style.height).toBe('88px'); // 高度来自镜像，不是真实输入框自身的 9999
      w.unmount();
    });

    it('镜像宽度跟随真实输入框的 clientWidth 同步，保证换行/高度测量准确', async () => {
      const w = mount(Sender, { attachTo: document.body });
      const taEl = w.find('textarea').element as HTMLTextAreaElement;
      Object.defineProperty(taEl, 'clientWidth', { configurable: true, get: () => 240 });

      await w.find('textarea').setValue('x');

      const mirror = w.element.querySelector('textarea[aria-hidden="true"]') as HTMLTextAreaElement;
      expect(mirror.style.width).toBe('240px');
      w.unmount();
    });

    it('组件卸载时清理镜像元素，不残留在 DOM 中', async () => {
      const w = mount(Sender, { attachTo: document.body });
      await nextTick();
      const mirror = w.element.querySelector('textarea[aria-hidden="true"]');
      expect(mirror).toBeTruthy();
      w.unmount();
      expect(mirror!.isConnected).toBe(false);
    });

    it('镜像元素不可聚焦、不出现在无障碍树中（tabIndex=-1 + aria-hidden）', async () => {
      const w = mount(Sender, { attachTo: document.body });
      await nextTick();
      const mirror = w.element.querySelector('textarea[aria-hidden="true"]') as HTMLTextAreaElement;
      expect(mirror.tabIndex).toBe(-1);
      expect(mirror.getAttribute('aria-hidden')).toBe('true');
      w.unmount();
    });
  });

  it('暴露的 focus() 使 textarea 获得焦点', () => {
    const w = mount(Sender, { attachTo: document.body });
    (w.vm as unknown as { focus: () => void }).focus();
    expect(w.find('textarea').element).toBe(document.activeElement);
    w.unmount();
  });

  it('暴露的 clear() 清空内容并 emit update:modelValue 为空串', async () => {
    const w = mount(Sender);
    const ta = w.find('textarea');
    await ta.setValue('待清空');
    (w.vm as unknown as { clear: () => void }).clear();
    await w.vm.$nextTick();
    expect((ta.element as HTMLTextAreaElement).value).toBe('');
    const events = w.emitted('update:modelValue')!;
    expect(events[events.length - 1]).toEqual(['']);
  });

  it('modelValue 受控同步：setProps 后 textarea 值更新', async () => {
    const w = mount(Sender, { props: { modelValue: 'a' } });
    const ta = w.find('textarea');
    expect((ta.element as HTMLTextAreaElement).value).toBe('a');
    await w.setProps({ modelValue: 'b' });
    expect((ta.element as HTMLTextAreaElement).value).toBe('b');
  });

  it('disabled 时 Enter 与点击发送均不 emit submit', async () => {
    const w = mount(Sender, { props: { disabled: true } });
    const ta = w.find('textarea');
    await ta.setValue('内容');
    await ta.trigger('keydown', { key: 'Enter' });
    await w.find('.aix-sender__send').trigger('click');
    expect(w.emitted('submit')).toBeUndefined();
  });

  it('未提供 toolbar slot 且内置项均未启用时，工具栏行仍渲染但只有发送键（承载发送键，始终存在）', () => {
    const w = mount(Sender);
    const toolbar = w.find('.aix-sender__toolbar');
    expect(toolbar.exists()).toBe(true);
    expect(toolbar.find('.aix-sender__send').exists()).toBe(true);
    expect(toolbar.findAll('.aix-sender__attach-btn, .aix-sender__mic').length).toBe(0);
    expect(w.classes()).not.toContain('is-has-toolbar');
  });

  it('提供 toolbar / prefix slot 时渲染对应区域', () => {
    const w = mount(Sender, {
      slots: {
        toolbar: '<button class="ins">灵感</button>',
        prefix: '<span class="pre">+</span>',
      },
    });
    expect(w.find('.aix-sender__toolbar .ins').exists()).toBe(true);
    expect(w.find('.aix-sender__prefix .pre').exists()).toBe(true);
    expect(w.classes()).toContain('is-has-toolbar');
    // 工具栏存在不影响发送
    expect(w.find('.aix-sender__send').exists()).toBe(true);
  });

  it('header / footer slot：提供时渲染于输入行上 / 下方，未提供则不渲染', () => {
    const empty = mount(Sender);
    expect(empty.find('.aix-sender__header').exists()).toBe(false);
    expect(empty.find('.aix-sender__footer').exists()).toBe(false);

    const w = mount(Sender, {
      slots: {
        header: '<div class="att">附件预览</div>',
        footer: '<span class="cnt">0/2000</span>',
      },
    });
    expect(w.find('.aix-sender__header .att').exists()).toBe(true);
    expect(w.find('.aix-sender__footer .cnt').exists()).toBe(true);
  });

  it('textarea 带 aria-label（默认取 placeholder 文案）', () => {
    const wrapper = mount(Sender);
    expect(wrapper.find('textarea').attributes('aria-label')).toBeTruthy();
  });

  // ── 附件集成（opt-in）──────────────────────────────────────────────
  describe('附件集成', () => {
    const instantUpload = vi.fn(async (f: File) => ({ name: f.name, url: `/f/${f.name}` }));

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('默认不开启：不传 attachments 时无回形针按钮、无附件面板、无文件 input', () => {
      const w = mount(Sender);
      expect(w.find('[aria-label="添加附件"]').exists()).toBe(false);
      expect(w.find('.aix-attachments-panel').exists()).toBe(false);
      expect(w.find('input[type="file"]').exists()).toBe(false);
    });

    it('开启后渲染回形针按钮，点击展开面板（placeholder 可见），选择文件出现预览卡片于面板内', async () => {
      const w = mount(Sender, { props: { attachments: { upload: instantUpload } } });
      const attachBtn = w.find('[aria-label="添加附件"]');
      expect(attachBtn.exists()).toBe(true);
      // 点回形针展开面板：placeholder 可见
      await attachBtn.trigger('click');
      expect(w.find('.aix-attachments-panel__placeholder').exists()).toBe(true);
      // 经隐藏 input change 后卡片出现在面板列表内
      const input = w.find('input[type="file"]');
      const f = new File(['x'], 'a.pdf', { type: 'application/pdf' });
      Object.defineProperty(input.element, 'files', { value: [f] });
      await input.trigger('change');
      await flushPromises();
      expect(w.findAll('.aix-attachments-panel__list .aix-attachment-card')).toHaveLength(1);
    });

    it('回形针 toggle：点开面板可见+按钮 is-active，再点收起', async () => {
      const w = mount(Sender, { props: { attachments: { upload: instantUpload } } });
      const attachBtn = w.find('[aria-label="添加附件"]');
      expect(w.find('.aix-attachments-panel').exists()).toBe(false);
      await attachBtn.trigger('click');
      expect(w.find('.aix-attachments-panel').exists()).toBe(true);
      expect(attachBtn.classes()).toContain('is-active');
      await attachBtn.trigger('click');
      expect(attachBtn.classes()).not.toContain('is-active');
    });

    it('disabled 后已展开面板的 drop 不再 add（disabled 覆盖附件全部交互）', async () => {
      const w = mount(Sender, { props: { attachments: { upload: instantUpload } } });
      await w.find('[aria-label="添加附件"]').trigger('click'); // 先在可用态展开面板
      await w.setProps({ disabled: true });
      await w
        .find('.aix-attachments-panel')
        .trigger('drop', { dataTransfer: { files: [new File(['x'], 'a.pdf')] } });
      await flushPromises();
      expect(w.findAll('.aix-attachment-card')).toHaveLength(0);
      expect(instantUpload).not.toHaveBeenCalled();
    });

    it('disabled 后面板内 retry 不再重试上传', async () => {
      const upload = vi
        .fn<(f: File) => Promise<{ name: string }>>()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValue({ name: 'a.pdf' });
      const w = mount(Sender, { props: { attachments: { upload } } });
      const input = w.find('input[type="file"]');
      Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'a.pdf')] });
      await input.trigger('change');
      await flushPromises();
      expect(upload).toHaveBeenCalledTimes(1); // 首次上传失败 → error 卡片带重试钮
      await w.setProps({ disabled: true });
      await w.find('.aix-attachment-card__btn').trigger('click');
      await flushPromises();
      expect(upload).toHaveBeenCalledTimes(1); // disabled：重试被拦截
    });

    it('add 自动展开：未展开时经拖放 add 文件，面板自动可见', async () => {
      const w = mount(Sender, { props: { attachments: { upload: instantUpload } } });
      expect(w.find('.aix-attachments-panel').exists()).toBe(false);
      const dt = { files: [new File(['x'], 'auto.pdf')] };
      await w.find('.aix-sender').trigger('drop', { dataTransfer: dt });
      await flushPromises();
      expect(w.find('.aix-attachments-panel').exists()).toBe(true);
      expect(w.findAll('.aix-attachments-panel__list .aix-attachment-card')).toHaveLength(1);
    });

    it('收起带徽标：手动收起且仍有 items 时显示数量徽标', async () => {
      const w = mount(Sender, { props: { attachments: { upload: instantUpload } } });
      const input = w.find('input[type="file"]');
      Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'a.pdf')] });
      await input.trigger('change');
      await flushPromises();
      // add 后自动展开，无徽标
      expect(w.find('.aix-sender__attach-badge').exists()).toBe(false);
      // 手动收起
      await w.find('[aria-label="添加附件"]').trigger('click');
      const badge = w.find('.aix-sender__attach-badge');
      expect(badge.exists()).toBe(true);
      expect(badge.text()).toBe('1');
    });

    it('根 dragenter 自动展开：未展开时根 dragenter 使面板可见', async () => {
      const w = mount(Sender, { props: { attachments: { upload: instantUpload } } });
      expect(w.find('.aix-attachments-panel').exists()).toBe(false);
      await w.find('.aix-sender').trigger('dragenter');
      expect(w.find('.aix-attachments-panel').exists()).toBe(true);
    });

    it('手动收起（items>0）后再 add 重新展开面板（有意设计：新文件落地需可见反馈）', async () => {
      const w = mount(Sender, { props: { attachments: { upload: instantUpload } } });
      const input = w.find('input[type="file"]');
      Object.defineProperty(input.element, 'files', {
        value: [new File(['x'], 'a.pdf')],
        configurable: true,
      });
      await input.trigger('change');
      await flushPromises();
      // add 后自动展开
      expect(w.find('.aix-attachments-panel').exists()).toBe(true);
      // 手动收起，仍有条目
      await w.find('[aria-label="添加附件"]').trigger('click');
      expect(w.find('.aix-attachments-panel').exists()).toBe(false);
      // 再 add 新文件 → 面板重新展开
      Object.defineProperty(input.element, 'files', {
        value: [new File(['y'], 'b.pdf')],
        configurable: true,
      });
      await input.trigger('change');
      await flushPromises();
      expect(w.find('.aix-attachments-panel').exists()).toBe(true);
      expect(w.findAll('.aix-attachments-panel__list .aix-attachment-card')).toHaveLength(2);
    });

    it('disabled=true 时拖放不新增卡片、面板不展开（disabled 覆盖附件交互）', async () => {
      const w = mount(Sender, {
        props: { disabled: true, attachments: { upload: instantUpload } },
      });
      const dt = { files: [new File(['x'], 'drag.pdf')] };
      await w.find('.aix-sender').trigger('dragenter');
      expect(w.find('.aix-attachments-panel').exists()).toBe(false); // dragenter 不展开
      await w.find('.aix-sender').trigger('drop', { dataTransfer: dt });
      await flushPromises();
      expect(w.find('.aix-attachments-panel').exists()).toBe(false);
      expect(w.findAll('.aix-attachment-card')).toHaveLength(0);
    });

    it('面板高度过渡：enter 未完成即 leave 时，旧 enter 的 finish 不再误触发（快速 toggle 竞态）', () => {
      const w = mount(Sender, { props: { attachments: { upload: instantUpload } } });
      const vm = w.vm as unknown as {
        __onPanelEnter: (el: Element, done: () => void) => void;
        __onPanelLeave: (el: Element, done: () => void) => void;
      };
      // jsdom 无布局，用 getter spy 驱动非 0 scrollHeight（与 heightTransition 测试同款手法）
      const node = document.createElement('div');
      Object.defineProperty(node, 'scrollHeight', { configurable: true, get: () => 120 });
      const enterDone = vi.fn();
      const leaveDone = vi.fn();
      // enter 挂起（不派发 transitionend）
      vm.__onPanelEnter(node, enterDone);
      expect(node.style.height).toBe('120px');
      // enter 未完成即 leave：leave 入口须先清掉 enter 的监听/timer（竞态修复点）
      vm.__onPanelLeave(node, leaveDone);
      expect(node.style.height).toBe('0px'); // leave 接管，目标高 0
      // 派发 transitionend：只应触发 leave 的 finish；若 enter finish 未被清理则也会跑，
      // 把 height 置 'auto'（把收起动画弹回全高）并误调用 enterDone。
      node.dispatchEvent(new Event('transitionend'));
      expect(enterDone).not.toHaveBeenCalled(); // 关键：旧 enter finish 未误触发
      expect(leaveDone).toHaveBeenCalledTimes(1);
      expect(node.style.height).toBe(''); // leave finish 正常清理（非 'auto'）
    });

    it('面板高度过渡：子元素 transitionend 冒泡不提前 finish（如上传进度条 width 过渡结束）', () => {
      const w = mount(Sender, { props: { attachments: { upload: instantUpload } } });
      const vm = w.vm as unknown as {
        __onPanelEnter: (el: Element, done: () => void) => void;
      };
      const node = document.createElement('div');
      const child = document.createElement('span');
      node.appendChild(child);
      Object.defineProperty(node, 'scrollHeight', { configurable: true, get: () => 120 });
      const enterDone = vi.fn();
      vm.__onPanelEnter(node, enterDone);
      expect(node.style.height).toBe('120px');
      // 子元素过渡结束冒泡（AttachmentCard 进度条 transition: width）：不应提前 finish
      child.dispatchEvent(new Event('transitionend', { bubbles: true }));
      expect(enterDone).not.toHaveBeenCalled();
      expect(node.style.height).toBe('120px'); // 仍在过渡，未被置 'auto'
      // 本元素过渡结束：正常 finish
      node.dispatchEvent(new Event('transitionend'));
      expect(enterDone).toHaveBeenCalledTimes(1);
      expect(node.style.height).toBe('auto');
    });

    it('isUploading 时发送按钮禁用并带 title 提示', async () => {
      let resolveUpload!: (v: { name: string }) => void;
      const pending = vi.fn(
        () =>
          new Promise<{ name: string }>((r) => {
            resolveUpload = r;
          }),
      );
      const w = mount(Sender, {
        props: { modelValue: 'hi', attachments: { upload: pending } },
      });
      const input = w.find('input[type="file"]');
      Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'a.pdf')] });
      await input.trigger('change');
      await w.vm.$nextTick();
      const send = w.find('.aix-sender__send');
      expect(send.attributes('disabled')).toBeDefined();
      expect(send.attributes('title')).toBe('附件上传中');
      resolveUpload({ name: 'a.pdf' });
      await flushPromises();
      expect(send.attributes('disabled')).toBeUndefined();
    });

    it('提交时 emit submit(text, attachments) 并清空预览', async () => {
      const w = mount(Sender, { props: { attachments: { upload: instantUpload } } });
      const input = w.find('input[type="file"]');
      Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'a.pdf')] });
      await input.trigger('change');
      await flushPromises();
      await w.find('textarea').setValue('帮我总结');
      await w.find('.aix-sender__send').trigger('click');
      const payload = w.emitted('submit')?.[0];
      expect(payload?.[0]).toBe('帮我总结');
      expect(payload?.[1]).toMatchObject([{ name: 'a.pdf', url: '/f/a.pdf' }]);
      expect(payload).toHaveLength(2); // 无 meta 时保持旧签名：不携带第三参
      await w.vm.$nextTick();
      // drain 清空 + 面板自动收起
      expect(w.findAll('.aix-attachment-card')).toHaveLength(0);
      expect(w.find('.aix-attachments-panel').exists()).toBe(false);
    });

    it('纯附件可发送（无文本）', async () => {
      const w = mount(Sender, { props: { attachments: { upload: instantUpload } } });
      const input = w.find('input[type="file"]');
      Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'a.pdf')] });
      await input.trigger('change');
      await flushPromises();
      const send = w.find('.aix-sender__send');
      expect(send.attributes('disabled')).toBeUndefined();
      await send.trigger('click');
      expect(w.emitted('submit')?.[0]?.[0]).toBe('');
    });

    it('loading 中新增附件上传时，停止按钮仍可点击', async () => {
      let resolveUpload!: (v: { name: string }) => void;
      const pending = vi.fn(
        () =>
          new Promise<{ name: string }>((r) => {
            resolveUpload = r;
          }),
      );
      const w = mount(Sender, { props: { loading: true, attachments: { upload: pending } } });
      const input = w.find('input[type="file"]');
      Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'a.pdf')] });
      await input.trigger('change');
      const send = w.find('.aix-sender__send');
      expect(send.attributes('disabled')).toBeUndefined(); // 停止不被上传禁用
      expect(send.attributes('title')).toBe('停止');
      await send.trigger('click');
      expect(w.emitted('cancel')).toHaveLength(1);
      resolveUpload({ name: 'a.pdf' });
    });

    it('粘贴文件触发上传，卡片出现在面板列表内且面板自动展开', async () => {
      const w = mount(Sender, { props: { attachments: { upload: instantUpload } } });
      const dt = {
        files: [new File(['x'], 'paste.png', { type: 'image/png' })],
        getData: () => '',
      };
      await w.find('textarea').trigger('paste', { clipboardData: dt });
      await flushPromises();
      expect(w.find('.aix-attachments-panel').exists()).toBe(true);
      expect(w.findAll('.aix-attachments-panel__list .aix-attachment-card')).toHaveLength(1);
    });
  });

  // ── 语音集成（opt-in）──────────────────────────────────────────────
  describe('语音集成', () => {
    const fakeRecognizer = () => {
      let ctx: VoiceRecognizerCtx | null = null;
      const stop = vi.fn(() => ctx?.onEnd());
      const recognizer: VoiceRecognizer = (c) => {
        ctx = c;
        return { stop };
      };
      return { recognizer, stop, drive: () => ctx! };
    };

    it('默认不开启：不传 voice 无麦克风按钮', () => {
      const w = mount(Sender);
      expect(w.find('[aria-label="语音输入"]').exists()).toBe(false);
    });

    it('voice=true 但浏览器不支持（jsdom 无 SpeechRecognition）：按钮自动隐藏', () => {
      const w = mount(Sender, { props: { voice: true } });
      expect(w.find('[aria-label="语音输入"]').exists()).toBe(false);
    });

    it('注入自定义识别器：渲染麦克风按钮，点击进入聆听态（placeholder 切换 + 按钮高亮）', async () => {
      const { recognizer } = fakeRecognizer();
      const w = mount(Sender, { props: { voice: { recognizer } } });
      const mic = w.find('[aria-label="语音输入"]');
      expect(mic.exists()).toBe(true);
      await mic.trigger('click');
      expect(w.find('textarea').attributes('placeholder')).toBe('正在聆听…');
      expect(w.find('[aria-label="停止语音输入"]').classes()).toContain('is-listening');
    });

    it('定稿文本追加到输入框现有内容；中间结果实时预览、定稿时替换', async () => {
      const { recognizer, drive } = fakeRecognizer();
      const w = mount(Sender, { props: { modelValue: '已有', voice: { recognizer } } });
      await w.find('[aria-label="语音输入"]').trigger('click');
      drive().onResult('正在', false); // interim 预览
      await nextTick();
      expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('已有正在');
      drive().onResult('正在识别', true); // 定稿替换预览段
      await nextTick();
      expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('已有正在识别');
      expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['已有正在识别']);
    });

    it('识别出错（如权限拒绝）：voice.onError 收到错误且按钮复位 idle', async () => {
      const { recognizer, drive } = fakeRecognizer();
      const onError = vi.fn();
      const w = mount(Sender, { props: { voice: { recognizer, onError } } });
      await w.find('[aria-label="语音输入"]').trigger('click');
      const err = new Error('not-allowed');
      drive().onError(err);
      await nextTick();
      expect(onError).toHaveBeenCalledWith(err);
      expect(w.find('[aria-label="语音输入"]').exists()).toBe(true); // 复位 idle
    });

    it('Esc 停止聆听并复位', async () => {
      const { recognizer, stop } = fakeRecognizer();
      const w = mount(Sender, { props: { voice: { recognizer } } });
      await w.find('[aria-label="语音输入"]').trigger('click');
      await w.find('textarea').trigger('keydown', { key: 'Escape' });
      expect(stop).toHaveBeenCalledTimes(1);
      expect(w.find('[aria-label="语音输入"]').exists()).toBe(true); // 复位 idle
    });

    it('提交发送时自动停止聆听', async () => {
      const { recognizer, stop } = fakeRecognizer();
      const w = mount(Sender, { props: { voice: { recognizer } } });
      await w.find('[aria-label="语音输入"]').trigger('click');
      await w.find('textarea').setValue('hello');
      await w.find('.aix-sender__send').trigger('click');
      expect(stop).toHaveBeenCalled();
      expect(w.emitted('submit')?.[0]?.[0]).toBe('hello');
    });

    it('聆听中手动打字不被后续语音结果覆盖', async () => {
      const { recognizer, drive } = fakeRecognizer();
      const w = mount(Sender, { props: { voice: { recognizer } } });
      await w.find('[aria-label="语音输入"]').trigger('click');
      drive().onResult('你好', true); // 定稿：committedBase='你好'
      await nextTick();
      await w.find('textarea').setValue('你好，朋友'); // 聆听中手动补充（setValue 触发 input 事件）
      drive().onResult('世界', false); // interim 不应覆盖手动输入
      await nextTick();
      expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('你好，朋友世界');
      drive().onResult('世界', true); // 定稿同样在新基线后追加
      await nextTick();
      expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('你好，朋友世界');
    });

    it('聆听中手动编辑后，旧会话迟到的 final 不会重复拼接', async () => {
      const ctxs: VoiceRecognizerCtx[] = [];
      const recognizer: VoiceRecognizer = (c) => {
        ctxs.push(c);
        return { stop: vi.fn() };
      };
      const w = mount(Sender, { props: { voice: { recognizer } } });
      await w.find('[aria-label="语音输入"]').trigger('click'); // 会话1
      ctxs[0]!.onResult('世界', false); // interim 预览
      await nextTick();
      await w.find('textarea').setValue('世界x'); // 聆听中手动编辑 → 重启为会话2
      ctxs[0]!.onResult('世界', true); // 旧会话 final 迟到——必须被丢弃
      await nextTick();
      expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('世界x'); // 无重复
      ctxs[1]!.onResult('继续', true); // 新会话正常追加
      await nextTick();
      expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('世界x继续');
    });

    it('转 disabled 后自动停止进行中的语音聆听（对齐附件路径的 disabled 守卫）', async () => {
      const { recognizer, stop } = fakeRecognizer();
      const w = mount(Sender, { props: { voice: { recognizer } } });
      await w.find('[aria-label="语音输入"]').trigger('click');
      expect(w.find('[aria-label="停止语音输入"]').exists()).toBe(true); // listening 中
      // 业务在聆听途中禁用（如表单提交期间）：麦克风按钮被禁、Esc 收不到，须自动停止会话
      await w.setProps({ disabled: true });
      expect(stop).toHaveBeenCalledTimes(1);
    });

    it('disabled 后在途语音结果不再改写输入框（applyVoiceText 守卫兜底）', async () => {
      const { recognizer, drive } = fakeRecognizer();
      const w = mount(Sender, { props: { voice: { recognizer } } });
      await w.find('[aria-label="语音输入"]').trigger('click');
      drive().onResult('你好', false);
      await nextTick();
      expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('你好');
      const emitsBefore = w.emitted('update:modelValue')?.length ?? 0;
      await w.setProps({ disabled: true });
      // 旧会话在途结果迟到：不得改写 textarea，也不得继续 emit update:modelValue
      drive().onResult('你好世界', false);
      drive().onResult('你好世界', true);
      await nextTick();
      expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('你好');
      expect(w.emitted('update:modelValue')?.length ?? 0).toBe(emitsBefore);
    });

    it('IME 组词中的 input 不触发会话重启，compositionend 后重启一次', async () => {
      const sessions: VoiceRecognizerCtx[] = [];
      const recognizer: VoiceRecognizer = (c) => {
        sessions.push(c);
        return { stop: vi.fn() };
      };
      const w = mount(Sender, { props: { voice: { recognizer } } });
      await w.find('[aria-label="语音输入"]').trigger('click'); // 会话1
      expect(sessions).toHaveLength(1);
      const ta = w.find('textarea');
      // 组词中：isComposing=true 的 input 不重启
      (ta.element as HTMLTextAreaElement).value = 'nihao';
      await ta.trigger('input', { isComposing: true });
      expect(sessions).toHaveLength(1); // 未重启
      // 组词结束落字
      (ta.element as HTMLTextAreaElement).value = '你好';
      await ta.trigger('compositionend');
      expect(sessions).toHaveLength(2); // 重启一次
      sessions[1]!.onResult('世界', true);
      await nextTick();
      expect((ta.element as HTMLTextAreaElement).value).toBe('你好世界'); // 落字成为新基线
    });
  });

  describe('toolbar 作用域插槽', () => {
    it('回传当前 value / loading / disabled，并随状态更新', async () => {
      const w = mount(Sender, {
        props: { modelValue: 'hi', loading: false, disabled: false },
        slots: {
          toolbar: (s: SenderSlotScope) =>
            h('span', { class: 'probe' }, `v=${s.value} l=${s.loading} d=${s.disabled}`),
        },
      });
      expect(w.find('.probe').text()).toBe('v=hi l=false d=false');
      await w.setProps({ loading: true, disabled: true });
      expect(w.find('.probe').text()).toBe('v=hi l=true d=true');
    });

    it('作用域 send() 触发发送（含守卫），cancel() 触发停止', async () => {
      const w = mount(Sender, {
        props: { modelValue: '问题', loading: false },
        slots: {
          toolbar: (s: SenderSlotScope) => [
            h('button', { class: 'do-send', onClick: s.send }),
            h('button', { class: 'do-cancel', onClick: s.cancel }),
          ],
        },
      });
      await w.find('.do-send').trigger('click');
      expect(w.emitted('submit')![0]).toEqual(['问题']);
      await w.find('.do-cancel').trigger('click');
      expect(w.emitted('cancel')).toHaveLength(1);
    });

    it('作用域 send() 复用发送守卫：loading 时不发送', async () => {
      const w = mount(Sender, {
        props: { modelValue: '问题', loading: true },
        slots: {
          toolbar: (s: SenderSlotScope) => h('button', { class: 'do-send', onClick: s.send }),
        },
      });
      await w.find('.do-send').trigger('click');
      expect(w.emitted('submit')).toBeUndefined();
    });

    it('作用域 clear() 清空输入', async () => {
      const w = mount(Sender, {
        props: { modelValue: '待清空' },
        slots: {
          toolbar: (s: SenderSlotScope) => h('button', { class: 'do-clear', onClick: s.clear }),
        },
      });
      await w.find('.do-clear').trigger('click');
      expect(w.emitted('update:modelValue')!.at(-1)).toEqual(['']);
    });
  });

  describe('toolbarItems', () => {
    const fakeRecognizer = () => {
      let ctx: VoiceRecognizerCtx | null = null;
      const recognizer: VoiceRecognizer = (c) => {
        ctx = c;
        return { stop: vi.fn(() => ctx?.onEnd()) };
      };
      return recognizer;
    };
    const instantUpload = vi.fn(async (f: File) => ({ name: f.name, url: `/f/${f.name}` }));

    it('语音启用时，麦克风渲染在工具栏行内，不再出现在主输入行', () => {
      const w = mount(Sender, { props: { voice: { recognizer: fakeRecognizer() } } });
      expect(w.find('.aix-sender__toolbar [aria-label="语音输入"]').exists()).toBe(true);
      expect(w.find('.aix-sender__main [aria-label="语音输入"]').exists()).toBe(false);
    });

    it('默认顺序 ["attach","voice"]：同时启用附件与语音时，附件按钮在前', () => {
      const w = mount(Sender, {
        props: {
          attachments: { upload: instantUpload },
          voice: { recognizer: fakeRecognizer() },
        },
      });
      const buttons = w.findAll('.aix-sender__toolbar button');
      expect(buttons.length).toBeGreaterThanOrEqual(2);
      expect(buttons[0]!.attributes('aria-label')).toBe('添加附件');
      expect(buttons[1]!.attributes('aria-label')).toBe('语音输入');
    });

    it('自定义顺序 ["voice","attach"]：语音按钮渲染在附件按钮之前', () => {
      const w = mount(Sender, {
        props: {
          toolbarItems: ['voice', 'attach'],
          attachments: { upload: instantUpload },
          voice: { recognizer: fakeRecognizer() },
        },
      });
      const buttons = w.findAll('.aix-sender__toolbar button');
      expect(buttons.length).toBeGreaterThanOrEqual(2);
      expect(buttons[0]!.attributes('aria-label')).toBe('语音输入');
      expect(buttons[1]!.attributes('aria-label')).toBe('添加附件');
    });

    it('默认 toolbarItems（attach+voice）均未启用时，工具栏行内不出现 attach/voice 按钮（只剩发送键）', () => {
      const w = mount(Sender);
      const toolbar = w.find('.aix-sender__toolbar');
      expect(toolbar.exists()).toBe(true);
      expect(toolbar.findAll('.aix-sender__attach-btn, .aix-sender__mic').length).toBe(0);
      expect(toolbar.find('.aix-sender__send').exists()).toBe(true);
    });

    it('自定义组件项：按 item.component 渲染并透传 item.props', () => {
      const Custom = {
        props: ['label'],
        template: '<button class="custom-item">{{ label }}</button>',
      };
      const w = mount(Sender, {
        props: { toolbarItems: [{ key: 'model', component: Custom, props: { label: '模型' } }] },
      });
      expect(w.find('.aix-sender__toolbar .custom-item').text()).toBe('模型');
    });

    it('sender scope 以独立 prop 传入，不覆盖自定义组件自身同名 prop（disabled 场景）', () => {
      const Custom = {
        props: ['disabled', 'sender'],
        template: '<div class="custom-item">{{ disabled }}-{{ sender.disabled }}</div>',
      };
      const w = mount(Sender, {
        props: {
          disabled: true, // Sender 整体禁用 → sender.disabled 应为 true
          toolbarItems: [{ key: 'x', component: Custom, props: { disabled: false } }], // 业务自己的 disabled=false 不应被覆盖
        },
      });
      expect(w.find('.custom-item').text()).toBe('false-true');
    });

    it('自定义项与内置项混排：["attach", 自定义, "voice"] 渲染顺序与数组顺序一致', () => {
      const Custom = { template: '<button class="custom-item">model</button>' };
      const w = mount(Sender, {
        props: {
          attachments: { upload: instantUpload },
          voice: { recognizer: fakeRecognizer() },
          toolbarItems: ['attach', { key: 'model', component: Custom }, 'voice'],
        },
      });
      const items = w.findAll('.aix-sender__toolbar > *');
      expect(items[0]!.attributes('aria-label')).toBe('添加附件');
      expect(items[1]!.classes()).toContain('custom-item');
      expect(items[2]!.attributes('aria-label')).toBe('语音输入');
    });

    it('未显式插入 spacer 时，发送键始终是工具栏行的最后一个子节点（隐式补在发送键前）', () => {
      const w = mount(Sender, {
        props: {
          attachments: { upload: instantUpload },
          toolbarItems: ['attach'],
        },
      });
      const items = w.findAll('.aix-sender__toolbar > *');
      expect(items.at(-1)!.classes()).toContain('aix-sender__send');
      // 只有隐式补的这一个 spacer，没有重复
      expect(w.findAll('.aix-sender__toolbar-spacer').length).toBe(1);
    });

    it('显式插入 "spacer"：切分左右分组，且不再重复补隐式 spacer', () => {
      const Custom = { template: '<button class="custom-item">model</button>' };
      const w = mount(Sender, {
        props: {
          attachments: { upload: instantUpload },
          voice: { recognizer: fakeRecognizer() },
          toolbarItems: ['attach', { key: 'model', component: Custom }, 'spacer', 'voice'],
        },
      });
      const items = w.findAll('.aix-sender__toolbar > *');
      // 顺序：attach、model、spacer、voice、send —— spacer 前的靠左，之后的（含发送键）在右
      expect(items[0]!.attributes('aria-label')).toBe('添加附件');
      expect(items[1]!.classes()).toContain('custom-item');
      expect(items[2]!.classes()).toContain('aix-sender__toolbar-spacer');
      expect(items[3]!.attributes('aria-label')).toBe('语音输入');
      expect(items[4]!.classes()).toContain('aix-sender__send');
      // 只有消费方显式放的这一个 spacer，不会再补隐式的
      expect(w.findAll('.aix-sender__toolbar-spacer').length).toBe(1);
    });

    it('spacer 不计入 is-has-toolbar 的"有可见内容"判断', () => {
      const w = mount(Sender, { props: { toolbarItems: ['spacer'] } });
      // attach/voice 均未启用，唯一的项是不可见的 spacer —— 不应被判定为"有工具栏内容"
      expect(w.classes()).not.toContain('is-has-toolbar');
    });

    it('spacer 是合法内置项，不触发"无效 toolbarItems"警告', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mount(Sender, { props: { toolbarItems: ['spacer', 'attach'] } });
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  // ── disabled 附件守卫（回归：拖放导航 / pick / remove / 同名文件）────────
  describe('disabled 附件守卫（回归）', () => {
    const instantUpload = vi.fn(async (f: File) => ({ name: f.name, url: `/f/${f.name}` }));

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('disabled 态根区域 drop：阻止浏览器默认导航（preventDefault）且不 add', async () => {
      const w = mount(Sender, {
        props: { attachments: { upload: instantUpload }, disabled: true },
      });
      const ev = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'dataTransfer', {
        value: { files: [new File(['x'], 'a.pdf')] },
      });
      w.find('.aix-sender').element.dispatchEvent(ev);
      await flushPromises();
      // 未阻止默认行为 → 浏览器导航打开文件、SPA 被整页替换
      expect(ev.defaultPrevented).toBe(true);
      expect(instantUpload).not.toHaveBeenCalled();
    });

    it('disabled 后面板 placeholder pick 不打开文件选择框', async () => {
      const w = mount(Sender, { props: { attachments: { upload: instantUpload } } });
      await w.find('[aria-label="添加附件"]').trigger('click'); // 可用态先展开面板
      const clickSpy = vi.spyOn(w.find('input[type="file"]').element as HTMLInputElement, 'click');
      await w.setProps({ disabled: true });
      await w.find('.aix-attachments-panel__placeholder').trigger('click');
      expect(clickSpy).not.toHaveBeenCalled();
    });

    it('disabled 后面板 remove 不删除附件卡片', async () => {
      const w = mount(Sender, { props: { attachments: { upload: instantUpload } } });
      const input = w.find('input[type="file"]');
      Object.defineProperty(input.element, 'files', {
        value: [new File(['x'], 'a.pdf')],
        configurable: true,
      });
      await input.trigger('change');
      await flushPromises();
      expect(w.findAll('.aix-attachment-card')).toHaveLength(1);
      await w.setProps({ disabled: true });
      await w.find('[aria-label="删除附件"]').trigger('click');
      await flushPromises();
      expect(w.findAll('.aix-attachment-card')).toHaveLength(1);
    });

    it('disabled 期间触发 change 也要清空 input.value（否则恢复后同名文件永久无法添加）', async () => {
      const w = mount(Sender, {
        props: { attachments: { upload: instantUpload }, disabled: true },
      });
      const input = w.find('input[type="file"]');
      let val = 'C:\\fakepath\\a.pdf';
      Object.defineProperty(input.element, 'value', {
        get: () => val,
        set: (v: string) => {
          val = v;
        },
        configurable: true,
      });
      Object.defineProperty(input.element, 'files', {
        value: [new File(['x'], 'a.pdf')],
        configurable: true,
      });
      await input.trigger('change');
      expect(instantUpload).not.toHaveBeenCalled(); // disabled：不 add
      expect(val).toBe(''); // 但 value 必须清空，否则原生 change 对同名文件不再触发
    });
  });
});
