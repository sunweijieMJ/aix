<template>
  <div class="aix-mindmap-renderer" :style="{ height: containerHeight }">
    <div ref="containerRef" class="aix-mindmap-renderer__container" />
    <div v-if="error" class="aix-mindmap-renderer__error">
      <span>思维导图渲染错误: {{ error }}</span>
    </div>
    <div v-if="loading" class="aix-mindmap-renderer__loading">
      <div class="aix-mindmap-renderer__spinner" />
      <span>加载思维导图中...</span>
    </div>
    <div v-if="!loading && !error" class="aix-mindmap-renderer__toolbar">
      <button
        class="aix-mindmap-renderer__btn"
        title="放大"
        @click="handleZoomIn"
      >
        +
      </button>
      <button
        class="aix-mindmap-renderer__btn"
        title="缩小"
        @click="handleZoomOut"
      >
        -
      </button>
      <button
        class="aix-mindmap-renderer__btn"
        title="适应画布"
        @click="handleFitView"
      >
        ⊡
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  onMounted,
  onUnmounted,
  shallowRef,
  nextTick,
} from 'vue';
import type { RendererProps } from '../../core/types';
import type { MindmapData, MindmapNode, MindmapLayoutType } from './index';

type G6Graph = InstanceType<typeof import('@antv/g6').Graph>;

const props = withDefaults(
  defineProps<
    RendererProps<MindmapData | string> & {
      height?: string | number;
    }
  >(),
  {
    height: 400,
  },
);

const containerRef = ref<HTMLElement>();
const loading = ref(true);
const error = ref<string>('');
const graphInstance = shallowRef<G6Graph | null>(null);

const containerHeight = computed(() => {
  const h = props.height;
  return typeof h === 'number' ? `${h}px` : h;
});

// 解析数据
const mindmapData = computed<MindmapData>(() => {
  if (typeof props.data === 'string') {
    try {
      return JSON.parse(props.data);
    } catch {
      return { root: { id: 'root', label: props.data } };
    }
  }
  return props.data || { root: { id: 'root', label: '空' } };
});

// 主题颜色配置 - 使用渐变色系
const themeColors: Record<
  string,
  { main: string[]; light: string[]; text: string[] }
> = {
  default: {
    main: ['#667eea', '#5B8FF9', '#5AD8A6', '#F6BD16', '#E8684A', '#9254de'],
    light: ['#eef2ff', '#e6f7ff', '#e6fffb', '#fffbe6', '#fff1f0', '#f9f0ff'],
    text: ['#ffffff', '#ffffff', '#ffffff', '#5c4a00', '#ffffff', '#ffffff'],
  },
  colorful: {
    main: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'],
    light: ['#ffe8e8', '#e0f7f5', '#e3f4f9', '#e8f5e9', '#fffde7', '#f8e8f8'],
    text: ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#5c4a00', '#ffffff'],
  },
  ocean: {
    main: ['#0077B6', '#00B4D8', '#90E0EF', '#CAF0F8', '#48CAE4', '#023E8A'],
    light: ['#e6f3f8', '#e6f9fc', '#f0fafe', '#fafeff', '#e8f8fc', '#e6edf5'],
    text: ['#ffffff', '#ffffff', '#003d5c', '#003d5c', '#003d5c', '#ffffff'],
  },
  forest: {
    main: ['#2D6A4F', '#40916C', '#52B788', '#74C69D', '#95D5B2', '#1B4332'],
    light: ['#e8f3ed', '#ebf5ef', '#eef7f1', '#f1f9f4', '#f4faf7', '#e6ede9'],
    text: ['#ffffff', '#ffffff', '#ffffff', '#1b4332', '#1b4332', '#ffffff'],
  },
};

