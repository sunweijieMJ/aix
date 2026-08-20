<template>
  <div :class="ns.b()" :style="{ maxHeight }">
    <div v-if="loading" :class="ns.e('skeleton')">
      <div v-for="i in 3" :key="i" :class="[ns.e('skeleton-item'), ns.is('end', i % 2 === 0)]">
        <div v-if="i % 2 !== 0" :class="ns.e('skeleton-avatar')" />
        <Skeleton :rows="2" :class="ns.e('skeleton-content')" />
      </div>
    </div>
    <template v-else>
      <div ref="scrollRef" :class="ns.e('scroll')" @scroll="computeState">
        <!-- 行级插槽（#row-before）：渲染在 .aix-bubble **之外**、占满整行宽度。
             消息时间戳、日期分隔线、未读分割线这类内容必须整行居中，而 Bubble 的 #header
             挂在 __wrapper 内、受气泡自身对齐（user 侧是 align-items:flex-end）约束，
             只能贴在气泡角上，做不到整行。
             prev 一并给出：算「距上一条超过 N 分钟才显示时间」不必再自己维护全表派生。

             包裹层由 BubbleRow（见 script）按「这一条**产出了内容**」决定渲不渲染，
             而非「插槽是否声明」（与 Bubble 的 footer 同口径）：本插槽的典型用法就是
             「只有部分消息显示时间戳」，
             按声明与否判定会让其余每条消息都白套一个带 margin-bottom 的空壳，
             表现为气泡间距忽大忽小，业务只能反过来写 `__row-before:empty{display:none}`。

             ⚠️ 本注释刻意写在 Virtualizer **之外**：dev 构建下 Vue 会把模板注释编译成真实的
             注释 vnode，写在默认插槽里会让插槽产出 2 个 vnode，virtua 遂放弃 BubbleRow 的
             key 回退到下标（详见 script 内 BubbleRow 注释）。插槽里只能有 BubbleRow 一个根。 -->
        <Virtualizer
          ref="virtualizerRef"
          v-slot="{ item, index }"
          :data="items"
          :keep-mounted="keepMounted"
        >
          <BubbleRow
            :key="(item as ChatMessage).id"
            :item="item as ChatMessage"
            :index="index as number"
            :prev="items[(index as number) - 1]"
          >
            <Bubble
              v-bind="resolveBubble(item as ChatMessage)"
              :item-key="(item as ChatMessage).id"
              :content="(item as ChatMessage).content"
              :role="(item as ChatMessage).role"
              :status="(item as ChatMessage).status"
              :loading="(item as ChatMessage).status === 'loading'"
              :typing="resolveTyping(item as ChatMessage)"
              :tail-breathing="tailBreathing"
              :editing="editingIds.has((item as ChatMessage).id)"
              :save-disabled="saveDisabled"
              :tool-renderers="toolRenderers"
              :error-text="resolveErrorText(item as ChatMessage)"
              @retry="emit('retry', (item as ChatMessage).id)"
              @block-action="emit('block-action', $event)"
              @block-intent="emit('block-intent', $event)"
              @edit="emit('edit', (item as ChatMessage).id, $event)"
              @editing-change="handleEditingChange((item as ChatMessage).id, $event)"
              @typing-complete="handleTypingComplete((item as ChatMessage).id)"
              @keep-mounted-change="
                handleKeepMountedChange((item as ChatMessage).id, $event.active)
              "
            >
              <template v-if="$slots.content" #content="slotProps">
                <slot name="content" :item="item as ChatMessage" v-bind="slotProps" />
              </template>
              <!-- 转发 footer 作用域 slot：补齐消息操作（复制/重生成等）的逃生口 -->
              <template v-if="$slots.footer" #footer>
                <slot name="footer" :item="item as ChatMessage" />
              </template>
              <!-- header / avatar / error 单独显式转发（不走下面的通用穿透）：这三个是**消息级**
                 插槽，业务几乎必然要读整条 ChatMessage（发送者名、时间戳、extra.error），
                 而 Bubble 只持有 role/status/itemKey，给不出 item。
                 刻意不在通用穿透里统一补 item：那会把 item 注入到所有块插槽上，而块插槽的
                 作用域来自各块渲染器（如 thought-chain-item-content 的 item 是 ThoughtChainItem），
                 同名不同义，届时 item 指代什么将取决于是哪个块，是更糟的歧义。 -->
              <template v-if="$slots.header" #header="sp">
                <slot name="header" :item="item as ChatMessage" v-bind="sp" />
              </template>
              <template v-if="$slots.avatar" #avatar="sp">
                <slot name="avatar" :item="item as ChatMessage" v-bind="sp" />
              </template>
              <!-- error 额外补一个 error 作用域：业务接管错误 UI 的第一件事必然是读原始错误，
                 而它埋在 extra.error 里（约定见 ChatMessage.extra），逐个业务自己去翻既啰嗦
                 又容易漏掉「err 可能是字符串而非 Error」这一层。 -->
              <template v-if="$slots.error" #error="sp">
                <slot
                  name="error"
                  :item="item as ChatMessage"
                  :error="(item as ChatMessage).extra?.error"
                  v-bind="sp"
                />
              </template>
              <!-- 透传块插槽：把非保留（上述几个之外）具名插槽原样转发给每个 Bubble，
               最终落到块渲染器内部 slot（如 thought-chain-item-content → item-content）。 -->
              <template v-for="name in passthroughSlotNames" :key="name" #[name]="sp">
                <slot :name="name" v-bind="sp" />
              </template>
            </Bubble>
          </BubbleRow>
        </Virtualizer>
      </div>
      <Transition :name="ns.e('back')">
        <button
          v-if="scrollState !== 'AT_BOTTOM'"
          type="button"
          :class="ns.e('back')"
          :aria-label="t.backToBottom"
          :title="t.backToBottom"
          @click="scrollToBottom(true)"
        >
          <ArrowDownward />
          <span v-if="unreadCount" :class="ns.e('back-badge')">
            {{ unreadCount > 99 ? '99+' : unreadCount }}
          </span>
        </button>
      </Transition>
    </template>
  </div>
