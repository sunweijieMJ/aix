/**
 * @fileoverview Mindmap 思维导图渲染器 (基于 @antv/g6)
 */

import type { RendererDefinition } from '../../core/types';

/** 思维导图节点数据 */
export interface MindmapNode {
  id: string;
  label: string;
  children?: MindmapNode[];
  collapsed?: boolean;
  style?: {
    fill?: string;
    stroke?: string;
    fontSize?: number;
  };
}

/**
 * 布局类型
 *
 * 树形布局：
 * - mindmap: 脑图布局（经典思维导图，支持左右分布）
 * - compactBox: 紧凑盒树布局（节点紧凑排列）
 * - dendrogram: 生态树布局（叶子节点对齐）
 * - indented: 缩进树布局（类似文件目录结构）
 *
 * 图布局：
 * - concentric: 同心圆布局（节点按层级分布在同心圆上）
 * - radial: 辐射布局（从中心向外辐射）
 * - force: 力导向布局（基于物理模拟）
 * - circular: 圆形布局（节点均匀分布在圆上）
 * - grid: 网格布局（节点按网格排列）
 */
export type MindmapLayoutType =
  // 树形布局
  | 'mindmap'
  | 'compactBox'
  | 'dendrogram'
  | 'indented'
  // 图布局
  | 'concentric'
  | 'radial'
  | 'force'
  | 'circular'
  | 'grid';

/** 思维导图数据 */
export interface MindmapData {
  /** 根节点数据 */
  root: MindmapNode;
  /**
   * 布局类型
   * - mindmap: 脑图布局（默认，支持左右分布）
   * - compactBox: 紧凑盒树布局
   * - dendrogram: 生态树布局（叶子节点对齐）
   * - indented: 缩进树布局（类似文件目录）
   */
  layout?: MindmapLayoutType;
  /** 布局方向: H-水平(左右分布), LR-从左到右, RL-从右到左, TB-从上到下, BT-从下到上 */
  direction?: 'H' | 'V' | 'LR' | 'RL' | 'TB' | 'BT';
  /**
   * 主题配色
   * - default: 默认蓝紫色系
   * - colorful: 多彩活泼配色
   * - ocean: 海洋蓝色系
   * - forest: 森林绿色系
   */
  theme?: 'default' | 'colorful' | 'ocean' | 'forest';
  /** 是否可交互（展开/折叠） */
  interactive?: boolean;
}

/**
 * 检测是否为思维导图 JSON 数据
 */
export function isMindmapJson(content: string): boolean {
  try {
    const data = JSON.parse(content.trim());
    // 检查是否有思维导图特征
    // 1. 显式标记 __type === 'mindmap'
    // 2. 有 root 节点且有 label 或 name
    // 3. 直接是节点数据（有 name/label 和 children）
    return (
      data.__type === 'mindmap' ||
      (data.root !== undefined &&
        typeof data.root === 'object' &&
        (data.root.label !== undefined || data.root.name !== undefined)) ||
      ((data.label !== undefined || data.name !== undefined) &&
        data.children !== undefined)
    );
  } catch {
    return false;
  }
}

/**
 * 将节点数据中的 name 字段转换为 label 字段（递归处理）
 */
function normalizeNodeData(node: Record<string, unknown>): MindmapNode {
  const label = (node.label as string) || (node.name as string) || '节点';
  const id =
    (node.id as string) || `node-${Math.random().toString(36).slice(2, 8)}`;
  const children = node.children as Record<string, unknown>[] | undefined;

  return {
    id,
    label,
    children: children?.map((child) => normalizeNodeData(child)),
    collapsed: node.collapsed as boolean | undefined,
    style: node.style as MindmapNode['style'],
  };
}

export const mindmapRenderer: RendererDefinition<MindmapData> = {
  name: 'mindmap',
  type: 'mindmap',
  priority: 16,
  streaming: false,
  description: '思维导图渲染器 (G6)',

  parser: (raw) => {
    try {
      const parsed = JSON.parse(raw);

      // 如果已有 root 属性，规范化 root 节点
      if (parsed.root !== undefined && typeof parsed.root === 'object') {
        return {
          ...parsed,
          root: normalizeNodeData(parsed.root),
        };
      }

      // 如果直接是节点数据（有 label 或 name），包装成 MindmapData
      if (parsed.label !== undefined || parsed.name !== undefined) {
        return { root: normalizeNodeData(parsed) };
      }

      return parsed;
    } catch {
      // 尝试解析简单文本格式
      return parseTextToMindmap(raw);
    }
  },

  detector: isMindmapJson,

  loader: () => import('./MindmapRenderer.vue').then((m) => m.default),
};

/**
 * 将简单文本格式解析为思维导图数据
 * 支持缩进格式：
 * 根节点
 *   子节点1
 *     孙节点1
 *   子节点2
 */
function parseTextToMindmap(text: string): MindmapData {
  const lines = text.split('\n').filter((line) => line.trim());
  if (lines.length === 0) {
    return { root: { id: 'root', label: '空' } };
  }

  const root: MindmapNode = {
    id: 'root',
    label: lines[0]?.trim() || '根节点',
    children: [],
  };
  const stack: { node: MindmapNode; indent: number }[] = [
    { node: root, indent: -1 },
  ];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;
    const label = trimmed.trim();

    const newNode: MindmapNode = {
      id: `node-${i}`,
      label,
      children: [],
    };

    // 找到父节点
    while (stack.length > 1 && stack[stack.length - 1]!.indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1]!.node;
    if (!parent.children) parent.children = [];
    parent.children.push(newNode);

    stack.push({ node: newNode, indent });
  }

  return { root };
}

export { default as MindmapRenderer } from './MindmapRenderer.vue';
