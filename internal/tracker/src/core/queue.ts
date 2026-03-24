import type { QueueConfig, QueuedEvent } from '../types.js';

/** flush 回调函数签名 */
export type FlushCallback = (
  event: string,
  properties: Record<string, unknown>,
  targetAdapters: string[],
) => void;

/**
 * 事件缓冲队列
 * SDK 未就绪前缓存事件，就绪后 flush 回放
 */
export class EventQueue {
  private buffer: QueuedEvent[] = [];
  private maxSize: number;

  constructor(config?: QueueConfig) {
    this.maxSize = config?.maxSize ?? 50;
  }

  /** 事件入队，队列已满时丢弃最旧事件 */
  enqueue(
    event: string,
    properties: Record<string, unknown>,
    targetAdapters: string[],
  ): void {
    if (this.buffer.length >= this.maxSize) {
      const dropped = this.buffer.shift();
      console.warn(
        `[aix-tracker] 缓冲队列已满(${this.maxSize})，丢弃最旧事件: ${dropped?.event}`,
      );
    }
    this.buffer.push({ event, properties, targetAdapters });
  }

  /** 清空队列并逐条回调 */
  flush(callback: FlushCallback): void {
    const items = this.buffer.splice(0);
    items.forEach((item) =>
      callback(item.event, item.properties, item.targetAdapters),
    );
  }

  /** 当前队列长度 */
  get size(): number {
    return this.buffer.length;
  }
}
