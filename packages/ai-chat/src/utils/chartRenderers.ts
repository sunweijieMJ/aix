import { defineComponent, h, ref, shallowRef, watch, type ShallowRef } from 'vue';
import { useEChartsRender, type EChartsLike } from '../composables/useEChartsRender';
import type { MarkdownRenderers } from './markdownWalker';

/** plain object 判定（拒绝数组 / null / 基本类型）：JSON.parse 出的 option 须是对象 */
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * ECharts 加载源：
 * - `instance` 响应式引用——null 表示「未就绪 / 不可用」，围栏先维持代码块，
 *   实例后到时各围栏块内 watch 自动重入出图（同 MermaidSource.instance 机制）；
 * - `ensure` 在每个 ```chart 围栏挂载时调用（幂等），懒加载在此发起 import。
 */
interface ChartSource {
  instance: ShallowRef<EChartsLike | null>;
  ensure?: () => void;
}

/**
 * 共享 ECharts 懒加载单例：围栏路径与结构化 ChartBlock 复用同一次加载
 * （echarts 模块本身也被 ESM import 缓存，但共享 shallowRef 让两路的「就绪信号」一致）。
 */
let shared: ChartSource | null = null;

/** 获取共享 ECharts 源（首次创建懒加载器；load 只在首个图表挂载时执行一次） */
export function getSharedECharts(load: () => Promise<EChartsLike | null>): ChartSource {
  if (!shared) {
    const instance = shallowRef<EChartsLike | null>(null);
    let started = false;
    shared = {
      instance,
      ensure: () => {
        if (started) return;
        started = true;
        load()
          .then((echarts) => {
            if (echarts) {
              instance.value = echarts;
            } else {
              // 未装 / 加载失败落 null：复位 started 允许下一个图表挂载时重试——
              // stale chunk 404 一次不应让后续所有图表永久降级（重试成本仅一次 import）
              started = false;
            }
          })
          .catch(() => {
            // 加载意外失败：维持 null（围栏→代码块，结构化→降级），不产生未处理 rejection，允许重试
            started = false;
          });
      },
    };
  }
  return shared;
}

/** 测试用：注入就绪的 ECharts 实例（跳过真实 import） */
export function __setSharedEChartsForTest(instance: EChartsLike | null): void {
  shared = { instance: shallowRef(instance) };
}

/** 测试用：重置共享单例 */
export function __resetSharedECharts(): void {
  shared = null;
}

/**
 * 共享实现：据 ECharts 来源产出 `fence:chart` 渲染器。
 * 流式期（未固化）维持代码块（半截 JSON 必崩，绝不喂渲染器）；固化后 JSON.parse 校验：
 * 合法 → 活实例出图；非法 → 维持代码块 + `--error`；引擎未就绪 → 静默维持代码块（缺依赖是合理降级）。
 */
function buildChartRenderers(source: ChartSource): MarkdownRenderers {
  const EChartsFenceBlock = defineComponent({
    name: 'AixEChartsFenceBlock',
    props: {
      code: { type: String, required: true },
      settled: { type: Boolean, required: true },
    },
    setup(props) {
      // 首个围栏挂载即触发懒加载（幂等）：流式期后台预载，块固化时多半已就绪即刻出图
      source.ensure?.();
      const container = ref<HTMLElement | null>(null);
      const option = shallowRef<Record<string, unknown> | null>(null);
      const failed = ref(false);

      watch(
        () => [props.code, props.settled] as const,
        ([code, settled]) => {
          // 流式未固化：维持代码块逐字展示，不解析
          if (!settled) {
            option.value = null;
            failed.value = false;
            return;
          }
          try {
            const parsed: unknown = JSON.parse(code);
            if (isPlainObject(parsed)) {
              option.value = parsed;
              failed.value = false;
            } else {
              option.value = null;
              failed.value = true;
            }
          } catch {
            option.value = null;
            failed.value = true;
          }
        },
        { immediate: true },
      );

      const { failed: renderFailed } = useEChartsRender({
        container,
        option,
        echarts: source.instance,
      });

      return () => {
        // option 合法且引擎就绪且未渲染失败 → 渲染活实例容器；
        // 否则维持代码块（JSON 非法 / setOption 抛错 / 不支持的图表类型加 --error）
        if (option.value && source.instance.value && !renderFailed.value) {
          return h('div', { class: 'aix-md-chart', ref: container });
        }
        return h(
          'pre',
          {
            class: [
              'aix-md-chart-source',
              (failed.value || renderFailed.value) && 'aix-md-chart-source--error',
            ],
          },
          h('code', props.code),
        );
      };
    },
  });

  return {
    'fence:chart': ({ token, info }) =>
      h(EChartsFenceBlock, {
        code: token.content,
        // committed 未注入（直接使用 walker）时按非流式即固化处理
        settled: info.committed ?? !info.streaming,
      }),
  };
}

/** DI 版：注入已就绪 EChartsLike（测试 / 预加载用）——契约同 createDiagramRenderers */
export function createChartRenderers(echarts: EChartsLike): MarkdownRenderers {
  return buildChartRenderers({ instance: shallowRef(echarts) });
}

/**
 * 懒加载版：首个 ```chart 围栏渲染时才执行 `load()`（经共享单例，与结构化路径共用一次加载）。
 * loader 返回 null / 抛错（未安装、网络失败）→ 实例维持 null，围栏静默维持代码块展示。
 */
export function createLazyChartRenderers(
  load: () => Promise<EChartsLike | null>,
): MarkdownRenderers {
  return buildChartRenderers(getSharedECharts(load));
}

/**
 * ECharts 惰性加载器：首个 ```chart 围栏 / chart 块挂载时才执行。未安装则返回 null → 静默降级。
 *
 * 渲染器选 **CanvasRenderer**：SVGRenderer 在 hover 高亮时会反复 remove/add `<path>` DOM 元素
 * （实测每次 mousemove 触发一次 path 增删）→ 浏览器重绘 → 图表内容闪烁；canvas 在画布内重绘像素、
 * 不动 DOM，交互流畅无闪。SSR / 静态截图场景另走 `renderToSVGString`（服务端静态、不涉及 hover），
 * 二者不冲突：客户端活实例要交互 → canvas，服务端出图要可序列化 → svg。
 */
export async function importECharts(): Promise<EChartsLike | null> {
  try {
    const core = (await import('echarts/core')) as unknown as EChartsLike;
    const { CanvasRenderer } = (await import('echarts/renderers')) as unknown as {
      CanvasRenderer: unknown;
    };
    core.use([CanvasRenderer]);
    return core;
  } catch {
    // 未安装 echarts：```chart 围栏 / chart 块维持降级（合理展示），与 mermaid 缺失同样静默
    return null;
  }
}
