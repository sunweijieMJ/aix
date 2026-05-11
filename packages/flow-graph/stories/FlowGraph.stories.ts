import type { Meta, StoryObj } from '@storybook/vue3';
import type { Component } from 'vue';
import { FlowGraph } from '../src';
import BasicEdit from './examples/BasicEdit.vue';
import BottomBarPosition from './examples/BottomBarPosition.vue';
import ChangeEvents from './examples/ChangeEvents.vue';
import CustomBottomBar from './examples/CustomBottomBar.vue';
import CustomNode from './examples/CustomNode.vue';
import CustomNodeType from './examples/CustomNodeType.vue';
import DeletableEdges from './examples/DeletableEdges.vue';
import ExposedMethods from './examples/ExposedMethods.vue';
import HighlightPath from './examples/HighlightPath.vue';
import NodeEvents from './examples/NodeEvents.vue';
import SharedPath from './examples/SharedPath.vue';

const meta: Meta<typeof FlowGraph> = {
  title: 'Components/FlowGraph',
  component: FlowGraph,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: { snapGrid: true },
};

export default meta;
type Story = StoryObj<typeof meta>;

const wrap = (component: Component) => ({
  components: { Demo: component },
  template: '<div style="width:100%;height:600px"><Demo /></div>',
});

export const 底部工具栏位置: Story = { render: () => wrap(BottomBarPosition) };

export const 节点事件: Story = { render: () => wrap(NodeEvents) };

export const 基础编辑: Story = { render: () => wrap(BasicEdit) };

export const 节点示例: Story = { render: () => wrap(CustomNode) };

export const 多路径共用: Story = { render: () => wrap(SharedPath) };

export const 高亮路径切换: Story = { render: () => wrap(HighlightPath) };

export const 自定义底部工具栏: Story = { render: () => wrap(CustomBottomBar) };

export const 实例方法调用: Story = { render: () => wrap(ExposedMethods) };

export const 节点变更事件: Story = { render: () => wrap(ChangeEvents) };

export const 边删除控制: Story = { render: () => wrap(DeletableEdges) };

export const 自定义节点类型: Story = { render: () => wrap(CustomNodeType) };

export const 可控参数: Story = {
  render: () => ({
    components: { FlowGraph },
    setup() {
      const nodes = [
        { id: '1', position: { x: 100, y: 100 }, data: { label: '节点 1' } },
        { id: '2', position: { x: 300, y: 100 }, data: { label: '节点 2' } },
        { id: '3', position: { x: 200, y: 250 }, data: { label: '节点 3' } },
      ];
      const edges = [
        { id: 'e1-2', source: '1', target: '2' },
        { id: 'e1-3', source: '1', target: '3' },
      ];
      return { nodes, edges };
    },
    template: `<FlowGraph :nodes="nodes" :edges="edges" style="width:100%;height:500px" />`,
  }),
};