</template>

<script lang="ts">
export interface BubbleListProps {
  /** 消息列表（渲染数据源，经 virtua 虚拟化渲染为气泡） */
  items: ChatMessage[];
  /** 整体加载态：为 true 时渲染骨架占位气泡，不渲染 items（历史消息拉取中使用），默认 false */
  loading?: boolean;
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
  /** 末尾静默呼吸：透传给各 Bubble（见 BubbleProps.tailBreathing） */
  tailBreathing?: boolean | { idleMs?: number };
  /** 块渲染器注册表：透传给各 Bubble，与 roles 内的 blockRenderers 合并（role 级更具体，优先） */
  blockRenderers?: BlockRenderers;
  /** 工具渲染器注册表：toolName → 组件，透传给各 Bubble 供内置 ToolUseBlock 按名路由 */
  toolRenderers?: BlockRenderers;
  /** 编辑态下是否禁止保存（如全局请求进行中），透传给每个 Bubble */
  saveDisabled?: boolean;
  /**
   * 出错文案解析：按整条消息算出内置错误条要显示的文字，逐条传给 Bubble 的 `errorText`。
   * 不传（或返回空串）时各气泡回退 `locale.errorMessage`。
   * 放在列表层而非气泡层，是因为只有这里持有完整 ChatMessage（`extra.error` 在其中）。
   */
  errorText?: (message: ChatMessage) => string;
}
export interface BubbleListEmits {
  /** 某条消息点击重试，携带消息 id */
  (e: 'retry', id: string): void;
  /** 透传 Bubble 的块动作 */
  (e: 'block-action', payload: BlockActionPayload): void;
  /** 透传 Bubble 的块意图（不改数据，交更上层处置） */
  (e: 'block-intent', payload: BlockIntentPayload): void;
  /** 某条用户消息编辑保存，携带消息 id 与新文本 */
  (e: 'edit', id: string, text: string): void;
  /** 某条消息逐字显示完毕，携带消息 id（流式打字机追平末尾时触发） */
  (e: 'typing-complete', id: string): void;
}
</script>

