import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { FlowGraph } from '../src';

vi.mock('@vue-flow/core', () => ({
  VueFlow: defineComponent({
    name: 'VueFlow',
    emits: ['connect', 'paneDblClick'],
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
    addNodes: vi.fn(),
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
    expect(wrapper.props('nodes')).toEqual(nodes);
  });

  it('支持 v-model:edges', () => {
    const edges = [{ id: 'e1', source: '1', target: '2' }];
    const wrapper = mount(FlowGraph, { props: { edges } });
    expect(wrapper.props('edges')).toEqual(edges);
  });
});
