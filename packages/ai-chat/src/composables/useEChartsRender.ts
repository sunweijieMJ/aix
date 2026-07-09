import { onBeforeUnmount, ref, watchPostEffect, type Ref, type ShallowRef } from 'vue';
import type { EChartsChartKind } from '../types';

/**
 * ECharts 活实例最小接口（依赖注入，不静态耦合库类型声明，同 MermaidLike/KatexLike）。
 * 图表是**绑定 DOM 的活实例**（非 mermaid 那种静态 SVG 字符串）：
 * - `setOption` 出图 / 主题重绘；`resize` 响应容器尺寸变化；
 * - `dispose` 释放实例——虚拟列表 unmount（滚出可视区）时**必须调用**，否则实例泄漏。
 */
export interface EChartsInstance {
  setOption(option: unknown, notMerge?: boolean): void;
  resize(): void;
  dispose(): void;
}

/** ECharts 核心最小接口：init 拿活实例 + use 注册按需子模块 */
export interface EChartsLike {
  init(el: HTMLElement, theme?: unknown, opts?: { renderer?: 'svg' | 'canvas' }): EChartsInstance;
  use(exts: unknown[]): void;
}

// 已 use 过的图表类型（模块级幂等：多图共享，避免重复 import/use 同一子模块）
const usedKinds = new Set<EChartsChartKind>();

/** 测试用：复位已加载图表类型缓存 */
export function __resetChartKinds(): void {
  usedKinds.clear();
}

/**
 * 按图表类型二次动态 import 只加载所需 ECharts 子模块（只画饼图不引柱图代码）。
 * 幂等；echarts 子模块不可用（未安装 / 加载失败）时静默——真实环境会画不出，
 * 但注入 mock 的测试与「echarts 整包未装」场景均不因此抛错。
 */
export async function ensureChartType(core: EChartsLike, kind: EChartsChartKind): Promise<void> {
  if (usedKinds.has(kind)) return;
  try {
    const charts = (await import('echarts/charts')) as Record<string, unknown>;
    const comps = (await import('echarts/components')) as Record<string, unknown>;
    // radar 用 RadarComponent（极坐标系），bar/line/scatter/heatmap 用 GridComponent（直角坐标系）；
    // pie/funnel/gauge/graph/tree/treemap 无需坐标系（自带布局，非直角/极坐标）；
    // heatmap 额外需要 VisualMapComponent 做取值→颜色的映射，否则色阶不生效。
    const perKind: Record<EChartsChartKind, { chart: string; components?: string[] }> = {
      bar: { chart: 'BarChart', components: ['GridComponent'] },
      line: { chart: 'LineChart', components: ['GridComponent'] },
      scatter: { chart: 'ScatterChart', components: ['GridComponent'] },
      pie: { chart: 'PieChart' },
      radar: { chart: 'RadarChart', components: ['RadarComponent'] },
      funnel: { chart: 'FunnelChart' },
      gauge: { chart: 'GaugeChart' },
      heatmap: { chart: 'HeatmapChart', components: ['GridComponent', 'VisualMapComponent'] },
      graph: { chart: 'GraphChart' },
      tree: { chart: 'TreeChart' },
      treemap: { chart: 'TreemapChart' },
    };
    const { chart, components } = perKind[kind];
    const exts: unknown[] = [
      charts[chart],
      comps.TitleComponent,
      comps.TooltipComponent,
      comps.LegendComponent,
    ];
    if (components) exts.push(...components.map((name) => comps[name]));
    core.use(exts.filter(Boolean));
    usedKinds.add(kind);
  } catch {
    // 子模块不可用：静默降级（真实环境画不出，mock 测试不受影响）
  }
}

/** 从 option.series[0].type 推断图表类型（围栏路径无显式 kind 时用），无法识别回退 'line' */
export function inferKind(option: Record<string, unknown>): EChartsChartKind {
  const series = option.series;
  const first = Array.isArray(series) ? series[0] : series;
  const type = (first as { type?: string } | undefined)?.type;
  const known: EChartsChartKind[] = [
    'bar',
    'line',
    'pie',
    'scatter',
    'radar',
    'funnel',
    'gauge',
    'heatmap',
    'graph',
    'tree',
    'treemap',
  ];
  return known.includes(type as EChartsChartKind) ? (type as EChartsChartKind) : 'line';
}

/**
 * 读取 @aix/theme CSS 变量注入 option（配色 / 文字色与组件库一致）。
 * 仅补默认——option 已显式给 color/textStyle 则尊重业务/模型意图不覆盖。
 * 注：运行时切换主题的动态重绘为后续增强（需接入主题变更信号），MVP 于每次 setOption 读当前值。
 */
