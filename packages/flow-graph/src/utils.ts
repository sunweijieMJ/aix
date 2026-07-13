import type { FlowNode, WayPoint } from './types';
import { DEFAULT_CIRCLE_SIZE, DEFAULT_HEXAGON_SIZE } from './types';

/**
 * 计算两节点间的折线拐点，拐点对齐到网格交叉点。
 * - 同行/同列：直线，无拐点
 * - 水平/垂直格数相等：斜线直连，无拐点
 * - 其他：先斜走 min(dx,dy) 格到拐点，再直走剩余距离，生成 1 个拐点
 */
export function calcOrthogonalWaypoints(
  source: FlowNode | undefined,
  target: FlowNode | undefined,
  gridSize = 40,
): WayPoint[] {
  if (!source || !target) return [];
  const srcSize =
    source.data?.size ?? (source.type === 'hexagon' ? DEFAULT_HEXAGON_SIZE : DEFAULT_CIRCLE_SIZE);
  const tgtSize =
    target.data?.size ?? (target.type === 'hexagon' ? DEFAULT_HEXAGON_SIZE : DEFAULT_CIRCLE_SIZE);
  const sx = Math.round((source.position.x + srcSize / 2) / gridSize) * gridSize;
  const sy = Math.round((source.position.y + srcSize / 2) / gridSize) * gridSize;
  const tx = Math.round((target.position.x + tgtSize / 2) / gridSize) * gridSize;
  const ty = Math.round((target.position.y + tgtSize / 2) / gridSize) * gridSize;
  const dx = Math.abs(tx - sx) / gridSize;
  const dy = Math.abs(ty - sy) / gridSize;
  if (dx === 0 || dy === 0 || dx === dy) return [];
  const steps = Math.min(dx, dy);
  const wx = sx + Math.sign(tx - sx) * steps * gridSize;
  const wy = sy + Math.sign(ty - sy) * steps * gridSize;
  return [{ x: wx, y: wy }];
}

/**
 * 计算节点的实际半径（px）：优先取节点自定义的 `data.size`，否则按 `type` 取对应的
 * 默认圆形/六边形尺寸。节点重叠判断（新建避重、拖拽吸附）必须用此函数取真实半径，
 * 不能假定所有节点都是同一尺寸——六边形起点与默认圆形节点尺寸不同，位置基准也不同
 * （见 `setNodeType` 切换类型时对 position 的居中修正）。
 */
export function getNodeHalf(
  node: Pick<FlowNode, 'type' | 'data'>,
  nodeSize: number,
  hexagonSize: number,
): number {
  const size = node.data?.size ?? (node.type === 'hexagon' ? hexagonSize : nodeSize);
  return size / 2;
}

/**
 * 在栅格上为新节点寻找一个不与 `existingNodes` 重叠的位置：以 `seed`（默认原点）为中心，
 * 按黄金角螺旋在栅格点上逐圈搜索，直到候选中心与所有已有节点中心的距离都不小于两者半径之和。
 * 返回值是节点左上角坐标（= 栅格对齐后的中心 - 半径），与 `FlowNode.position` 语义一致，可直接赋值。
 *
 * 与 `FlowGraph.createNode`（双击空白 / 工具栏新建按钮）共用同一份算法，业务方在补齐后端缺失坐标
 * （如列表页新增节点时未落库坐标）时也应调用本函数，而不是自行拍一个坐标——否则会绕开网格对齐与
 * 避重叠，重新引入"新节点偏离十字交叉点 / 与已有节点重叠"的问题。
 */
export function findFreeNodePosition(
  existingNodes: FlowNode[],
  options: {
    /** 栅格尺寸（px），需与画布 `gridSize` 保持一致 */
    gridSize: number;
    /** 新节点的圆形尺寸（px），用于换算半径 */
    nodeSize: number;
    /** 已有六边形节点的尺寸（px），用于按真实半径判重叠；不传时退化为 `nodeSize` */
    hexagonSize?: number;
    /** 期望的中心点（画布坐标系），默认原点 */
    seed?: { x: number; y: number };
  },
): { x: number; y: number } {
  const { gridSize: step, nodeSize, hexagonSize = nodeSize, seed = { x: 0, y: 0 } } = options;
  const half = nodeSize / 2;
  const baseX = Math.round(seed.x / step) * step - half;
  const baseY = Math.round(seed.y / step) * step - half;

  let px = baseX;
  let py = baseY;
  const overlapsExisting = (cx: number, cy: number) =>
    existingNodes.some((n) => {
      const nHalf = getNodeHalf(n, nodeSize, hexagonSize);
      return Math.hypot(cx - (n.position.x + nHalf), cy - (n.position.y + nHalf)) < half + nHalf;
    });
  for (let r = 0; overlapsExisting(px + half, py + half); r++) {
    const angle = r * 2.4;
    px = Math.round((baseX + half + (r + 1) * step * Math.cos(angle)) / step) * step - half;
    py = Math.round((baseY + half + (r + 1) * step * Math.sin(angle)) / step) * step - half;
  }
  return { x: px, y: py };
}

/**
 * 生成唯一节点 id。优先使用 `crypto.randomUUID`，不可用时降级到 `Date.now + 随机`。
 * @param prefix - id 前缀，默认 `node`
 */
export function createNodeId(prefix = 'node'): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${uuid}`;
}

/**
 * 切换节点类型并修正 position，保持节点中心不变。
 * 直接修改传入的 node 对象（原地修改，兼容 vue-flow v-model）。
 */
export function setNodeType(node: FlowNode, type: string | undefined): void {
  if (node.type === type) return;
  const oldSize =
    node.data?.size ?? (node.type === 'hexagon' ? DEFAULT_HEXAGON_SIZE : DEFAULT_CIRCLE_SIZE);
  const newSize =
    node.data?.size ?? (type === 'hexagon' ? DEFAULT_HEXAGON_SIZE : DEFAULT_CIRCLE_SIZE);
  const diff = (newSize - oldSize) / 2;
  node.type = type;
  node.position = { x: node.position.x - diff, y: node.position.y - diff };
  node.width = newSize;
  node.height = newSize;
}