<script setup lang="ts">
import { useNamespace } from '@aix/hooks';
import { ArrowDownward } from '@aix/icons';
import { Virtualizer } from 'virtua/vue';
import { ref, reactive, watch, nextTick, onMounted, computed, useSlots, h } from 'vue';
import type { FunctionalComponent } from 'vue';
import { useAiChatLocale } from '../composables/useAiChatLocale';
import { useAutoScroll } from '../composables/useAutoScroll';
import type { ShouldFollow } from '../composables/useAutoScroll';
import type {
  ChatMessage,
  RoleConfig,
  BubbleProps,
  BlockRenderers,
  BlockActionPayload,
  BlockIntentPayload,
  BubbleTypingConfig,
} from '../types';
import { contentFingerprint } from '../utils/contentFingerprint';
import { slotHasContent } from '../utils/hasVNodeContent';
import { ownProp } from '../utils/ownProp';
import { BUBBLE_LIST_RESERVED_SLOTS } from '../utils/reservedSlots';
import Bubble from './Bubble.vue';
import Skeleton from './Skeleton.vue';

const props = withDefaults(defineProps<BubbleListProps>(), {
  loading: false,
  autoScroll: true,
  maxHeight: '100%',
  typing: false,
});
const emit = defineEmits<BubbleListEmits>();

// virtua/vue 的 index 未 re-export VirtualizerHandle 类型，
// 用 InstanceType<typeof Virtualizer> 推导实例类型（含 scrollToIndex），避免引入 any
type VirtualizerHandle = InstanceType<typeof Virtualizer>;

const ns = useNamespace('bubble-list');
const { t } = useAiChatLocale();
const slots = useSlots();

// 本组件显式转发 content/footer/header/avatar/error（前两个补 item，后三个见模板注释）+
// 自绘 row-before；其余具名插槽原样透传给每个 Bubble（最终落到块渲染器内部 slot）。
// 名单集中在 utils/reservedSlots（含层间关系说明）。
const passthroughSlotNames = computed(() =>
  Object.keys(slots).filter((n) => !(BUBBLE_LIST_RESERVED_SLOTS as readonly string[]).includes(n)),
);

