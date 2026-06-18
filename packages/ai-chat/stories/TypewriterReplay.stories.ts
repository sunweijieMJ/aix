import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent, waitFor } from 'storybook/test';
import { defineComponent, h, ref, computed, watch, onMounted, nextTick } from 'vue';
import { Bubble, useTypewriter, textBlock } from '../src';

/**
 * 打字机「重挂载重播」复现与对照
 * ================================
 *
 * 背景（业务现场）：`BubbleList` 用 `virtua` 虚拟列表渲染气泡，滚出视口的气泡会被**卸载**、
 * 滚回时**重新挂载**。而组件库对「曾经流式过」的消息会持续保持 `typing=true`
 * （`streamedIds` 直到消息离开列表才剔除，目的是让数据快于打字机时仍能把缓冲打完）。
 *
 * 这两点叠加后，「打字机的实现是否在重挂载时从头重播」就完全取决于 `useTypewriter`
 * 的 `source` 在重挂载那一刻是不是完整文本：
 *
 * - **内置 `TextBlock`（安全）**：`useTypewriter` 内部 `displayed = ref(source.value)`，
 *   重挂载时 `source` 已是完整文本 → 快照即全文 → 不重播。
 * - **自定义块渲染器（危险）**：若自己 `const source = ref('')` 再在 `onMounted` 里填充
 *   （这是让卡片产生逐字效果的常见写法），重挂载时 `source` 又被重置为空 →
 *   打字机从头跑一遍 → 用户看到「滚回去又重新输出一遍」。
 *
 * 这正是业务里 `QuestionCard`（自定义 `question` 块）遇到的问题。本文件用一个
 * 「卸载并重挂载」按钮确定性地复现 virtua 滚动时的卸载/重挂载，对照三种实现的表现。
 *
 * 【组件库根治（已落地）】`BubbleList` 现在会在消息「进入终态 + 逐字播放完成」后关闭其
 * typing（见 `completedIds` / `handleTypingComplete`）——完成信号来自块渲染器上抛的
 * `typing-complete` 事件。内置 `TextBlock` 会 emit 该事件，故内置块重挂载彻底不重播；
 * **自定义块渲染器要享受同样的保护，必须在自身打字机追平末尾时 `emit('typing-complete')`**
 * （这是块渲染器契约的一部分）。一旦接入该事件，自定义块即可删掉「模块级 Set 自管防重播」
 * 的兜底守卫——下方「带守卫」一栏演示的就是这种**渲染器自管**的旧兜底范式，
 * 接入 `typing-complete` 后不再需要。
 */

// 模拟一张「已生成完毕」的题卡正文：内置块与自定义块用同一段文本，方便对照
const FULL =
  '题干：以下哪个是 Vue 3 组合式 API 的入口？A. data 选项 B. setup 函数 C. mounted 钩子 D. computed';

// 打字机节奏放慢，便于在 Canvas 与断言中观察「是否重新逐字」（默认 30ms/[1,3] 太快不易肉眼分辨）
const TYPING = { interval: 40, step: 1 as const };

// ─────────────────────────────────────────────────────────────
// 自定义块渲染器（无守卫）—— 复现 bug
// 与业务 QuestionCard 早期写法同构：source 初始空、挂载后填充 → 重挂载必从头重播。
// ─────────────────────────────────────────────────────────────
let naiveMountSeq = 0;
const NaiveCustomCard = defineComponent({
  name: 'NaiveCustomCard',
  props: { typing: { type: Boolean, default: true } },
  setup(props) {
    const mountNo = (naiveMountSeq += 1);
    const source = ref(''); // ⚠️ 每次挂载都重置为空
    const { displayed } = useTypewriter(source, {
      enabled: () => props.typing,
      ...TYPING,
    });
    // 挂载时快照：无守卫实现每次挂载都从空串起步，所以这里恒为 ''（即「会重播」的根因）
    const initialSnapshot = displayed.value;
    onMounted(() => {
      source.value = FULL;
    });
    return () =>
      h(
        'div',
        {
          'data-testid': 'card',
          'data-mount': String(mountNo),
          'data-initial': initialSnapshot,
          style:
            'padding:12px 14px;border-radius:10px;border:1px solid var(--aix-colorBorderSecondary);background:var(--aix-colorBgContainer);min-height:64px;',
        },
        displayed.value,
      );
  },
});

