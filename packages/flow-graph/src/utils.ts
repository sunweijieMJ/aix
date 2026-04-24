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
