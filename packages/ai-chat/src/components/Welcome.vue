<template>
  <div :class="[ns.b(), ns.m(align)]">
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
}
</script>

<script setup lang="ts">
import { useNamespace } from '../composables/useNamespace';

withDefaults(defineProps<WelcomeProps>(), { align: 'center' });

const ns = useNamespace('welcome');
</script>

<style lang="scss">
.aix-welcome {
  display: flex;
  flex-direction: column;
  gap: var(--aix-sizeXS);

  /* 居中空态（默认）：水平垂直居中 */
  &--center {
    align-items: center;

    /* 作为空态置于 AiChat body（flex 列）中时，auto 上下边距使其垂直居中 */
    margin: auto 0;
    padding: var(--aix-paddingXL) var(--aix-padding);
    text-align: center;
  }

  /* 左对齐引导语：置于面板顶部 */
  &--start {
    align-items: flex-start;
    text-align: left;
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