// ─────────────────────────────────────────────────────────────
// 自定义块渲染器（带守卫）—— 修复范式
// 模块级 Set 记录「已播完」的块 id；重挂载命中即直接全显，不再逐字。
// ─────────────────────────────────────────────────────────────
const typedIds = new Set<string>();
let guardedMountSeq = 0;
const GuardedCustomCard = defineComponent({
  name: 'GuardedCustomCard',
  props: {
    blockId: { type: String, required: true },
    typing: { type: Boolean, default: true },
  },
  setup(props) {
    const mountNo = (guardedMountSeq += 1);
    const source = ref('');
    // revealed=true 表示直接全显：已播过（在 Set 里）或非打字态
    const revealed = ref(typedIds.has(props.blockId) || !props.typing);
    const { displayed } = useTypewriter(source, {
      enabled: () => !revealed.value,
      ...TYPING,
    });
    // 已全显时取全文，否则取打字机当前进度
    const shown = computed(() => (revealed.value ? FULL : displayed.value));
    const initialSnapshot = shown.value; // 重挂载且已播过 → 快照即全文
    onMounted(() => {
      if (!revealed.value) source.value = FULL;
    });
    // 追平全文即标记「已播完」，记入 Set 防重挂载重播
    watch(displayed, (d) => {
      if (!revealed.value && source.value && d.length >= FULL.length) {
        revealed.value = true;
        typedIds.add(props.blockId);
      }
    });
    return () =>
      h(
        'div',
        {
          'data-testid': 'card',
          'data-mount': String(mountNo),
          'data-initial': initialSnapshot,
          style:
            'padding:12px 14px;border-radius:10px;border:1px solid var(--aix-colorBorderSecondary);background:var(--aix-colorBgContainer);min-height:64px;',
        },
        shown.value,
      );
  },
});

// ─────────────────────────────────────────────────────────────
// 「卸载并重挂载」面板：v-if 切换模拟 virtua 滚动时的卸载/重挂载
// ─────────────────────────────────────────────────────────────
const RemountPanel = defineComponent({
  name: 'RemountPanel',
  props: { title: { type: String, default: '' } },
  setup(props, { slots }) {
    const mounted = ref(true);
    const remount = async () => {
      // 先卸载、待 DOM 真正移除后再挂载，确保触发一次完整的 unmount → mount
      mounted.value = false;
      await nextTick();
      mounted.value = true;
    };
    return () =>
      h(
        'div',
        {
          style:
            'display:flex;flex-direction:column;gap:10px;flex:1;min-width:240px;padding:14px;border-radius:12px;background:var(--aix-colorFillTertiary);',
        },
        [
          h(
            'div',
            { style: 'font-size:13px;font-weight:600;color:var(--aix-colorText);' },
            props.title,
          ),
          h(
            'button',
            {
              type: 'button',
              'data-testid': 'remount',
              onClick: remount,
              style:
                'align-self:flex-start;padding:4px 12px;border-radius:8px;border:1px solid var(--aix-colorBorder);background:var(--aix-colorBgContainer);color:var(--aix-colorText);cursor:pointer;font-size:12px;',
            },
            '卸载并重挂载（模拟滚动）',
          ),
          mounted.value
            ? slots.default?.()
            : h('div', { style: 'min-height:64px;opacity:0.4;' }, '（已卸载）'),
        ],
      );
  },
});

const meta: Meta = {
  title: 'AI Chat/打字机重挂载重播',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '复现并对照「问答流输出结束后，滚回去又重新逐字输出一遍」的问题。根因是虚拟列表滚动会' +
          '卸载/重挂载气泡，而组件库对流式过的消息持续保持 typing=true；此时打字机是否重播取决于' +
          '其 source 在重挂载时是否为完整文本。内置 TextBlock 用挂载快照规避；自定义块渲染器若' +
          '「source 初始空 + onMounted 填充」则会重播，需自行用「已播完」标记守卫。',
      },
    },
  },
};
export default meta;
type Story = StoryObj;

