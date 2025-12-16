/**
 * @fileoverview MindmapRenderer Stories
 * 展示 G6 思维导图渲染器的各种布局
 */

import type { Meta, StoryObj } from '@storybook/vue3';
import { ref, computed } from 'vue';
import { MindmapRenderer, setup } from '../src';

setup({ preset: 'full' });

const meta: Meta<typeof MindmapRenderer> = {
  title: 'ChatUI/MindmapRenderer',
  component: MindmapRenderer,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: `
基于 @antv/g6 的思维导图渲染器，支持 9 种布局类型。

## 布局类型

| 分类 | 类型 | 说明 |
|------|------|------|
| 图布局 | concentric | 同心圆布局 |
| 图布局 | radial | 辐射布局 |
| 图布局 | force | 力导向布局 |
| 图布局 | circular | 圆形布局 |
| 图布局 | grid | 网格布局 |
| 树形 | mindmap | 脑图布局（默认） |
| 树形 | compactBox | 紧凑盒树布局 |
| 树形 | dendrogram | 生态树布局 |
| 树形 | indented | 缩进树布局 |
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const createBlock = (id: string) => ({
  id,
  type: 'mindmap' as const,
  raw: '',
  status: 'complete' as const,
});

// 通用示例数据
const sampleData = {
  root: {
    id: 'root',
    label: '中心主题',
    children: [
      {
        id: 'branch1',
        label: '分支 A',
        children: [
          { id: 'a1', label: 'A-1' },
          { id: 'a2', label: 'A-2' },
          { id: 'a3', label: 'A-3' },
        ],
      },
      {
        id: 'branch2',
        label: '分支 B',
        children: [
          { id: 'b1', label: 'B-1' },
          { id: 'b2', label: 'B-2' },
        ],
      },
      {
        id: 'branch3',
        label: '分支 C',
        children: [
          { id: 'c1', label: 'C-1' },
          { id: 'c2', label: 'C-2' },
        ],
      },
      {
        id: 'branch4',
        label: '分支 D',
        children: [{ id: 'd1', label: 'D-1' }],
      },
    ],
  },
};

/**
 * 布局切换器
 * 交互式切换所有布局类型
 */
export const LayoutSwitcher: Story = {
  render: () => ({
    components: { MindmapRenderer },
    setup() {
      const currentLayout = ref('mindmap');
      const data = ref(sampleData);

      const layouts = [
        { value: 'mindmap', label: '🧠 脑图', direction: 'H' },
        { value: 'radial', label: '☀️ 辐射' },
        { value: 'concentric', label: '🎯 同心圆' },
        { value: 'force', label: '⚡ 力导向' },
        { value: 'circular', label: '⭕ 圆形' },
        { value: 'grid', label: '📊 网格' },
        { value: 'compactBox', label: '📦 紧凑盒树', direction: 'LR' },
        { value: 'dendrogram', label: '🌳 生态树', direction: 'TB' },
        { value: 'indented', label: '📋 缩进树', direction: 'LR' },
      ];

      const currentDirection = computed(() => {
        const layout = layouts.find((l) => l.value === currentLayout.value);
        return layout?.direction || 'LR';
      });

      return { currentLayout, data, layouts, currentDirection, createBlock };
    },
    template: `
      <div>
        <div style="margin-bottom: 16px; display: flex; flex-wrap: wrap; gap: 8px;">
          <button
            v-for="layout in layouts"
            :key="layout.value"
            @click="currentLayout = layout.value"
            :style="{
              padding: '8px 16px',
              border: currentLayout === layout.value ? '2px solid #3b82f6' : '1px solid #e5e7eb',
              borderRadius: '6px',
              background: currentLayout === layout.value ? '#eff6ff' : '#fff',
              color: currentLayout === layout.value ? '#3b82f6' : '#333',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: currentLayout === layout.value ? '600' : '400',
            }"
          >
            {{ layout.label }}
          </button>
        </div>
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <MindmapRenderer
            :key="currentLayout"
            :block="createBlock('switcher-' + currentLayout)"
            :data="{ ...data, layout: currentLayout, direction: currentDirection }"
            :height="450"
          />
        </div>
        <div style="margin-top: 12px; padding: 12px; background: #f9fafb; border-radius: 6px; font-size: 12px; color: #6b7280;">
          当前: <strong>{{ currentLayout }}</strong> | 图布局支持拖拽节点，树形布局支持展开/折叠
        </div>
      </div>
    `,
  }),
};

/**
 * 脑图布局 (Mindmap)
 * 经典思维导图，支持左右分布
 */
export const MindmapLayout: Story = {
  args: {
    block: createBlock('mindmap'),
    data: {
      ...sampleData,
      layout: 'mindmap',
      direction: 'H',
      theme: 'default',
    },
    height: 400,
  },
};

/**
 * 辐射布局 (Radial)
 * 从中心向外辐射
 */
export const RadialLayout: Story = {
  args: {
    block: createBlock('radial'),
    data: { ...sampleData, layout: 'radial', theme: 'ocean' },
    height: 450,
  },
};

/**
 * 同心圆布局 (Concentric)
 * 节点按层级分布在同心圆上
 */
export const ConcentricLayout: Story = {
  args: {
    block: createBlock('concentric'),
    data: { ...sampleData, layout: 'concentric', theme: 'colorful' },
    height: 450,
  },
};

/**
 * 力导向布局 (Force)
 * 基于物理模拟，节点自动找到平衡位置
 */
export const ForceLayout: Story = {
  args: {
    block: createBlock('force'),
    data: { ...sampleData, layout: 'force', theme: 'default' },
    height: 450,
  },
};

/**
 * 圆形布局 (Circular)
 * 节点均匀分布在圆上
 */
export const CircularLayout: Story = {
  args: {
    block: createBlock('circular'),
    data: { ...sampleData, layout: 'circular', theme: 'forest' },
    height: 450,
  },
};

/**
 * 网格布局 (Grid)
 * 节点按网格排列
 */
export const GridLayout: Story = {
  args: {
    block: createBlock('grid'),
    data: { ...sampleData, layout: 'grid', theme: 'colorful' },
    height: 400,
  },
};

/**
 * 紧凑盒树布局 (CompactBox)
 * 节点紧凑排列，层级清晰
 */
export const CompactBoxLayout: Story = {
  args: {
    block: createBlock('compactBox'),
    data: {
      ...sampleData,
      layout: 'compactBox',
      direction: 'LR',
      theme: 'default',
    },
    height: 450,
  },
};

/**
 * 生态树布局 (Dendrogram)
 * 叶子节点对齐，适合分类展示
 */
export const DendrogramLayout: Story = {
  args: {
    block: createBlock('dendrogram'),
    data: {
      ...sampleData,
      layout: 'dendrogram',
      direction: 'TB',
      theme: 'forest',
    },
    height: 500,
  },
};

/**
 * 缩进树布局 (Indented)
 * 类似文件目录结构
 */
export const IndentedLayout: Story = {
  args: {
    block: createBlock('indented'),
    data: {
      root: {
        id: 'root',
        label: '📁 项目',
        children: [
          {
            id: 'src',
            label: '📁 src',
            children: [
              { id: 'components', label: '📁 components' },
              { id: 'utils', label: '📁 utils' },
              { id: 'main', label: '📄 main.ts' },
            ],
          },
          {
            id: 'public',
            label: '📁 public',
            children: [{ id: 'index', label: '📄 index.html' }],
          },
          { id: 'package', label: '📄 package.json' },
        ],
      },
      layout: 'indented',
      direction: 'LR',
      theme: 'colorful',
    },
    height: 400,
  },
};
