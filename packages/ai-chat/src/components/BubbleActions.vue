<template>
  <!-- data-aix-hover-reveal：参与 actionsTrigger='hover' 的显隐（选择器与语义见文末样式块注释）。
       自绘操作条给根节点加同一属性即可获得同样的行为。 -->
  <div :class="ns.b()" data-aix-hover-reveal>
    <div v-if="branch && branch.count > 1" :class="ns.e('branch')">
      <button
        type="button"
        :class="ns.e('branch-btn')"
        :disabled="branchDisabled || branch.index === 0"
        :aria-label="t.prevBranch"
        :title="t.prevBranch"
        @click="emit('switch-branch', -1)"
      >
        ‹
      </button>
      <span :class="ns.e('branch-label')">{{ branch.index + 1 }}/{{ branch.count }}</span>
      <button
        type="button"
        :class="ns.e('branch-btn')"
        :disabled="branchDisabled || branch.index === branch.count - 1"
        :aria-label="t.nextBranch"
        :title="t.nextBranch"
        @click="emit('switch-branch', 1)"
      >
        ›
      </button>
    </div>
    <template v-for="item in normalized" :key="item.key">
      <button
        v-if="item.builtin && item.key === 'copy'"
        type="button"
        :class="ns.e('btn')"
        :aria-label="copiedKey === 'copy' ? t.copiedButton : t.copyButton"
        :title="copiedKey === 'copy' ? t.copiedButton : t.copyButton"
        @click="onCopy"
      >
        <Check v-if="copiedKey === 'copy'" />
        <Copy v-else />
      </button>
      <!-- opt-in：复制原始 markdown 源码，不在默认 items 里，需消费方显式加入 actions 才会渲染 -->
      <button
        v-else-if="item.builtin && item.key === 'copySource'"
        type="button"
        :class="ns.e('btn')"
        :aria-label="copiedKey === 'copySource' ? t.copiedButton : t.copySourceButton"
        :title="copiedKey === 'copySource' ? t.copiedButton : t.copySourceButton"
        @click="onCopySource"
      >
        <Check v-if="copiedKey === 'copySource'" />
        <Copy v-else />
      </button>
      <button
        v-else-if="item.builtin && item.key === 'regenerate'"
        type="button"
        :class="ns.e('btn')"
        :aria-label="t.regenerateButton"
        :title="t.regenerateButton"
        @click="emit('regenerate')"
      >
        <Refresh />
      </button>
      <!-- 内置 continue 操作：向被手动停止（status==='abort'）的消息续写，由 AiChat 按 status 自动注入 -->
      <button
        v-else-if="item.builtin && item.key === 'continue'"
        type="button"
        :class="ns.e('btn')"
        :aria-label="t.continueButton"
        :title="t.continueButton"
        @click="emit('continue')"
      >
        <Play />
      </button>
      <template v-else-if="item.builtin && item.key === 'feedback'">
        <button
          type="button"
          :class="[ns.e('btn'), ns.e('feedback'), ns.is('active', feedback === 'like')]"
          :aria-label="t.likeButton"
          :title="t.likeButton"
          :aria-pressed="feedback === 'like'"
          @click="toggleFeedback('like')"
        >
          <ThumbUp />
        </button>
        <button
          type="button"
          :class="[ns.e('btn'), ns.e('feedback'), ns.is('active', feedback === 'dislike')]"
          :aria-label="t.dislikeButton"
          :title="t.dislikeButton"
          :aria-pressed="feedback === 'dislike'"
          @click="toggleFeedback('dislike')"
        >
          <ThumbDown />
        </button>
      </template>
      <button
        v-else-if="item.builtin && item.key === 'speak'"
        type="button"
        :class="[ns.e('btn'), ns.is('active', speaking)]"
        :aria-label="speaking ? t.speakStopButton : t.speakButton"
        :title="speaking ? t.speakStopButton : t.speakButton"
        :aria-pressed="speaking"
        @click="emit('speak')"
      >
        <VolumeOff v-if="speaking" />
        <VolumeUp v-else />
      </button>
      <!-- 内置 quote 操作：整条引用该消息 -->
      <button
        v-else-if="item.builtin && item.key === 'quote'"
        type="button"
        :class="ns.e('btn')"
        :aria-label="t.quoteButton"
        :title="t.quoteButton"
        @click="emit('quote')"
      >
        <Reply />
      </button>
      <button
        v-else-if="item.builtin && item.key === 'edit'"
        type="button"
        :class="ns.e('btn')"
        :aria-label="t.editButton"
        :title="t.editButton"
        @click="emit('edit')"
      >
        <Edit />
      </button>
      <button
        v-else-if="item.builtin && item.key === 'delete'"
        type="button"
        :class="ns.e('btn')"
        :aria-label="t.deleteButton"
        :title="t.deleteButton"
        @click="emit('delete')"
      >
        <Delete />
      </button>
      <button
        v-else-if="!item.builtin"
        type="button"
        :class="ns.e('btn')"
        :disabled="item.disabled"
        :aria-label="item.label"
        :title="item.label"
        @click="onCustomClick(item)"
      >
        <component :is="item.icon" v-if="item.icon" />
        <span v-else>{{ item.label }}</span>
      </button>
    </template>
    <!-- 扩展位：items 之后渲染，自由追加任意 VNode -->
    <slot />
  </div>
