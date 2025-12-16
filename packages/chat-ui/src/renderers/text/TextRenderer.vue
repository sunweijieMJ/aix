<template>
  <div class="aix-text-renderer">{{ data }}</div>
</template>

<script setup lang="ts">
import type { RendererProps } from '../../core/types';

defineProps<RendererProps<string>>();
</script>

<style lang="scss" scoped>
.aix-text-renderer {
  color: var(--aix-text-primary, #1f2937);
  font-size: var(--aix-font-size, 14px);
  line-height: var(--aix-line-height, 1.6);
  overflow-wrap: break-word;
  white-space: pre-wrap;
}
</style>
