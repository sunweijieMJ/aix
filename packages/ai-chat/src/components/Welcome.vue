<template>
  <div :class="[ns.b(), ns.m(align), ns.is('fill-height', fillHeight)]">
    <div v-if="icon || $slots.icon" :class="ns.e('icon')">
      <slot name="icon"><img :src="icon" alt="" /></slot>
    </div>
    <h3 v-if="title || $slots.title" :class="ns.e('title')">
      <slot name="title">{{ title }}</slot>
    </h3>
    <p v-if="description || $slots.description" :class="ns.e('description')">
      <slot name="description">{{ description }}</slot>
    </p>
    <div v-if="$slots.extra" :class="ns.e('extra')"><slot name="extra" /></div>
  </div>
</template>

<script lang="ts">
export interface WelcomeProps {
  /** 顶部图标图片地址（可用 icon 具名 slot 覆盖） */
  icon?: string;
  /** 标题文案（可用 title 具名 slot 覆盖） */
  title?: string;
  /** 描述文案（可用 description 具名 slot 覆盖） */
  description?: string;
  /** 对齐方式：center 居中空态（默认）/ start 左对齐（用于带在顶部的引导语） */
  align?: 'center' | 'start';
  /**
   * 是否用 flex 上下 auto margin 在纵向撑满的容器（如 AiChat body）中垂直居中，
   * 默认跟随 `align`（`center` → `true`，`start` → `false`）。
   *
   * 与 `align` **正交**：显式传入本 prop 即可覆盖上述默认，两个维度任意组合——
   * 如「左对齐 + 垂直居中」（面板顶部左对齐、但仍在空白区居中的引导语）传
   * `align="start"` + `:fill-height="true"`。
   */
  fillHeight?: boolean;
}
</script>

<script setup lang="ts">
import { useNamespace } from '@aix/hooks';
import { computed } from 'vue';

const props = withDefaults(defineProps<WelcomeProps>(), {
  align: 'center',
  // 显式 undefined 默认值（联合类型含 boolean 的 prop 若不声明会被隐式转换成 false，
  // 与 AiChat.vue quote/suggestions/treeMode 同款坑），交由下方 computed 落回跟随 align 的默认值
  fillHeight: undefined,
});

const ns = useNamespace('welcome');
const fillHeight = computed(() => props.fillHeight ?? props.align === 'center');
</script>

<style lang="scss">
.aix-welcome {
  display: flex;
  flex-direction: column;
  gap: var(--aix-sizeXS);

  /* 居中空态（默认）：水平对齐 + 文本居中；纵向撑满由独立的 fillHeight 维度控制（见下方 is-fill-height） */
  &--center {
    align-items: center;
    padding: var(--aix-paddingXL) var(--aix-padding);
    text-align: center;
  }

  /* 左对齐引导语：置于面板顶部 */
  &--start {
    align-items: flex-start;
    text-align: left;
  }

  /* 纵向撑满时用 flex 上下 auto margin 在容器（如 AiChat body）中垂直居中，与 align 独立正交，
     默认跟随 align（center 时开、start 时关，见 WelcomeProps.fillHeight），可显式覆盖任意组合 */
  &.is-fill-height {
    margin: auto 0;
  }

  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    margin-bottom: var(--aix-marginXS);
    border-radius: var(--aix-borderRadiusLG);
    background-color: var(--aix-colorPrimaryBg);
    color: var(--aix-colorPrimary);

    img {
      width: 32px;
      height: 32px;
    }
  }

  &__title {
    margin: 0;
    color: var(--aix-colorTextHeading);
    font-size: var(--aix-fontSizeLG);
    font-weight: var(--aix-fontWeightStrong);
  }

  &__description {
    max-width: 440px;
    margin: 0;
    color: var(--aix-colorTextSecondary);
    font-size: var(--aix-fontSize);
    line-height: var(--aix-lineHeight);
  }

  &__extra {
    margin-top: var(--aix-marginSM);
  }
}
</style>
