import type { Meta, StoryObj } from '@storybook/vue3';
import { FlowGraph } from '../src';
import BasicEdit from './examples/BasicEdit.vue';
import CustomNode from './examples/CustomNode.vue';

const meta: Meta<typeof FlowGraph> = {
  title: 'Components/FlowGraph',
  component: FlowGraph,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const 基础编辑: Story = {
  render: () => ({
    components: { BasicEdit },
    template: '<div style="width:100%;height:600px"><BasicEdit /></div>',
  }),
};

export const 节点示例: Story = {
  render: () => ({
    components: { CustomNode },
    template: '<div style="width:100%;height:600px"><CustomNode /></div>',
  }),
};

export const 可控参数: Story = {
  render: () => ({
    components: { FlowGraph },
    setup() {
      const nodes = [
        { id: '1', position: { x: 100, y: 100 }, label: '节点 1' },
        { id: '2', position: { x: 300, y: 100 }, label: '节点 2' },
        { id: '3', position: { x: 200, y: 250 }, label: '节点 3' },
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
