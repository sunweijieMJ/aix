import type { SDKCore } from '../core/sdk.js';
import { BaseChannel } from './base-channel.js';
import { Logger } from '../shared/logger.js';
import { isHandshakeEnvelope, type GuestChannelOptions, type HandshakeEnvelope } from './types.js';

/**
 * Guest 侧通信频道。
 *
 * 适用于所有被嵌入或被打开的页面场景：
 * - 作为 iframe 运行（通过 window.parent 联系 host）
 * - 通过 window.open() 打开（通过 window.opener 联系 host）
 *
 * 调用 ready() 向 host 发送握手信号，host 响应后建立私有 MessageChannel。
 * ready() 调用前的 send() 消息自动入队，握手完成后 flush。
 */
export class GuestChannel extends BaseChannel {
  /**
   * 创建 Guest 侧通道。构造不会主动发起握手，需要显式调用 {@link GuestChannel.ready}。
   *
   * @param core    SDK 内部状态容器
   * @param options 可选配置：heartbeat
   */
  constructor(core: SDKCore, options: GuestChannelOptions = {}) {
    super(core, new Logger(core.debug, 'iframe:guest'), 'host', options.heartbeat);
  }

  /**
   * 通知 host 页面 guest 已初始化完成，触发握手流程。
   * 在 guest 页面所有初始化逻辑完成后调用。
   *
   * 可重复调用：
   * - 若上一次握手尚未完成：清理旧监听器后重新发起。
   * - 若上一次已成功握手：关闭旧 MessagePort 后重新发起（handlers / connectListeners 保留）。
   *
   * @param targetOrigin host 页面的 origin，推荐明确指定；不传默认 '*'（仅开发环境使用）
   */
  ready(targetOrigin = '*'): void {
    if (this.disposed) {
      this.logger.warn('ready() 调用无效：channel 已销毁');
      return;
    }

    // 清理一切上一轮残留：未完成的握手监听、已绑定的 port。
    // 这里无条件清理，覆盖"成功握手后再次调用 ready()"的场景，
    // 防止旧 MessagePort 因被 this.port 覆盖而泄漏。
    if (this.windowListener) {
      window.removeEventListener('message', this.windowListener);
      this.windowListener = null;
    }
    this._closeConnection();

    // 兼容 iframe（window.parent）和 window.open()（window.opener）两种场景。
    // 若既无 opener 也非 iframe，window.parent 会指向自身，发到自己没有意义，直接拒绝。
    const host = window.opener ?? window.parent;
    if (host === window) {
      this.logger.warn(
        'ready() 调用无效：当前窗口既无 opener 也不是 iframe（window.parent === self）',
      );
      return;
    }

    this._listenForAck();
    const envelope: HandshakeEnvelope = {
      __sdk: '@kit/sdk',
      appId: this.core.appId,
      __sys: 'sdk:ready',
    };
    this.logger.log(`sdk:ready → host (targetOrigin: ${targetOrigin})`);
    host.postMessage(envelope, targetOrigin);
  }

  /**
   * 注册 window message 监听器，等待来自 host 的 `sdk:ack` 响应。
   * 收到合法响应后从事件中取出 MessagePort 交给基类绑定，之后立即移除自身。
   */
  private _listenForAck(): void {
    const listener = (event: MessageEvent) => {
      if (!isHandshakeEnvelope(event.data, 'sdk:ack', this.core.appId)) return;
      if (!event.ports || event.ports.length === 0) {
        this.logger.warn('sdk:ack received but no MessagePort transferred');
        return;
      }

      this.logger.log(`sdk:ack ← ${event.origin}, MessageChannel established`);
      window.removeEventListener('message', listener);
      this.windowListener = null;
      this.peerOrigin = event.origin;
      this._bindPort(event.ports[0]!);
    };

    this.windowListener = listener;
    window.addEventListener('message', listener);
  }
}
