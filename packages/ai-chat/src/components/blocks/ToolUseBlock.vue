<template>
  <!-- 委托自定义工具渲染器。除五个契约 prop 外还须透传 $attrs 与块插槽，否则 toolRenderers
       比 blockRenderers 少两条通道（Bubble 是把 @typing-complete / @keep-mounted-change 与
       块插槽直接挂在「块渲染器」上的，对 tool_use 而言那个组件是本组件而非委托目标）：
       本组件 inheritAttrs:false，不显式 v-bind 就等于把这些监听器整个吃掉——自定义工具卡里
       的 Teleport 浮层（同内置 ImageBlock 的图片预览）因此拿不到 keepMounted，虚拟列表回收
       宿主行时会连同打开状态一起销毁。 -->
  <component
    :is="delegate"
    v-if="delegate"
    v-bind="$attrs"
    :block="block"
    :info="info"
    :typing="typing"
    :on-block-action="onBlockAction"
    :on-block-intent="onBlockIntent"
  >
    <template v-for="name in slotNames" :key="name" #[name]="sp">
      <slot :name="name" v-bind="sp" />
    </template>
  </component>
  <div v-else :class="ns.b()">
    <button type="button" :class="ns.e('header')" @click="expanded = !expanded">
      <span :class="ns.e('name')">{{ block.toolName || 'Tool' }}</span>
      <LoadingDots v-if="pending" />
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
  /** 气泡上下文（注册表统一透传给委托目标，本组件自身不消费）；可选性与 BlockRendererProps 契约对齐 */
  info?: BubbleContentInfo;
  /** 打字机态（注册表统一透传，工具调用不逐字，故不消费） */
  typing?: boolean;
  /** 交互动作回调（注册表统一透传，转发给命中的自定义渲染器） */
  onBlockAction?: BlockActionHandler;
  /**
   * 块意图回调（注册表统一透传，转发给命中的自定义渲染器）。
   * 必须显式声明为 prop：本组件 inheritAttrs:false，未声明会让 Bubble 传下来的
   * on-block-intent 落进 attrs 被丢弃，自定义工具渲染器便拿不到 intent 通道——
   * 工具审批（state='awaiting-approval'）这类「改数据走 action、点提交走 intent」的场景
   * 因此走不通（与 UserConfirmBlock 的双通道保持同构）。
   */
  onBlockIntent?: BlockIntentHandler;
  /** 按 toolName 路由到自定义渲染器；命中则整块委托，未命中落到默认可折叠卡片 */
  toolRenderers?: BlockRenderers;
}
</script>

<script setup lang="ts">
import { useNamespace, useLocale } from '@aix/hooks';
import { computed, ref, useSlots, type Component } from 'vue';
import { locale } from '../../locale';
import type {
  ContentBlock,
  BubbleContentInfo,
  BlockActionHandler,
  BlockIntentHandler,
  BlockRenderers,
} from '../../types';
import LoadingDots from '../LoadingDots.vue';

// 注册表统一向渲染器透传 block/info/typing；关闭属性继承避免多余 attr 落到根元素。
defineOptions({ inheritAttrs: false });

const props = defineProps<ToolUseBlockProps>();

const ns = useNamespace('tool-use');
const { t } = useLocale(locale);
const slots = useSlots();
// 本组件自身不消费任何具名插槽（默认卡片是纯数据渲染），故收到的全部插槽都属于「块插槽穿透」
// 链路（AiChat → BubbleList → Bubble → 块渲染器），原样转交委托目标。
const slotNames = computed(() => Object.keys(slots));
const expanded = ref(true);
// toolName 来自不可信流数据，用 Object.hasOwn 做自有属性校验，避免 'constructor'/'toString'
// 等原型链上的键命中被误当渲染器（__proto__ 本就不在自有属性中，hasOwn 一并挡住）
const delegate = computed<Component | undefined>(() =>
  props.toolRenderers && Object.hasOwn(props.toolRenderers, props.block.toolName)
    ? props.toolRenderers[props.block.toolName]
    : undefined,
);
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
</style>
