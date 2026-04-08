import type { SDKCore } from '../core/sdk.js';
import type { IframeEnvelope, MessageSource, ReceiverOptions } from './types.js';
import { Logger } from '../shared/logger.js';

type MessageHandler<T = unknown> = (payload: T, source: MessageSource) => void;

export class IframeReceiver {
  private readonly logger: Logger;
  private listeners: Array<(event: MessageEvent) => void> = [];

  constructor(
    private readonly core: SDKCore,
    private readonly options: ReceiverOptions = {},
  ) {
    this.logger = new Logger(core.debug, 'iframe');
  }

  /**
   * 注册消息处理器，返回取消该监听的函数。
   * 可多次调用以注册多个 handler。
   */
  onMessage<T>(handler: MessageHandler<T>): () => void {
    const listener = (event: MessageEvent) => {
      // 过滤非 SDK 消息
      const data = event.data as IframeEnvelope<T>;
      if (!data || data.__sdk !== '@kit/sdk') return;

      // origin 白名单校验
      const { allowedOrigins } = this.options;
      if (allowedOrigins && allowedOrigins.length > 0) {
        if (!allowedOrigins.includes(event.origin)) {
          this.logger.warn(
            `Message rejected: origin "${event.origin}" not in allowedOrigins`,
            event.origin,
          );
          return;
        }
      }

      const source: MessageSource = { origin: event.origin, appId: data.appId };
      this.logger.log(`Message received ← ${event.origin} (appId: ${data.appId})`);
      handler(data.payload, source);
    };

    window.addEventListener('message', listener);
    this.listeners.push(listener);

    // 返回取消单个监听的函数
    return () => {
      window.removeEventListener('message', listener);
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * 销毁整个 receiver，移除所有监听器。销毁后不可再用。
   */
  destroy(): void {
    for (const listener of this.listeners) {
      window.removeEventListener('message', listener);
    }
    this.listeners = [];
    this.logger.log('Receiver destroyed');
  }
}
