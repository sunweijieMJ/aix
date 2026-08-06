<template>
  <div :class="ns.b()">
    <button type="button" :class="ns.e('header')" :aria-expanded="open" @click="open = !open">
      <!-- 图标 / 标题 / 箭头各开一个插槽：只想换其一时不必接管整个折叠壳（展开态、a11y、动效都还在）。
           作用域给 open——箭头几乎必然要按开合换图形，标题也常需要按开合换文案。
           icon 不提供时不占位（无 fallback、无包裹元素），与 arrow/title 的「不提供则无副作用」约定一致，
           区别在于 arrow/title 有内置默认内容作 fallback，而图标本就不是内置形态的一部分。 -->
      <slot name="icon" :open="open" />
      <span>
        <slot name="title" :open="open">{{ title || t.thinking }}</slot>
      </span>
      <slot name="arrow" :open="open">
        <span :class="[ns.e('arrow'), ns.is('open', open)]">▾</span>
      </slot>
    </button>
    <div v-if="open" :class="ns.e('body')">
      <slot :open="open">{{ content }}</slot>
    </div>
  </div>
</template>

<script lang="ts">
export interface ThinkingProps {
  /** 思维链内容（可用默认 slot 覆盖） */
  content?: string;
  /** 折叠面板标题，未传时回退 i18n 文案 */
  title?: string;
  /** 初始是否展开，默认 false */
  expanded?: boolean;
}
</script>

<script setup lang="ts">
import { useLocale } from '@aix/hooks';
import { useNamespace } from '@aix/hooks';
import { ref, watch } from 'vue';
import { locale } from '../locale';

const props = withDefaults(defineProps<ThinkingProps>(), {
  content: '',
  expanded: false,
});

defineSlots<{
  /** 折叠面板正文（覆盖 content 文本渲染） */
  default?: (props: { open: boolean }) => unknown;
  /** 标题前的图标区（无内置默认内容，不提供时不占位） */
  icon?: (props: { open: boolean }) => unknown;
  /** 标题区（覆盖 title / i18n 回退文案） */
  title?: (props: { open: boolean }) => unknown;
  /** 展开箭头（覆盖内置 ▾ 字符） */
  arrow?: (props: { open: boolean }) => unknown;
}>();

const ns = useNamespace('thinking');
const { t } = useLocale(locale);
const open = ref(props.expanded);

// expanded 作为可响应的展开意图：父组件改变它（如 reasoning 流式中→完成）时同步面板状态。
// watch 仅在 expanded 真正变化时触发，故用户手动点击切换不会被「相同 expanded 重渲染」覆盖，
// 自动控制与手动切换可共存。静态传入（一次性 expanded）时 watch 永不触发，向后兼容。
watch(
  () => props.expanded,
  (v) => {
    open.value = v;
  },
);
</script>

<style lang="scss">
.aix-thinking {
  overflow: hidden;
  border: 1px solid var(--aix-colorBorderSecondary);
  border-radius: var(--aix-borderRadiusLG);
  background-color: var(--aix-colorFillQuaternary);

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--aix-paddingSM) var(--aix-padding);
    transition: background-color var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border: none;
    background: transparent;
    color: var(--aix-colorTextSecondary);
    font-size: var(--aix-fontSize);
    cursor: pointer;

    &:hover {
      background-color: var(--aix-colorFillTertiary);
    }
  }

  &__arrow {
    transition: transform var(--aix-motionDurationMid) var(--aix-motionEaseInOut);
    color: var(--aix-colorTextTertiary);
  }

  &__arrow.is-open {
    transform: rotate(180deg);
  }

  &__body {
    padding: var(--aix-paddingSM) var(--aix-padding);
    border-top: 1px solid var(--aix-colorBorderSecondary);
    color: var(--aix-colorTextSecondary);
    font-size: var(--aix-fontSize);
    line-height: var(--aix-lineHeight);
  }
}
</style>
