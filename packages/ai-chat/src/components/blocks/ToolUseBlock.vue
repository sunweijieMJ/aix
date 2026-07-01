<template>
  <component
    :is="delegate"
    v-if="delegate"
    :block="block"
    :info="info"
    :typing="typing"
    :on-block-action="onBlockAction"
  />
  <div v-else :class="ns.b()">
    <button type="button" :class="ns.e('header')" @click="expanded = !expanded">
      <span :class="ns.e('name')">{{ block.toolName || 'Tool' }}</span>
      <span v-if="pending" :class="ns.e('spinner')" />
      <span :class="[ns.e('caret'), ns.is('open', expanded)]">▾</span>
    </button>
    <div v-show="expanded" :class="ns.e('body')">
      <div :class="ns.e('section')">
        <div :class="ns.e('section-title')">{{ t.toolInput }}</div>
        <pre :class="ns.e('code')">{{ inputText }}</pre>
      </div>
      <div v-if="block.state === 'output-error'" :class="[ns.e('section'), ns.m('error')]">
        <div :class="ns.e('section-title')">{{ t.toolError }}</div>
        <pre :class="ns.e('code')">{{ block.errorText }}</pre>
      </div>
      <div v-else-if="block.state === 'output-available'" :class="ns.e('section')">
        <div :class="ns.e('section-title')">{{ t.toolOutput }}</div>
        <pre :class="ns.e('code')">{{ outputText }}</pre>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
export interface ToolUseBlockProps {
  /** tool_use 类型的 block */
  block: Extract<ContentBlock, { type: 'tool_use' }>;
  /** 气泡上下文（注册表统一透传，本组件暂不消费） */
  info: BubbleContentInfo;
  /** 打字机态（注册表统一透传，工具调用不逐字，故不消费） */
  typing?: boolean;
  /** 交互动作回调（注册表统一透传，转发给命中的自定义渲染器） */
  onBlockAction?: BlockActionHandler;
  /** 按 toolName 路由到自定义渲染器；命中则整块委托，未命中落到默认可折叠卡片 */
  toolRenderers?: BlockRenderers;
}
</script>

<script setup lang="ts">
import { useNamespace, useLocale } from '@aix/hooks';
import { computed, ref, type Component } from 'vue';
import { locale } from '../../locale';
import type {
  ContentBlock,
  BubbleContentInfo,
  BlockActionHandler,
  BlockRenderers,
} from '../../types';

// 注册表统一向渲染器透传 block/info/typing；关闭属性继承避免多余 attr 落到根元素。
defineOptions({ inheritAttrs: false });

const props = defineProps<ToolUseBlockProps>();

const ns = useNamespace('tool-use');
const { t } = useLocale(locale);
const expanded = ref(true);
const delegate = computed<Component | undefined>(() => props.toolRenderers?.[props.block.toolName]);
const pending = computed(
  () =>
    props.block.state === 'input-streaming' ||
    props.block.state === 'input-available' ||
    props.block.state === 'executing',
);
const fmt = (v: unknown): string =>
  v == null
    ? ''
    : typeof v === 'string'
      ? v
      : (() => {
          try {
            return JSON.stringify(v, null, 2);
          } catch {
            return String(v);
          }
        })();
const inputText = computed(() =>
  props.block.input != null ? fmt(props.block.input) : (props.block.argsText ?? ''),
);
const outputText = computed(() => fmt(props.block.output));
</script>

<style lang="scss">
.aix-tool-use {
  margin: var(--aix-marginXS) 0;

  &__header {
    display: flex;
    align-items: center;
    gap: var(--aix-marginXXS);
    width: 100%;
    padding: var(--aix-paddingXXS) 0;
    border: none;
    background: transparent;
    color: var(--aix-colorText);
    font-size: var(--aix-fontSize);
    font-weight: var(--aix-fontWeightStrong);
    cursor: pointer;
  }

  &__spinner {
    width: 12px;
    height: 12px;
    animation: aix-tool-use-spin 0.8s linear infinite;
    border: 2px solid var(--aix-colorBorderSecondary);
    border-radius: 50%;
    border-top-color: var(--aix-colorPrimary);
  }

  &__caret {
    margin-left: auto;
    transition: transform var(--aix-motionDurationFast) var(--aix-motionEaseInOut);

    &.is-open {
      transform: rotate(180deg);
    }
  }

  &__section {
    margin-top: var(--aix-marginXS);
    overflow: hidden;
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: var(--aix-borderRadius);

    &--error {
      border-color: var(--aix-colorErrorBorder);
    }
  }

  &__section-title {
    padding: var(--aix-paddingXXS) var(--aix-paddingSM);
    border-bottom: 1px solid var(--aix-colorBorderSecondary);
    color: var(--aix-colorTextSecondary);
    font-size: var(--aix-fontSizeSM);
  }

  &__code {
    max-height: 320px;
    margin: 0;
    padding: var(--aix-paddingSM);
    overflow: auto;
    color: var(--aix-colorText);
    font-size: var(--aix-fontSizeSM);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
}

@keyframes aix-tool-use-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
