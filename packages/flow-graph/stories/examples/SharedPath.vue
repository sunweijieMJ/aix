<template>
  <FlowGraph :nodes="nodes" :edges="edges" style="width: 100%; height: 100%" />
</template>

<script setup lang="ts">
import { FlowGraph } from '../../src';
import type { FlowEdge, FlowNode } from '../../src/types';

/**
 * 演示多路径共用节点与边：
 * - 节点 B 被路径1(红)和路径2(蓝)共用 → pathColors = ['#e34935', '#1546f2']
 * - 节点 C 被三条路径共用 → pathColors = ['#e34935', '#1546f2', '#00b42a']
 * - B→C 边被路径1和路径2共用 → sharedColors = ['#1546f2']
 */

const RED = '#e34935';
const BLUE = '#1546f2';
const GREEN = '#00b42a';

const nodes: FlowNode[] = [
  { id: 'a1', type: 'default', position: { x: 80, y: 80 }, data: { label: 'A1', color: RED } },
  { id: 'a2', type: 'default', position: { x: 80, y: 220 }, data: { label: 'A2', color: BLUE } },
  { id: 'a3', type: 'default', position: { x: 80, y: 360 }, data: { label: 'A3', color: GREEN } },
  {
    id: 'b',
    type: 'default',
    position: { x: 280, y: 150 },
    data: { label: 'B（共用）', color: RED, pathColors: [RED, BLUE] },
  },
  {
    id: 'c',
    type: 'hexagon',
    position: { x: 480, y: 220 },
    data: { label: 'C（共用）', color: RED, pathColors: [RED, BLUE, GREEN] },
  },
  { id: 'd1', type: 'default', position: { x: 680, y: 80 }, data: { label: 'D1', color: RED } },
  { id: 'd2', type: 'default', position: { x: 680, y: 360 }, data: { label: 'D2', color: GREEN } },
];

const edges: FlowEdge[] = [
  { id: 'e-a1-b', source: 'a1', target: 'b', type: 'default', data: { color: RED } },
  { id: 'e-a2-b', source: 'a2', target: 'b', type: 'default', data: { color: BLUE } },
  // B→C 被红、蓝两条路径共用
  {
    id: 'e-b-c',
    source: 'b',
    target: 'c',
    type: 'default',
    data: { color: RED, sharedColors: [BLUE] },
  },
  { id: 'e-a3-c', source: 'a3', target: 'c', type: 'default', data: { color: GREEN } },
  { id: 'e-c-d1', source: 'c', target: 'd1', type: 'default', data: { color: RED } },
  { id: 'e-c-d2', source: 'c', target: 'd2', type: 'default', data: { color: GREEN } },
];
</script>
