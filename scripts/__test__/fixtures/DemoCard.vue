<script setup lang="ts">
/**
 * 演示卡片：说明里带行中的 @aix/popper 写法，正文不该在这里截断。
 * @default 标签不该混进正文
 */
import { computed } from 'vue';

interface DemoProps {
  /** 标题 */
  title?: string;
  /** 可选倍速档位 */
  rates?: number[];
}

const props = withDefaults(defineProps<DemoProps>(), {
  title: 'hi',
  rates: () => [0.5, 1, 2],
});

/** 已选项（v-model:picked） */
const picked = defineModel<string[]>('picked', { default: () => [] });

const upper = computed(() => props.title.toUpperCase());
</script>

<template>
  <div>{{ upper }}{{ picked }}</div>
</template>
