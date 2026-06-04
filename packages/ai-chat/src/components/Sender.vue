<template>
  <div :class="[ns.b(), ns.is('disabled', disabled), ns.is('has-toolbar', !!$slots.toolbar)]">
    <!-- 顶部扩展区：常用于附件预览 / 引用上下文等，位于输入行上方 -->
    <div v-if="$slots.header" :class="ns.e('header')"><slot name="header" /></div>
    <div :class="ns.e('main')">
      <span v-if="$slots.prefix" :class="ns.e('prefix')"><slot name="prefix" /></span>
      <textarea
        ref="textareaRef"
        :class="ns.e('input')"
        :value="inner"
        :placeholder="placeholder || t.senderPlaceholder"
        :aria-label="placeholder || t.senderPlaceholder"
        :disabled="disabled"
        rows="1"
        @input="onInput"
        @keydown="onKeydown"
      />
      <button
        type="button"
        :class="[ns.e('send'), ns.is('streaming', loading)]"
        :disabled="disabled || (!loading && !inner.trim())"
        :aria-label="loading ? t.stopButton : t.sendButton"
        :title="loading ? t.stopButton : t.sendButton"
        @click="onSendClick"
      >
        <span :class="ns.e('send-icon')" :style="sendIconStyle" aria-hidden="true" />
      </button>
    </div>
    <!-- 底部工具栏：放灵感/附件等操作按钮（提供 slot 时才渲染，向后兼容） -->
    <div v-if="$slots.toolbar" :class="ns.e('toolbar')"><slot name="toolbar" /></div>
    <!-- 底部扩展区：位于工具栏之下，用于字数统计 / 提示语 / 自定义页脚等 -->
    <div v-if="$slots.footer" :class="ns.e('footer')"><slot name="footer" /></div>
  </div>
</template>

<script lang="ts">
export interface SenderProps {
  /** 输入框文本（v-model），受控 */
  modelValue?: string;
  /** 占位提示，缺省取 locale.senderPlaceholder */
  placeholder?: string;
  /** 加载态：发送按钮切换为停止按钮，点击触发 cancel，默认 false */
  loading?: boolean;
  /** 是否禁用整个输入框，默认 false */
  disabled?: boolean;
  /** 提交方式：'enter' 回车发送（Shift+Enter 换行）/ 'shiftEnter' 反之，默认 'enter' */
  submitType?: 'enter' | 'shiftEnter';
}
export interface SenderEmits {
  (e: 'update:modelValue', v: string): void;
  (e: 'submit', v: string): void;
  (e: 'cancel'): void;
}
</script>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useLocale } from '@aix/hooks';
import { locale } from '../locale';
import { useNamespace } from '../composables/useNamespace';
// 发送按钮图标采用设计稿导出的本地 SVG 资源：默认态为纸飞机、输出中为停止圆点。
// 以 CSS mask 渲染，使图标颜色随按钮 color（主题变量）变化，而非 SVG 内置色，符合主题系统约定。
import sendIconUrl from '../assets/send-default.svg';
import stopIconUrl from '../assets/send-streaming.svg';

const props = withDefaults(defineProps<SenderProps>(), {
  modelValue: '',
  loading: false,
  disabled: false,
  submitType: 'enter',
});
const emit = defineEmits<SenderEmits>();
const ns = useNamespace('sender');
const { t } = useLocale(locale);

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const inner = ref(props.modelValue);

// 按状态切换 mask 图标（输出中=停止，否则=发送）。mask 相关属性全部走内联样式（含 -webkit- 前缀），
// 避免依赖构建期 autoprefixer，确保在 Storybook / Safari 下也能正确渲染。
const sendIconStyle = computed(() => {
  const img = `url("${props.loading ? stopIconUrl : sendIconUrl}")`;
  return {
    maskImage: img,
    maskRepeat: 'no-repeat',
    maskPosition: 'center',
    maskSize: 'contain',
    WebkitMaskImage: img,
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    WebkitMaskSize: 'contain',
  };
});

// 自适应高度：内容增减时按 scrollHeight 撑高，上限由 CSS max-height 接管（超出后内部滚动）
const autosize = () => {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
};

watch(
  () => props.modelValue,
  (v) => {
    inner.value = v;
    nextTick(autosize);
  },
  // immediate：父组件以非空多行初值挂载时（v-model:input 回填草稿/发送失败保留内容），
  // 首屏即按内容撑高，避免停留在单行高度直到用户首次输入才纠正。
  { immediate: true },
);

const onInput = (e: Event) => {
  inner.value = (e.target as HTMLTextAreaElement).value;
  emit('update:modelValue', inner.value);
  autosize();
};