</template>

<script lang="ts">
export interface BubbleActionsProps {
  /** 操作项列表：字符串=内置预设（copy/regenerate/feedback/speak），对象=自定义项；默认 ['copy','regenerate'] */
  items?: ActionsItems;
  /**
   * 'copy' 内置项的复制文本；提供后点击复制自动写入剪贴板并给出「已复制」反馈。
   * 未提供但传了 `message` 时，点击的那一刻按 `stripMarkdownForCopy(messageText(message))` 现算
   * （复制是低频动作，不值得为它逐帧预先剥离全文 markdown）。
   */
  content?: string;
  /**
   * 'copySource' 内置项的复制文本（原始 markdown 源码，未剥离语法符号）；
   * 未传时依次退化为 `messageText(message)` → content。
   * 该内置项默认不在 items 里，需消费方显式加入才会渲染（如 `actions: ['copy', 'copySource', 'regenerate']`）。
   */
  sourceContent?: string;
  /** 'feedback' 内置项的受控激活态，null 表示未反馈 */
  feedback?: MessageFeedback | null;
  /** 'speak' 内置项的受控朗读态（true=正在朗读，按钮切换为停止） */
  speaking?: boolean;
  /** 自定义项 onClick 的 ctx.message 来源（AiChat 接线时传入；独立使用可不传） */
  message?: ChatMessage;
  /** 分支元信息：count>1 时渲染 ‹ i/n › 切换器 */
  branch?: BranchMeta;
  /** 切换器是否禁用（流式中由上层传 true） */
  branchDisabled?: boolean;
}
export interface BubbleActionsEmits {
  (e: 'copy'): void;
  /** 内置 copySource 操作：复制原始 markdown 源码 */
  (e: 'copy-source'): void;
  (e: 'regenerate'): void;
  /** 内置 continue 操作：向被手动停止（status==='abort'）的消息续写 */
  (e: 'continue'): void;
  (e: 'feedback', value: MessageFeedback | null): void;
  (e: 'speak'): void;
  /** 内置 quote 操作：整条引用该消息（AiChat 接线构造 Quote 进 pendingQuotes） */
  (e: 'quote'): void;
  /** 切换分支版本：dir=-1 上一个 / 1 下一个 */
  (e: 'switch-branch', dir: -1 | 1): void;
  /** 内置 edit 操作：请求进入内联编辑态（不是保存——保存是 Bubble 内部 saveEdit 的事，走独立事件通道） */
  (e: 'edit'): void;
  /** 内置 delete 操作：请求删除该消息，只上抛不改数据 */
  (e: 'delete'): void;
}
</script>

<script setup lang="ts">
import { useNamespace, copyText } from '@aix/hooks';
import {
  Copy,
  Check,
  Refresh,
  Play,
  Reply,
  ThumbUp,
  ThumbDown,
  VolumeUp,
  VolumeOff,
  Edit,
  Delete,
} from '@aix/icons';
import { ref, computed, onScopeDispose } from 'vue';
import { useAiChatLocale } from '../composables/useAiChatLocale';
import type {
  ActionsItems,
  ActionItem,
  ActionKey,
  ChatMessage,
  MessageFeedback,
  BranchMeta,
} from '../types';
import { messageText } from '../utils/helpers';
import { stripMarkdownForCopy } from '../utils/stripMarkdownForCopy';

// content 刻意不给默认值：需要区分「未提供」（可回落到 message 现算）与「显式传空串」（不复制）
const props = withDefaults(defineProps<BubbleActionsProps>(), {
  items: () => ['copy', 'regenerate'],
});
const emit = defineEmits<BubbleActionsEmits>();
const ns = useNamespace('bubble-actions');
const { t } = useAiChatLocale();

// 用具体 key（而非单一布尔）区分是哪个复制按钮触发了反馈：copy/copySource 各自独立高亮，
// 避免共用一个 copied 布尔导致两个按钮同时显示「已复制」勾选态。
const copiedKey = ref<'copy' | 'copySource' | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;

// 有文本时用 copyText 复制（内含 Clipboard API + execCommand 兜底，兼容 HTTP / 旧浏览器）；
// 两条路径都失败视为硬失败：静默降级，不显示「已复制」也不抛事件。
// 无文本时跳过复制、仍抛事件，交由使用方自定义复制逻辑（逃生口）。
const markCopied = (key: 'copy' | 'copySource') => {
  copiedKey.value = key;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    copiedKey.value = null;
  }, 1500);
};
// 复制文本在**点击那一刻**才求值，不由上层逐帧预先算好（如在模板里写
// `:content="stripMarkdownForCopy(messageText(item))"`）：那样每次父级重渲染都要对全文重扫
// 一遍 markdown，而流式期间只要该消息挂着操作条（有分支版本时切换器要求 footer 常挂），
// 就退化成逐帧 O(全文)。显式传入的 content / sourceContent 始终优先。
const resolveCopyText = (): string =>
  props.content ?? (props.message ? stripMarkdownForCopy(messageText(props.message)) : '');
