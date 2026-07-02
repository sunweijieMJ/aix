import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick } from 'vue';
import { FlowGraph } from '../src';

const { addNodesMock } = vi.hoisted(() => ({ addNodesMock: vi.fn() }));

vi.mock('@vue-flow/core', () => ({
  VueFlow: defineComponent({
    name: 'VueFlow',
    props: ['nodes', 'edges'],
    emits: ['connect', 'paneDblClick', 'update:nodes', 'update:edges'],
    template: '<div class="vue-flow"><slot /></div>',
  }),
  Panel: defineComponent({
    name: 'FlowPanel',
    template: '<div class="vue-flow__panel"><slot /></div>',
  }),
  useVueFlow: () => ({
    updateEdge: vi.fn(),
    updateNodeData: vi.fn(),
    removeNodes: vi.fn(),
    addNodes: addNodesMock,
    getNodes: { value: [] },
    fitView: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    viewport: { value: { zoom: 1, x: 0, y: 0 } },
    screenToFlowCoordinate: vi.fn(() => ({ x: 0, y: 0 })),
  }),
  Handle: defineComponent({ template: '<div />' }),
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  BaseEdge: defineComponent({ template: '<path />' }),
  getSmoothStepPath: vi.fn(() => ['M 0 0', 0, 0]),
}));

vi.mock('@vue-flow/background', () => ({
  Background: defineComponent({
    name: 'FlowBackground',
    template: '<div class="vue-flow__background" />',
  }),
}));

vi.mock('@vue-flow/controls', () => ({
  Controls: defineComponent({
    name: 'FlowControls',
    template: '<div class="vue-flow__controls" />',
  }),
}));

describe('FlowGraph 组件', () => {
  it('应该渲染 VueFlow 画布', () => {
    const wrapper = mount(FlowGraph);
    expect(wrapper.find('.vue-flow').exists()).toBe(true);
  });

  it('默认显示背景', () => {
    const wrapper = mount(FlowGraph);
    expect(wrapper.find('.vue-flow__background').exists()).toBe(true);
  });

  it('默认显示控制条', () => {
    const wrapper = mount(FlowGraph);
    expect(wrapper.find('.aix-flow-controls').exists()).toBe(true);
  });

  it('支持 v-model:nodes', () => {
    const nodes = [{ id: '1', position: { x: 0, y: 0 } }];
    const wrapper = mount(FlowGraph, { props: { nodes } });
    expect((wrapper.props() as Record<string, unknown>).nodes).toEqual(nodes);
  });

  it('支持 v-model:edges', () => {
    const edges = [{ id: 'e1', source: '1', target: '2' }];
    const wrapper = mount(FlowGraph, { props: { edges } });
    expect((wrapper.props() as Record<string, unknown>).edges).toEqual(edges);
  });

  // 非受控回归：不绑 v-model:nodes 时，VueFlow 内部变更经回写由 useControllable 内部状态持有
  // （兼容 Vue 3.3 的关键——defineModel 在 3.3 非受控下回写会丢失，导致内部读到陈旧空数组）
  it('非受控（不绑 v-model:nodes）：VueFlow 回写由内部状态持有并回传', async () => {
    const wrapper = mount(FlowGraph); // 不传 nodes
    const vueFlow = wrapper.findComponent({ name: 'VueFlow' });
    const newNodes = [{ id: 'n1', position: { x: 1, y: 2 } }];
    vueFlow.vm.$emit('update:nodes', newNodes);
    await nextTick();
    // 对外 emit
    expect(wrapper.emitted('update:nodes')?.at(-1)).toEqual([newNodes]);
    // 关键：内部状态持有，回传给 VueFlow 的 nodes prop 反映新值（非陈旧空数组）
    expect(vueFlow.props('nodes')).toEqual(newNodes);
  });

  // 回归：createNode 曾把 data.size 预置为圆形默认尺寸，节点后续被 setNodeType 切换成
  // 六边形等类型时，BaseNode 会优先读这个残留的旧尺寸而非类型默认尺寸，导致渲染尺寸错误
  // （需刷新页面重新拉取数据、data.size 变回 undefined 才会恢复正常）。
  // data 必须留空，让尺寸始终由 node.type 动态决定。
  it('addNode 新建的节点 data 不预置 size，避免类型切换后残留旧尺寸', () => {
    addNodesMock.mockClear();
    const wrapper = mount(FlowGraph);
    (wrapper.vm as unknown as { addNode: () => void }).addNode();
    expect(addNodesMock).toHaveBeenCalledTimes(1);
    const [nodes] = addNodesMock.mock.calls[0] as [Array<{ data?: Record<string, unknown> }>];
    expect(nodes[0]?.data).toEqual({});
  });
});
