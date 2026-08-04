<template>
  <div
    :class="[ns.b(), ns.m(placement)]"
    :data-aix-message-id="itemKey != null && itemKey !== '' ? String(itemKey) : undefined"
    :data-aix-role="role"
  >
    <div v-if="avatar || $slots.avatar" :class="ns.e('avatar')">
      <slot name="avatar"><img :src="avatar" alt="" /></slot>
    </div>
    <div :class="ns.e('wrapper')">
      <div v-if="$slots.header" :class="ns.e('header')"><slot name="header" /></div>
      <div
        :class="[
          ns.e('content'),
          ns.em('content', variant),
          ns.em('content', shape),
          ns.is('editing', editing),
          ns.is('tail-idle', tailIdle),
        ]"
        :aria-live="isUpdating ? 'polite' : undefined"
        :aria-atomic="isUpdating ? 'false' : undefined"
      >
        <LoadingDots v-if="loading" />
        <div v-else-if="editing" :class="ns.e('edit')">
          <textarea
            v-model="draft"
            :class="ns.e('edit-input')"
            rows="2"
            :aria-label="t.editButton"
          />
          <div :class="ns.e('edit-actions')">
            <button type="button" :class="ns.e('edit-cancel')" @click="cancelEdit">
              {{ t.cancelButton }}
            </button>
            <button
              type="button"
              :class="ns.e('edit-save')"
              :aria-label="t.editSaveButton"
              :title="t.editSaveButton"
              :disabled="saveDisabled"
              @click="saveEdit"
            >
              {{ t.sendButton }}
            </button>
          </div>
        </div>
        <template v-else>
          <slot name="content" :blocks="content" :info="info">
            <component :is="renderedNode" v-if="contentRender" />
            <template v-else>
              <!-- 单一注册表分发：内置 text/reasoning/sources/thought-chain/attachment 与用户 blockRenderers
                   合并后统一查表，无对应渲染器的块（如业务自定义未注册类型）安全跳过（开发期 devWarn 提示）。 -->
              <template v-for="block in content" :key="block.id">
                <component
                  :is="rendererOf(block.type)"
                  v-if="rendererOf(block.type)"
                  :block="block"
                  :info="info"
                  :typing="typing"
                  :on-block-action="handleBlockAction"
                  :on-block-intent="handleBlockIntent"
                  :tool-renderers="toolRenderers"
                  @typing-complete="onBlockTypingComplete(block)"
                  @keep-mounted-change="handleKeepMountedChange"
                >
                  <!-- 透传消费方提供的「非保留」具名插槽（约定 <块类型>-<内部slot>）给块渲染器，
                       由其映射到内部组件对应 slot。v-for 仅遍历实际存在的插槽，不产生幽灵插槽。 -->
                  <template v-for="name in blockSlotNames" :key="name" #[name]="sp">
                    <slot :name="name" v-bind="sp" />
                  </template>
                </component>
              </template>
            </template>
          </slot>
          <!-- 出错态：提示 + 重试入口（点击向上冒泡，由 AiChat 调 onReload） -->
          <span v-if="status === 'error'" :class="ns.e('error')">
            <span :class="ns.e('error-text')">{{ t.errorMessage }}</span>
            <button type="button" :class="ns.e('retry')" @click="emit('retry')">
              {{ t.retryButton }}
            </button>
          </span>
        </template>
      </div>
      <!-- 编辑态期间隐藏 footer（复制/编辑/删除等操作条）：避免草稿未保存时被同排的「删除」误删 -->
      <div v-if="hasFooterContent && !editing" :class="ns.e('footer')"><slot name="footer" /></div>
    </div>
  </div>
</template>

<script lang="ts">
// 注：与下方 <script setup> 的类型 import 合并后属同一模块，BlockAction 仅在此声明一次，
// setup 块不再重复 import，避免 vue-tsc 报 Duplicate identifier。
export interface BubbleEmits {
  /** 出错态点击重试（由 AiChat 调 onReload） */
  (e: 'retry'): void;
  /** 交互块上抛的动作（携带所属消息 key），由 AiChat 调 updateBlock */
  (e: 'block-action', payload: { messageKey: string | number; action: BlockAction }): void;
  /** 交互块上抛的意图（携带所属消息 key）：不改数据，逐层转发交宿主处置 */
  (e: 'block-intent', payload: { messageKey: string | number; intent: BlockIntent }): void;
  /** 用户消息内联编辑保存，携带新文本（由 AiChat 调 onEdit） */
  (e: 'edit', text: string): void;
  /** 进入/退出内联编辑态：供列表层保持该行挂载（虚拟滚动回收该行会销毁行内草稿） */
  (e: 'editing-change', editing: boolean): void;
  /** 某文本块逐字显示完毕（携带所属消息 key），供上层在动画结束后再渲染操作条等 */
  (e: 'typing-complete', payload: { messageKey: string | number }): void;
  /** 块级浮层（如图片预览 Modal）开合：供列表层保持该行挂载，免被虚拟滚动回收销毁 */
  (e: 'keep-mounted-change', payload: { messageKey: string | number; active: boolean }): void;
}
</script>

