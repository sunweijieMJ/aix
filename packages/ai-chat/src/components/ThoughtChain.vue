<template>
  <div :class="ns.b()">
    <button
      v-if="title"
      type="button"
      :class="ns.e('summary')"
      :aria-expanded="chainOpen"
      @click="toggleChain"
    >
      <span v-if="collapsible" :class="[ns.e('summary-arrow'), ns.is('open', chainOpen)]">▾</span>
      <span :class="[ns.e('summary-title'), ns.is('loading', loading)]">{{ title }}</span>
    </button>
    <ul v-if="chainOpen" :class="ns.e('list')">
      <li
        v-for="(item, i) in items"
        :key="item.key"
        :class="[ns.e('item'), ns.is(item.status ?? 'done')]"
      >
        <div :class="ns.e('rail')">
          <span :class="ns.e('icon')">{{ item.icon }}</span>
        </div>
        <div :class="ns.e('main')">
          <button
            type="button"
            :class="ns.e('head')"
            :aria-expanded="isOpen(item)"
            @click="toggle(item.key)"
          >
            <span :class="[ns.e('title'), ns.is('active', item.status === 'active')]">
              {{ item.title }}
            </span>
            <span :class="ns.e('spacer')" />
            <span v-if="item.duration" :class="ns.e('badge')">{{ item.duration }}</span>
            <span v-if="hasBody(item)" :class="[ns.e('arrow'), ns.is('open', isOpen(item))]">
              ▾
            </span>
          </button>
          <div v-if="hasBody(item) && isOpen(item)" :class="ns.e('body')">
            <!-- 检索结果卡（数据驱动）：标题 + chip 列表 -->
            <div v-if="item.result" :class="ns.e('result')">
              <div v-if="item.result.title" :class="ns.e('result-title')">
                {{ item.result.title }}
              </div>
              <div :class="ns.e('result-chips')">
                <component
                  :is="chipHref(chip) ? 'a' : 'div'"
                  v-for="(chip, ci) in item.result.chips"
                  :key="ci"
                  :class="ns.e('chip')"
                  :href="chipHref(chip)"
                  :target="chipHref(chip) ? '_blank' : undefined"
                  :rel="chipHref(chip) ? 'noopener noreferrer' : undefined"
                >
                  <img
                    v-if="chip.thumbnail"
                    :class="ns.e('chip-thumb')"
                    :src="chip.thumbnail"
                    alt=""
                  />
                  <span v-else-if="chip.icon" :class="ns.e('chip-icon')">{{ chip.icon }}</span>
                  <span :class="ns.e('chip-text')">{{ chip.text }}</span>
                </component>
              </div>
            </div>
            <slot name="item-content" :item="item" :index="i">
              <MarkdownRenderer v-if="item.content" :content="item.content" />
            </slot>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<script lang="ts">
import type { ThoughtChainItem, ThoughtChainResultChip } from '../types';

export interface ThoughtChainProps {
  /** 思维链步骤列表 */
  items: ThoughtChainItem[];
  /** 链级头部标题（如「已完成」「生成中…」）；提供后在步骤列表上方渲染一行汇总头部 */
  title?: string;
  /** 是否可点击头部折叠/展开整个步骤列表（需配合 title），默认 false */
  collapsible?: boolean;
  /** 初始是否折叠整链（需 collapsible），默认 false */
  defaultCollapsed?: boolean;
  /** 生成中：汇总标题显示主色流光（如「生成中…」），默认 false */
  loading?: boolean;
}
</script>

<script setup lang="ts">
import { reactive, ref, useSlots, watch } from 'vue';
import MarkdownRenderer from './MarkdownRenderer.vue';
import { useNamespace } from '../composables/useNamespace';
import { safeUrl } from '../utils/url';

const props = withDefaults(defineProps<ThoughtChainProps>(), {
  items: () => [],
  collapsible: false,
  defaultCollapsed: false,
  loading: false,
});
const ns = useNamespace('thought-chain');
const slots = useSlots();

// 链级折叠：仅 collapsible+defaultCollapsed 时初始折叠；无 title 时恒展开（无折叠入口）
const chainOpen = ref(!(props.collapsible && props.defaultCollapsed));
const toggleChain = () => {
  if (props.collapsible) chainOpen.value = !chainOpen.value;
};

// 展开态：按 item.key 记录；未记录时回退 defaultExpanded ?? true（执行过程默认展开）。
// Vue 3 reactive 对新增 key 也具响应性，故流式追加的步骤可正常切换。
const openMap = reactive<Record<string | number, boolean>>({});
const isOpen = (item: ThoughtChainItem): boolean =>
  openMap[item.key] ?? item.defaultExpanded ?? true;
const toggle = (key: string | number) => {
  const item = props.items.find((it) => it.key === key);
  // 仅对仍存在的步骤记录展开态，避免 items 替换后为已移除步骤写入残留状态
  if (!item) return;
  openMap[key] = !(openMap[key] ?? item.defaultExpanded ?? true);
};

// items 流式追加/替换后，裁剪 openMap 中已不存在步骤的展开态，避免长对话累积无用记录
watch(
  () => props.items,
  (items) => {
    const liveKeys = new Set(items.map((it) => it.key));
    for (const k of Object.keys(openMap)) {
      // openMap 的 key 经对象字面量存取会被转为 string，需同时比对原始 number key
      if (!liveKeys.has(k) && !liveKeys.has(Number(k))) delete openMap[k];
    }
  },
);

