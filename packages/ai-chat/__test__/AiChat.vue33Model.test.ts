/**
 * Vue 3.3 兼容护栏：`v-model:messages` / `v-model:tree` 两条通道在 3.3 语义下的行为。
 *
 * 本包 peer 声明 `vue: ^3.3.0`，但测试与开发基线是 3.5.x，3.3 从未被真正跑过——3.3 支持
 * 此前只靠源码注释维系。审计下来 ai-chat 对 3.3 的风险面其实很窄（`@aix/hooks` 的 useId
 * 自带 3.5/低版本分支，hooks·popper 未使用任何 3.5-only API），**唯一的分叉点是 defineModel**：
 *
 *   vue@3.3.13 runtime-core useModel 默认分支（无 options.local）：
 *     get value() { return props[name]; }
 *     set value(v) { i.emit(`update:${name}`, v); }     ← 只 emit，不维护本地 ref
 *   vue@3.4+ 改为 customRef + 本地 ref，写入会同步反映到 .value。
 *
 * 所以本文件把 useModel 打桩成 3.3 的实现（等于把运行时降级回 3.3）复跑两条通道的关键契约。
 * 若日后有人让某处依赖「写入 model 后能立刻读回新值」这一 3.4+ 才成立的前提，3.5 下 CI 全绿、
 * 3.3 业务侧直接坏——本文件就是为拦住那种改动而存在的。
 *
 * 注：AiChat 对 `input` / Conversations 对 `activeKey` 用的是 useControllable 而非 defineModel，
 * 正是为了绕开这条 emit-only 语义（见各自源码注释），故不在本文件覆盖范围内。
 */
import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { nextTick, defineComponent, h, ref } from 'vue';
import AiChat from '../src/components/AiChat.vue';
import type { ChatMessage, ExportedTree } from '../src/types';

vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>();
  return {
    ...actual,
    // 逐字复刻 vue@3.3.13 的 useModel 默认分支（emit-only、无本地 ref）
    useModel: (props: Record<string, unknown>, name: string) => {
      const i = actual.getCurrentInstance()!;
      return {
        __v_isRef: true,
        get value() {
          return props[name];
        },
        set value(v: unknown) {
          (i as unknown as { emit: (e: string, v: unknown) => void }).emit(`update:${name}`, v);
        },
      };
    },
  };
});

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

const enc = new TextEncoder();
const streamRequest = () =>
  Promise.resolve(
    new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('data: {"delta":"Hello"}\n\n'));
        c.enqueue(enc.encode('data: {"delta":" world"}\n\n'));
        c.enqueue(enc.encode('data: [DONE]\n\n'));
        c.close();
      },
    }),
  );

const settle = async () => {
  for (let i = 0; i < 30; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 20));
  for (let i = 0; i < 10; i++) await nextTick();
};

const lastAiOf = (tree: ExportedTree) =>
  [...tree.nodes].reverse().find((n) => n.message.role === 'ai')?.message;

describe('Vue 3.3 语义（useModel emit-only）下的 v-model 通道', () => {
  it('v-model:tree：落终态导出仍带完整内容与终态', async () => {
    const snapshots: ExportedTree[] = [];
    const treeRef = ref<ExportedTree | undefined>(undefined);
    const Host = defineComponent({
      setup() {
        return () =>
          h(AiChat, {
            request: streamRequest,
            tree: treeRef.value,
            'onUpdate:tree': (v: ExportedTree) => {
              snapshots.push(JSON.parse(JSON.stringify(v)) as ExportedTree);
              treeRef.value = v;
            },
          });
      },
    });
    const wrapper = mount(Host);
    await nextTick();
    await (
      wrapper.findComponent(AiChat).vm as unknown as { onSend: (s: string) => Promise<void> }
    ).onSend('hi');
    await settle();

    const last = lastAiOf(snapshots[snapshots.length - 1]!)!;
    expect(last.status).toBe('success');
    expect((last.content[0] as { text: string }).text).toBe('Hello world');
  });

  it('v-model:tree：两轮对话后写回的 prop 不误触发反向导入清空内部树', async () => {
    const treeRef = ref<ExportedTree | undefined>(undefined);
    const Host = defineComponent({
      setup() {
        return () =>
          h(AiChat, {
            request: streamRequest,
            tree: treeRef.value,
            'onUpdate:tree': (v: ExportedTree) => {
              treeRef.value = v;
            },
          });
      },
    });
    const wrapper = mount(Host);
    await nextTick();
    const vm = wrapper.findComponent(AiChat).vm as unknown as {
      onSend: (s: string) => Promise<void>;
      messages: ChatMessage[];
    };
    await vm.onSend('q1');
    await settle();
    await vm.onSend('q2');
    await settle();

    expect(treeRef.value!.nodes).toHaveLength(4);
    expect(vm.messages).toHaveLength(4);
    expect(lastAiOf(treeRef.value!)!.status).toBe('success');
  });

  it('v-model:messages：镜像输出照常 emit（3.3 下本地写入被丢弃，但 UI 不依赖它）', async () => {
    const seen: ChatMessage[][] = [];
    const Host = defineComponent({
      setup() {
        return () =>
          h(AiChat, {
            request: streamRequest,
            messages: [],
            'onUpdate:messages': (v: ChatMessage[]) => {
              seen.push(v);
            },
          });
      },
    });
    const wrapper = mount(Host);
    await nextTick();
    const vm = wrapper.findComponent(AiChat).vm as unknown as {
      onSend: (s: string) => Promise<void>;
      messages: ChatMessage[];
    };
    await vm.onSend('hi');
    await settle();

    // 对外镜像照常发出；UI 的真源是 useChat 的 parsedMessages，不受 emit-only 影响
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toHaveLength(2);
    expect(vm.messages).toHaveLength(2);
  });
});