/**
 * 单行的整体包裹层：渲染「行级插槽包裹层 + 气泡」两个兄弟节点。
 *
 * ## 为什么必须由它统一产出这两者，而不是在 Virtualizer 插槽里并列写
 *
 * virtua 的 ListItem 只在**插槽恰好产出一个 vnode** 时才采纳该 vnode 的 key，否则回退到
 * `"_" + index`（见 virtua/lib/vue 的 key 推导）。而 `v-if` 为假时 Vue 会编译出一个注释占位
 * vnode，故「RowBefore + Bubble」并列写恒产出 2 个 vnode——`:key="item.id"` 从未生效过，
 * 行标识实际是下标。
 *
 * 后果不是「白写一个 key」这么轻：删除中间某条消息、或向上加载历史使下标整体平移时，
 * 每个 ListItem 承载的消息都换了一条，其内部气泡按 key 变化被卸载重建——正在内联编辑的
 * 草稿（Bubble 内部 ref，非列表级状态）连同折叠态、图片预览态一起丢失，而列表级的
 * editingIds 仍在，表现为「行还停在编辑态，输入的内容却被悄悄还原」。
 * 这也正是下方 keepMounted 那套保挂载要防的事，两者必须一起才成立。
 *
 * 本组件返回数组（Fragment 多根），**不引入任何额外 DOM 元素**，DOM 结构与之前逐字节一致；
 * 对 Virtualizer 而言插槽产出的是单个带 key 的组件 vnode，key 遂真正生效。
 *
 * ## 行级插槽包裹层的既有语义（保持不变）
 *
 * 插槽产出实际内容才套那层带 margin 的 div，否则整块不渲染。判空实现与 Bubble 的 footer
 * 共用（utils/hasVNodeContent）。
 *
 * 做成函数式组件而不是「模板里 v-if 判空 + <slot> 再渲染一次」，是因为后者会让插槽函数
 * 每条每帧**被调用两次**。插槽由宿主提供，不能假定它是纯的——把它当纯函数反复调用，
 * 带副作用（埋点、计数、push 进外部数组）的实现就会莫名其妙地翻倍。这里调用一次、
 * 拿到 vnode 后自己决定包不包。
 *
 * 另有一处顺带的好处：插槽内容读到的响应式依赖由本组件自己的 render effect 收集，
 * 变化时只重渲染这一行，不需要对整条转发链上的依赖做人工补读。
 * Bubble 的 footer 包裹层（FooterWrap）同款。
 *
 * 必须显式声明 props：函数式组件不声明 props 时，传入的一切都会被当作 attrs 走
 * fallthrough，item / index / prev 会被原样写成根节点的 DOM 属性。
 */
const BubbleRow: FunctionalComponent<{
  item: ChatMessage;
  index: number;
  prev?: ChatMessage;
}> = (slotProps, { slots: ownSlots }) => {
  const nodes = slots['row-before']?.({
    item: slotProps.item,
    index: slotProps.index,
    prev: slotProps.prev,
  });
  const before = slotHasContent(nodes) ? h('div', { class: ns.e('row-before') }, nodes) : null;
  return [before, ownSlots.default?.()];
};
BubbleRow.props = ['item', 'index', 'prev'];

const scrollRef = ref<HTMLElement | null>(null);
const virtualizerRef = ref<VirtualizerHandle | null>(null);
const { scrollState, unreadCount, computeState, scrollToBottom, follow, observeContent } =
  useAutoScroll(scrollRef, {
    // 传 getter 而非快照，使运行时切换 :auto-scroll / :should-follow 生效
    autoScroll: () => props.autoScroll,
    shouldFollow: () => props.shouldFollow,
  });

// 处于内联编辑态的消息 id：虚拟列表滚动会回收离开视口的行并销毁其行内编辑草稿，
// 故把编辑中的行下标经 keepMounted 交给 Virtualizer 常驻挂载，滚出再滚回草稿不丢
//（与 streamedIds 提升打字机状态同构：编辑态用保挂载而非提升状态）。
const editingIds = reactive(new Set<string>());
const handleEditingChange = (id: string, editing: boolean) => {
  if (editing) editingIds.add(id);
  else editingIds.delete(id);
};
// 块级浮层（图片预览等 Teleport Modal 挂在块渲染器内部）打开中的消息 id：
// 与编辑态同构地保挂载，否则宿主行被回收时 Modal 连同打开状态一起销毁。
// 计数而非布尔：同一消息可有多个块同时打开浮层（如多个 image 块）。
const retainedCounts = reactive(new Map<string, number>());
const handleKeepMountedChange = (id: string, active: boolean) => {
  const cur = retainedCounts.get(id) ?? 0;
  if (active) retainedCounts.set(id, cur + 1);
  else if (cur <= 1) retainedCounts.delete(id);
  else retainedCounts.set(id, cur - 1);
};
const keepMounted = computed<number[]>(() => {
  if (editingIds.size === 0 && retainedCounts.size === 0) return [];
  const idx: number[] = [];
  props.items.forEach((m, i) => {
    if (editingIds.has(m.id) || retainedCounts.has(m.id)) idx.push(i);
  });
  return idx;
});

