<template>
  <div :class="[ns.b(), ns.is('rich', rich)]">
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      :class="ns.e('item')"
      @click="$emit('select', item)"
    >
      <span v-if="item.icon" :class="ns.e('icon')">
        <img v-if="isImg(item.icon)" :src="item.icon" alt="" />
        <template v-else>{{ item.icon }}</template>
      </span>
      <span :class="ns.e('main')">
        <span :class="ns.e('label')">{{ item.label }}</span>
        <span v-if="item.description" :class="ns.e('desc')">{{ item.description }}</span>
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useNamespace } from '../composables/useNamespace';
import type { PromptItem } from '../types';

const props = defineProps<{ items: PromptItem[] }>();
defineEmits<{ (e: 'select', item: PromptItem): void }>();

const ns = useNamespace('prompts');

// 任一项含 icon/description 即为富卡片布局（纵向标题+描述），否则为紧凑标签流式布局
const rich = computed(() => props.items.some((it) => it.icon || it.description));
const isImg = (icon: string) => /^(https?:|data:|\/|\.)/.test(icon);
</script>

<style lang="scss">
.aix-prompts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--aix-sizeSM);

  // 富卡片模式：纵向排布，卡片占满宽度
  &.is-rich {
    flex-flow: column nowrap;
  }

  &__item {
    display: inline-flex;
    align-items: center;
    padding: var(--aix-paddingXS) var(--aix-padding);
    transition: all var(--aix-motionDurationMid) var(--aix-motionEaseInOut);
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: var(--aix-borderRadiusLG);
    background-color: var(--aix-colorBgContainer);
    box-shadow: var(--aix-shadowXS);
    color: var(--aix-colorText);
    font-size: var(--aix-fontSize);
    line-height: var(--aix-lineHeight);
    text-align: left;
    cursor: pointer;

    &:hover {
      transform: translateY(-1px);
      border-color: var(--aix-colorPrimaryBorder);
      background-color: var(--aix-colorPrimaryBg);
      box-shadow: var(--aix-shadowSM);
      color: var(--aix-colorPrimaryText);
    }

    &:active {
      transform: translateY(0);
      box-shadow: none;
    }
  }

  // 富卡片：图标 + （标题 / 描述）两行
  &.is-rich &__item {
    align-items: flex-start;
    gap: var(--aix-sizeXS);
    width: 100%;
    padding: var(--aix-padding);
    background-color: var(--aix-colorFillQuaternary);
    box-shadow: none;

    &:hover {
      background-color: var(--aix-colorPrimaryBg);
    }
  }

  &__icon {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    font-size: var(--aix-fontSizeLG);

    img {
      width: 18px;
      height: 18px;
    }
  }

  &__main {
    display: flex;
    flex-direction: column;
    gap: var(--aix-marginXXS);
    min-width: 0;
  }

  &__label {
    font-weight: var(--aix-fontWeightStrong);
  }

  &__desc {
    color: var(--aix-colorTextSecondary);
    font-size: var(--aix-fontSizeSM);
    font-weight: 400;
    line-height: var(--aix-lineHeight);
  }
}
</style>
