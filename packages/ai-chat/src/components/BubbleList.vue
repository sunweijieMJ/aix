<template>
  <div :class="ns.b()" :style="{ maxHeight }">
    <div ref="scrollRef" :class="ns.e('scroll')" @scroll="computeState">
      <Virtualizer ref="virtualizerRef" v-slot="{ item }" :data="items">
        <Bubble
          :key="(item as ChatMessage).id"
          v-bind="resolveBubble(item as ChatMessage)"
          :item-key="(item as ChatMessage).id"
          :content="(item as ChatMessage).content"
          :role="(item as ChatMessage).role"
          :status="(item as ChatMessage).status"
          :loading="(item as ChatMessage).status === 'loading'"
          :typing="resolveTyping(item as ChatMessage)"
          :editable="editable && (item as ChatMessage).role === 'user'"
          @retry="emit('retry', (item as ChatMessage).id)"
          @block-action="emit('block-action', $event)"
          @edit="emit('edit', (item as ChatMessage).id, $event)"
          @typing-complete="emit('typing-complete', (item as ChatMessage).id)"
        >
          <template v-if="$slots.content" #content="slotProps">
            <slot name="content" :item="item as ChatMessage" v-bind="slotProps" />
          </template>
          <!-- 转发 footer 作用域 slot：补齐消息操作（复制/重生成等）的逃生口 -->
          <template v-if="$slots.footer" #footer>
            <slot name="footer" :item="item as ChatMessage" />
          </template>
          <!-- 透传块插槽：把非保留（content/footer 之外）具名插槽原样转发给每个 Bubble，
               最终落到块渲染器内部 slot（如 thought-chain-item-content → item-content）。 -->
          <template v-for="name in passthroughSlotNames" :key="name" #[name]="sp">
            <slot :name="name" v-bind="sp" />
          </template>
        </Bubble>
      </Virtualizer>
    </div>
    <button
      v-if="scrollState !== 'AT_BOTTOM'"
      type="button"
      :class="ns.e('back')"
      :aria-label="t.backToBottom"
      @click="scrollToBottom(true)"
    >
      <span v-if="unreadCount">{{ unreadCount }}</span>
      ↓
    </button>
  </div>
</template>

<script lang="ts">
export interface BubbleListProps {
  /** 消息列表（渲染数据源，经 virtua 虚拟化渲染为气泡） */
  items: ChatMessage[];
  /** 角色样式映射：角色 → 气泡默认 props（头像 / 位置 / 变体等） */
  roles?: Record<string, RoleConfig>;
  /** 是否自动滚动跟随新消息，默认 true */
  autoScroll?: boolean;
  /** 自定义滚动跟随策略（覆盖内置 defaultShouldFollow） */
  shouldFollow?: ShouldFollow;
  /** 列表最大高度（CSS 值），默认 '100%'；超出内部滚动 */
  maxHeight?: string;
  /**
   * 全局打字机开关：开启后流式更新中（status==='updating'）的气泡逐字显示，默认 false。
   * 传配置对象 `{ step, interval }` 可细化逐字节奏（透传给各气泡的打字机）。
   */
  typing?: boolean | BubbleTypingConfig;
  /** 块渲染器注册表：透传给各 Bubble，与 roles 内的 blockRenderers 合并（role 级更具体，优先） */
  blockRenderers?: BlockRenderers;
  /** 是否允许用户气泡内联编辑，透传给各 Bubble（仅 user 角色生效） */
  editable?: boolean;
}
export interface BubbleListEmits {
  /** 某条消息点击重试，携带消息 id */
  (e: 'retry', id: string): void;
  /** 透传 Bubble 的块动作 */
  (e: 'block-action', payload: BlockActionPayload): void;
  /** 某条用户消息编辑保存，携带消息 id 与新文本 */
  (e: 'edit', id: string, text: string): void;
  /** 某条消息逐字显示完毕，携带消息 id（流式打字机追平末尾时触发） */
  (e: 'typing-complete', id: string): void;
}
</script>