// 单次解析角色级 props 并合入块渲染器（一条消息只调一次，函数形态的角色配置不被重复执行）。
// 块渲染器合并优先级：list 级 < role 级（role 更具体）；Bubble 内部再叠加内置默认。
const resolveBubble = (item: ChatMessage): Partial<BubbleProps> => {
  // item.role 开放给任意字符串、来源同样是流数据与持久化的对话树，故走 ownProp 的自有属性
  // 查找（直接下标取到原型上的函数会走进下面的「函数形态角色配置」分支，详见 ownProp 说明）
  const cfg = ownProp(props.roles, item.role);
  const roleProps = typeof cfg === 'function' ? cfg(item) : (cfg ?? {});
  return {
    ...roleProps,
    blockRenderers: { ...props.blockRenderers, ...roleProps.blockRenderers },
  };
};

// 出错文案：仅对出错态消息调用业务解析器，其余传 undefined。
// 不做这层短路的话，每条消息的每次重渲染（流式期间很密集）都会白跑一遍业务函数——
// 而它通常要读 extra、判类型、拼兜底文案，纯属浪费。
const resolveErrorText = (item: ChatMessage): string | undefined =>
  item.status === 'error' ? props.errorText?.(item) : undefined;

// 解析单条气泡的 typing：仅对「本会话流式过且未中止」的消息开启；
// 列表级 typing 为配置对象时透传配置（细化节奏），为 true 时传 true。
const resolveTyping = (item: ChatMessage): boolean | BubbleTypingConfig => {
  const active =
    !!props.typing &&
    streamedIds.has(item.id) &&
    !completedIds.has(item.id) &&
    item.status !== 'abort';
  if (!active) return false;
  return typeof props.typing === 'object' ? props.typing : true;
};

// 记录「本会话曾进入流式（status==='updating'）」的消息 id：使其在 status 转为 success 后
// 仍保持打字机开启，直到 typewriter 把剩余字符追平自停，避免数据快于打字机时的结尾跳显。
// 纯历史消息（直接以 success 进入、从未 updating）不会被标记，故不会逐字重播。
// 例外：status==='abort'（用户点击停止）时，上方 :typing 绑定会立即关闭打字机，
// 让已接收文本一次性全显——点停止即"暂停"，而非继续把缓冲逐字打完。
// 注：streamedIds 只负责「开启并维持」打字机；其「何时收尾关闭」由下方 completedIds 接管
// （追平末尾后关闭，避免重挂载重播）——两者一开一关，共同界定打字机的生命周期。
const streamedIds = reactive(new Set<string>());
// 「已逐字播放完毕」的消息 id：消息进入终态（success/error）后，其打字机追平末尾会上抛
// typing-complete（见 handleTypingComplete）——此时记入本集合，resolveTyping 据此关闭该消息的
// typing。这样虚拟列表滚动卸载/重挂载该气泡时，内置 TextBlock 与自定义块渲染器都拿到 typing=false，
// 不会从头重播。内置块本身有挂载快照保护，但自定义块渲染器（如业务的 QuestionCard 自管打字机）
// 无此保护、尤其依赖本信号；统一在此关闭，免去各渲染器自造防重播守卫。
const completedIds = reactive(new Set<string>());
watch(
  () => props.items.map((m) => `${m.id}:${m.status}`).join(','),
  () => {
    // 同一遍扫描里收集当前存活 id，并标记流式过的消息。
    const alive = new Set<string>();
    for (const m of props.items) {
      alive.add(m.id);
      if (m.status === 'updating') {
        streamedIds.add(m.id);
        // 重新生成 / 续流（同 id 再次 updating）→ 复位完成标记，允许重新逐字。
        completedIds.delete(m.id);
      }
    }
    // 切会话 / 编辑截断等导致消息整体替换或移除后，丢弃已不在当前列表的旧 id，
    // 避免 streamedIds / completedIds 随会话历史单调增长（id 全局唯一，prune 不会误删仍在用的标记）。
    for (const id of streamedIds) {
      if (!alive.has(id)) streamedIds.delete(id);
    }
    for (const id of completedIds) {
      if (!alive.has(id)) completedIds.delete(id);
    }
    // 编辑中的消息若被移除（切会话 / 截断），一并从编辑集合剪除，避免 keepMounted 残留失效下标
    for (const id of editingIds) {
      if (!alive.has(id)) editingIds.delete(id);
    }
    // 浮层保挂载计数同理：宿主消息已不在列表时剪除（块随消息销毁，不会再上抛 false）
    for (const id of retainedCounts.keys()) {
      if (!alive.has(id)) retainedCounts.delete(id);
    }
  },
  { immediate: true },
);