// 将 MindmapNode 转换为 G6 树图数据格式
function transformToG6Data(
  node: MindmapNode,
  depth = 0,
  theme = 'default',
  index = 0,
  side: 'left' | 'right' = 'right',
): Record<string, unknown> {
  const colors = themeColors[theme] || themeColors.default!;
  const colorIndex = depth % colors.main.length;
  const mainColor = node.style?.fill || colors.main[colorIndex]!;
  const lightColor = colors.light[colorIndex]!;
  const textColor = colors.text[colorIndex]!;

  // 计算子节点，交替分配左右
  const children = node.children || [];
  const transformedChildren = children.map((child, idx) => {
    // 一级子节点交替左右分布
    const childSide = depth === 0 ? (idx % 2 === 0 ? 'right' : 'left') : side;
    return transformToG6Data(child, depth + 1, theme, idx, childSide);
  });

  return {
    id: `${node.id || 'node'}-${depth}-${index}`,
    data: {
      label: node.label,
      originalId: node.id,
      depth,
      index,
      side,
      mainColor,
      lightColor,
      textColor,
    },
    children: transformedChildren,
  };
}

/**
 * 判断是否为图布局类型（非树形布局）
 */
function isGraphLayout(layoutType: MindmapLayoutType): boolean {
  return ['concentric', 'radial', 'force', 'circular', 'grid'].includes(
    layoutType,
  );
}

/**
 * 获取布局配置
 * 根据布局类型和方向返回对应的 G6 布局配置
 */
function getLayoutConfig(
  layoutType: MindmapLayoutType,
  direction: string,
): any {
  // 通用的节点尺寸计算函数（树形布局用）
  const getNodeHeight = (d: Record<string, unknown>) => {
    const data = d.data as Record<string, unknown> | undefined;
    const depth = (data?.depth as number) || 0;
    return depth === 0 ? 56 : depth === 1 ? 44 : depth === 2 ? 36 : 30;
  };

  const getNodeWidth = (d: Record<string, unknown>) => {
    const data = d.data as Record<string, unknown> | undefined;
    const label = (data?.label as string) || '';
    const depth = (data?.depth as number) || 0;
    const charWidth = depth === 0 ? 16 : depth === 1 ? 14 : 12;
    const padding = depth === 0 ? 48 : depth === 1 ? 36 : 28;
    return Math.max(depth === 0 ? 120 : 80, label.length * charWidth + padding);
  };

  const getSide = (d: Record<string, unknown>) => {
    const data = d.data as Record<string, unknown> | undefined;
    return (data?.side as 'left' | 'right') || 'right';
  };

  switch (layoutType) {
    // ========== 树形布局 ==========
    case 'compactBox':
      // 紧凑盒树布局 - 节点紧凑排列
      return {
        type: 'compact-box',
        direction,
        getHeight: getNodeHeight,
        getWidth: getNodeWidth,
        getVGap: () => 8,
        getHGap: () => 24,
      };

    case 'dendrogram':
      // 生态树布局 - 叶子节点对齐
      return {
        type: 'dendrogram',
        direction,
        nodeSep: 24,
        rankSep: 80,
      };

    case 'indented':
      // 缩进树布局 - 类似文件目录结构
      return {
        type: 'indented',
        direction,
        indent: 40,
        getHeight: getNodeHeight,
        getWidth: getNodeWidth,
        getSide,
      };

    // ========== 图布局 ==========
    case 'concentric':
      // 同心圆布局 - 节点按层级分布在同心圆上
      return {
        type: 'concentric',
        maxLevelDiff: 1,
        sortBy: 'degree',
        preventOverlap: true,
        nodeSize: 60,
      };

    case 'radial':
      // 辐射布局 - 从中心向外辐射
      return {
        type: 'radial',
        unitRadius: 100,
        linkDistance: 150,
        preventOverlap: true,
        nodeSize: 60,
        strictRadial: false,
      };

    case 'force':
      // 力导向布局 - 基于物理模拟
      return {
        type: 'force',
        preventOverlap: true,
        nodeSize: 60,
        linkDistance: 120,
        nodeStrength: -200,
        edgeStrength: 0.5,
        collideStrength: 0.8,
        alpha: 0.8,
        alphaDecay: 0.02,
      };

    case 'circular':
      // 圆形布局 - 节点均匀分布在圆上
      return {
        type: 'circular',
        radius: 200,
        divisions: 1,
        ordering: 'topology',
      };

    case 'grid':
      // 网格布局 - 节点按网格排列
      return {
        type: 'grid',
        rows: 4,
        cols: 4,
        sortBy: 'degree',
        preventOverlap: true,
        nodeSize: 60,
      };

    case 'mindmap':
    default:
      // 脑图布局 - 经典思维导图
      return {
        type: 'mindmap',
        direction,
        getHeight: getNodeHeight,
        getWidth: getNodeWidth,
        getVGap: () => 12,
        getHGap: () => 40,
        getSide,
      };
  }
}

