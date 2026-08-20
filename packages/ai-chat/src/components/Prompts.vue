<template>
  <div :class="[ns.b(), ns.is('rich', rich)]">
    <button
      v-for="row in resolved"
      :key="row.item.key"
      type="button"
      :class="ns.e('item')"
      @click="$emit('select', row.item)"
    >
      <!-- 图标与文本都解析不出（icon 判为图片地址却未过白名单）时整个图标位不渲染，
           避免留一个空的图标格子把标题挤偏 -->
      <span v-if="row.iconSrc || row.iconText" :class="ns.e('icon')">
        <img v-if="row.iconSrc" :src="row.iconSrc" alt="" />
        <template v-else>{{ row.iconText }}</template>
      </span>
      <span :class="ns.e('main')">
        <span :class="ns.e('label')">{{ row.item.label }}</span>
        <span v-if="row.item.description" :class="ns.e('desc')">{{ row.item.description }}</span>
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { useNamespace } from '@aix/hooks';
import { computed } from 'vue';
import type { PromptItem } from '../types';
import { isImageSource, safeImageSrc } from '../utils/url';

const props = defineProps<{ items: PromptItem[] }>();
defineEmits<{ (e: 'select', item: PromptItem): void }>();

const ns = useNamespace('prompts');

// 任一项含 icon/description 即为富卡片布局（纵向标题+描述），否则为紧凑标签流式布局
const rich = computed(() => props.items.some((it) => it.icon || it.description));

// icon 的 emoji / 图片地址二义分流 + 协议白名单，与 SourcesBlock 的 favicon 完全同口径
// （两步各自的必要性见该文件注释）。prompts 通常由宿主自己配置、可信度高于模型输出，
// 但同一份 icon 语义在两处必须渲染一致，且白名单是零成本的纵深防护，故一并收口。
// 保留原始 item 对象透出给 select 事件：绝不能 emit 这里派生出的包装对象，
// 那会让业务侧拿到多出 iconSrc/iconText 的陌生结构。
const resolved = computed(() =>
  props.items.map((item) => {
    const isImageIcon = isImageSource(item.icon);
    return {
      item,
      iconSrc: isImageIcon ? safeImageSrc(item.icon) : undefined,
      iconText: isImageIcon ? undefined : item.icon,
    };
  }),
);
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