// 某条消息逐字播放完成（Bubble 上抛 typing-complete）：仅当其已进入终态（非 loading/updating）
// 时才登记为已完成并关闭 typing——流式中途的「追平」（源还会继续增长）不能关闭，否则后续增量
// 不再逐字（这正是 streamedIds 持续保持 typing 的初衷）。无论是否登记都向上转发事件。
const handleTypingComplete = (id: string) => {
  const m = props.items.find((x) => x.id === id);
  if (m && m.status !== 'loading' && m.status !== 'updating') completedIds.add(id);
  emit('typing-complete', id);
};

/**
 * 按 messageId 定位并等挂载（回链契约）：
 * - messageId 基于渲染视图 items（含 parser 1→N 派生 id），找不到 → resolve null；
 * - virtua 只认下标，先 findIndex 再 scrollToIndex；
 * - 虚拟列表滚过去才渲染，rAF 轮询等目标气泡出现在 DOM，超时（默认 500ms）降级 null。
 */
const scrollToBubble = (
  messageId: string,
  opts: { smooth?: boolean; timeoutMs?: number } = {},
): Promise<HTMLElement | null> => {
  const { smooth = false, timeoutMs = 500 } = opts;
  const index = props.items.findIndex((m) => m.id === messageId);
  if (index < 0) return Promise.resolve(null);
  virtualizerRef.value?.scrollToIndex(index, { smooth });
  return new Promise((resolve) => {
    const startedAt = performance.now();
    const tick = () => {
      const el = scrollRef.value?.querySelector<HTMLElement>(
        `[data-aix-message-id="${CSS.escape(messageId)}"]`,
      );
      if (el) return resolve(el);
      if (performance.now() - startedAt > timeoutMs) return resolve(null);
      requestAnimationFrame(tick);
    };
    tick();
  });
};

// 首屏挂载：等 Virtualizer 完成首次渲染后同步滚动态，避免初始硬编码的
// AT_BOTTOM 与真实 DOM 不一致（否则带初始历史消息时回到底部按钮会被误隐藏，
// 首次 streaming 也会被误判为贴底）。开启 autoScroll 时直接贴底，更符合对话场景。
// 抽成具名函数：loading=true 时 scrollRef 尚未挂载（骨架屏分支），下方 watch 在
// loading 转为 false、真实滚动容器挂载后重新调用一次，避免贴底与 ResizeObserver 钉底永久失效。
const syncScrollState = () => {
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
};
onMounted(syncScrollState);
watch(
  () => props.loading,
  (loading, prevLoading) => {
    if (prevLoading && !loading) syncScrollState();
  },
);

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
// 流式是「就地 mutate（last.text += delta）+ push」，content 数组引用不变，故不能直接
// watch 引用；改为追踪内容增长指纹，任一维度增长都触发跟随。
watch(
  () => contentFingerprint(props.items[props.items.length - 1]?.content),
  () => nextTick(() => follow('streaming')),
);

