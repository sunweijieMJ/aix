<template>
  <div style="display: flex; position: relative; width: 100%; height: 100%">
    <FlowGraph
      v-model:nodes="nodes"
      :edges="[]"
      :bottom-bar-position="bottomBarPosition"
      style="flex: 1"
    />
    <div v-if="drawerOpen" class="mock-drawer">右侧抽屉 (600px)</div>
    <button class="toggle-btn" @click="drawerOpen = !drawerOpen">
      {{ drawerOpen ? '关闭抽屉' : '打开抽屉' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { FlowGraph } from '../../src';

const drawerOpen = ref(false);
const nodes = ref([{ id: '1', position: { x: 200, y: 200 }, data: { label: '节点 1' } }]);
const bottomBarPosition = computed(() =>
  drawerOpen.value
    ? { position: 'bottom-center' as const, offset: { x: -300 } }
    : ('bottom-center' as const),
);
</script>

<style>
.mock-drawer {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 600px;
  height: 100%;
  border-left: 1px solid #e4e7ed;
  background: #f5f7fa;
  color: #86909c;
  font-size: 14px;
}

.toggle-btn {
  position: absolute;
  top: 16px;
  right: 620px;
  padding: 6px 16px;
  border: none;
  border-radius: 8px;
  background: #1546f2;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}
</style>
