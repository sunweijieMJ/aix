import { mount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextTick } from 'vue';
import Sender from '../src/components/Sender.vue';
import TriggerMenu from '../src/components/TriggerMenu.vue';
import type { TriggerConfig } from '../src/types';

const users: TriggerConfig = {
  char: '@',
  items: [
    { value: 'zhangsan', label: '张三' },
    { value: 'lisi', label: '李四' },
  ],
};
const commands: TriggerConfig = {
  char: '/',
  items: [{ value: 'translate', label: '/翻译', insertText: '请翻译：', keepTrigger: false }],
};

/** 在 textarea 键入文本并把光标置于末尾，触发 input 事件 */
async function type(w: ReturnType<typeof mount>, text: string) {
  const ta = w.find('textarea');
  const el = ta.element as HTMLTextAreaElement;
  el.value = text;
  el.selectionStart = el.selectionEnd = text.length;
  await ta.trigger('input');
  await nextTick();
}

describe('Sender 触发菜单', () => {
  // 菜单 Teleport 到 body：某用例失败中断（未走到 unmount）时传送节点会残留 body，
  // 污染后续用例的 document 查询——每例前兜底清理，failing 测试不连坐
  beforeEach(() => {
    document.querySelectorAll('.aix-trigger-menu').forEach((n) => n.remove());
  });

  it('键入 @ 打开菜单并按 query 过滤静态 items', async () => {
    const w = mount(Sender, { props: { triggers: [users] }, attachTo: document.body });
    await type(w, '@张');
    const menu = document.querySelector('.aix-trigger-menu');
    expect(menu).toBeTruthy();
    expect(menu!.textContent).toContain('张三');
    expect(menu!.textContent).not.toContain('李四');
    w.unmount();
  });

  it('TriggerMenu 收到 textarea 作为虚拟锚点 contextEl（可滚动容器内跟随的前提）', async () => {
    const w = mount(Sender, { props: { triggers: [users] }, attachTo: document.body });
    await type(w, '@');
    expect(w.findComponent(TriggerMenu).props('contextEl')).toBe(w.find('textarea').element);
    w.unmount();
  });

  it('菜单开时 Enter 选中而非提交；插入 @label + 空格并关菜单', async () => {
    const w = mount(Sender, { props: { triggers: [users] }, attachTo: document.body });
    await type(w, '@张');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await nextTick();
    expect(w.emitted('submit')).toBeUndefined();
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('@张三 ');
    expect(document.querySelector('.aix-trigger-menu')).toBeNull();
    w.unmount();
  });

  it('组词中（isComposing）Enter/↑↓ 不被菜单拦截', async () => {
    const w = mount(Sender, { props: { triggers: [users] }, attachTo: document.body });
    await type(w, '@');
    await w.find('textarea').trigger('keydown', { key: 'Enter', isComposing: true });
    // 组词 Enter 归输入法：不选中、不改值
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('@');
    w.unmount();
  });

  it('↑↓ 移动高亮（受控 activeIndex），Esc 关菜单', async () => {
    const w = mount(Sender, { props: { triggers: [users] }, attachTo: document.body });
    await type(w, '@');
    await w.find('textarea').trigger('keydown', { key: 'ArrowDown' });
    await nextTick();
    const active = document.querySelector('.aix-trigger-menu .is-active');
    expect(active!.textContent).toContain('李四');
    await w.find('textarea').trigger('keydown', { key: 'Escape' });
    await nextTick();
    expect(document.querySelector('.aix-trigger-menu')).toBeNull();
    // 同一按键的 keyup 复检（真实浏览器必发）：dismiss 语义保证不重开
    await w.find('textarea').trigger('keyup', { key: 'Escape' });
    await nextTick();
    expect(document.querySelector('.aix-trigger-menu')).toBeNull();
    // 继续键入改变 query：解除驳回，菜单恢复
    await type(w, '@张三');
    expect(document.querySelector('.aix-trigger-menu')).toBeTruthy();
    w.unmount();
  });

  it('/ 命令选中：insertText 回填且不保留触发字符，已键入触发段被清除', async () => {
    const w = mount(Sender, { props: { triggers: [commands] }, attachTo: document.body });
    await type(w, '/翻');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await nextTick();
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('请翻译：');
    w.unmount();
  });

  it('纯 onSelect 命令（无 insertText）：清除触发段并执行回调', async () => {
    const onSelect = vi.fn();
    const cfg: TriggerConfig = { char: '/', items: [{ value: 'clear', label: '/清空', onSelect }] };
    const w = mount(Sender, { props: { triggers: [cfg] }, attachTo: document.body });
    await type(w, '/清');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await nextTick();
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('');
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: '/', query: '清' }),
    );
    w.unmount();
  });

  it('异步 items：竞态令牌丢弃旧结果', async () => {
    let resolveA!: (v: never[]) => void;
    const fn = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (resolveA = r)))
      .mockImplementationOnce(() => Promise.resolve([{ value: 'b', label: 'B命中' }]));
    const w = mount(Sender, {
      props: { triggers: [{ char: '@', items: fn }] },
      attachTo: document.body,
    });
    await type(w, '@a');
    await type(w, '@ab'); // query 变化，令牌 +1
    resolveA([]); // 旧 Promise 后到
    await nextTick();
    await nextTick();
    expect(document.querySelector('.aix-trigger-menu')!.textContent).toContain('B命中');
    w.unmount();
  });

  it('异步 items 加载中：旧候选被清空，Enter 不回填陈旧项（只关菜单不提交）', async () => {
    let resolveB!: (v: { value: string; label: string }[]) => void;
    const fn = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve([{ value: 'a', label: 'Alice' }]))
      .mockImplementationOnce(() => new Promise<{ value: string; label: string }[]>((r) => (resolveB = r)));
    const w = mount(Sender, {
      props: { triggers: [{ char: '@', items: fn }] },
      attachTo: document.body,
    });
    await type(w, '@a');
    await nextTick();
    await nextTick();
    expect(document.querySelector('.aix-trigger-menu')!.textContent).toContain('Alice');
    await type(w, '@ab'); // 第二轮进入 loading（Promise 挂起）
    // loading 窗口内按 Enter：不得选中上一轮的不可见候选 'Alice'
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await nextTick();
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('@ab'); // 未回填
    expect(w.emitted('submit')).toBeUndefined(); // 空列表回车消费按键，不提交
    expect(document.querySelector('.aix-trigger-menu')).toBeNull(); // 关闭菜单
    // 迟到的 Promise 结果已被作废，不得回写陈旧候选重开菜单
    resolveB([{ value: 'ab', label: 'AB命中' }]);
    await nextTick();
    await nextTick();
    expect(document.querySelector('.aix-trigger-menu')).toBeNull();
    w.unmount();
  });

  it('异步 items reject：静默关菜单并 warn 一次', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const w = mount(Sender, {
      props: { triggers: [{ char: '@', items: () => Promise.reject(new Error('x')) }] },
      attachTo: document.body,
    });
    await type(w, '@a');
    await nextTick();
    await nextTick();
    expect(document.querySelector('.aix-trigger-menu')).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    w.unmount();
  });

  it('粘贴不进入触发态', async () => {
    const w = mount(Sender, { props: { triggers: [users] }, attachTo: document.body });
    const ta = w.find('textarea');
    const el = ta.element as HTMLTextAreaElement;
    el.value = '@张';
    el.selectionStart = el.selectionEnd = 2;
    // 模拟粘贴产生的 input 事件（inputType: insertFromPaste）
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertFromPaste', bubbles: true }));
    await nextTick();
    expect(document.querySelector('.aix-trigger-menu')).toBeNull();
    w.unmount();
  });

  it('失焦关闭菜单；外部 modelValue 改写清空触发态', async () => {
    const w = mount(Sender, { props: { triggers: [users] }, attachTo: document.body });
    await type(w, '@张');
    await w.find('textarea').trigger('blur');
    await nextTick();
    expect(document.querySelector('.aix-trigger-menu')).toBeNull();
    await type(w, '@张');
    await w.setProps({ modelValue: '外部改写' });
    await nextTick();
    expect(document.querySelector('.aix-trigger-menu')).toBeNull();
    w.unmount();
  });

  it('未配置 triggers：零开销，不渲染菜单、行为与旧版全同', async () => {
    const w = mount(Sender, { attachTo: document.body });
    await type(w, '@张');
    expect(document.querySelector('.aix-trigger-menu')).toBeNull();
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    expect(w.emitted('submit')![0]).toEqual(['@张']);
    w.unmount();
  });

  it('重复 char 配置 dev warn 一次', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount(Sender, { props: { triggers: [users, { char: '@', items: [] }] } });
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('组词中的 keyup 不复检：不触发 items 调用、菜单态不变', async () => {
    const items = vi.fn(() => [{ value: 'zhangsan', label: '张三' }]);
    const w = mount(Sender, {
      props: { triggers: [{ char: '@', items }] },
      attachTo: document.body,
    });
    await type(w, '@张');
    const calls = items.mock.calls.length;
    expect(document.querySelector('.aix-trigger-menu')).toBeTruthy();
    // 组词期间浏览器逐键：推进拼音预览文本并发 input(isComposing) 更新 inner、再发 keyup(isComposing)。
    // 必须经 input 事件更新响应式 inner（runDetect 读 inner 非 DOM value），否则守卫缺失时
    // detect 的等值保持仍让断言通过（假绿）——本用例已做变异验证
    const el = w.find('textarea').element as HTMLTextAreaElement;
    el.value = '@张zh';
    el.selectionStart = el.selectionEnd = 4;
    await w.find('textarea').trigger('input', { isComposing: true }); // 组词 input：更新 inner、不检测
    await w.find('textarea').trigger('keyup', { isComposing: true });
    await nextTick();
    expect(items.mock.calls.length).toBe(calls); // 未以拼音预览 query 新增调用
    // keyCode 229 兼容写法同样不复检（继续推进预览文本）
    el.value = '@张zha';
    el.selectionStart = el.selectionEnd = 5;
    await w.find('textarea').trigger('input', { isComposing: true });
    await w.find('textarea').trigger('keyup', { keyCode: 229 });
    await nextTick();
    expect(items.mock.calls.length).toBe(calls);
    w.unmount();
  });

  it('自定义 insertText 无尾随空白：Enter 选中的 keyup 不重开菜单，继续键入可恢复', async () => {
    // 插入 '#话题' 型 token（keepTrigger + 无尾随空格）：插入后光标前仍是合法触发上下文
    const topic: TriggerConfig = {
      char: '#',
      position: 'anywhere',
      items: [{ value: 'topic', label: '话题', insertText: '话题', keepTrigger: true }],
    };
    const w = mount(Sender, { props: { triggers: [topic] }, attachTo: document.body });
    await type(w, '#话');
    expect(document.querySelector('.aix-trigger-menu')).toBeTruthy();
    await w.find('textarea').trigger('keydown', { key: 'Enter' }); // 选中 → 回填 '#话题'
    await nextTick();
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('#话题');
    // Enter 的 keyup（真实浏览器必发）：插入后上下文已被驳回，不得重开
    await w.find('textarea').trigger('keyup', { key: 'Enter' });
    await nextTick();
    expect(document.querySelector('.aix-trigger-menu')).toBeNull();
    // 继续键入改变 query：解除驳回，菜单恢复（与 Esc 驳回同语义）
    await type(w, '#话题热');
    expect(document.querySelector('.aix-trigger-menu')).toBeTruthy();
    w.unmount();
  });

  // ── 语音 × 触发菜单互斥（实现见 runDetect isListening 守卫 + onMicClick 先关菜单）──
  describe('语音互斥', () => {
    const fakeRecognizer = () => {
      let ctx: { onResult: (t: string, final: boolean) => void; onEnd: () => void } | null = null;
      const stop = vi.fn(() => ctx?.onEnd());
      const recognizer = (c: typeof ctx & object) => {
        ctx = c;
        return { stop };
      };
      return { recognizer, stop };
    };

    it('聆听中键入触发字符：不进入触发态（interim 回填会改写文本/光标）', async () => {
      const { recognizer } = fakeRecognizer();
      const w = mount(Sender, {
        props: { triggers: [users], voice: { recognizer } },
        attachTo: document.body,
      });
      await w.find('[aria-label="语音输入"]').trigger('click'); // 开始聆听
      await type(w, '@张');
      expect(document.querySelector('.aix-trigger-menu')).toBeNull();
      w.unmount();
    });

    it('菜单打开时点击麦克风开始聆听：先关闭菜单', async () => {
      const { recognizer } = fakeRecognizer();
      const w = mount(Sender, {
        props: { triggers: [users], voice: { recognizer } },
        attachTo: document.body,
      });
      await type(w, '@张');
      expect(document.querySelector('.aix-trigger-menu')).toBeTruthy();
      await w.find('[aria-label="语音输入"]').trigger('click');
      await nextTick();
      expect(document.querySelector('.aix-trigger-menu')).toBeNull();
      w.unmount();
    });
  });
});
