import type { SDKCore } from '../core/sdk.js';
import { BaseChannel } from './base-channel.js';
import { Logger } from '../shared/logger.js';
import { isHandshakeEnvelope, type HandshakeEnvelope, type HostChannelOptions } from './types.js';

/** Host 侧支持的目标窗口类型：嵌入的 iframe 或 window.open() 打开的窗口 */
export type WindowTarget = HTMLIFrameElement | Window;

/**
 * 从 {@link WindowTarget} 中解出真正的 Window 引用。
 * - 传入 HTMLIFrameElement 时读取其 `contentWindow`（iframe 未 attach 时可能为 null）
 * - 传入 Window 时原样返回
 *
 * @param target host 持有的目标对象
 * @returns 对应的 Window；iframe 未就绪时返回 null
 */
function getContentWindow(target: WindowTarget): Window | null {
  if (target instanceof HTMLIFrameElement) {
    return target.contentWindow;
  }
  return target;
}

/**
 * Host 侧通信频道。
 *
 * 支持两种目标窗口：
 * - `HTMLIFrameElement`：嵌入的 iframe
 * - `Window`：`window.open()` 打开的新窗口
 *
 * 创建后自动监听 guest 的 sdk:ready 握手信号，
 * 握手完成后建立私有 MessageChannel，握手前的消息自动入队。
 * 支持 guest 页面重载后自动重新握手（旧队列丢弃，handlers/connectListeners 保留）。
 */
export class HostChannel extends BaseChannel {
  /**
   * 创建 Host 侧通道。构造完成后立即开始监听 `sdk:ready` 握手信号。
   *
   * @param core    SDK 内部状态容器
   * @param target  目标窗口（iframe 元素或 window.open 返回值）
   * @param options 可选配置：origin 白名单 / onReconnect / heartbeat
   */
  constructor(
    core: SDKCore,
    private readonly target: WindowTarget,
    private readonly options: HostChannelOptions = {},
  ) {
    super(core, new Logger(core.debug, 'iframe:host'), 'guest', options.heartbeat);
    this._listenForReady();
  }

  /**
   * 注册 window message 监听器，等待来自目标窗口的 `sdk:ready` 握手信号。
   * 监听器在通道生命周期内始终保留，支持 guest 重载后自动重新握手。
   */
  private _listenForReady(): void {
    const listener = (event: MessageEvent) => {
      if (!isHandshakeEnvelope(event.data, 'sdk:ready', this.core.appId)) return;

      // 校验消息确实来自目标窗口，防止其他页面伪造握手
      if (event.source !== getContentWindow(this.target)) return;

      // origin 白名单校验
      const { allowedOrigins } = this.options;
      if (allowedOrigins?.length && !allowedOrigins.includes(event.origin)) {
        this.logger.warn(`Handshake rejected: origin "${event.origin}" not in allowedOrigins`);
        return;
      }

      const isReconnect = this.port !== null;
      if (isReconnect) {
        // guest 重载：关闭旧通道（旧 pendingQueue 此时必为空，因为成功的 port 会吸收 send）
        this.logger.log(`sdk:ready (reconnect) ← ${event.origin}, re-establishing MessageChannel`);
        this._closeConnection();
      } else {
        this.logger.log(`sdk:ready ← ${event.origin}, establishing MessageChannel`);
      }

      const established = this._establish(event.origin);
      if (isReconnect && established) {
        this.options.onReconnect?.();
      }
    };

    // 保持监听不移除，以支持 guest 重载后重新握手
    this.windowListener = listener;
    window.addEventListener('message', listener);
  }

  /**
   * 建立 MessageChannel 并把 port2 交给 guest。
   * @returns 是否成功建立
   */
  private _establish(guestOrigin: string): boolean {
    const contentWindow = getContentWindow(this.target);
    if (!contentWindow) {
      this.logger.warn('_establish() 失败：目标窗口不可用');
      return false;
    }

    const { port1, port2 } = new MessageChannel();

    // postMessage 成功后才提交状态（peerOrigin / port），避免半初始化
    try {
      const ack: HandshakeEnvelope = {
        __sdk: '@kit/sdk',
        appId: this.core.appId,
        __sys: 'sdk:ack',
      };
      contentWindow.postMessage(ack, guestOrigin, [port2]);
    } catch (err) {
      port1.close();
      this.logger.warn('_establish() 失败：postMessage 抛出异常', err);
      return false;
    }

    this.peerOrigin = guestOrigin;
    this._bindPort(port1);
    this.logger.log(`sdk:ack + port2 → ${guestOrigin}`);
    // 注：_bindPort 内部 flush 的消息会进入 port1 的内置队列，
    // 待 guest 端 port.onmessage 挂上后按序投递。
    return true;
  }
}
