<template>
  <div class="aix-flow-controls">
    <button class="aix-flow-controls__btn" title="缩小" @click="zoomOut()">
      <img src="../assets/icon-ctrl-minus.svg" width="18" height="18" alt="" />
    </button>
    <span class="aix-flow-controls__zoom">{{ zoomPercent }}%</span>
    <button class="aix-flow-controls__btn" title="放大" @click="zoomIn()">
      <img src="../assets/icon-ctrl-add.svg" width="18" height="18" alt="" />
    </button>
    <div class="aix-flow-controls__divider" />
    <button class="aix-flow-controls__btn" title="适应视图" @click="fitView()">
      <img src="../assets/icon-ctrl-fit.svg" width="18" height="18" alt="" />
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * 画布控制条：左下角 Panel，提供缩小 / 缩放百分比显示 / 放大 / 适应视图四个操作。
 * 直接消费 VueFlow 的 `useVueFlow` 暴露的控制方法。
 */
import { useVueFlow } from '@vue-flow/core';
import { computed } from 'vue';

defineOptions({ name: 'AixFlowControls' });

const { zoomIn, zoomOut, fitView, viewport } = useVueFlow();

/** 当前缩放百分比（四舍五入） */
const zoomPercent = computed(() => Math.round(viewport.value.zoom * 100));
</script>

<style>
.aix-flow-controls {
  display: flex;
  align-items: center;
  height: 42px;
  padding: 0 4px;
  border-radius: var(--aix-borderRadiusLG, 12px);
  background: var(--aix-colorBgElevated, #fff);
  box-shadow: var(--aix-shadowMD, 0 6px 36px 0 rgb(0 0 0 / 0.12));
}

.aix-flow-controls__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: var(--aix-borderRadiusSM, 6px);
  background: transparent;
  color: var(--aix-colorText, #1d2129);
  cursor: pointer;
}

.aix-flow-controls__btn:hover {
  background: var(--aix-controlItemBgHover, #f5f5f5);
}

.aix-flow-controls__divider {
  width: 0.5px;
  height: 18px;
  margin: 0 2px;
  background: var(--aix-colorBorder, #e5e6eb);
}

.aix-flow-controls__zoom {
  min-width: 38px;
  padding: 0 4px;
  color: var(--aix-colorText, #1d2129);
  font-family: var(--aix-fontFamily, 'PingFang SC', sans-serif);
  font-size: var(--aix-fontSize, 14px);
  text-align: right;
}
</style>