// 渲染思维导图
async function renderMindmap() {
  if (!containerRef.value) return;

  loading.value = true;
  error.value = '';

  try {
    // 动态导入 G6
    const G6 = await import('@antv/g6');

    // 销毁旧实例
    if (graphInstance.value) {
      graphInstance.value.destroy();
      graphInstance.value = null;
    }

    const {
      root,
      layout: layoutType = 'mindmap',
      direction = 'LR',
      theme = 'default',
      interactive = true,
    } = mindmapData.value;
    const treeData = transformToG6Data(root, 0, theme);

    // 确定布局方向
    const layoutDirection =
      direction === 'H' ? 'H' : direction === 'V' ? 'TB' : direction;

    // 获取容器尺寸，确保有合理的最小值
    const rect = containerRef.value.getBoundingClientRect();
    // 如果容器宽度小于 400，使用父元素宽度或默认值
    const parentWidth = containerRef.value.parentElement?.clientWidth || 800;
    const width = rect.width > 100 ? rect.width : Math.max(parentWidth, 600);
    const height = rect.height > 100 ? rect.height : 400;

    // 使用 treeToGraphData 转换树形数据为图数据
    const graphData = G6.treeToGraphData(
      treeData as Parameters<typeof G6.treeToGraphData>[0],
    );

    // 判断是否为图布局
    const useGraphLayout = isGraphLayout(layoutType);

    // 根据布局类型选择不同的节点配置
    const nodeConfig: any = useGraphLayout
      ? {
          // 图布局 - 使用圆形节点
          type: 'circle',
          style: {
            size: (d: Record<string, unknown>) => {
              const data = d.data as Record<string, unknown> | undefined;
              const depth = (data?.depth as number) || 0;
              return depth === 0 ? 60 : depth === 1 ? 50 : 40;
            },
            fill: (d: Record<string, unknown>) => {
              const data = d.data as Record<string, unknown> | undefined;
              return (data?.mainColor as string) || '#667eea';
            },
            stroke: (d: Record<string, unknown>) => {
              const data = d.data as Record<string, unknown> | undefined;
              const depth = (data?.depth as number) || 0;
              if (depth === 0) return '#fff';
              return (data?.mainColor as string) || '#667eea';
            },
            lineWidth: (d: Record<string, unknown>) => {
              const data = d.data as Record<string, unknown> | undefined;
              const depth = (data?.depth as number) || 0;
              return depth === 0 ? 3 : 2;
            },
            shadowColor: 'rgba(0, 0, 0, 0.15)',
            shadowBlur: 8,
            shadowOffsetY: 2,
            labelText: (d: Record<string, unknown>) => {
              const data = d.data as Record<string, unknown> | undefined;
              return (data?.label as string) || '';
            },
            labelFill: '#ffffff',
            labelFontSize: (d: Record<string, unknown>) => {
              const data = d.data as Record<string, unknown> | undefined;
              const depth = (data?.depth as number) || 0;
              return depth === 0 ? 14 : depth === 1 ? 12 : 11;
            },
            labelFontWeight: (d: Record<string, unknown>) => {
              const data = d.data as Record<string, unknown> | undefined;
              const depth = (data?.depth as number) || 0;
              return depth === 0 ? 700 : 500;
            },
            labelPlacement: 'center',
          },
          animation: { enter: false },
        }
      : {
          // 树形布局 - 使用矩形/椭圆节点
          type: (d: Record<string, unknown>) => {
            const data = d.data as Record<string, unknown> | undefined;
            const depth = (data?.depth as number) || 0;
            if (depth === 0) return 'rect';
            if (depth === 1) return 'rect';
            if (depth === 2) return 'ellipse';
            return 'ellipse';
          },
          style: {
            size: (d: Record<string, unknown>) => {
              const data = d.data as Record<string, unknown> | undefined;
              const label = (data?.label as string) || '';
              const depth = (data?.depth as number) || 0;
              const charWidth = depth === 0 ? 16 : depth === 1 ? 14 : 12;
              const padding = depth === 0 ? 48 : depth === 1 ? 36 : 28;
              const w = Math.max(
                depth === 0 ? 120 : 80,
                label.length * charWidth + padding,
              );
              if (depth === 0) return [w, 56];
              if (depth === 1) return [w, 44];
              if (depth === 2) return [w, 36];
              return [w - 8, 30];
            },
            radius: (d: Record<string, unknown>) => {
              const data = d.data as Record<string, unknown> | undefined;
              const depth = (data?.depth as number) || 0;
              return depth === 0 ? 12 : depth === 1 ? 8 : 18;
            },
            fill: (d: Record<string, unknown>) => {
              const data = d.data as Record<string, unknown> | undefined;
              const depth = (data?.depth as number) || 0;
              if (depth <= 1) {
                return (data?.mainColor as string) || '#667eea';
              }
              return (data?.lightColor as string) || '#eef2ff';
            },
            stroke: (d: Record<string, unknown>) => {
              const data = d.data as Record<string, unknown> | undefined;
              return (data?.mainColor as string) || '#667eea';
            },
            lineWidth: (d: Record<string, unknown>) => {
              const data = d.data as Record<string, unknown> | undefined;
              const depth = (data?.depth as number) || 0;
              return depth <= 1 ? 0 : 2;
            },
            shadowColor: (d: Record<string, unknown>) => {
              const data = d.data as Record<string, unknown> | undefined;
              const depth = (data?.depth as number) || 0;
              if (depth === 0) return 'rgba(102, 126, 234, 0.4)';
              return 'transparent';
            },
            shadowBlur: (d: Record<string, unknown>) => {
              const data = d.data as Record<string, unknown> | undefined;
              const depth = (data?.depth as number) || 0;
              return depth === 0 ? 16 : 0;
            },
            shadowOffsetY: 4,
            labelText: (d: Record<string, unknown>) => {
              const data = d.data as Record<string, unknown> | undefined;
              return (data?.label as string) || '';
            },
            labelFill: (d: Record<string, unknown>) => {
              const data = d.data as Record<string, unknown> | undefined;
              const depth = (data?.depth as number) || 0;
              if (depth <= 1) {
                return (data?.textColor as string) || '#ffffff';
              }
              return (data?.mainColor as string) || '#667eea';
            },
            labelFontSize: (d: Record<string, unknown>) => {
              const data = d.data as Record<string, unknown> | undefined;
              const depth = (data?.depth as number) || 0;
              return depth === 0
                ? 16
                : depth === 1
                  ? 14
                  : depth === 2
                    ? 13
                    : 12;
            },
            labelFontWeight: (d: Record<string, unknown>) => {
              const data = d.data as Record<string, unknown> | undefined;
              const depth = (data?.depth as number) || 0;
              return depth === 0 ? 700 : depth === 1 ? 600 : 500;
            },
            labelPlacement: 'center',
            ports: [
              { placement: 'right', key: 'right' },
              { placement: 'left', key: 'left' },
            ],
          },
          animation: { enter: false },
        };

    // 根据布局类型选择不同的边配置

    const edgeConfig: any = useGraphLayout
      ? {
          // 图布局 - 使用直线或曲线
          type: 'line',
          style: {
            stroke: (d: Record<string, unknown>) => {
              const target = d.target as string | undefined;
              const targetNode = graphData.nodes?.find(
                (n: Record<string, unknown>) => n.id === target,
              );
              const targetData = targetNode?.data as
                | Record<string, unknown>
                | undefined;
              return (targetData?.mainColor as string) || '#C9CDD4';
            },
            lineWidth: 1.5,
            opacity: 0.6,
            endArrow: true,
          },
          animation: { enter: false },
        }
      : {
          // 树形布局 - 使用曲线
          type: 'cubic-horizontal',
          style: {
            stroke: (d: Record<string, unknown>) => {
              const target = d.target as string | undefined;
              const targetNode = graphData.nodes?.find(
                (n: Record<string, unknown>) => n.id === target,
              );
              const targetData = targetNode?.data as
                | Record<string, unknown>
                | undefined;
              return (targetData?.mainColor as string) || '#C9CDD4';
            },
            lineWidth: 2,
            lineDash: (d: Record<string, unknown>) => {
              const target = d.target as string | undefined;
              const targetNode = graphData.nodes?.find(
                (n: Record<string, unknown>) => n.id === target,
              );
              const targetData = targetNode?.data as
                | Record<string, unknown>
                | undefined;
              const depth = (targetData?.depth as number) || 0;
              return depth > 2 ? [4, 4] : undefined;
            },
            opacity: 0.7,
          },
          animation: { enter: false },
        };

    // 根据布局类型选择交互行为
    const behaviors = useGraphLayout
      ? ['drag-canvas', 'zoom-canvas', 'drag-element']
      : interactive
        ? ['drag-canvas', 'zoom-canvas', 'collapse-expand']
        : ['drag-canvas', 'zoom-canvas'];

    // 创建 G6 实例
    const graph = new G6.Graph({
      container: containerRef.value,
      width,
      height,
      autoFit: 'view',
      padding: 20,
      data: graphData,
      node: nodeConfig,
      edge: edgeConfig,
      layout: getLayoutConfig(layoutType, layoutDirection),
      behaviors,
    });

    await graph.render();
    graphInstance.value = graph;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    console.error('[MindmapRenderer] 渲染失败:', e);
  } finally {
    loading.value = false;
  }
}

