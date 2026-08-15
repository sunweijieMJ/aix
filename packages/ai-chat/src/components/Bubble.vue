<template>
  <div
    :class="[ns.b(), ns.m(placement)]"
    :data-aix-message-id="itemKey != null && itemKey !== '' ? String(itemKey) : undefined"
    :data-aix-role="role"
  >
    <!-- avatar / header 插槽带 info 作用域：Bubble 只持有 role/status/itemKey，完整消息由
         BubbleList 在转发时补 item（气泡本身拿不到 ChatMessage，见其转发处注释）。 -->
    <div v-if="avatar || $slots.avatar" :class="ns.e('avatar')">
      <slot name="avatar" :info="info"><img :src="avatar" alt="" /></slot>
    </div>
    <div :class="ns.e('wrapper')">
      <div v-if="$slots.header" :class="ns.e('header')">
        <slot name="header" :info="info" />
      </div>
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
            ref="editInputRef"
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
          <!-- 出错态：提示 + 重试入口（点击向上冒泡，由 AiChat 调 onReload）；
               error 插槽让业务换成自己的错误 UI（错误码、限流/鉴权分支等）。

               【renderSlot 全 Comment 陷阱 —— 包内该问题的说明出处，其余几处指向这里】
               这里用 `$slots.error` 显式二选一，而**不能**写成 `<slot name="error">兜底</slot>`
               的原生 fallback：Vue 的 renderSlot 在插槽产出「全是 Comment 节点」时（消费方按
               条件 v-if，只在部分情况下渲染）会判定为「未提供插槽」而启用 fallback —— 于是消费方
               明确表示「这种情况不显示」时，反而被强行套回内置 UI。
               判据必须落在「消费方**是否声明**了插槽」（`$slots.x` 有无），而非「本次渲染产出了
               什么」。凡存在「提供了插槽但期望渲染空」语义的地方都适用（本处、AiChat #footer、
               Conversations #item、ReasoningBlock 正文）；不存在该语义的（如 Sender 附件面板）
               照常用原生 fallback 即可。 -->
          <template v-if="status === 'error'">
            <slot v-if="$slots.error" name="error" :info="info" :retry="() => emit('retry')" />
            <span v-else :class="ns.e('error')">
              <span :class="ns.e('error-text')">{{ errorText || t.errorMessage }}</span>
              <button type="button" :class="ns.e('retry')" @click="emit('retry')">
                {{ t.retryButton }}
              </button>
            </span>
          </template>
          <!-- 中断且一个内容块都没收到：补一条占位，否则气泡是纯空白框（loading 已为 false，
               不出加载点；content 为空，不出任何块）。判据刻意用「一个块都没有」而非「没有文本」——
               停在思考阶段时 content 里有 reasoning 块，那不是空气泡，不该再叠一句「已停止生成」。
               locale.abortedEmpty 置空串即关闭本占位（业务想自己往 content 里塞兜底文案时用）。 -->
          <span
            v-else-if="status === 'abort' && !content.length && t.abortedEmpty"
            :class="ns.e('aborted')"
          >
            {{ t.abortedEmpty }}
          </span>
        </template>
      </div>
      <!-- 编辑态期间隐藏 footer（复制/编辑/删除等操作条）：避免草稿未保存时被同排的「删除」误删。
           包裹层由 FooterWrap（见 script）按「这一条**产出了内容**」决定渲不渲染，同 BubbleList
           的 row-before。 -->
      <FooterWrap v-if="$slots.footer && !editing" :render="$slots.footer" :status="status" />
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
import {
  computed,
  watch,
  watchEffect,
  useSlots,
  nextTick,
  ref,
  h,
  type FunctionalComponent,
  type VNode,
} from 'vue';
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
import { slotHasContent } from '../utils/hasVNodeContent';
import { messageText } from '../utils/helpers';
import { ownProp } from '../utils/ownProp';
import { BUBBLE_RESERVED_SLOTS } from '../utils/reservedSlots';
import { BUILTIN_BLOCK_RENDERERS } from './blocks/builtinRenderers';
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