<script setup lang="ts">
import { useLocale } from '@aix/hooks';
import { useNamespace } from '@aix/hooks';
import { computed, watch, watchEffect, useSlots, ref, Comment, Fragment, isVNode } from 'vue';
import { useIdleWhileStreaming } from '../composables/useIdleWhileStreaming';
import { locale } from '../locale';
import type {
  BlockAction,
  BlockIntent,
  BubbleProps,
  BubbleContentInfo,
  BlockRenderers,
  ContentBlock,
} from '../types';
import { contentFingerprint } from '../utils/contentFingerprint';
import { devWarn } from '../utils/devWarn';
import { messageText } from '../utils/helpers';
import AttachmentBlock from './blocks/AttachmentBlock.vue';
import ChartBlock from './blocks/ChartBlock.vue';
import ImageBlock from './blocks/ImageBlock.vue';
import QuoteBlock from './blocks/QuoteBlock.vue';
import ReasoningBlock from './blocks/ReasoningBlock.vue';
import SourcesBlock from './blocks/SourcesBlock.vue';
import TextBlock from './blocks/TextBlock.vue';
import ThoughtChainBlock from './blocks/ThoughtChainBlock.vue';
import ToolUseBlock from './blocks/ToolUseBlock.vue';
import UserConfirmBlock from './blocks/UserConfirmBlock.vue';
import LoadingDots from './LoadingDots.vue';

const props = withDefaults(defineProps<BubbleProps>(), {
  content: () => [],
  role: 'ai',
  placement: 'start',
  variant: 'filled',
  shape: 'round',
  loading: false,
  typing: false,
  blockRenderers: () => ({}),
});

const emit = defineEmits<BubbleEmits>();

// 交互渲染器经统一回调上抛动作；补齐所属消息 key 后向上转发，由 AiChat 落到 useChat.updateBlock。
const handleBlockAction = (action: BlockAction) =>
  emit('block-action', { messageKey: props.itemKey ?? '', action });

// 意图通道：与 action 对称补齐消息 key 后转发；组件库不据此改任何数据（见 BlockIntent 注释的分工表）。
const handleBlockIntent = (intent: BlockIntent) =>
  emit('block-intent', { messageKey: props.itemKey ?? '', intent });

// —— 消息级 typing-complete 聚合 ——
// 块渲染器在「追平当下源文本」时上抛块级 typing-complete，但追平可能早于消息终态
// （最后 token 与 done 帧间隔 > 打字机 interval 时必现），其后打字机已 stop、不再有任何 tick；
// 多块并存时，先追平的块也不代表整条消息播完。故不能逐条原样转发：按块聚合，
// 记录各 text/reasoning 块的追平长度（尾块追平后源又增长则记录失效，等再次追平刷新），
// 终态且全部有效追平时才上抛一次消息级事件（BubbleList 据此登记 completedIds 关闭 typing）。
const completedLens = new Map<string, number>();
const settledFired = ref(false);
const isTerminal = computed(() => props.status !== 'loading' && props.status !== 'updating');
const typingBlockIds = computed(() =>
  props.content.filter((b) => b.type === 'text' || b.type === 'reasoning').map((b) => b.id),
);
const blockTextLen = (id: string) => {
  const blk = props.content.find((b) => b.id === id);
  return blk && 'text' in blk && typeof blk.text === 'string' ? blk.text.length : 0;
};
const fireIfSettled = () => {
  if (settledFired.value || !isTerminal.value) return;
  const ids = typingBlockIds.value;
  // 空集合的 every() 恒为 true（vacuous truth）：内容全为非 text/reasoning 块
  // （纯 tool_use/chart/image 等）时视为「没有需要追平的块」，终态到达即算播完，
  // 不能因 ids 为空而提前 return，否则该消息永远等不到消息级 typing-complete。
  //
  // 未登记的块按追平长度 0 参与比较（`?? 0`）：useTypewriter.fireComplete 有 `len > 0`
  // 守卫，**空文本块永不上抛块级完成事件**，completedLens 里没有它的记录。若按 undefined
  // 直接比较，空块（blockTextLen 为 0）恒不满足，整条消息的完成聚合被永久阻塞——这是上面
  // 「ids 为空即 vacuous truth」的对称情形（ids 非空但块长度为 0）。空块可由业务 parser 的
  // 1→N 拆分、或自定义 parseChunk 经 block 字段下发产生。
  // 非空块仍需真实追平才算数：其 blockTextLen > 0，`?? 0` 不会让它被误判为已完成。
  if (!ids.every((id) => (completedLens.get(id) ?? 0) === blockTextLen(id))) return;
  settledFired.value = true;
  emit('typing-complete', { messageKey: props.itemKey ?? '' });
};
// 块级浮层开合（图片预览等）→ 补齐所属消息 key 后向上转发，由 BubbleList 落 keepMounted
const handleKeepMountedChange = (active: boolean) =>
  emit('keep-mounted-change', { messageKey: props.itemKey ?? '', active });

