<template>
  <div :class="ns.b()">
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
        :aria-label="copied ? t.copiedButton : t.copyButton"
        :title="copied ? t.copiedButton : t.copyButton"
        @click="onCopy"
      >
        <Check v-if="copied" />
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
  /** 'copy' 内置项的复制文本；提供后点击复制自动写入剪贴板并给出「已复制」反馈 */
  content?: string;
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
  (e: 'regenerate'): void;
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
import { useLocale } from '@aix/hooks';
import { useNamespace, copyText } from '@aix/hooks';
import {
  Copy,
  Check,
  Refresh,
  Reply,
  ThumbUp,
  ThumbDown,
  VolumeUp,
  VolumeOff,
  Edit,
  Delete,
} from '@aix/icons';
import { ref, computed, onScopeDispose } from 'vue';
import { locale } from '../locale';
import type {
  ActionsItems,
  ActionItem,
  ActionKey,
  ChatMessage,
  MessageFeedback,
  BranchMeta,
} from '../types';

const props = withDefaults(defineProps<BubbleActionsProps>(), {
  content: '',
  items: () => ['copy', 'regenerate'],
});
const emit = defineEmits<BubbleActionsEmits>();
const ns = useNamespace('bubble-actions');
const { t } = useLocale(locale);

const copied = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

const onCopy = async () => {
  // 有文本时用 copyText 复制（内含 Clipboard API + execCommand 兜底，兼容 HTTP / 旧浏览器）；
  // 两条路径都失败视为硬失败：静默降级，不显示「已复制」也不抛 copy。
  // 无 content 时跳过复制、仍抛 copy 事件，交由使用方自定义复制逻辑（逃生口）。
  if (props.content && !(await copyText(props.content))) return;
  copied.value = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    copied.value = false;
  }, 1500);
  emit('copy');
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
.aix-ai-chat.is-actions-hover {
  .aix-bubble .aix-bubble-actions {
    opacity: 0;
  }

  .aix-bubble:hover .aix-bubble-actions,
  .aix-bubble .aix-bubble-actions:focus-within {
    opacity: 1;
  }

  // 触屏等无 hover 设备：即便配置 hover 也始终显示，避免操作无法触达
  @media (hover: none) {
    .aix-bubble .aix-bubble-actions {
      opacity: 1;
    }
  }
}
</style>