// chip 链接可能来自模型/检索结果（不可信），渲染前经 safeUrl 协议白名单过滤（与 SourcesBlock 同构）：
// 安全 url 渲染为可点击 <a>，不安全（如 javascript:）则返回 undefined → 降级为 <div> 纯展示。
const chipHref = (chip: ThoughtChainResultChip): string | undefined => safeUrl(chip.url);

// 有可折叠内容才显示箭头与正文区：item.content / item.result 或外部提供了 item-content slot
const hasBody = (item: ThoughtChainItem): boolean =>
  !!item.content || !!item.result || !!slots['item-content'];
</script>

<style lang="scss">
.aix-thought-chain {
  &__summary {
    display: flex;
    align-items: center;
    gap: var(--aix-marginXXS);
    width: 100%;
    padding: 0 0 var(--aix-marginSM);
    border: none;
    background: transparent;
    color: var(--aix-colorTextSecondary);
    font-size: var(--aix-fontSize);
    font-weight: 500;
    cursor: pointer;
  }

  &__summary-arrow {
    transform: rotate(-90deg);
    transition: transform var(--aix-motionDurationMid) var(--aix-motionEaseInOut);
    color: var(--aix-colorTextTertiary);
  }

  &__summary-arrow.is-open {
    transform: rotate(0deg);
  }

  // 生成中：汇总标题主色流光（浅蓝→主蓝→浅蓝 横向流动），复用步骤标题同款关键帧
  &__summary-title.is-loading {
    animation: aix-thought-chain-shimmer 1.6s linear infinite;
    background: linear-gradient(
      90deg,
      var(--aix-colorPrimaryBorder) 0%,
      var(--aix-colorPrimary) 50%,
      var(--aix-colorPrimaryBorder) 100%
    );
    background-clip: text;
    background-size: 200% 100%;
    color: transparent;
    -webkit-text-fill-color: transparent;
  }

  &__list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__item {
    display: flex;
    position: relative;
    gap: var(--aix-sizeXS);

    &:not(:last-child) {
      padding-bottom: var(--aix-paddingLG);
    }

    // 虚线连接线：从图标下方贯穿到下一步骤图标（最后一步不画）
    &:not(:last-child) .aix-thought-chain__rail::after {
      content: '';
      position: absolute;
      top: 22px;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      border-left: 1px dashed var(--aix-colorTextTertiary);
    }
  }

  &__rail {
    display: flex;
    position: relative;
    flex: none;
    justify-content: center;
    width: 20px;
  }

  &__icon {
    display: inline-flex;
    z-index: 1;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    font-size: 18px;
    line-height: 1;
  }

  &__main {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--aix-marginXXS);
    min-width: 0;
  }

  &__head {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    gap: var(--aix-sizeXS);
  }

  &__title {
    color: var(--aix-colorText);
    font-size: var(--aix-fontSize);
    font-weight: 600;
    text-align: left;
  }

  // 进行中：标题流光渐变（浅→深→浅 横向流动）
  &__title.is-active {
    animation: aix-thought-chain-shimmer 1.6s linear infinite;
    background: linear-gradient(
      90deg,
      var(--aix-colorTextQuaternary) 0%,
      var(--aix-colorText) 50%,
      var(--aix-colorTextQuaternary) 100%
    );
    background-clip: text;
    background-size: 200% 100%;
    color: transparent;
    -webkit-text-fill-color: transparent;
  }

  &__spacer {
    flex: 1;
  }

  &__badge {
    flex: none;
    padding: 0 var(--aix-paddingXS);
    border-radius: var(--aix-borderRadiusSM);
    background: var(--aix-colorFillTertiary);
    color: var(--aix-colorTextTertiary);
    font-size: var(--aix-fontSizeSM);
  }

  &__arrow {
    flex: none;
    transition: transform var(--aix-motionDurationMid) var(--aix-motionEaseInOut);
    color: var(--aix-colorTextTertiary);
  }

  &__arrow.is-open {
    transform: rotate(180deg);
  }

  &__body {
    color: var(--aix-colorTextSecondary);
    font-size: var(--aix-fontSizeSM);
    line-height: var(--aix-lineHeight);
  }

  /* 检索结果卡：标题 + chip 列表 */
  &__result {
    display: flex;
    flex-direction: column;
    gap: var(--aix-marginXS);
  }

  &__result-title {
    color: var(--aix-colorTextSecondary);
    font-size: var(--aix-fontSize);
    font-weight: 500;
  }

  &__result-chips {
    display: flex;
    flex-direction: column;
    gap: var(--aix-sizeXS);
  }

  &__chip {
    display: flex;
    align-items: center;
    gap: var(--aix-sizeXS);
    padding: var(--aix-paddingXS) var(--aix-paddingSM);
    border-radius: var(--aix-borderRadius);
    background: var(--aix-colorFillQuaternary);
    color: var(--aix-colorText);
    font-size: var(--aix-fontSizeSM);
    text-decoration: none;
  }

  &__chip-thumb {
    flex: none;
    width: 18px;
    height: 18px;
    border-radius: var(--aix-borderRadiusXS);
    object-fit: cover;
  }

  &__chip-icon {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    font-size: var(--aix-fontSize);
    line-height: 1;
  }

  &__chip-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@keyframes aix-thought-chain-shimmer {
  0% {
    background-position: 200% 0;
  }

  100% {
    background-position: -200% 0;
  }
}
</style>
