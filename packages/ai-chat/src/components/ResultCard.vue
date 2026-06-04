<template>
  <div :class="ns.b()">
    <div :class="ns.e('card')">
      <div v-if="title || editable || $slots.title || $slots.extra" :class="ns.e('head')">
        <span :class="ns.e('title')">
          <slot name="title">{{ title }}</slot>
        </span>
        <span :class="ns.e('head-extra')"><slot name="extra" /></span>
        <button
          v-if="editable"
          type="button"
          :class="ns.e('edit')"
          :aria-label="t.editButton"
          :title="t.editButton"
          @click="emit('edit')"
        >
          <Edit />
        </button>
      </div>
      <div :class="ns.e('body')"><slot /></div>
    </div>
    <div v-if="$slots.actions" :class="ns.e('actions')"><slot name="actions" /></div>
  </div>
</template>

<script lang="ts">
export interface ResultCardProps {
  /** 卡片标题/类型标签（如「单项选择题」） */
  title?: string;
  /** 是否显示右上角编辑按钮（点击触发 edit），默认 false */
  editable?: boolean;
}
export interface ResultCardEmits {
  /** 点击编辑按钮 */
  (e: 'edit'): void;
}
</script>

<script setup lang="ts">
import { useLocale } from '@aix/hooks';
import { Edit } from '@aix/icons';
import { locale } from '../locale';
import { useNamespace } from '../composables/useNamespace';

withDefaults(defineProps<ResultCardProps>(), { editable: false });
const emit = defineEmits<ResultCardEmits>();
const ns = useNamespace('result-card');
const { t } = useLocale(locale);
</script>

<style lang="scss">
.aix-result-card {
  &__card {
    padding: var(--aix-padding);
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: var(--aix-borderRadiusLG);
    background: var(--aix-colorBgContainer);
  }

  &__head {
    display: flex;
    align-items: center;
    margin-bottom: var(--aix-marginSM);
  }

  &__title {
    flex: 1;
    color: var(--aix-colorText);
    font-size: var(--aix-fontSize);
    font-weight: var(--aix-fontWeightStrong);
  }

  &__head-extra {
    display: inline-flex;
    align-items: center;
  }

  &__edit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--aix-colorTextTertiary);
    cursor: pointer;

    svg {
      width: 16px;
      height: 16px;
    }

    &:hover {
      color: var(--aix-colorText);
    }
  }

  /* 内容区：灰底承托正文（题干/选项/答案/解析等） */
  &__body {
    padding: var(--aix-paddingLG);
    border-radius: var(--aix-borderRadius);
    background: var(--aix-colorFillTertiary);
    color: var(--aix-colorText);
    font-size: var(--aix-fontSize);
    line-height: var(--aix-lineHeight);
  }

  &__actions {
    display: flex;
    gap: var(--aix-sizeSM);
    margin-top: var(--aix-marginSM);
  }
}
</style>