const onBlockTypingComplete = (block: ContentBlock) => {
  if (block.type === 'text' || block.type === 'reasoning') {
    completedLens.set(block.id, block.text.length);
    fireIfSettled();
    return;
  }
  // 自定义类型块：完成集合无法预知，沿用旧语义直接转发（BubbleList 终态时登记）；
  // 消息含内置打字块时则不转发，避免自定义块先完成而内置块仍在逐字时提前关闭 typing
  if (!typingBlockIds.value.length) emit('typing-complete', { messageKey: props.itemKey ?? '' });
};
watch(isTerminal, (terminal) => {
  if (terminal) {
    // 追平早于终态的场景：块级事件已在 updating 期记录，此刻补判整条消息是否播完
    fireIfSettled();
  } else {
    // 重新生成/续流（同 id 回到 updating）：复位聚合状态，允许再次完成
    completedLens.clear();
    settledFired.value = false;
  }
});

const ns = useNamespace('bubble');
const { t } = useLocale(locale);
const slots = useSlots();

// Bubble 自身消费的保留插槽；其余具名插槽视为「块插槽」透传给块渲染器。
const RESERVED_SLOTS = ['avatar', 'header', 'content', 'footer'];
const blockSlotNames = computed(() =>
  Object.keys(slots).filter((n) => !RESERVED_SLOTS.includes(n)),
);

// 判断单个 vnode 是否有实际内容：
// - Comment（v-if 为 false）视为空；
// - Fragment / 普通元素都递归看 children 是否全空——
//  消费方为规避 Vue renderSlot 的「插槽产出全是 Comment 就判定插槽未提供」陷阱
//  （见 AiChat.vue 的 <slot name="footer"><BubbleActions ... /></slot> 兜底机制），
//  常会包一层恒定渲染的占位标签（如 <div style="display:contents">）再在内部 v-if；
//  这种写法编译后占位标签的 children 是长度为 1 的数组（真实 vnode 或 Comment 占位），
//  并非空数组，因此必须递归判断子节点而非只看数组是否为空。
// - 无 children（如 <img/> 等自闭合真实内容标签）视为有内容。
function hasVNodeContent(vnode: unknown): boolean {
  if (!isVNode(vnode)) return true;
  if (vnode.type === Comment) return false;
  if (vnode.type === Fragment || typeof vnode.type === 'string') {
    if (!Array.isArray(vnode.children)) return true;
    return vnode.children.some(hasVNodeContent);
  }
  return true;
}

// footer 是否有实际内容：消费方（如按角色/状态条件显示操作条）常常「声明了 footer 插槽，
// 但某些消息渲染为空」（如 v-if 为 user 消息不出操作条）。只判断插槽是否声明会让这些消息
// 也套上 __footer 包裹 div，在 flex 布局的 &__wrapper 上多出一份 gap 间距。这里改为渲染一次
// 插槽、检查是否产出有实际内容的节点，按「有没有实际内容」决定是否包裹。
const hasFooterContent = computed(() => {
  // 显式读一次 status：footer 内容真正的条件判断（如按 status 决定是否显示操作条）
  // 往往写在消费方经多层 <slot> 转发过来的插槽内容里（Bubble → BubbleList → AiChat → 业务）。
  // 深层转发链路上对 status 的读取不会被 Vue 记为本 computed 的依赖，导致 status 变化后
  // （如 loading → abort）本值仍停留在旧的缓存结果上、footer 不会随之出现。这里在自身
  // 作用域内直接读一次 props.status，强制建立依赖，绕开嵌套转发插槽的响应式追踪缺口。
  void props.status;
  const nodes = slots.footer?.();
  return !!nodes && nodes.some(hasVNodeContent);
});

