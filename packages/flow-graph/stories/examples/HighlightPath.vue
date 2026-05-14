<template>
  <div style="position: relative; width: 100%; height: 100%">
    <div class="path-switcher">
      <button
        v-for="path in paths"
        :key="path.id"
        :style="{
          borderColor: path.color,
          color: pendingPath === path.id ? '#fff' : path.color,
          background: pendingPath === path.id ? path.color : 'transparent',
        }"
        @click="selectPath(path.id)"
      >
        {{ path.label }}
      </button>
    </div>
    <FlowGraph
      ref="graphRef"
      :nodes="computedNodes"
      :edges="computedEdges"
      style="width: 100%; height: 100%"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { FlowGraph } from '../../src';
import type { FlowEdge, FlowNode } from '../../src/types';

const RED = '#e34935';
const BLUE = '#1546f2';
const GREEN = '#00b42a';

const paths = [
  {
    id: 'red',
    color: RED,
    label: '路径 红',
    nodeIds: ['s', 'a', 'c', 'e'],
    edgeIds: ['s-a', 'a-c', 'c-e'],
  },
  { id: 'blue', color: BLUE, label: '路径 蓝', nodeIds: ['s', 'b', 'f'], edgeIds: ['s-b', 'b-f'] },
  {
    id: 'green',
    color: GREEN,
    label: '路径 绿',
    nodeIds: ['s', 'b', 'd'],
    edgeIds: ['s-b', 'b-d'],
  },
];

const activePath = ref('red');
const graphRef = ref<InstanceType<typeof FlowGraph> | null>(null);

const FIT_DURATION = 400;
const pendingPath = ref('red');

async function selectPath(id: string) {
  // 先清除高亮，启动 fitView，动画结束后再显示高亮
  activePath.value = '';
  pendingPath.value = id;
  const active = paths.find((p) => p.id === id)!;
  await nextTick();
  graphRef.value?.fitView({ nodes: active.nodeIds, padding: 0.3, duration: FIT_DURATION });
  setTimeout(() => {
    activePath.value = pendingPath.value;
  }, FIT_DURATION);
}

const baseNodes: FlowNode[] = [
  // 共用起点，居中
  {
    id: 's',
    type: 'hexagon',
    position: { x: 500, y: 300 },
    data: {
      label: '共用起点 · 欢迎来到本学期 AI 翻转课堂的统一学习入口与流程导览',
      color: '#666',
    },
  },
  // 红色路径：左上角
  {
    id: 'a',
    type: 'default',
    position: { x: 80, y: 80 },
    data: {
      label: '红色路径节点 A · 基础概念入门：变量、表达式、控制流与基本数据结构梳理',
      color: RED,
    },
  },
  {
    id: 'c',
    type: 'default',
    position: { x: 80, y: 240 },
    data: {
      label: '红色路径节点 C · 进阶练习：函数封装、模块化思维与常见算法题型训练',
      color: RED,
    },
  },
  {
    id: 'e',
    type: 'default',
    position: { x: 80, y: 400 },
    data: {
      label: '红色路径节点 E · 综合应用：将所学知识串联完成一个端到端的小型项目演练',
      color: RED,
    },
  },
  // 蓝色路径：右上角
  {
    id: 'b',
    type: 'default',
    position: { x: 920, y: 80 },
    data: {
      label: '蓝色路径节点 B · 概念梳理：从问题域到解决方案的抽象建模与推导过程',
      color: BLUE,
    },
  },
  {
    id: 'f',
    type: 'default',
    position: { x: 920, y: 240 },
    data: {
      label: '蓝色路径节点 F · 案例分析：基于真实业务场景的需求拆解与方案对比讨论',
      color: BLUE,
    },
  },
  // 绿色路径：右下角
  {
    id: 'd',
    type: 'default',
    position: { x: 920, y: 520 },
    data: {
      label: '绿色路径节点 D · 项目实战与总结：组队完成项目，进行交付答辩与课程回顾反思',
      color: GREEN,
    },
  },
];

const baseEdges: FlowEdge[] = [
  { id: 's-a', source: 's', target: 'a', type: 'default', data: { color: RED } },
  { id: 's-b', source: 's', target: 'b', type: 'default', data: { color: BLUE } },
  { id: 'a-c', source: 'a', target: 'c', type: 'default', data: { color: RED } },
  { id: 'c-e', source: 'c', target: 'e', type: 'default', data: { color: RED } },
  { id: 'b-f', source: 'b', target: 'f', type: 'default', data: { color: BLUE } },
  { id: 'b-d', source: 'b', target: 'd', type: 'default', data: { color: GREEN } },
];

const computedNodes = computed(() => {
  const active = paths.find((p) => p.id === activePath.value);
  return baseNodes.map((n) => {
    const inPath = active?.nodeIds.includes(n.id) ?? false;
    return {
      ...n,
      // selecting 高亮态下同时写入 activeColor，让 BaseNode 的 label outline 取该路径色；
      // 与业务侧 onHighlightPath 的写入策略一致。
      // 非高亮路径的节点 dimmed=true，触发透明 + backdrop-filter 模糊。
      data: {
        ...n.data,
        selecting: inPath,
        activeColor: inPath ? active?.color : undefined,
        dimmed: active ? !inPath : false,
      },
    };
  });
});

const computedEdges = computed(() => {
  const active = paths.find((p) => p.id === activePath.value);
  return baseEdges.map((e) => {
    const inPath = active?.edgeIds.includes(e.id) ?? false;
    return {
      ...e,
      data: { ...e.data, selecting: inPath, dimmed: active ? !inPath : false },
    };
  });
});
</script>

<style scoped>
.path-switcher {
  display: flex;
  position: absolute;
  z-index: 10;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  gap: 8px;
}

.path-switcher button {
  padding: 4px 14px;
  transition:
    background 0.2s,
    color 0.2s;
  border: 2px solid;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}
</style>
