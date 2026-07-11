<template>
  <Teleport to="body">
    <!-- mousedown.prevent：防按钮抢焦点清掉选区高亮（选区保全，见设计 §7） -->
    <div
      ref="floatingElRef"
      :class="ns.b()"
      :style="floatingStyles"
      role="toolbar"
      :aria-label="t.quoteToolbarLabel"
      @mousedown.prevent
      @keydown="onKeydown"
    >
      <button
        v-for="(item, i) in items"
        :key="item.key"
        type="button"
        :class="ns.e('btn')"
        :tabindex="i === focusIndex ? 0 : -1"
        :disabled="item.disabled"
        :aria-label="item.label"
        :title="item.label"
        @click="emit('invoke', item.key)"
      >
        <component :is="item.icon" v-if="item.icon" :class="ns.e('icon')" />
        <span :class="ns.e('label')">{{ item.label }}</span>
      </button>
    </div>
  </Teleport>
</template>

<script lang="ts">
export interface QuoteToolbarProps {
  /** L2 解析后的动作项 */
  items: ResolvedQuoteAction[];
  /** 定位锚：选区包围盒（视口坐标） */
  getAnchorRect: () => DOMRect;
  /** 虚拟锚点宿主元素（VirtualElement.contextElement）：供 autoUpdate 挂滚动祖先监听 */
  contextEl?: HTMLElement | null;
}
export interface QuoteToolbarEmits {
  (e: 'invoke', key: string): void;
  (e: 'close'): void;
}
</script>

<script setup lang="ts">
import { useLocale, useNamespace } from '@aix/hooks';
import { usePopper } from '@aix/popper';
import { ref, watch, watchEffect } from 'vue';
import { locale } from '../../locale';
import type { ResolvedQuoteAction } from '../../types';

const props = defineProps<QuoteToolbarProps>();
const emit = defineEmits<QuoteToolbarEmits>();
const ns = useNamespace('quote-toolbar');
const { t } = useLocale(locale);

// 虚拟参考元素（同 @aix/popper createVirtualElement 的先例做法）：
// 选区没有真实元素，用 getBoundingClientRect 闭包桥接
const { referenceRef, floatingRef, floatingStyles } = usePopper({
  placement: 'top',
  strategy: 'fixed',
  offset: 8,
});
watchEffect(() => {
  referenceRef.value = {
    getBoundingClientRect: props.getAnchorRect,
    // contextElement 让 autoUpdate 挂上锚点侧滚动祖先监听（选区所在消息列表滚动时跟随）
    contextElement: props.contextEl ?? undefined,
  } as unknown as HTMLElement;
});

// 桥接本地模板 ref 到 usePopper 的 floatingRef（同 TableFloatingToolbar.vue 先例）：
// 直接把 usePopper 解构出的 Ref 绑到 `ref="floatingRef"` 时，vue-tsc 在双 <script> 块
// （<script lang="ts"> 导出接口 + <script setup>）场景下无法识别模板引用为"已使用"，
// 触发 noUnusedLocals 误报，故用本地 ref + watch 桥接规避。
const floatingElRef = ref<HTMLElement | null>(null);
watch(floatingElRef, (el) => {
  floatingRef.value = el;
});

// roving tabindex：←/→ 移动焦点，Esc 关闭（焦点归还由选区保全兜底）
const focusIndex = ref(0);
// items 变化时重置 roving 起点到首个可用项：越界（items 动态缩短）会使所有按钮
// tabindex=-1、Tab 无法进入工具条；首项 disabled 时 tabindex=0 落在不可聚焦元素上
watch(
  () => props.items,
  (items) => {
    const first = items.findIndex((it) => !it.disabled);
    focusIndex.value = first === -1 ? 0 : first;
  },
  { immediate: true },
);
const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    emit('close');
    return;
  }
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  e.preventDefault();
  const len = props.items.length;
  const delta = e.key === 'ArrowRight' ? 1 : len - 1;
  // 逐步前进并跳过 disabled 项（最多绕一圈，全 disabled 时留在原地）
  let next = focusIndex.value;
  for (let step = 0; step < len; step += 1) {
    next = (next + delta) % len;
    if (!props.items[next]?.disabled) break;
  }
  focusIndex.value = next;
  const btns = (e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button');
  btns[focusIndex.value]?.focus();
};
</script>

<style lang="scss">
.aix-quote-toolbar {
  display: inline-flex;
  z-index: 1000;
  align-items: center;
  padding: var(--aix-paddingXXS);
  border: 1px solid var(--aix-colorBorderSecondary);
  border-radius: var(--aix-borderRadius);
  background-color: var(--aix-colorBgElevated);
  box-shadow: var(--aix-shadowMD);
  gap: var(--aix-marginXXS);

  &__btn {
    display: inline-flex;
    align-items: center;
    height: var(--aix-controlHeightSM);
    padding: 0 var(--aix-paddingXS);
    transition: all var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border: none;
    border-radius: var(--aix-borderRadiusSM);
    background: transparent;
    color: var(--aix-colorText);
    font-size: var(--aix-fontSizeSM);
    cursor: pointer;
    gap: var(--aix-marginXXS);

    svg {
      width: 14px;
      height: 14px;
    }

    &:hover:not(:disabled) {
      background-color: var(--aix-colorFillTertiary);
    }

    &:disabled {
      color: var(--aix-colorTextQuaternary);
      cursor: not-allowed;
    }
  }
}
</style>