<script setup lang="ts">
import { useLocale } from '@aix/hooks';
import { useNamespace } from '@aix/hooks';
import { Virtualizer } from 'virtua/vue';
import { ref, reactive, watch, nextTick, onMounted, computed, useSlots } from 'vue';
import { useAutoScroll } from '../composables/useAutoScroll';
import type { ShouldFollow } from '../composables/useAutoScroll';
import { locale } from '../locale';
import type {
  ChatMessage,
  RoleConfig,
  BubbleProps,
  BlockRenderers,
  BlockActionPayload,
  BubbleTypingConfig,
} from '../types';
import Bubble from './Bubble.vue';

const props = withDefaults(defineProps<BubbleListProps>(), {
  autoScroll: true,
  maxHeight: '100%',
  typing: false,
});
const emit = defineEmits<BubbleListEmits>();

// virtua/vue 的 index 未 re-export VirtualizerHandle 类型，
// 用 InstanceType<typeof Virtualizer> 推导实例类型（含 scrollToIndex），避免引入 any
type VirtualizerHandle = InstanceType<typeof Virtualizer>;

const ns = useNamespace('bubble-list');
const { t } = useLocale(locale);
const slots = useSlots();

// BubbleList 自身消费 content/footer；其余具名插槽透传给每个 Bubble（最终落到块渲染器内部 slot）。
const passthroughSlotNames = computed(() =>
  Object.keys(slots).filter((n) => n !== 'content' && n !== 'footer'),
);
const scrollRef = ref<HTMLElement | null>(null);
const virtualizerRef = ref<VirtualizerHandle | null>(null);
const { scrollState, unreadCount, computeState, scrollToBottom, follow, observeContent } =
  useAutoScroll(scrollRef, {
    // 传 getter 而非快照，使运行时切换 :auto-scroll 生效
    autoScroll: () => props.autoScroll,
    shouldFollow: props.shouldFollow,
  });

// 单次解析角色级 props 并合入块渲染器（避免此前 resolveBubbleProps 被调两次 / 角色函数执行两次）。
// 块渲染器合并优先级：list 级 < role 级（role 更具体）；Bubble 内部再叠加内置默认。
const resolveBubble = (item: ChatMessage): Partial<BubbleProps> => {
  const cfg = props.roles?.[item.role];
  const roleProps = typeof cfg === 'function' ? cfg(item) : (cfg ?? {});
  return {
    ...roleProps,
    blockRenderers: { ...props.blockRenderers, ...roleProps.blockRenderers },
  };
};

// 解析单条气泡的 typing：仅对「本会话流式过且未中止」的消息开启；
// 列表级 typing 为配置对象时透传配置（细化节奏），为 true 时传 true。
const resolveTyping = (item: ChatMessage): boolean | BubbleTypingConfig => {
  const active = !!props.typing && streamedIds.has(item.id) && item.status !== 'abort';
  if (!active) return false;
  return typeof props.typing === 'object' ? props.typing : true;
};

// 记录「本会话曾进入流式（status==='updating'）」的消息 id：使其在 status 转为 success 后
// 仍保持打字机开启，直到 typewriter 把剩余字符追平自停，避免数据快于打字机时的结尾跳显。
// 纯历史消息（直接以 success 进入、从未 updating）不会被标记，故不会逐字重播。
// 例外：status==='abort'（用户点击停止）时，上方 :typing 绑定会立即关闭打字机，
// 让已接收文本一次性全显——点停止即"暂停"，而非继续把缓冲逐字打完。
const streamedIds = reactive(new Set<string>());
watch(
  () => props.items.map((m) => `${m.id}:${m.status}`).join(','),
  () => {
    // 同一遍扫描里收集当前存活 id，并标记流式过的消息。
    const alive = new Set<string>();
    for (const m of props.items) {
      alive.add(m.id);
      if (m.status === 'updating') streamedIds.add(m.id);
    }
    // 切会话 / 编辑截断等导致消息整体替换或移除后，丢弃已不在当前列表的旧 id，
    // 避免 streamedIds 随会话历史单调增长（id 全局唯一，prune 不会误删仍在用的标记）。
    for (const id of streamedIds) {
      if (!alive.has(id)) streamedIds.delete(id);
    }
  },
  { immediate: true },
);