// 块渲染注册表：内置 text → TextBlock、reasoning → ReasoningBlock（折叠思考过程）、
// thought-chain → ThoughtChainBlock（Agent 步骤时间线），与 props.blockRenderers 合并（用户优先，可覆盖内置）。
// 收敛为单一注册表，避免内置类型硬编码先于注册表导致无法覆盖、内置与扩展走两套机制。
const builtinRenderers: BlockRenderers = {
  text: TextBlock,
  reasoning: ReasoningBlock,
  'thought-chain': ThoughtChainBlock,
  sources: SourcesBlock,
  attachment: AttachmentBlock,
  tool_use: ToolUseBlock,
  chart: ChartBlock,
  image: ImageBlock,
  quote: QuoteBlock,
  user_confirm: UserConfirmBlock,
};
const renderers = computed<BlockRenderers>(() => ({
  ...builtinRenderers,
  ...props.blockRenderers,
}));

/**
 * 按块类型取渲染器。必须走 Object.hasOwn 而非直接下标（与 ToolUseBlock 按 toolName 路由
 * 同款加固）：注册表是对象字面量，继承 Object.prototype，直接下标会让 'constructor' /
 * 'toString' / 'valueOf' / '__proto__' 这些**原型链上的键取到真值**——block.type 来自流数据
 * 与持久化的对话树（localStorage 可被篡改/损坏），一旦撞上就同时踩两个坑：绕过下方
 * 「未注册渲染器」的开发期告警（静默），且把原型上的函数/对象当组件渲染，气泡里吐出
 * `[object Object]` 之类的垃圾内容，排查成本极高。
 */
const rendererOf = (type: string): BlockRenderers[string] | undefined =>
  Object.hasOwn(renderers.value, type) ? renderers.value[type] : undefined;

// 开发期提示：内容块无对应渲染器时跳过渲染并告警（每种类型仅一次），
// 避免如未注册的 sources 块被静默丢弃而难以排查。
const warnedTypes = new Set<string>();
watchEffect(() => {
  for (const block of props.content ?? []) {
    if (!rendererOf(block.type) && !warnedTypes.has(block.type)) {
      warnedTypes.add(block.type);
      devWarn(
        `[AiChat] 内容块类型 "${block.type}" 没有注册渲染器，已跳过渲染。请通过 blockRenderers 注册对应组件。`,
      );
    }
  }
});

const info = computed<BubbleContentInfo>(() => ({
  status: props.status,
  role: props.role,
  key: props.itemKey ?? '',
}));

// 流式更新中：驱动内容区 aria-live 播报，仅此状态挂载（虚拟列表回收其它行不会误播报）
const isUpdating = computed(() => props.status === 'updating');

// 末尾静默呼吸：判定必须在气泡层而非块内——一条消息是 ContentBlock[]，
// 形如 [text, tool_use, text] 时，首个 text 在工具开始流式后就不再增长，
// 若各块自行判定，会出现「中间块呼吸、真正在输出的末块不呼吸」。
// 气泡层持有完整 content，指纹覆盖全部块，末块由 CSS 后代选择器命中。
const tailBreathingEnabled = computed(() => !!props.tailBreathing);
const tailIdleMs = computed(() =>
  typeof props.tailBreathing === 'object' ? (props.tailBreathing.idleMs ?? 3000) : 3000,
);
const isStreamingContent = computed(
  () => props.status === 'loading' || props.status === 'updating',
);
const idle = useIdleWhileStreaming({
  streaming: isStreamingContent,
  fingerprint: () => contentFingerprint(props.content),
  idleMs: tailIdleMs,
});
const tailIdle = computed(() => tailBreathingEnabled.value && idle.value);

const renderedNode = computed(() =>
  props.contentRender ? props.contentRender(props.content, info.value) : null,
);

