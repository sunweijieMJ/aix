<template>
  <div class="aix-pdf-toolbar">
    <div class="aix-pdf-toolbar__left">
      <!-- @slot 左侧区域，默认渲染翻页控件与页码输入 -->
      <slot name="left">
        <button
          class="aix-pdf-toolbar__btn"
          :disabled="currentPage <= 1"
          :title="t.prev"
          @click="emit('prev')"
        >
          <ArrowLeft width="16" height="16" />
        </button>
        <div class="aix-pdf-toolbar__page-input">
          <input
            type="number"
            :value="currentPage"
            :min="1"
            :max="totalPages"
            class="aix-pdf-toolbar__input"
            @keydown.enter="handlePageInput"
            @blur="handlePageInput"
          />
          <span class="aix-pdf-toolbar__page-sep">/</span>
          <span class="aix-pdf-toolbar__page-total">{{ totalPages }}</span>
        </div>
        <button
          class="aix-pdf-toolbar__btn"
          :disabled="currentPage >= totalPages"
          :title="t.next"
          @click="emit('next')"
        >
          <ArrowRight width="16" height="16" />
        </button>
      </slot>
    </div>

    <div class="aix-pdf-toolbar__center">
      <!-- @slot 中间区域，默认渲染缩放控件 -->
      <slot name="center">
        <button
          class="aix-pdf-toolbar__btn"
          :disabled="scale <= minScale"
          :title="t.zoomOut"
          @click="emit('zoom-out')"
        >
          <Minus width="16" height="16" />
        </button>
        <span class="aix-pdf-toolbar__scale">{{ Math.round(scale * 100) }}%</span>
        <button
          class="aix-pdf-toolbar__btn"
          :disabled="scale >= maxScale"
          :title="t.zoomIn"
          @click="emit('zoom-in')"
        >
          <Add width="16" height="16" />
        </button>
      </slot>
    </div>

    <div class="aix-pdf-toolbar__right">
      <!-- @slot 右侧区域，默认渲染适应页面按钮 -->
      <slot name="right">
        <button class="aix-pdf-toolbar__btn" :title="t.fitPage" @click="emit('fit-page')">
          <Fullscreen width="16" height="16" />
        </button>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
/** PDF 工具栏：翻页、跳页、缩放与适应页面，三个区域都可用插槽替换。 */
import { useLocale } from '@aix/hooks';
import { Add, ArrowLeft, ArrowRight, Fullscreen, Minus } from '@aix/icons';
import { locale } from '../locale';

const { t } = useLocale({ name: 'pdf-viewer', messages: locale });

const props = defineProps<{
  /** 当前页码（从 1 开始） */
  currentPage: number;
  /** 总页数 */
  totalPages: number;
  /** 当前缩放比例，1 为 100% */
  scale: number;
  /** 最小缩放比例 */
  minScale: number;
  /** 最大缩放比例 */
  maxScale: number;
}>();

const emit = defineEmits<{
  /** 上一页 */
  (e: 'prev'): void;
  /** 下一页 */
  (e: 'next'): void;
  /** 跳转到指定页 */
  (e: 'goto', page: number): void;
  /** 放大 */
  (e: 'zoom-in'): void;
  /** 缩小 */
  (e: 'zoom-out'): void;
  /** 适应页面 */
  (e: 'fit-page'): void;
}>();

function handlePageInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  const page = parseInt(input.value, 10);

  if (!isNaN(page) && page >= 1 && page <= props.totalPages && page !== props.currentPage) {
    emit('goto', page);
  } else {
    // 重置为当前页
    input.value = String(props.currentPage);
  }
}
</script>
