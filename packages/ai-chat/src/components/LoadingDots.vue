<template>
  <span :class="ns.b()" aria-hidden="true">
    <!-- toFixed(2) 避免浮点误差（3 * 0.15 === 0.44999999999999996），勿改回裸乘法字面量 -->
    <i
      v-for="i in 3"
      :key="i"
      :class="ns.e('dot')"
      :style="{ animationDelay: `${(i * 0.15).toFixed(2)}s` }"
    />
  </span>
</template>

<script setup lang="ts">
import { useNamespace } from '@aix/hooks';

const ns = useNamespace('loading-dots');
</script>

<style lang="scss">
.aix-loading-dots {
  display: inline-flex;
  gap: 5px;
  padding: var(--aix-paddingXXS) 0;

  &__dot {
    width: 6px;
    height: 6px;
    animation: aix-loading-dots-wave 1.2s infinite ease-in-out;
    border-radius: 50%;
    background-color: var(--aix-colorTextTertiary);
  }
}

@keyframes aix-loading-dots-wave {
  0%,
  100% {
    transform: translateY(-2px);
    opacity: 0.6;
  }

  50% {
    transform: translateY(2px);
    opacity: 1;
  }
}
</style>
