<template>
  <div :class="ns.b()">
    <button
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
      v-if="reloadable"
      type="button"
      :class="ns.e('btn')"
      :aria-label="t.regenerateButton"
      :title="t.regenerateButton"
      @click="emit('regenerate')"
    >
      <Refresh />
    </button>
    <template v-if="feedbackable">
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
    <!-- 扩展位：使用方可追加分享等自定义操作 -->
    <slot />
  </div>
</template>

<script lang="ts">
import type { MessageFeedback } from '../types';

export interface BubbleActionsProps {
  /** 待复制的文本；提供后点击复制按钮自动写入剪贴板并给出「已复制」反馈 */
  content?: string;
  /** 是否显示「重新生成」按钮，默认 true */
  reloadable?: boolean;
  /** 是否显示赞/踩反馈按钮，默认 false */
  feedbackable?: boolean;
  /** 当前反馈激活态（受控），null 表示未反馈 */
  feedback?: MessageFeedback | null;
}
export interface BubbleActionsEmits {
  /** 复制成功（已写入剪贴板）后触发 */
  (e: 'copy'): void;
  /** 点击重新生成 */
  (e: 'regenerate'): void;
  /** 赞/踩切换（互斥，再点同项取消为 null） */
  (e: 'feedback', value: MessageFeedback | null): void;
}
</script>

<script setup lang="ts">
import { ref, onScopeDispose } from 'vue';
import { useLocale } from '@aix/hooks';
import { Copy, Check, Refresh, ThumbUp, ThumbDown } from '@aix/icons';
import { locale } from '../locale';
import { useNamespace } from '../composables/useNamespace';

const props = withDefaults(defineProps<BubbleActionsProps>(), {
  content: '',
  reloadable: true,
  feedbackable: false,
});
const emit = defineEmits<BubbleActionsEmits>();
const ns = useNamespace('bubble-actions');
const { t } = useLocale(locale);

const copied = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

const onCopy = async () => {
  // 无可写文本时仍向上抛 copy 事件，交由使用方自定义复制逻辑
  if (props.content && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(props.content);
    } catch {
      // 有剪贴板能力但写入失败（权限被拒 / 非聚焦态）视为硬失败：
      // 静默降级，既不显示「已复制」反馈，也不抛 copy 事件（详见单测「剪贴板不可用时静默降级、不抛 copy 事件」）。
      // 注意：与上方「无剪贴板能力」路径不同——那条路径会抛 copy 事件交由使用方自定义复制。
      return;
    }
  }
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