function withTheme(option: Record<string, unknown>, el: HTMLElement): Record<string, unknown> {
  const cs = getComputedStyle(el);
  // getComputedStyle 在现代浏览器返回 CSS Color Level 4 空格语法（"rgb(19 194 194)" / "rgb(0 0 0 / 0.88)"），
  // ECharts/zrender 无法解析这种空格格式 → emphasis 高亮时颜色计算异常 → hover 反复 mouseover/mouseout = 闪。
  // 转成 zrender 认识的逗号语法 rgb(r,g,b) / rgba(r,g,b,a)。这是「hover 图元闪烁」的真根因修复。
  const toLegacyColor = (c: string): string =>
    c.replace(/rgba?\(([^)]+)\)/i, (_m, inner: string) => {
      const p = inner.replace(/\//g, ' ').split(/\s+/).filter(Boolean);
      if (p.length === 4) return `rgba(${p[0]},${p[1]},${p[2]},${p[3]})`;
      if (p.length === 3) return `rgb(${p[0]},${p[1]},${p[2]})`;
      return c;
    });
  const v = (name: string): string => toLegacyColor(cs.getPropertyValue(name).trim());
  const palette = [
    '--aix-colorPrimary',
    '--aix-colorSuccess',
    '--aix-colorWarning',
    '--aix-colorError',
    '--aix-colorInfo',
  ]
    .map(v)
    .filter(Boolean);
  const textColor = v('--aix-colorText');
  // tooltip 默认 confine 在容器内：防 tooltip 溢出触发页面滚动条 → 容器尺寸变 → ResizeObserver 抖动闪烁
  const tip = option.tooltip as Record<string, unknown> | undefined;
  const confinedTooltip =
    tip && typeof tip === 'object' && !Array.isArray(tip) && tip.confine === undefined
      ? { tooltip: { ...tip, confine: true } }
      : {};
  return {
    ...(palette.length && option.color === undefined ? { color: palette } : {}),
    ...(textColor && option.textStyle === undefined ? { textStyle: { color: textColor } } : {}),
    ...option,
    ...confinedTooltip,
  };
}

export interface UseEChartsRenderParams {
  /** 挂载容器（须有非零高度——依赖调用方 CSS min-height 保证，比运行时查 clientHeight 更稳） */
  container: Ref<HTMLElement | null>;
  /** 已解析的 ECharts option 对象；null 表示当前不应出图（未固化 / 非法 / 引擎未就绪） */
  option: Ref<Record<string, unknown> | null>;
  /** 图表类型（决定二次动态 import 的子模块）；缺省从 option.series 推断 */
  kind?: Ref<EChartsChartKind | undefined>;
  /** ECharts 实例（响应式；null=库未就绪，出图延后到就绪时自动重入） */
  echarts: ShallowRef<EChartsLike | null>;
}

/**
 * ECharts 活实例生命周期管理（围栏 / 结构化两路共用的渲染核）：
 * option/容器/引擎任一变化即重算——首次 init + 后续 setOption 复用实例；
 * ResizeObserver 跟随容器尺寸；组件卸载 dispose 释放（虚拟列表重挂载重建，靠 overscan 摊薄）。
 */
export function useEChartsRender(params: UseEChartsRenderParams): { rendered: Ref<boolean> } {
  const rendered = ref(false);
  let chart: EChartsInstance | null = null;
  let ro: ResizeObserver | null = null;

  const teardown = (): void => {
    if (ro) {
      ro.disconnect();
      ro = null;
    }
    if (chart) {
      chart.dispose();
      chart = null;
    }
    rendered.value = false;
  };

  // watchPostEffect：DOM 挂载后（post）立即运行并追踪依赖——容器一渲染出来就出图；
  // 依赖（容器 / option / 引擎 / kind）任一变化即重入。同步开头读齐响应式值以确保被追踪。
  watchPostEffect(async () => {
    const el = params.container.value;
    const option = params.option.value;
    const echarts = params.echarts.value;
    const kind = params.kind?.value;
    // 无容器 / 无 option / 库未就绪 → 释放已有实例，维持降级
    if (!el || !option || !echarts) {
      teardown();
      return;
    }
    await ensureChartType(echarts, kind ?? inferKind(option));
    // 异步落定期间容器 / option 已变：丢弃过期结果，避免往错误实例 setOption
    if (params.container.value !== el || params.option.value !== option) return;
    if (!chart) {
      // canvas 渲染器：hover 高亮在画布内重绘、不增删 DOM，避免 SVG renderer 的 path 反复重建闪烁
      chart = echarts.init(el, undefined, { renderer: 'canvas' });
      if (typeof ResizeObserver !== 'undefined') {
        let prevW = Math.round(el.clientWidth);
        let prevH = Math.round(el.clientHeight);
        let raf = 0;
        ro = new ResizeObserver((entries) => {
          const rect = entries[0]?.contentRect;
          if (!rect) return;
          const w = Math.round(rect.width);
          const h = Math.round(rect.height);
          // 尺寸未真正变化则忽略 + RAF 节流——避免「resize→重绘→observer 再触发」的抖动
          if (w === prevW && h === prevH) return;
          prevW = w;
          prevH = h;
          if (raf) cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => chart?.resize());
        });
        ro.observe(el);
      }
    }
    chart.setOption(withTheme(option, el), true);
    rendered.value = true;
  });

  onBeforeUnmount(teardown);
  return { rendered };
}
