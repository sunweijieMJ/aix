import type { SDKCore } from '../core/sdk.js';
import { BaseChannel } from './base-channel.js';
import { Logger } from '../shared/logger.js';
import { matchesOrigin } from './origin-matcher.js';
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

const DEV_HANDSHAKE_WARNING_MS = 3000;

/**
 * Host 侧通信频道。
 *
 * 支持两种目标窗口：
 * - `HTMLIFrameElement`：嵌入的 iframe
 * - `Window`：`window.open()` 打开的新窗口
 *
 * 创建后自动监听 guest 的 sdk:ready 握手信号，
 * 握手完成后建立私有 MessageChannel，握手前的消息自动入队。
 * 支持 guest 页面重载后自动重新握手；通过 `onConnect({reconnected})` 区分首次与重连。
 *
 * 可选 `handshakeTimeout` 在首次握手超时后触发 `onDisconnect('handshake-timeout')`。
 */
export class HostChannel extends BaseChannel {
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 创建 Host 侧通道。构造完成后立即开始监听 `sdk:ready` 握手信号。
   *
   * @param core    SDK 内部状态容器
   * @param target  目标窗口（iframe 元素或 window.open 返回值）
   * @param options 可选配置：allowedOrigins / handshakeTimeout / heartbeat
   */
  constructor(
    core: SDKCore,
    private readonly target: WindowTarget,
    private readonly options: HostChannelOptions = {},
  ) {
    super(core, new Logger(core.debug, 'cross-window:host'), 'guest', options.heartbeat);
    this._listenForReady();
    this._startHandshakeTimeout();
    this._startDevHandshakeWarning();
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

      // origin 白名单校验；支持精确匹配和 glob 通配符（如 'https://*.example.com'），'*' 表示接受所有来源
      const { allowedOrigins } = this.options;
      if (allowedOrigins?.length && !matchesOrigin(allowedOrigins, event.origin)) {
        this.logger.warn(`Handshake rejected: origin "${event.origin}" not in allowedOrigins`);
        return;
      }

      const isReconnect = this.port !== null;
      if (isReconnect) {
        // guest 重载：先发断连事件让业务感知旧连接已废弃，再关闭旧通道
        // （旧 pendingQueue 此时必为空，因为成功的 port 会吸收 send）
        this.logger.log(`sdk:ready (reconnect) ← ${event.origin}, re-establishing MessageChannel`);
        this._emitDisconnect('peer-reconnect');
        this._closeConnection();
      } else {
        this.logger.log(`sdk:ready ← ${event.origin}, establishing MessageChannel`);
      }

      this._establish(event.origin, isReconnect);
    };

    // 保持监听不移除，以支持 guest 重载后重新握手
    this.windowListener = listener;
    window.addEventListener('message', listener);
  }

  /**
   * 建立 MessageChannel 并把 port2 交给 guest。
   * @param guestOrigin 通过白名单校验的 guest origin
   * @param reconnected 是否为 guest 重载重新握手
   * @returns 是否成功建立
   */
  private _establish(guestOrigin: string, reconnected: boolean): boolean {
    // 用户可能在 _emitDisconnect('peer-reconnect') 回调里 dispose 通道，
    // 此时 listener 控制权已返回此处，需要主动放弃以避免复活已销毁的通道。
    if (this.disposed) return false;
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
      // postMessage 抛错时 transferable 不会被分离（HTML spec），port2 仍属本 realm，需主动 close 避免泄漏
      port1.close();
      port2.close();
      this.logger.warn('_establish() 失败：postMessage 抛出异常', err);
      // 未配 handshakeTimeout 的调用方否则完全感知不到失败，发出明确事件让业务能补救
      this._emitDisconnect('handshake-failed');
      return false;
    }

    // 握手成功，首次（非 reconnected）清除握手超时定时器
    if (!reconnected && this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }

    this.peerOrigin = guestOrigin;
    this._bindPort(port1, reconnected);
    this.logger.log(`sdk:ack + port2 → ${guestOrigin}`);
    // 注：_bindPort 内部 flush 的消息会进入 port1 的内置队列，
    // 待 guest 端 port.onmessage 挂上后按序投递。
    return true;
  }

  /** 启动握手超时检测；未配置或 <=0 时不启用。 */
  private _startHandshakeTimeout(): void {
    const timeout = this.options.handshakeTimeout;
    if (!timeout || timeout <= 0) return;
    this.handshakeTimer = setTimeout(() => {
      this.handshakeTimer = null;
      if (this.port || this.disposed) return; // 已成功握手或已销毁
      this.logger.warn(`handshake timeout (${timeout}ms)`);
      this._emitDisconnect('handshake-timeout');
    }, timeout);
  }

  /** dev 模式 3s 未握手成功时主动告警，帮助定位握手失败原因。 */
  private _startDevHandshakeWarning(): void {
    if (!this.core.debug) return;
    setTimeout(() => {
      if (this.port || this.disposed) return;
      this.logger.warn(
        '3s 未收到 guest sdk:ready，请检查：guest 是否已挂载 / allowedOrigins 是否匹配 guest origin / iframe 是否加载完成',
      );
    }, DEV_HANDSHAKE_WARNING_MS);
  }

  /** 销毁通道并清除握手定时器。 */
  dispose(): void {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
    super.dispose();
  }
}
