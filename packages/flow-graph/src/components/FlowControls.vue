<template>
  <Panel position="bottom-left">
    <div class="aix-flow-controls">
      <button class="aix-flow-controls__btn" :title="t('zoomOut')" @click="zoomOut()">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M3.75 9h10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </button>
      <span class="aix-flow-controls__zoom">{{ zoomPercent }}%</span>
      <button class="aix-flow-controls__btn" :title="t('zoomIn')" @click="zoomIn()">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path
            d="M9 3.75v10.5M3.75 9h10.5"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      </button>
      <div class="aix-flow-controls__divider" />
      <button class="aix-flow-controls__btn" :title="t('fitView')" @click="fitView()">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path
            d="M2 5V2h3M13 2h3v3M16 13v3h-3M5 16H2v-3"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>
  </Panel>
</template>

<script setup lang="ts">
import { Panel, useVueFlow } from '@vue-flow/core';
import { computed } from 'vue';

const { zoomIn, zoomOut, fitView, viewport } = useVueFlow();

const zoomPercent = computed(() => Math.round(viewport.value.zoom * 100));

function t(key: string) {
  const map: Record<string, string> = { fitView: '适应视图', zoomIn: '放大', zoomOut: '缩小' };
  return map[key] ?? key;
}
</script>

<style>
.aix-flow-controls {
  display: flex;
  align-items: center;
  height: 42px;
  padding: 0 4px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 6px 36px 0 rgb(0 0 0 / 0.12);
}

.aix-flow-controls__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #1d2129;
  cursor: pointer;
}

.aix-flow-controls__btn:hover {
  background: #f5f5f5;
}

.aix-flow-controls__divider {
  width: 0.5px;
  height: 18px;
  margin: 0 2px;
  background: #e5e6eb;
}

.aix-flow-controls__zoom {
  min-width: 38px;
  padding: 0 4px;
  color: #1d2129;
  font-family: 'PingFang SC', sans-serif;
  font-size: 14px;
  text-align: right;
}
</style>
