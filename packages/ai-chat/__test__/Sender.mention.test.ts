import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import Sender from '../src/components/Sender.vue';
import type { TriggerConfig } from '../src/types';

const users: TriggerConfig = {
  char: '@',
  items: [
    { value: 'zhangsan', label: '张三' },
    { value: 'zhangsan2', label: '张三' }, // 重名不同 value，测配额
    { value: 'lisi', label: '李四' },
  ],
};

async function type(w: ReturnType<typeof mount>, text: string, cursor = text.length) {
  const ta = w.find('textarea');
  const el = ta.element as HTMLTextAreaElement;
  el.value = text;
  el.selectionStart = el.selectionEnd = cursor;
  await ta.trigger('input');
  await nextTick();
}

/** 经菜单选中第 index 项（默认第 0 项） */
async function pick(w: ReturnType<typeof mount>, index = 0) {
  for (let i = 0; i < index; i++) {
    await w.find('textarea').trigger('keydown', { key: 'ArrowDown' });
  }
  await w.find('textarea').trigger('keydown', { key: 'Enter' });
  await nextTick();
}

const ta = (w: ReturnType<typeof mount>) => w.find('textarea').element as HTMLTextAreaElement;

describe('Sender mention 语义', () => {
  it('提交携带 meta.mentions；提交后旁路数组清空', async () => {
    const w = mount(Sender, { props: { triggers: [users] }, attachTo: document.body });
    await type(w, '@张');
    await pick(w);
    await type(w, `${ta(w).value}帮我问下`);
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    const [text, atts, meta] = w.emitted('submit')![0] as unknown[];
    expect(text).toBe('@张三 帮我问下');
    expect(atts).toBeUndefined();
    expect(meta).toEqual({
      mentions: [{ value: 'zhangsan', label: '张三', trigger: '@' }],
    });
    // 再次纯文本提交：不携带 meta（数组已清空）
    await type(w, '第二条');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    expect(w.emitted('submit')![1]).toEqual(['第二条']);
    w.unmount();
  });

  it('token 被手动删改：配额校验丢弃对应条目', async () => {
    const w = mount(Sender, { props: { triggers: [users] }, attachTo: document.body });
    await type(w, '@张');
    await pick(w);
    await type(w, '张三 改坏了'); // 手动改写：删掉了 @ 前缀
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    expect(w.emitted('submit')![0]).toEqual(['张三 改坏了']); // 无 meta
    w.unmount();
  });

  it('重名 mention 删一留一：meta 只保留配额内条目（无幽灵项）', async () => {
    const w = mount(Sender, { props: { triggers: [users] }, attachTo: document.body });
    await type(w, '@张');
    await pick(w, 0); // zhangsan
    await type(w, `${ta(w).value}@张`);
    await pick(w, 1); // zhangsan2（同 label 张三）
    // 手动删掉一个 token：文本只剩一个 @张三
    await type(w, '@张三 问题');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    const meta = (w.emitted('submit')![0] as unknown[])[2] as { mentions: unknown[] };
    expect(meta.mentions).toHaveLength(1); // 配额=1，先进先出保留 zhangsan
    expect(meta.mentions[0]).toMatchObject({ value: 'zhangsan' });
    w.unmount();
  });

  it('Backspace 在完整 token 末尾：整体删除并移除一条旁路记录', async () => {
    const w = mount(Sender, { props: { triggers: [users] }, attachTo: document.body });
    await type(w, '@张');
    await pick(w); // 值为 '@张三 '，光标在末尾
    await w.find('textarea').trigger('keydown', { key: 'Backspace' });
    await nextTick();
    expect(ta(w).value).toBe('');
    // 再提交：无 meta（记录已随整体删除移除）
    await type(w, 'x');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    expect(w.emitted('submit')![0]).toEqual(['x']);
    w.unmount();
  });

  it('Backspace 光标不在 token 末尾：正常逐字删除（不拦截）', async () => {
    const w = mount(Sender, { props: { triggers: [users] }, attachTo: document.body });
    await type(w, '@张');
    await pick(w);
    // 光标移到中间（'@张' 之后）
    ta(w).selectionStart = ta(w).selectionEnd = 2;
    await w.find('textarea').trigger('keydown', { key: 'Backspace' });
    // 未 preventDefault：值不被组件改动（jsdom 不执行默认删除，值保持）
    expect(ta(w).value).toBe('@张三 ');
    w.unmount();
  });

  it('整体删除按最长候选匹配（@张三丰 整删，不受较短 label 干扰）', async () => {
    const long: TriggerConfig = {
      char: '@',
      items: [
        { value: 'a', label: '张三' },
        { value: 'b', label: '张三丰' },
      ],
    };
    const w = mount(Sender, { props: { triggers: [long] }, attachTo: document.body });
    await type(w, '@张');
    await pick(w, 1); // 张三丰 → '@张三丰 '
    await w.find('textarea').trigger('keydown', { key: 'Backspace' });
    await nextTick();
    expect(ta(w).value).toBe(''); // 最长匹配整删 @张三丰，而非只删 @张三
    w.unmount();
  });
});
