<template>
  <div :class="[ns.b(), ns.m(variant)]">
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
// ThinkingVariant 定义在 types.ts（它同时是 AiChatProps.reasoningVariant 与
// AiChatConfig.reasoningVariant 的类型，配置层不应为了一个字符串联合去 import 组件文件），
// 由下方 script setup 块统一导入——SFC 两个 script 块共享模块作用域，且 import/order
// 把它们视作同一份导入清单排序，分开写会破坏顺序。此处原样再导出，
// 保持 `from '.../Thinking.vue'` 这一既有引用路径可用。
export type { ThinkingVariant } from '../types';

export interface ThinkingProps {
  /** 思维链内容（可用默认 slot 覆盖） */
  content?: string;
  /** 折叠面板标题，未传时回退 i18n 文案 */
  title?: string;
  /** 初始是否展开，默认 false */
  expanded?: boolean;
  /**
   * 外观形态，默认 `'card'`（行为完全不变）：
   *
   * - `'card'`：整体一个描边卡片，头部撑满、与正文之间一条分隔线；
   * - `'capsule'`：头部收成 hug 宽度的胶囊（不再撑满一行），正文独立成一个圆角浅底块——
   *   当下多数 AI 产品的思考区就长这样；
   * - `'plain'`：不带任何容器视觉，只保留折叠行为与间距，交给宿主完全自绘。
   *
   */
  variant?: ThinkingVariant;
}
</script>

<script setup lang="ts">
import { useNamespace } from '@aix/hooks';
import { ref, watch } from 'vue';
import { useAiChatLocale } from '../composables/useAiChatLocale';
import type { ThinkingVariant } from '../types';

const props = withDefaults(defineProps<ThinkingProps>(), {
  content: '',
  expanded: false,
  variant: 'card',
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
const { t } = useAiChatLocale();
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
  /* 三种形态共有的部分：头部是个可点的按钮，正文是次级文本。
     容器视觉（边框 / 圆角 / 底色）与头尾的具体排布下沉到各 variant，
     这样 plain 天然零视觉，不必先 reset 再自绘。 */
  &__header {
    display: flex;
    align-items: center;
    transition: background-color var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border: none;
    background: transparent;
    color: var(--aix-colorTextSecondary);
    font-size: var(--aix-fontSize);
    cursor: pointer;
  }

  &__arrow {
    transition: transform var(--aix-motionDurationMid) var(--aix-motionEaseInOut);
    color: var(--aix-colorTextTertiary);
  }

  &__arrow.is-open {
    transform: rotate(180deg);
  }

  &__body {
    color: var(--aix-colorTextSecondary);
    font-size: var(--aix-fontSize);
    line-height: var(--aix-lineHeight);
  }

  /* ── card（默认）：整体一个描边卡片，头部撑满，正文以分隔线相接 ── */
  &--card {
    overflow: hidden;
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: var(--aix-borderRadiusLG);
    background-color: var(--aix-colorFillQuaternary);

    .aix-thinking__header {
      justify-content: space-between;
      width: 100%;
      padding: var(--aix-paddingSM) var(--aix-padding);

      &:hover {
        background-color: var(--aix-colorFillTertiary);
      }
    }

    .aix-thinking__body {
      padding: var(--aix-paddingSM) var(--aix-padding);
      border-top: 1px solid var(--aix-colorBorderSecondary);
    }
  }

  /* ── capsule：头部收成 hug 宽度的胶囊，正文独立成一个圆角浅底块。
     容器自身不能有 overflow:hidden —— 胶囊的圆角要能正常显示，正文块也要能与头部错开。 ── */
  &--capsule {
    .aix-thinking__header {
      display: inline-flex;
      justify-content: flex-start;
      width: auto;
      padding: var(--aix-paddingXS) var(--aix-paddingSM);
      border-radius: 999px;
      background-color: var(--aix-colorFillTertiary);
      font-size: var(--aix-fontSizeSM);
      gap: var(--aix-marginXXS);

      &:hover {
        background-color: var(--aix-colorFill);
      }
    }

    .aix-thinking__body {
      margin-top: var(--aix-marginXXS);
      padding: var(--aix-paddingXS) var(--aix-paddingSM);
      border-radius: var(--aix-borderRadiusLG);
      background-color: var(--aix-colorFillQuaternary);
      color: var(--aix-colorTextTertiary);
      font-size: var(--aix-fontSizeSM);
    }
  }

  /* ── plain：无容器视觉，只保留折叠行为与最基本的间距。
     头部同样收成 hug 宽度（撑满一行却没有任何底色，点击热区会大得莫名其妙）。 ── */
  &--plain {
    .aix-thinking__header {
      display: inline-flex;
      justify-content: flex-start;
      width: auto;
      padding: 0;
      gap: var(--aix-marginXXS);
    }

    .aix-thinking__body {
      margin-top: var(--aix-marginXXS);
    }
  }
}
</style>
