import { flushPromises, mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { h, nextTick, reactive } from 'vue';
import AiChat from '../src/components/AiChat.vue';

vi.mock('virtua/vue', () => ({
  Virtualizer: {
    name: 'Virtualizer',
    props: ['data', 'keepMounted'],
    setup(props: any, { slots }: any) {
      return () => (props.data as unknown[]).map((item, i) => slots.default?.({ item, index: i }));
    },
  },
}));

function once(text: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(`data: ${JSON.stringify({ delta: text })}\n\n`));
      c.enqueue(enc.encode('data: [DONE]\n\n'));
      c.close();
    },
  });
}

/**
 * `#footer` 的内容有两类依赖，来源不同、失效路径也不同，必须都能驱动重渲染。
 * 包裹层（Bubble 的 FooterWrap）是个只在 render / status 两个 prop 变化时才更新的
 * 函数式组件，故这两条各自对应一个不变量：
 *
 * ① **插槽内部直接读到的响应式数据**（业务自己的 store / ref）——由 FooterWrap 自己的
 *    render effect 收集。典型形态是「与回答并行拉取、回来得比回答晚」的旁路数据：
 *    此时消息早已是 success、AiChat 自身没有任何依赖变化，只有插槽内容的依赖动了。
 * ② **插槽作用域参数**（item / branch / branchDisabled / actions）——它们不是响应式对象，
 *    值随 AiChat 重渲染产出的新插槽闭包一起更新，靠 render prop 的引用变化驱动。
 *
 * 两条都是外部接入方的实际用法（分支切换器、赞踩态、并行拉取的图表/参考资料卡），
 * 一旦漏掉表现都是「数据到了但 footer 不更新」，且不报错。
 */
describe('AiChat #footer 作用域插槽的两类依赖都能驱动重渲染', () => {
  it('① 插槽内部读的外部 store 在消息终态之后回填，footer 仍随之更新', async () => {
    // 与回答并行拉取的旁路数据（图表 / 参考资料），回来得比回答晚
    const sideStore = reactive<Record<string, string>>({});
    const w = mount(AiChat, {
      props: { request: () => Promise.resolve(once('答案')) },
      slots: {
        footer: (sp: any) =>
          h('div', { class: 'biz-footer' }, [
            sideStore[sp.item.id] ? h('span', { class: 'side' }, sideStore[sp.item.id]) : null,
          ]),
      },
    });
    await w.vm.onSend('问题');
    await flushPromises();
    await nextTick();
    const list = (w.vm as any).messages;
    const aiId = list[list.length - 1].id;
    expect(list[list.length - 1].status).toBe('success');
    expect(w.find('.side').exists()).toBe(false);

    // 此刻消息已终态，AiChat 自身无任何依赖变化——只有插槽内容读到的 store 动了
    sideStore[aiId] = '旁路数据';
    await nextTick();
    expect(w.find('.side').exists()).toBe(true);
    expect(w.find('.side').text()).toBe('旁路数据');
  });

  it('② 插槽作用域的 branch：重新生成产生兄弟分支后，自绘切换器应出现', async () => {
    const w = mount(AiChat, {
      props: { request: () => Promise.resolve(once('答案')) },
      slots: {
        footer: (sp: any) =>
          h('div', { class: 'biz-footer' }, [
            sp.branch
              ? h('span', { class: 'br' }, `${sp.branch.index + 1}/${sp.branch.count}`)
              : null,
          ]),
      },
    });
    await w.vm.onSend('问题');
    await flushPromises();
    await nextTick();
    expect(w.find('.br').exists()).toBe(false); // 单版本不出切换器

    const list = (w.vm as any).messages;
    await (w.vm as any).onReload(list[list.length - 1].id);
    await flushPromises();
    await nextTick();
    expect(w.find('.br').exists()).toBe(true);
    expect(w.find('.br').text()).toBe('2/2');
  });
});
