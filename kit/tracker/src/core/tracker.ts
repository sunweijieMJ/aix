import type {
  AccountInfo,
  BaseEventProperties,
  CommonPropertyMap,
  EventName,
  ITrackerAdapter,
  TrackerInitOptions,
  ValidatorConfig,
} from '../types.js';
import { CommonPropertiesManager } from './common-properties.js';
import { TrackerLogger } from './logger.js';
import { EventQueue } from './queue.js';
import { TrackerValidator } from './validator.js';

/**
 * Tracker 核心类
 * 管理适配器生命周期、事件上报、用户身份和公共属性
 */
export class Tracker {
  private adapters: ITrackerAdapter[];
  private queue: EventQueue;
  private commonProps: CommonPropertiesManager;
  private validator: TrackerValidator | null;
  private logger: TrackerLogger;
  private options: TrackerInitOptions;
  private visibilityHandler: (() => void) | null = null;
  /** 缓存最近一次 identify 调用，适配器就绪后回放 */
  private pendingIdentify: AccountInfo | null = null;

  constructor(options: TrackerInitOptions) {
    this.options = options;
    this.adapters = options.adapters ?? [];
    this.queue = new EventQueue(options.queue);
    this.commonProps = new CommonPropertiesManager(options.commonProperties);
    this.logger = new TrackerLogger(options.debug ?? false);

    // 校验器：传 true 使用默认配置，传对象使用自定义配置
    if (options.validation) {
      const config: ValidatorConfig | true =
        typeof options.validation === 'object' ? options.validation : true;
      this.validator = new TrackerValidator(config);
    } else {
      this.validator = null;
    }
  }

  /** 初始化所有适配器 */
  async init(): Promise<void> {
    // 并行初始化所有适配器
    const results = await Promise.allSettled(
      this.adapters.map((adapter) => adapter.init(this.options)),
    );

    // 记录初始化失败的适配器
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        const adapterName = this.adapters[i]?.name ?? `index:${i}`;
        console.error(
          `[kit-tracker] 适配器 "${adapterName}" 初始化失败:`,
          result.reason,
        );
      }
    });

    // 回放缓冲的 identify 调用
    if (this.pendingIdentify) {
      this.safeForEachAdapter((adapter) =>
        adapter.identify(this.pendingIdentify!),
      );
      this.pendingIdentify = null;
    }

    // 回放缓冲的公共属性
    const resolved = this.commonProps.resolve();
    this.safeForEachAdapter((adapter) => adapter.setCommonData(resolved));

    // flush 缓冲队列中的事件（只分发给已就绪的目标适配器）
    this.queue.flush(this.createFlushCallback());

    // 注册页面隐藏时 flush（兜底：页面关闭前尽量发送）
    // 先移除旧监听，防止重复调用 init() 导致泄漏
    if (this.visibilityHandler && typeof window !== 'undefined') {
      window.removeEventListener('visibilitychange', this.visibilityHandler);
    }
    if (typeof window !== 'undefined') {
      this.visibilityHandler = () => {
        if (document.visibilityState === 'hidden') {
          this.queue.flush(this.createFlushCallback());
        }
      };
      window.addEventListener('visibilitychange', this.visibilityHandler);
    }

    this.logger.log('初始化完成');
  }

  /**
   * 上报自定义事件
   * 已就绪的适配器立即分发，未就绪的事件进缓冲队列
   */
  track<E extends string = string>(
    eventName: EventName<E>,
    properties?: BaseEventProperties,
  ): void {
    // 1. 合并公共属性
    const mergedProps = this.commonProps.merge(properties ?? {});

    // 2. 开发环境校验
    if (this.validator) {
      const valid = this.validator.validate(eventName, mergedProps);
      if (!valid && this.validator.shouldBlock()) return;
    }

    // 3. 调试日志
    this.logger.logTrack(eventName, mergedProps);

    // 4. 按适配器就绪状态分组分发
    const readyAdapters = this.adapters.filter((a) => a.isReady());
    const pendingAdapters = this.adapters.filter((a) => !a.isReady());

    if (readyAdapters.length > 0) {
      this.dispatchToAdapters(eventName, mergedProps, readyAdapters);
    }

    if (pendingAdapters.length > 0) {
      this.queue.enqueue(
        eventName,
        mergedProps,
        pendingAdapters.map((a) => a.name),
      );
    }
  }

  /** 设置用户身份 */
  identify(account: AccountInfo): void {
    this.logger.logIdentify(account as Record<string, unknown>);
    this.pendingIdentify = account;

    this.safeForEachAdapter((adapter) => adapter.identify(account));
  }

  /** 更新公共属性 */
  setCommonData(data: CommonPropertyMap): void {
    this.commonProps.update(data as Record<string, any>); // CommonPropertyMap 兼容 PropertyInput

    const resolved = this.commonProps.resolve();
    this.safeForEachAdapter((adapter) => adapter.setCommonData(resolved));

    this.logger.log('公共属性已更新', resolved);
  }

  /** 销毁 Tracker，释放资源 */
  destroy(): void {
    // flush 剩余队列
    this.queue.flush(this.createFlushCallback());

    // 销毁适配器
    for (const adapter of this.adapters) {
      try {
        adapter.destroy?.();
      } catch (err) {
        console.error(`[kit-tracker] 适配器 "${adapter.name}" 销毁失败:`, err);
      }
    }

    // 移除 visibilitychange 监听
    if (this.visibilityHandler && typeof window !== 'undefined') {
      window.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }

    this.logger.log('已销毁');
  }

  /** 创建 flush 回调，只向已就绪的目标适配器分发事件 */
  private createFlushCallback() {
    return (
      event: string,
      props: Record<string, unknown>,
      targetAdapters: string[],
    ) => {
      const targets = this.adapters.filter(
        (a) => targetAdapters.includes(a.name) && a.isReady(),
      );
      this.dispatchToAdapters(event, props, targets);
    };
  }

  /** 安全遍历已就绪的适配器，单个适配器异常不影响其余 */
  private safeForEachAdapter(fn: (adapter: ITrackerAdapter) => void): void {
    for (const adapter of this.adapters) {
      if (adapter.isReady()) {
        try {
          fn(adapter);
        } catch (err) {
          console.error(
            `[kit-tracker] 适配器 "${adapter.name}" 操作失败:`,
            err,
          );
        }
      }
    }
  }

  /** 向指定适配器列表分发事件 */
  private dispatchToAdapters(
    eventName: string,
    properties: Record<string, unknown>,
    adapters: ITrackerAdapter[],
  ): void {
    for (const adapter of adapters) {
      try {
        adapter.track(eventName, properties);
      } catch (err) {
        console.error(`[kit-tracker] 适配器 "${adapter.name}" 上报失败:`, err);
      }
    }
  }
}
