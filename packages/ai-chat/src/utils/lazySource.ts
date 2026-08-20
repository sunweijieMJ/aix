import { shallowRef, type ShallowRef } from 'vue';

/** 懒加载源：响应式实例 + 幂等加载触发器（mermaid / echarts 等可选重依赖共用形态） */
export interface LazySource<T> {
  /** 响应式实例：null 表示「尚未就绪 / 不可用」，落定时依赖它的 watch 自动重入 */
  instance: ShallowRef<T | null>;
  /** 幂等触发加载：首个消费者挂载时调用；失败复位允许下一个消费者重试 */
  ensure: () => void;
}

/**
 * 懒加载源工厂：收敛 mermaid / echarts 两路各自手写的「started 标志 + 失败复位」模式
 * （useMarkdownRenderer 的引擎加载注释自述与此同一思路，是第三处潜在收敛点）。
 *
 * load 落 null（未安装 / 加载失败）或抛错（不产生未处理 rejection）→ 复位 started，
 * 允许下一个消费者挂载时重试——发版 stale chunk 404 / 弱网抖动一次不应让后续消费者
 * 永久降级；真正未安装的场景重试同样落 null，行为不变仅多一次尝试成本。
 * onReady 在实例落定前执行一次性初始化（如 mermaid.initialize）。
 */
export function createLazySource<T>(
  load: () => Promise<T | null>,
  onReady?: (instance: T) => void,
): LazySource<T> {
  const instance = shallowRef<T | null>(null);
  let started = false;
  const ensure = () => {
    if (started || instance.value) return;
    started = true;
    load()
      .then((v) => {
        if (!v) {
          started = false;
          return;
        }
        onReady?.(v);
        instance.value = v;
      })
      .catch(() => {
        started = false;
      });
  };
  return { instance, ensure };
}