// 委托给 virtua 官方 API：虚拟列表只渲染视口内项，DOM 索引对非可见项会静默失效
const scrollToBubble = (index: number, smooth = false) => {
  virtualizerRef.value?.scrollToIndex(index, { smooth });
};

// 首屏挂载：等 Virtualizer 完成首次渲染后同步滚动态，避免初始硬编码的
// AT_BOTTOM 与真实 DOM 不一致（否则带初始历史消息时回到底部按钮会被误隐藏，
// 首次 streaming 也会被误判为贴底）。开启 autoScroll 时直接贴底，更符合对话场景。
onMounted(() => {
  nextTick(() => {
    if (props.autoScroll) {
      scrollToBottom();
    } else {
      computeState();
    }
    // 观测虚拟列表内容区高度变化（流式逐字 / 块淡入 / 公式 / 并发输出），处于底部时持续钉底，
    // 消除"跟随时机错位"导致的抖动与不贴底（无 ResizeObserver 环境自动空转）。
    observeContent(scrollRef.value?.firstElementChild as HTMLElement | null);
  });
});

// 消息数量变化 → 判定是否为用户自己的消息或新消息。
// 注意：一次 onSend 会同时新增 user 消息 + ai 占位（末条恒为 ai），
// 故按"本次新增是否包含 user 角色"判定，而非看末条，否则 'own-message' 永不触发。
watch(
  () => props.items.length,
  (len, prev) => {
    if (len <= prev) return;
    const added = props.items.slice(prev, len);
    const reason = added.some((m) => m.role === 'user') ? 'own-message' : 'new-message';
    nextTick(() => follow(reason, true));
  },
);

// 末条内容流式增长 → streaming 跟随。
// content 切为 ContentBlock[] 后，流式是「就地 mutate（last.text += delta）+ push」，
// 数组引用不变，故不能直接 watch content 引用；改为追踪「块数 + 各块文本总长」，
// 任一增长都触发跟随，等价于此前 watch 字符串内容增长的行为。
watch(
  () => {
    const blocks = props.items[props.items.length - 1]?.content;
    if (!blocks) return '';
    return `${blocks.length}:${blocks.reduce((n, b) => n + ('text' in b ? b.text.length : 0), 0)}`;
  },
  () => nextTick(() => follow('streaming')),
);

defineExpose({
  scrollToTop: () => scrollRef.value?.scrollTo({ top: 0 }),
  scrollToBottom,
  scrollToBubble,
  scrollState,
  unreadCount,
});
</script>

<style lang="scss">
.aix-bubble-list {
  display: flex;
  position: relative;
  flex-direction: column;
  min-height: 0;

  &__scroll {
    flex: 1;
    padding: var(--aix-padding);
    overflow-y: auto;
  }

  &__back {
    display: inline-flex;
    position: absolute;
    right: var(--aix-padding);
    bottom: var(--aix-padding);
    align-items: center;
    height: var(--aix-controlHeightLG);
    padding: 0 var(--aix-padding);
    transition:
      transform var(--aix-motionDurationFast) var(--aix-motionEaseInOut),
      box-shadow var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: 999px;
    background-color: color-mix(in sRGB, var(--aix-colorBgElevated) 86%, transparent);
    box-shadow: var(--aix-shadowMD);
    color: var(--aix-colorText);
    font-size: var(--aix-fontSizeSM);
    cursor: pointer;
    gap: var(--aix-marginXXS);
    backdrop-filter: blur(8px);

    &:hover {
      transform: translateY(-1px);
      box-shadow: var(--aix-shadowLG);
    }

    span {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 999px;
      background-color: var(--aix-colorPrimary);
      color: var(--aix-colorTextLight);
      font-size: var(--aix-fontSizeXS);
    }
  }
}
</style>
