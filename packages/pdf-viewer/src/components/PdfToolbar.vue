<template>
  <div class="aix-pdf-toolbar">
    <div class="aix-pdf-toolbar__left">
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
      <slot name="center">
        <button
          class="aix-pdf-toolbar__btn"
          :disabled="scale <= minScale"
          :title="t.zoomOut"
          @click="emit('zoom-out')"
        >
          <Minus width="16" height="16" />
        </button>
        <span class="aix-pdf-toolbar__scale">
          {{ Math.round(scale * 100) }}%
        </span>
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
      <slot name="right">
        <button
          class="aix-pdf-toolbar__btn"
          :title="t.fitPage"
          @click="emit('fit-page')"
        >
          <Fullscreen width="16" height="16" />
        </button>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLocale } from '@aix/hooks';
import { Add, ArrowLeft, ArrowRight, Fullscreen, Minus } from '@aix/icons';
import { locale } from '../locale';

const { t } = useLocale(locale);

const props = defineProps<{
  currentPage: number;
  totalPages: number;
  scale: number;
  minScale: number;
  maxScale: number;
}>();

const emit = defineEmits<{
  (e: 'prev'): void;
  (e: 'next'): void;
  (e: 'goto', page: number): void;
  (e: 'zoom-in'): void;
  (e: 'zoom-out'): void;
  (e: 'fit-page'): void;
}>();

function handlePageInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  const page = parseInt(input.value, 10);

  if (
    !isNaN(page) &&
    page >= 1 &&
    page <= props.totalPages &&
    page !== props.currentPage
  ) {
    emit('goto', page);
  } else {
    // 重置为当前页
    input.value = String(props.currentPage);
  }
}
</script>
