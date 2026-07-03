import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, ref } from 'vue';
import {
  useNodeInteraction,
  type UseNodeInteractionReturn,
} from '../src/composables/useNodeInteraction';
import { FlowSnapContextKey } from '../src/types';

const { addNodesMock, getNodesRef } = vi.hoisted(() => ({
  addNodesMock: vi.fn(),
  getNodesRef: {
    value: [] as Array<{
      id: string;
      type?: string;
      position: { x: number; y: number };
      data?: Record<string, unknown>;
    }>,
  },
}));

vi.mock('@vue-flow/core', () => ({
  useVueFlow: () => ({
    removeNodes: vi.fn(),
    addNodes: addNodesMock,
    getNodes: getNodesRef,
    updateNodeData: vi.fn(),
  }),
}));

// 挂一个宿主组件调用 useNodeInteraction，并注入 FlowSnapContextKey 模拟 FlowGraph 提供的栅格上下文
function mountInteraction(id: string) {
  let api!: UseNodeInteractionReturn;
  const Host = defineComponent({
    setup() {
      api = useNodeInteraction({ id, data: ref({}) });
      return () => null;
    },
  });
  mount(Host, {
    global: {
      provide: {
        [FlowSnapContextKey]: {
          snapEnabled: ref(true),
          gridSize: ref(100),
          nodeSize: ref(28),
          hexagonSize: ref(40),
        },
      },
    },
  });
  return api;
}

describe('useNodeInteraction.onCopy', () => {
  // 回归：onCopy 曾用「精确字符串匹配左上角坐标」判重，未考虑六边形节点(半径 20)与圆形节点
  // (半径 14)尺寸不同、位置基准不同，导致复制出的节点与画布上已有的六边形节点视觉重合
  // （与 FlowGraph.createNode 是同一类缺陷，见 addNode/createNode 的修复）。
  it('复制圆形节点时，候选位置与已有六边形节点中心重叠应跳过，不应视觉重合', () => {
    addNodesMock.mockClear();
    // 六边形节点：真实中心 (200, 200)
    const hexagon = { id: 'hex', type: 'hexagon', position: { x: 180, y: 180 }, data: {} };
    // 被复制的圆形节点：offset 一个网格步长(100)吸附后，候选中心恰好落在 (200, 200)
    const circle = { id: 'src', position: { x: 86, y: 86 }, data: {} };
    getNodesRef.value = [hexagon, circle];

    const api = mountInteraction('src');
    api.onCopy();

    expect(addNodesMock).toHaveBeenCalledTimes(1);
    const [nodes] = addNodesMock.mock.calls[0] as [Array<{ position: { x: number; y: number } }>];
    const [newNode] = nodes;
    const newCenter = { x: newNode!.position.x + 14, y: newNode!.position.y + 14 };
    const hexCenter = { x: hexagon.position.x + 20, y: hexagon.position.y + 20 };
    const dist = Math.hypot(newCenter.x - hexCenter.x, newCenter.y - hexCenter.y);
    // 两节点半径之和为 34px，小于此距离视觉上就会重叠；修复前该场景 dist === 0（完全重合）
    expect(dist).toBeGreaterThanOrEqual(34);
  });
});