const doSubmit = () => {
  const text = inner.value.trim();
  if (!text || props.loading || props.disabled) return;
  emit('submit', text);
  inner.value = '';
  emit('update:modelValue', '');
  nextTick(autosize);
};

const onKeydown = (e: KeyboardEvent) => {
  // IME 输入法组词期间（拼音/假名选词）按 Enter 仅用于确认候选词，不应触发提交。
  // keyCode 229 兼容部分浏览器在组词时不设置 isComposing 的情况。
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key !== 'Enter') return;
  const wantShift = props.submitType === 'shiftEnter';
  const matched = wantShift ? e.shiftKey : !e.shiftKey;
  if (matched) {
    e.preventDefault();
    doSubmit();
  }
};

const onSendClick = () => {
  if (props.loading) emit('cancel');
  else doSubmit();
};

defineExpose({
  focus: () => textareaRef.value?.focus(),
  clear: () => {
    inner.value = '';
    emit('update:modelValue', '');
    nextTick(autosize);
  },
});
</script>

<style lang="scss">
.aix-sender {
  display: flex;
  flex-direction: column;
  padding: var(--aix-paddingXS) var(--aix-paddingXS) var(--aix-paddingXS) var(--aix-paddingSM);
  transition:
    border-color var(--aix-motionDurationMid) var(--aix-motionEaseInOut),
    box-shadow var(--aix-motionDurationMid) var(--aix-motionEaseInOut);
  border: 1px solid var(--aix-colorBorderSecondary);
  border-radius: var(--aix-borderRadiusLG);
  background-color: var(--aix-colorBgContainer);
  box-shadow: var(--aix-shadowSM);
  gap: var(--aix-sizeXS);

  /* 聚焦时主色描边 + 焦点环，给出清晰的输入焦点反馈 */
  &:focus-within {
    border-color: var(--aix-colorPrimary);
    box-shadow: 0 0 0 var(--aix-controlOutlineWidth) var(--aix-controlOutline);
  }

  &.is-disabled {
    background-color: var(--aix-colorBgContainerDisabled);
    box-shadow: none;
  }

  /* 输入行：前缀 + 文本域 + 发送按钮 */
  &__main {
    display: flex;
    align-items: flex-end;
    gap: var(--aix-sizeXS);
  }

  &__prefix {
    display: inline-flex;
    flex: none;
    align-items: center;
    align-self: flex-end;
  }

  /* 顶部扩展区（附件预览 / 引用上下文等），在输入行上方 */
  &__header {
    display: flex;
    flex-direction: column;
    gap: var(--aix-sizeXS);
    padding-bottom: var(--aix-paddingXXS);
  }

  /* 底部工具栏行 */
  &__toolbar {
    display: flex;
    align-items: center;
    gap: var(--aix-sizeXS);
    padding-top: var(--aix-paddingXXS);
  }

  /* 底部扩展区（字数统计 / 提示语等），在工具栏之下 */
  &__footer {
    display: flex;
    align-items: center;
    gap: var(--aix-sizeXS);
    padding-top: var(--aix-paddingXXS);
  }

  &__input {
    flex: 1;
    max-height: 160px;
    padding: var(--aix-paddingXS);
    overflow-y: auto;
    border: none;
    outline: none;
    background: transparent;
    color: var(--aix-colorText);
    font-size: var(--aix-fontSize);
    line-height: var(--aix-lineHeight);
    resize: none;

    &::placeholder {
      color: var(--aix-colorTextPlaceholder);
    }
  }

  /* 发送按钮：浅灰圆角方底（设计稿语言），图标颜色随状态变化——
     空输入/禁用=次级文本灰（纸飞机），可发送/输出中=主色（纸飞机 / 停止圆点）。
     图标用 currentColor 着色（见 &__send-icon 的 mask 实现）。 */
  &__send {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: var(--aix-controlHeight);
    height: var(--aix-controlHeight);
    transition:
      background-color var(--aix-motionDurationFast) var(--aix-motionEaseInOut),
      color var(--aix-motionDurationFast) var(--aix-motionEaseInOut),
      transform var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border: none;
    border-radius: var(--aix-borderRadiusLG);
    background-color: var(--aix-colorFillSecondary);
    color: var(--aix-colorPrimary);
    cursor: pointer;

    &:hover:not(:disabled) {
      background-color: var(--aix-colorFill);
    }

    &:active:not(:disabled) {
      transform: scale(0.92);
    }

    &:disabled {
      color: var(--aix-colorTextTertiary);
      cursor: not-allowed;
    }
  }

  /* 图标本体：以 mask 取设计 SVG 形状，背景填 currentColor 实现主题着色（mask 图与定位见内联 style）。 */
  &__send-icon {
    width: 16px;
    height: 16px;
    background-color: currentColor;
  }
}
</style>