// sourceContent 未传时依次退化：message 原始 markdown → content（后者保留给只传了 content
// 而未传 message 的独立用法；message 传了但取不出文本，如整条只有工具块时也走这条退化）
const resolveSourceText = (): string =>
  props.sourceContent ?? ((props.message && messageText(props.message)) || props.content || '');

const onCopy = async () => {
  const text = resolveCopyText();
  if (text && !(await copyText(text))) return;
  markCopied('copy');
  emit('copy');
};
const onCopySource = async () => {
  const text = resolveSourceText();
  if (text && !(await copyText(text))) return;
  markCopied('copySource');
  emit('copy-source');
};

onScopeDispose(() => {
  if (timer) clearTimeout(timer);
});

const toggleFeedback = (value: MessageFeedback) => {
  // 互斥可取消：再次点击当前激活项则取消（null），否则切到该项
  emit('feedback', props.feedback === value ? null : value);
};

type NormalizedItem = { builtin: true; key: ActionKey } | ({ builtin: false } & ActionItem);

const normalized = computed<NormalizedItem[]>(() =>
  props.items.map((it) =>
    typeof it === 'string' ? { builtin: true, key: it } : { builtin: false, ...it },
  ),
);

const onCustomClick = (item: ActionItem) => {
  if (item.disabled) return;
  item.onClick?.({ message: props.message });
};
</script>

<style lang="scss">
.aix-bubble-actions {
  display: inline-flex;
  align-items: center;
  transition: opacity var(--aix-motionDurationFast) var(--aix-motionEaseInOut);

  // 独立使用时默认可见；仅在气泡内才做 hover 显隐（见下方上下文规则）
  gap: var(--aix-marginXXS);

  &__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--aix-controlHeightSM);
    height: var(--aix-controlHeightSM);
    padding: 0;
    transition: all var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border: none;
    border-radius: var(--aix-borderRadiusSM);
    background: transparent;
    color: var(--aix-colorTextTertiary);
    cursor: pointer;

    svg {
      width: 16px;
      height: 16px;
    }

    &:hover {
      background-color: var(--aix-colorFillTertiary);
      color: var(--aix-colorText);
    }

    &:active {
      background-color: var(--aix-colorFill);
    }
  }

  &__feedback.is-active {
    color: var(--aix-colorPrimary);
  }

  &__branch {
    display: inline-flex;
    align-items: center;
    gap: var(--aix-marginXXS);
    color: var(--aix-colorTextTertiary);
    font-size: var(--aix-fontSizeSM);
  }

  &__branch-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--aix-controlHeightSM);
    height: var(--aix-controlHeightSM);
    padding: 0;
    border: none;
    border-radius: var(--aix-borderRadiusSM);
    background: transparent;
    color: var(--aix-colorTextTertiary);
    font-size: var(--aix-fontSize);
    line-height: 1;
    cursor: pointer;

    &:hover:not(:disabled) {
      background-color: var(--aix-colorFillTertiary);
      color: var(--aix-colorText);
    }

    &:disabled {
      color: var(--aix-colorTextQuaternary);
      cursor: not-allowed;
    }
  }

  &__branch-label {
    min-width: 28px;
    text-align: center;
  }
}

// 默认：气泡内操作常驻显示（actionsTrigger='always'）。
// 仅当外层 AiChat 配置 actionsTrigger='hover' 时，才在气泡内做 hover / 键盘聚焦显隐。
// 选择器锚定 [data-aix-hover-reveal] 而非 .aix-bubble-actions：actionsTrigger 是**气泡级**语义，
// 绑死在内置操作条的类名上，会让接管 #footer 自绘操作条的业务拿不到这个能力——传了
// actionsTrigger="hover" 却毫无效果，且没有任何提示。内置操作条自带该标记（见模板根节点），
// 自绘操作条给自己的根节点加上同一个属性即可加入。
// 同理刻意**不**直接锚定 .aix-bubble__footer：业务的 footer 里常常还有图表卡、参考资料、
// 展开面板等常驻内容（它们与「hover 才出现的按钮」是两码事），整块淡出并非本配置的本意。
// 由业务自己标注哪一部分参与 hover 显隐，粒度才对。
.aix-ai-chat.is-actions-hover {
  .aix-bubble [data-aix-hover-reveal] {
    transition: opacity var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    opacity: 0;
  }

  .aix-bubble:hover [data-aix-hover-reveal],
  .aix-bubble [data-aix-hover-reveal]:focus-within {
    opacity: 1;
  }

  // 触屏等无 hover 设备：即便配置 hover 也始终显示，避免操作无法触达
  @media (hover: none) {
    .aix-bubble [data-aix-hover-reveal] {
      opacity: 1;
    }
  }
}
</style>