// 块渲染器上抛的两条通道，都补齐所属消息 key 后原样向上转发：
// action 由 AiChat 落到 useChat.updateBlock，intent 只转发不改数据（分工见 BlockIntent 注释）。
const handleBlockAction = (action: BlockAction) =>
  emit('block-action', { messageKey: props.itemKey ?? '', action });

const handleBlockIntent = (intent: BlockIntent) =>
  emit('block-intent', { messageKey: props.itemKey ?? '', intent });

// 块渲染注册表：内置表（见 blocks/builtinRenderers.ts）与 props.blockRenderers 合并，
// 用户优先、可覆盖内置。收敛为单一注册表，避免内置类型硬编码先于注册表导致无法覆盖、
// 内置与扩展走两套机制。
const renderers = computed<BlockRenderers>(() => ({
  ...BUILTIN_BLOCK_RENDERERS,
  ...props.blockRenderers,
}));

/** 按块类型取渲染器（block.type 来自不可信数据，故走 ownProp 的自有属性查找，见其说明） */
const rendererOf = (type: string): BlockRenderers[string] | undefined =>
  ownProp(renderers.value, type);

// —— 消息级 typing-complete 聚合 ——
// 块渲染器在「追平当下源文本」时上抛块级 typing-complete，但追平可能早于消息终态
// （最后 token 与 done 帧间隔 > 打字机 interval 时必现），其后打字机已 stop、不再有任何 tick；
// 多块并存时，先追平的块也不代表整条消息播完。故不能逐条原样转发：按块聚合，
// 记录各 text/reasoning 块的追平长度（尾块追平后源又增长则记录失效，等再次追平刷新），
// 终态且全部有效追平时才上抛一次消息级事件（BubbleList 据此登记 completedIds 关闭 typing）。
const completedLens = new Map<string, number>();
const settledFired = ref(false);
const isTerminal = computed(() => props.status !== 'loading' && props.status !== 'updating');
// 只统计**仍走内置渲染器**的 text/reasoning 块。`typing-complete` 是内置 TextBlock /
// ReasoningBlock 与本聚合之间的私有约定，从未写进对外的 BlockRendererProps 契约；若按块类型
// 一刀切收集，业务经 blockRenderers 覆盖 text/reasoning 后，其自定义渲染器（不知道要上抛该
// 事件）会让 completedLens 永远缺这一条 → 消息级 typing-complete 永不触发 → BubbleList 不登记
// completedIds → typing 常开、虚拟列表回收重挂载时重播。覆盖内置渲染器是文档明示的扩展点，
// 故这里按渲染器同一性排除：谁接管了渲染，谁自己决定何时算播完，不再阻塞整条消息的完成聚合。
const typingBlockIds = computed(() =>
  props.content
    .filter(
      (b) =>
        (b.type === 'text' || b.type === 'reasoning') &&
        renderers.value[b.type] === BUILTIN_BLOCK_RENDERERS[b.type],
    )
    .map((b) => b.id),
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
  // 归属判定与 typingBlockIds 同源（而非再按 block.type 判一次）：只有**仍走内置渲染器**的
  // text/reasoning 块参与长度聚合；被 blockRenderers 覆盖的同类块与自定义类型块一视同仁，
  // 落到下方「直接转发」分支——两处口径必须一致，否则会把不在 ids 里的块记进 completedLens。
  if (typingBlockIds.value.includes(block.id)) {
    completedLens.set(block.id, blockTextLen(block.id));
    fireIfSettled();
    return;
  }
  // 自定义类型块 / 被覆盖的内置块：完成集合无法预知，沿用旧语义直接转发（BubbleList 终态时登记）；
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

// 本组件消费的插槽之外，其余具名插槽视为「块插槽」透传给块渲染器。
// 名单集中在 utils/reservedSlots（漏登记会让该插槽在每个块里重复渲染，见其说明）。
const blockSlotNames = computed(() =>
  Object.keys(slots).filter((n) => !(BUBBLE_RESERVED_SLOTS as readonly string[]).includes(n)),
);

/**
 * 操作条包裹层：插槽产出实际内容才套那层 __footer div，否则整块不渲染——消费方常「声明了
 * footer 插槽，但某些消息渲染为空」（按角色/状态决定是否出操作条），只按声明与否判定会让
 * 这些消息也套上包裹 div，在 flex 的 &__wrapper 上多出一份 gap。
 * 做成函数式组件（而非 computed 里判空、模板里再渲一次）的理由同 BubbleList.RowBefore，见那里。
 *
 * 两个 prop 都是**为了让本组件在该重渲染时重渲染**——无 prop 的子组件会被 Vue 判定为无变化
 * 而整体跳过更新，插槽便只在挂载时调用一次、此后永远停在首帧：
 * - `render`：插槽函数本身，父级重渲染产出新闭包时随之更新，覆盖「依赖父级作用域数据」；
 * - `status`：覆盖「插槽内容按本气泡 status 分支」，该依赖经多层 <slot> 转发进来、Vue 追踪不到，
 *   必须显式落在 prop 上。
 * 两条各由 __test__/AiChat.footerSlot.test.ts 的一个用例锁定。
 */
const FooterWrap: FunctionalComponent<{ render: () => VNode[]; status?: BubbleProps['status'] }> = (
  p,
) => {
  const nodes = p.render();
  return slotHasContent(nodes) ? h('div', { class: ns.e('footer') }, nodes) : null;
};
// 必须显式声明 props（同 BubbleList.RowBefore）：函数式组件不声明时传入的一切都会走 attrs
// fallthrough，render / status 会被原样写成根节点的 DOM 属性。
FooterWrap.props = ['render', 'status'];

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
const editInputRef = ref<HTMLTextAreaElement | null>(null);
// editing 由 false→true 时（外部请求进入编辑态）重新取当前 content 的最新文本作为草稿基线
watch(
  () => props.editing,
  (v) => {
    if (!v) return;
    draft.value = messageText({ id: '', role: props.role ?? 'ai', content: props.content ?? [] });
    // 焦点交接：触发编辑的那个铅笔按钮与整条 footer 在同一帧被卸载（见模板
    // `v-if="$slots.footer && !editing"`），不接管的话 activeElement 落回 <body>，
    // 键盘 / 读屏用户点完编辑后要重新 Tab 一遍才能找到输入框。
    // 光标置于末尾（而非全选）：编辑既有消息通常是接着补充，与包内 Conversations.startRename
    // 的重命名输入框同一处理口径。
    void nextTick(() => {
      const el = editInputRef.value;
      if (!el) return; // 同帧内又退出编辑态 / 组件已卸载
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
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

    /* AI 气泡：白底卡片，细边 + 极轻阴影，在浅灰背景上浮起。
       圆角走组件级尺寸旋钮 --aix-bubble-content-radius（见 README「样式定制」），
       fallback 到原有 --aix-borderRadiusLG，未设置时行为不变 */
    &--filled {
      border: 1px solid var(--aix-colorBorderSecondary);
      border-radius: var(--aix-bubble-content-radius, var(--aix-borderRadiusLG));
      background-color: var(--aix-colorBgContainer);
      box-shadow: var(--aix-shadowXS);
    }

    &--outlined {
      border: 1px solid var(--aix-colorBorder);
      border-radius: var(--aix-bubble-content-radius, var(--aix-borderRadiusLG));
    }

    &--shadow {
      border-radius: var(--aix-bubble-content-radius, var(--aix-borderRadiusLG));
      background-color: var(--aix-colorBgContainer);
      box-shadow: var(--aix-shadowSM);
    }

    &--borderless {
      padding-right: 0;
      padding-left: 0;
    }

    &--round {
      border-radius: var(--aix-bubble-content-radius, var(--aix-borderRadiusLG));
    }

    &--corner {
      border-radius: var(--aix-bubble-content-radius, var(--aix-borderRadiusLG));
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

  /* 中断空消息占位：次级文本色，与错误条区分（这不是错误，是用户自己停的） */
  &__aborted {
    display: inline-flex;
    align-items: center;
    color: var(--aix-colorTextTertiary);
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