/**
 * 三栏对照：点各栏「卸载并重挂载」按钮，观察哪一栏会重新逐字。
 * - 内置文本块：重挂载后**直接全显**（快照保护）。
 * - 自定义块（无守卫）：重挂载后**从头重播**（bug）。
 * - 自定义块（带守卫）：重挂载后**直接全显**（修复范式）。
 */
export const 重挂载对比: Story = {
  render: () => ({
    components: { Bubble, RemountPanel, NaiveCustomCard, GuardedCustomCard },
    setup: () => ({ content: [textBlock(FULL)] }),
    template: `
      <div style="display:flex;gap:16px;flex-wrap:wrap;padding:24px;background:var(--aix-colorBgLayout);min-height:100vh;align-items:flex-start;">
        <RemountPanel title="内置文本块 TextBlock（快照保护，不重播）">
          <Bubble :content="content" :typing="true" role="ai" status="success" variant="filled" />
        </RemountPanel>
        <RemountPanel title="自定义块 · 无守卫（重挂载会重播 — 复现 bug）">
          <NaiveCustomCard :typing="true" />
        </RemountPanel>
        <RemountPanel title="自定义块 · 带守卫（重挂载不重播 — 修复范式）">
          <GuardedCustomCard block-id="demo-fixed" :typing="true" />
        </RemountPanel>
      </div>
    `,
  }),
};

/**
 * 自动化复现：自定义块（无守卫）在重挂载后从空串重新逐字。
 * 用 data-initial（挂载时快照）作无竞态断言——重挂载后仍为空串即证明会重播。
 */
export const 自定义块重播复现: Story = {
  render: () => ({
    components: { RemountPanel, NaiveCustomCard },
    template: `
      <div style="padding:24px;background:var(--aix-colorBgLayout);min-height:100vh;">
        <RemountPanel title="自定义块 · 无守卫">
          <NaiveCustomCard :typing="true" />
        </RemountPanel>
      </div>
    `,
  }),
  play: async ({ canvas }) => {
    // 1) 首次挂载：等逐字追平全文
    const card = await canvas.findByTestId('card');
    const mount1 = card.getAttribute('data-mount');
    await waitFor(() => expect(canvas.getByTestId('card').textContent).toBe(FULL), {
      timeout: 8000,
    });

    // 2) 卸载并重挂载（模拟滚动滚回）
    await userEvent.click(canvas.getByTestId('remount'));

    // 3) 重挂载后应是一个全新实例（data-mount 递增），且其挂载快照为空串 → 会从头重播
    await waitFor(() => {
      const c = canvas.getByTestId('card');
      expect(c.getAttribute('data-mount')).not.toBe(mount1); // 确实重挂载了
      expect(c.getAttribute('data-initial')).toBe(''); // bug：又从空串起步
    });
    // 4) 并且会再次逐字追平（重播确凿）
    await waitFor(() => expect(canvas.getByTestId('card').textContent).toBe(FULL), {
      timeout: 8000,
    });
  },
};

/**
 * 自动化校验修复：自定义块（带守卫）首播完成后，重挂载直接全显、不再重播。
 */
export const 自定义块守卫修复: Story = {
  render: () => ({
    components: { RemountPanel, GuardedCustomCard },
    template: `
      <div style="padding:24px;background:var(--aix-colorBgLayout);min-height:100vh;">
        <RemountPanel title="自定义块 · 带守卫">
          <GuardedCustomCard block-id="story-guarded" :typing="true" />
        </RemountPanel>
      </div>
    `,
  }),
  play: async ({ canvas }) => {
    // 1) 首次挂载逐字追平全文（首播会触发，把 block-id 记入「已播完」Set）
    const card = await canvas.findByTestId('card');
    const mount1 = card.getAttribute('data-mount');
    await waitFor(() => expect(canvas.getByTestId('card').textContent).toBe(FULL), {
      timeout: 8000,
    });

    // 2) 卸载并重挂载
    await userEvent.click(canvas.getByTestId('remount'));

    // 3) 重挂载是新实例，但守卫命中 → 挂载快照即全文、内容立刻为全文（无重播）
    await waitFor(() => {
      const c = canvas.getByTestId('card');
      expect(c.getAttribute('data-mount')).not.toBe(mount1);
      expect(c.getAttribute('data-initial')).toBe(FULL); // 修复：快照即全文
      expect(c.textContent).toBe(FULL);
    });
  },
};
