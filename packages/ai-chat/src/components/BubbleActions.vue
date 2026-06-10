<template>
  <div :class="ns.b()">
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
  /** 操作项列表：字符串=内置预设（copy/regenerate/feedback），对象=自定义项；默认 ['copy','regenerate'] */
  items?: ActionsItems;
  /** 'copy' 内置项的复制文本；提供后点击复制自动写入剪贴板并给出「已复制」反馈 */
  content?: string;
  /** 'feedback' 内置项的受控激活态，null 表示未反馈 */
  feedback?: MessageFeedback | null;
  /** 自定义项 onClick 的 ctx.message 来源（AiChat 接线时传入；独立使用可不传） */
  message?: ChatMessage;
}
export interface BubbleActionsEmits {
  (e: 'copy'): void;
  (e: 'regenerate'): void;
  (e: 'feedback', value: MessageFeedback | null): void;
}
</script>

<script setup lang="ts">
import { useLocale } from '@aix/hooks';
import { Copy, Check, Refresh, ThumbUp, ThumbDown } from '@aix/icons';
import { ref, computed, onScopeDispose } from 'vue';
import { useNamespace } from '../composables/useNamespace';
import { locale } from '../locale';
import type { ActionsItems, ActionItem, ChatMessage, MessageFeedback } from '../types';
import { copyText } from '../utils/clipboard';

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

type NormalizedItem =
  | { builtin: true; key: 'copy' | 'regenerate' | 'feedback' }
  | ({ builtin: false } & ActionItem);

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
