<template>
  <div :class="ns.b()">
    <button type="button" :class="ns.e('header')" :aria-expanded="open" @click="open = !open">
      <span>{{ title || t.thinking }}</span>
      <span :class="[ns.e('arrow'), ns.is('open', open)]">▾</span>
    </button>
    <div v-if="open" :class="ns.e('body')">
      <slot>{{ content }}</slot>
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
import { ref, watch } from 'vue';
import { useNamespace } from '../composables/useNamespace';
import { locale } from '../locale';

const props = withDefaults(defineProps<ThinkingProps>(), {
  content: '',
  expanded: false,
});

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
