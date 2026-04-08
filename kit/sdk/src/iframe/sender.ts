import type { SDKCore } from '../core/sdk.js';
import type { IframeEnvelope } from './types.js';
import { Logger } from '../shared/logger.js';

export class IframeSender {
  private readonly logger: Logger;

  constructor(private readonly core: SDKCore) {
    this.logger = new Logger(core.debug, 'iframe');
  }

  /**
   * 向子 iframe 发消息（父页面使用）
   * targetOrigin 自动从 iframe.src 推导；iframe 未加载时 warn + 丢弃
   */
  send<T>(iframe: HTMLIFrameElement, payload: T): void {
    if (!iframe.contentWindow) {
      this.logger.warn('send() 失败：iframe.contentWindow 为 null，iframe 可能未加载', iframe.src);
      return;
    }

    let targetOrigin = '*';
    if (iframe.src) {
      try {
        targetOrigin = new URL(iframe.src).origin;
      } catch {
        this.logger.warn(
          'send() 警告：无法解析 iframe.src，将使用 * 作为 targetOrigin',
          iframe.src,
        );
      }
    } else {
      this.logger.warn('send() 警告：iframe.src 为空，将使用 * 作为 targetOrigin');
    }

    const envelope: IframeEnvelope<T> = {
      __sdk: '@kit/sdk',
      appId: this.core.appId,
      payload,
    };

    this.logger.log(`Message sent → ${targetOrigin} (appId: ${this.core.appId})`);
    iframe.contentWindow.postMessage(envelope, targetOrigin);
  }

  /**
   * 向父页面发消息（子页面使用）
   * targetOrigin 不传默认 '*'
   */
  sendToParent<T>(payload: T, targetOrigin = '*'): void {
    const envelope: IframeEnvelope<T> = {
      __sdk: '@kit/sdk',
      appId: this.core.appId,
      payload,
    };

    this.logger.log(`Message sent → parent (targetOrigin: ${targetOrigin})`);
    window.parent.postMessage(envelope, targetOrigin);
  }
}