// 内联编辑：editing 是受控 prop（由 BubbleList.startEdit 驱动进入），Bubble 自身只管 draft 文本与保存/取消。
const draft = ref('');
// editing 由 false→true 时（外部请求进入编辑态）重新取当前 content 的最新文本作为草稿基线
watch(
  () => props.editing,
  (v) => {
    if (v)
      draft.value = messageText({ id: '', role: props.role ?? 'ai', content: props.content ?? [] });
  },
  { immediate: true }, // 挂载时若 editing 已为 true（如 BubbleList 已在 editingIds 中）也需取到初值，而非等下一次翻转
);
const saveEdit = () => {
  // saveDisabled 在编辑框打开期间被外部翻 true（如流式进行中）时，上层 onEdit 守卫会拒绝保存；
  // 此处不 emit editing-change、不 emit edit，保留编辑框与草稿，待恢复可保存后再提交，避免草稿被静默丢弃。
  if (props.saveDisabled) return;
  const text = draft.value.trim();
  if (!text) return; // 空内容不提交
  emit('edit', text);
  emit('editing-change', false);
};
const cancelEdit = () => {
  emit('editing-change', false);
};
</script>

<style lang="scss">
.aix-bubble {
  display: flex;
  align-items: flex-start;
  gap: var(--aix-sizeSM);
  margin-bottom: var(--aix-paddingLG);

  &--end {
    flex-direction: row-reverse;
  }

  &__avatar {
    flex: none;

    img {
      display: block;

      /* 组件级尺寸旋钮（见 README「样式定制」）：只写 var() fallback、**不声明默认值**——
         默认值一旦声明在组件根上，元素自身的声明会压过从祖先继承的值，宿主写
         `:root { --aix-bubble-avatar-size: 48px }` 就会被静默忽略。纯 fallback 形态下
         该变量从未被声明，宿主在任意祖先设值都能继承生效，且无特异度冲突。
         BubbleList 的骨架屏头像共用本变量，保证占位与真实头像同步。 */
      width: var(--aix-bubble-avatar-size, 36px);
      height: var(--aix-bubble-avatar-size, 36px);
      border: 1px solid var(--aix-colorBorderSecondary);
      border-radius: 50%;
      background-color: var(--aix-colorFillTertiary);
      object-fit: cover;
    }
  }

  &__wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--aix-marginXXS);
    min-width: 0;
  }

  &--end &__wrapper {
    align-items: flex-end;
  }

  &__header {
    padding: 0 var(--aix-paddingXXS);
    color: var(--aix-colorTextTertiary);
    font-size: var(--aix-fontSizeSM);
  }

  &__content {
    position: relative;

    /* 组件级尺寸旋钮（见 README「样式定制」与上方 __avatar 的说明） */
    max-width: var(--aix-bubble-max-width, min(680px, 100%));
    padding: var(--aix-paddingSM) var(--aix-padding);
    transition:
      border-color var(--aix-motionDurationMid) var(--aix-motionEaseInOut),
      box-shadow var(--aix-motionDurationMid) var(--aix-motionEaseInOut);
    color: var(--aix-colorText);
    font-size: var(--aix-fontSize);
    line-height: var(--aix-lineHeight);
    overflow-wrap: break-word;

    /* 末尾静默呼吸：输出停顿时末块文字做明暗呼吸，与「已说完」区分。
       必须用「直接子元素 + :last-child」限定到最后一个块——各块渲染器的根元素都是
       本容器的直接子元素，一条消息含多个文本块时（如 [text, tool_use, text]）会渲染
       出多个 .aix-markdown，用后代选择器会让中间的文本块也一起呼吸。
       末块非文本块（tool_use / chart / image）时不命中，由其自身的加载态表达进度。
       markdown 引擎未就绪 / 未装 markdown-it 的降级分支里 .aix-markdown 只含文本节点、
       没有元素子节点，末层 :last-child 匹配不到 → 降级期不呼吸，是已知且可接受的取舍。
       :where() 只压低 .aix-markdown 这一位的优先级，业务可无痛覆盖。 */
    &.is-tail-idle > :where(.aix-markdown):last-child > :last-child {
      animation: aix-bubble-tail-breathe 2s var(--aix-motionEaseInOut) infinite;
    }

    /* AI 气泡：白底卡片，细边 + 极轻阴影，在浅灰背景上浮起 */
    &--filled {
      border: 1px solid var(--aix-colorBorderSecondary);
      border-radius: var(--aix-borderRadiusLG);
      background-color: var(--aix-colorBgContainer);
      box-shadow: var(--aix-shadowXS);
    }

    &--outlined {
      border: 1px solid var(--aix-colorBorder);
      border-radius: var(--aix-borderRadiusLG);
    }

    &--shadow {
      border-radius: var(--aix-borderRadiusLG);
      background-color: var(--aix-colorBgContainer);
      box-shadow: var(--aix-shadowSM);
    }

    &--borderless {
      padding-right: 0;
      padding-left: 0;
    }

    &--round {
      border-radius: var(--aix-borderRadiusLG);
    }

    &--corner {
      border-radius: var(--aix-borderRadiusLG);
    }
  }

  /* 贴角变体：靠头像一侧收一个尖角，指向说话者 */
  &--start &__content--corner {
    border-top-left-radius: var(--aix-borderRadiusXS);
  }

  &--end &__content--corner {
    border-top-right-radius: var(--aix-borderRadiusXS);
  }

  /* 用户气泡：主色浅底，去边框 */
  &--end &__content--filled {
    border-color: transparent;
    background-color: var(--aix-colorPrimaryBg);
    box-shadow: none;
  }

  /* 编辑态：统一换回中性描边+底色，不再沿用角色专属着色（如用户气泡的主色浅底）——
     深色主题下 colorPrimaryBg 是较重的暗色调，与编辑框内保存按钮的主色又形成第二次撞色，观感差；
     编辑态在这里之后声明以覆盖上面 --end &__content--filled 的着色（同优先级取源码顺序） */
  &__content.is-editing {
    border-color: var(--aix-colorBorder);
    background-color: var(--aix-colorBgContainer);
    box-shadow: none;
  }

  &__footer {
    padding: 0 var(--aix-paddingXXS);
  }

  &__edit {
    display: flex;
    flex-direction: column;
    gap: var(--aix-marginSM);
    min-width: 240px;
  }

  // 编辑框本身不再自带边框/背景——直接融入外层气泡卡片（.aix-bubble__content 已提供圆角+底色），
  // 避免「卡片里再嵌一层卡片」的双层边框观感
  &__edit-input {
    width: 100%;
    min-height: calc(var(--aix-lineHeight) * var(--aix-fontSize) * 2);
    padding: 0;
    border: none;
    background: transparent;
    color: var(--aix-colorText);
    font-family: inherit;
    font-size: var(--aix-fontSize);
    line-height: var(--aix-lineHeight);
    resize: none;

    &:focus {
      outline: none;
    }
  }

  &__edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--aix-marginXS);
  }

  &__edit-cancel,
  &__edit-save {
    display: inline-flex;
    align-items: center;
    height: var(--aix-controlHeightSM);
    padding: 0 var(--aix-paddingSM);
    transition: background-color var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border: none;
    border-radius: 999px;
    font-size: var(--aix-fontSizeSM);
    cursor: pointer;
  }

  &__edit-cancel {
    background-color: var(--aix-colorFillSecondary);
    color: var(--aix-colorText);

    &:hover {
      background-color: var(--aix-colorFill);
    }
  }

  &__edit-save {
    background-color: var(--aix-colorPrimary);
    color: var(--aix-colorTextLight);

    &:hover:not(:disabled) {
      background-color: var(--aix-colorPrimaryHover);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  &__error {
    display: inline-flex;
    align-items: center;
    gap: var(--aix-sizeXS);
    margin-top: var(--aix-marginXXS);
    color: var(--aix-colorError);
    font-size: var(--aix-fontSizeSM);
  }

  &__retry {
    padding: 2px var(--aix-paddingXS);
    transition: all var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border: 1px solid var(--aix-colorErrorBorder);
    border-radius: var(--aix-borderRadiusSM);
    background: transparent;
    color: var(--aix-colorError);
    font-size: var(--aix-fontSizeSM);
    cursor: pointer;

    &:hover {
      border-color: var(--aix-colorError);
      background-color: var(--aix-colorErrorBg);
    }
  }
}

/* 末尾静默呼吸：正文色 ⇄ 次级色往复，暗示「仍在生成」 */
@keyframes aix-bubble-tail-breathe {
  0%,
  100% {
    color: var(--aix-colorText);
  }

  50% {
    color: var(--aix-colorTextTertiary);
  }
}

/* 尊重系统「减少动态效果」设置：关闭呼吸动画（选择器须与上方一致，否则降级不生效） */
@media (prefers-reduced-motion: reduce) {
  .aix-bubble__content.is-tail-idle > :where(.aix-markdown):last-child > :last-child {
    animation: none;
  }
}
</style>