// 缩放操作
function handleZoomIn() {
  if (graphInstance.value) {
    const currentZoom = graphInstance.value.getZoom();
    graphInstance.value.zoomTo(Math.min(currentZoom * 1.2, 3));
  }
}

function handleZoomOut() {
  if (graphInstance.value) {
    const currentZoom = graphInstance.value.getZoom();
    graphInstance.value.zoomTo(Math.max(currentZoom / 1.2, 0.3));
  }
}

function handleFitView() {
  if (graphInstance.value) {
    graphInstance.value.fitView();
  }
}

// 处理窗口大小变化
function handleResize() {
  if (graphInstance.value && containerRef.value) {
    const { width, height } = containerRef.value.getBoundingClientRect();
    graphInstance.value.resize(width, height);
  }
}

// 监听数据变化
watch(mindmapData, () => renderMindmap(), { deep: true });

onMounted(async () => {
  // 等待 DOM 完全渲染后再初始化，确保容器尺寸正确
  await nextTick();
  // 额外等待一帧确保布局完成
  requestAnimationFrame(() => {
    renderMindmap();
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleResize);
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', handleResize);
  }
  if (graphInstance.value) {
    graphInstance.value.destroy();
    graphInstance.value = null;
  }
});
</script>

<style lang="scss">
.aix-mindmap-renderer {
  position: relative;
  width: 100%;
  min-height: 300px;

  &__container {
    width: 100%;
    height: 100%;
  }

  &__error {
    display: flex;
    position: absolute;
    align-items: center;
    justify-content: center;
    padding: 16px;
    color: var(--aix-error, #ef4444);
    font-size: 14px;
    inset: 0;
  }

  &__loading {
    display: flex;
    position: absolute;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--aix-text-secondary, #6b7280);
    font-size: 14px;
    inset: 0;
    gap: 12px;
  }

  &__spinner {
    width: 24px;
    height: 24px;
    animation: aix-spin 0.8s linear infinite;
    border: 3px solid var(--aix-border, #e5e7eb);
    border-radius: 50%;
    border-top-color: var(--aix-primary, #3b82f6);
  }

  &__toolbar {
    display: flex;
    position: absolute;
    right: 12px;
    bottom: 12px;
    border-radius: 4px;
    background: var(--aix-bg-container, #fff);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.15);
    gap: 4px;
  }

  &__btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    transition: all 0.2s;
    border: none;
    background: transparent;
    color: var(--aix-text-secondary, #6b7280);
    font-size: 16px;
    cursor: pointer;

    &:hover {
      background: var(--aix-hover, #f3f4f6);
      color: var(--aix-primary, #3b82f6);
    }
  }
}

@keyframes aix-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
