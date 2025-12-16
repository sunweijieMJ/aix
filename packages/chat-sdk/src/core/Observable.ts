/**
 * @fileoverview Observable - 可观察对象基类
 * 提供统一的订阅/通知模式，减少各模块中的重复代码
 */

import { logger } from '../utils/logger';

/**
 * 状态变更监听器类型
 */
export type StateListener<T> = (state: T) => void;

/**
 * 取消订阅函数类型
 */
export type Unsubscribe = () => void;

/**
 * Observable 配置选项
 */
export interface ObservableOptions {
  /**
   * 节流间隔（毫秒）
   * 设置后会使用 leading + trailing 节流策略
   * 防止流式数据导致组件频繁更新
   * @default undefined（不启用节流）
   */
  throttleInterval?: number;
}

/**
 * Observable 基类
 *
 * 提供状态管理和订阅功能的基础实现，
 * 可被 ChatStore、AgentRunner、MCPClient 等类继承或组合使用
 *
 * @template State 状态类型
 *
 * @example 继承使用
 * ```ts
 * class MyStore extends Observable<MyState> {
 *   constructor() {
 *     super({ count: 0 });
 *   }
 *
 *   increment() {
 *     this.updateState({ count: this.state.count + 1 });
 *   }
 * }
 * ```
 *
 * @example 组合使用
 * ```ts
 * class MyService {
 *   private observable = new Observable<MyState>({ loading: false });
 *
 *   subscribe = this.observable.subscribe.bind(this.observable);
 *   getState = this.observable.getState.bind(this.observable);
 * }
 * ```
 */
export class Observable<State extends object> {
  private _state: State;
  private listeners: Set<StateListener<State>> = new Set();

  // 节流相关（使用 _obs 前缀避免与子类冲突）
  private _obsThrottleInterval?: number;
  private _obsThrottleTimer: ReturnType<typeof setTimeout> | null = null;
  private _obsPendingNotify = false;

  constructor(initialState: State, options?: ObservableOptions) {
    this._state = initialState;
    this._obsThrottleInterval = options?.throttleInterval;
  }

  /**
   * 获取当前状态（返回深拷贝以防止外部修改）
   */
  getState(): State {
    return structuredClone(this._state);
  }

  /**
   * 获取当前状态的只读引用（性能优化，用于内部读取）
   * @internal
   */
  protected get state(): Readonly<State> {
    return this._state;
  }

  /**
   * 更新状态并通知所有监听器
   *
   * @param partial 部分状态更新
   */
  protected updateState(partial: Partial<State>): void {
    this._state = { ...this._state, ...partial };
    this.notifyListeners();
  }

  /**
   * 替换整个状态
   *
   * @param newState 新状态
   */
  protected setState(newState: State): void {
    this._state = newState;
    this.notifyListeners();
  }

  /**
   * 静默替换整个状态（不触发通知）
   * 用于需要手动控制通知时机的场景（如节流更新）
   *
   * @param newState 新状态
   * @internal
   */
  protected setStateSilent(newState: State): void {
    this._state = newState;
  }

  /**
   * 订阅状态变更
   *
   * @param listener 监听器函数
   * @returns 取消订阅函数
   */
  subscribe(listener: StateListener<State>): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 通知所有监听器（支持节流）
   *
   * 节流策略：Leading + Trailing
   * - Leading: 第一次调用立即执行
   * - Trailing: 在节流周期结束时执行最后一次
   */
  protected notifyListeners(): void {
    // 如果没有配置节流，直接通知
    if (!this._obsThrottleInterval) {
      this.doNotifyListeners();
      return;
    }

    // 节流逻辑：leading + trailing
    if (!this._obsThrottleTimer) {
      // Leading edge: 立即执行
      this.doNotifyListeners();
      this._obsPendingNotify = false;

      // 设置定时器，在周期结束时检查是否需要再次执行
      this._obsThrottleTimer = setTimeout(() => {
        this._obsThrottleTimer = null;
        // Trailing edge: 如果有待处理的通知，执行它
        if (this._obsPendingNotify) {
          this.doNotifyListeners();
          this._obsPendingNotify = false;
        }
      }, this._obsThrottleInterval);
    } else {
      // 在节流周期内，标记为待处理
      this._obsPendingNotify = true;
    }
  }

  /**
   * 实际执行通知
   * @internal
   */
  private doNotifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (error) {
        logger.error('[Observable] Listener error:', error);
      }
    });
  }

  /**
   * 获取监听器数量
   */
  get listenerCount(): number {
    return this.listeners.size;
  }

  /**
   * 检查是否有监听器
   */
  hasListeners(): boolean {
    return this.listeners.size > 0;
  }

  /**
   * 清除所有监听器
   */
  clearListeners(): void {
    this.listeners.clear();
  }

  /**
   * 销毁实例，清理所有资源
   */
  destroy(): void {
    this.clearListeners();
    // 清理节流定时器
    if (this._obsThrottleTimer) {
      clearTimeout(this._obsThrottleTimer);
      this._obsThrottleTimer = null;
    }
    this._obsPendingNotify = false;
  }
}

/**
 * 创建一个简单的 Observable 实例
 *
 * @param initialState 初始状态
 * @param options 配置选项
 * @returns Observable 实例
 *
 * @example
 * ```ts
 * const counter = createObservable({ count: 0 });
 *
 * counter.subscribe((state) => console.log('Count:', state.count));
 * ```
 *
 * @example 启用节流（适用于流式数据）
 * ```ts
 * const store = createObservable(
 *   { messages: [] },
 *   { throttleInterval: 50 }
 * );
 * ```
 */
export function createObservable<State extends object>(
  initialState: State,
  options?: ObservableOptions,
): Observable<State> {
  return new Observable(initialState, options);
}

/**
 * EventEmitter 风格的事件管理
 *
 * @template Events 事件类型映射
 *
 * @example
 * ```ts
 * interface MyEvents {
 *   connect: (url: string) => void;
 *   error: (error: Error) => void;
 *   message: (data: unknown) => void;
 * }
 *
 * const emitter = new EventEmitter<MyEvents>();
 *
 * emitter.on('connect', (url) => console.log('Connected to:', url));
 * emitter.emit('connect', 'ws://localhost:3000');
 * ```
 */
export class EventEmitter<
  Events extends Record<string, (...args: unknown[]) => void>,
> {
  private handlers = new Map<keyof Events, Set<Events[keyof Events]>>();

  /**
   * 订阅事件
   */
  on<K extends keyof Events>(event: K, handler: Events[K]): Unsubscribe {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  /**
   * 一次性订阅事件
   */
  once<K extends keyof Events>(event: K, handler: Events[K]): Unsubscribe {
    const wrapper = ((...args: unknown[]) => {
      this.off(event, wrapper as Events[K]);
      handler(...args);
    }) as Events[K];

    return this.on(event, wrapper);
  }

  /**
   * 取消订阅事件
   */
  off<K extends keyof Events>(event: K, handler: Events[K]): void {
    this.handlers.get(event)?.delete(handler);
  }

  /**
   * 触发事件
   */
  emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>): void {
    this.handlers.get(event)?.forEach((handler) => {
      try {
        handler(...args);
      } catch (error) {
        logger.error(
          `[EventEmitter] Handler error for event "${String(event)}":`,
          error,
        );
      }
    });
  }

  /**
   * 清除指定事件的所有监听器
   */
  removeAllListeners<K extends keyof Events>(event?: K): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }

  /**
   * 获取事件监听器数量
   */
  listenerCount<K extends keyof Events>(event: K): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.handlers.clear();
  }
}