defineExpose({
  scrollToTop: () => scrollRef.value?.scrollTo({ top: 0 }),
  scrollToBottom,
  scrollToBubble,
  scrollState,
  unreadCount,
  /** 滚动容器（划词检测 L1 的监听根 + 滚动即关闭菜单的事件源） */
  scrollElement: () => scrollRef.value,
  /** 请求某条消息进入内联编辑态（由业务/AiChat 在 BubbleActions 的 edit 点击时调用） */
  startEdit: (id: string) => editingIds.add(id),
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

    // 关掉浏览器默认的滚动锚定：Sender 自适应高度（autosize）在长会话/虚拟列表场景下
    // 哪怕只改动 1px 高度，也会挤压本容器的可用高度，触发浏览器自动纠正 scrollTop 来
    // 保持视觉内容不跳动——这次纠正伴随的重排会在某些浏览器下导致刚聚焦的 Sender 输入框
    // 出现一次瞬间 blur→重新 focus 的抖动（用户体感为"打字打着打着突然失焦"）。
    // 本容器自己的贴底/跟随已经由 useAutoScroll 全权接管，不需要浏览器再插手纠正。
    overflow-anchor: none;
  }

  /* 行级插槽容器：整行宽度、内容居中（时间戳 / 日期分隔线的常规排布）。
     业务想左右对齐自行覆盖 justify-content 即可。margin-bottom 与气泡的间距节奏一致。 */
  &__row-before {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--aix-marginXXS);
  }

  &__skeleton {
    display: flex;
    flex-direction: column;
    gap: var(--aix-paddingLG);
    padding: var(--aix-padding);
  }

  &__skeleton-item {
    display: flex;
    align-items: flex-start;
    gap: var(--aix-sizeSM);

    &.is-end {
      flex-direction: row-reverse;
    }
  }

  &__skeleton-avatar {
    flex: none;

    /* 与真实头像共用同一变量（见 Bubble.vue __avatar）：宿主调大头像时骨架屏占位同步跟随，
       否则加载态与就绪态之间会出现一次尺寸跳变 */
    width: var(--aix-bubble-avatar-size, 36px);
    height: var(--aix-bubble-avatar-size, 36px);
    border-radius: 50%;
    background-color: var(--aix-colorFillTertiary);
  }

  &__skeleton-content {
    max-width: min(420px, 100%);
  }

  &__back {
    display: inline-flex;
    position: absolute;
    right: var(--aix-padding);
    bottom: var(--aix-padding);
    align-items: center;
    justify-content: center;
    width: var(--aix-controlHeightLG);
    height: var(--aix-controlHeightLG);
    padding: 0;
    transition:
      transform var(--aix-motionDurationFast) var(--aix-motionEaseInOut),
      box-shadow var(--aix-motionDurationFast) var(--aix-motionEaseInOut),
      color var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: 50%;
    background-color: color-mix(in sRGB, var(--aix-colorBgElevated) 86%, transparent);
    box-shadow: var(--aix-shadowMD);
    color: var(--aix-colorTextSecondary);
    cursor: pointer;
    backdrop-filter: blur(8px);

    &:hover {
      transform: translateY(-2px);
      box-shadow: var(--aix-shadowLG);
      color: var(--aix-colorText);
    }

    svg {
      width: 18px;
      height: 18px;
    }
  }

  &__back-badge {
    display: inline-flex;
    position: absolute;
    top: -4px;
    right: -4px;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border: 2px solid var(--aix-colorBgContainer);
    border-radius: 999px;
    background-color: var(--aix-colorPrimary);
    color: var(--aix-colorTextLight);
    font-size: var(--aix-fontSizeXS);
    line-height: 14px;
  }

  /* 回到底部按钮出现 / 消失过渡：淡入 + 轻微上滑，避免滚动状态切换时硬切 */
  &__back-enter-active,
  &__back-leave-active {
    transition:
      opacity var(--aix-motionDurationFast) var(--aix-motionEaseInOut),
      transform var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
  }

  &__back-enter-from,
  &__back-leave-to {
    transform: translateY(8px) scale(0.9);
    opacity: 0;
  }
}
</style>
