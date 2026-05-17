import type { SDKCore } from '../core/sdk.js';
import { BaseChannel } from './base-channel.js';
import { Logger } from '../shared/logger.js';
import { isHandshakeEnvelope, type GuestChannelOptions, type HandshakeEnvelope } from './types.js';

const DEV_HANDSHAKE_WARNING_MS = 3000;

/**
 * Guest 侧通信频道。
 *
 * 适用于所有被嵌入或被打开的页面场景：
 * - 作为 iframe 运行（通过 window.parent 联系 host）
 * - 通过 window.open() 打开（通过 window.opener 联系 host）
 *
 * 默认构造完后通过 microtask 自动发起握手（`autoReady=true`，业务侧推荐路径）。
 * 需要精细控制握手时机（如测试、需要等待外部数据）的场景可传入 `autoReady: false`，
 * 之后由外部显式调用 {@link GuestChannel.ready}。
 *
 * 安全：当 `expectedHostOrigin` 不为 `'*'` 时，SDK 会严格校验 `sdk:ack` 的 `event.origin`
 * 必须与之完全一致，且 `event.source` 必须等于 `window.opener` 或 `window.parent`，
 * 防止第三方页面伪造 ack 抢占 MessagePort。
 */
export class GuestChannel extends BaseChannel {
  /** `null` 表示未启用 origin 校验（expectedHostOrigin 为 `'*'` 或未传） */
  private expectedHostOrigin: string | null;

  /**
   * 创建 Guest 侧通道。
   *
   * @param core    SDK 内部状态容器
   * @param options 可选配置：expectedHostOrigin / autoReady / heartbeat
   */
  constructor(core: SDKCore, options: GuestChannelOptions = {}) {
    super(core, new Logger(core.debug, 'cross-window:guest'), 'host', options.heartbeat);

    const origin = options.expectedHostOrigin ?? '*';
    this.expectedHostOrigin = origin === '*' ? null : origin;
    if (this.expectedHostOrigin === null) {
      this.logger.warn('expectedHostOrigin 未指定或为 "*"，origin 校验已禁用，仅推荐用于开发环境');
    }

    const autoReady = options.autoReady !== false;
    if (autoReady) {
      // microtask 推迟到本轮调用栈之后，让用户有机会在同步代码里注册 onMessage / onRequest
      queueMicrotask(() => this.ready());
    }

    this._startDevHandshakeWarning();
  }

  /**
   * 触发握手：向 host 发送 sdk:ready，并注册 sdk:ack 监听器。
   *
   * 当 `autoReady !== false` 时构造期已自动调用，业务侧通常不需要再手动调。
   * `autoReady: false` 时由调用方自行触发，可重复调用（先清理旧监听器和已绑定 port）。
   *
   * 可选 `targetOrigin` 覆盖构造时的 `expectedHostOrigin`，仅用于测试/特殊场景。
   *
   * @param targetOrigin 覆盖期望的 host origin（不传则用构造时的 expectedHostOrigin）。
   */
  ready(targetOrigin?: string): void {
    if (this.disposed) {
      this.logger.warn('ready() 调用无效：channel 已销毁');
      return;
    }

    // 清理一切上一轮残留：未完成的握手监听、已绑定的 port。
    // 覆盖"成功握手后再次调用 ready()"的场景，防止旧 MessagePort 因被 this.port 覆盖而泄漏。
    if (this.windowListener) {
      window.removeEventListener('message', this.windowListener);
      this.windowListener = null;
    }
    this._closeConnection();

    // 覆盖 expectedHostOrigin（如果显式传入）
    if (targetOrigin !== undefined) {
      this.expectedHostOrigin = targetOrigin === '*' ? null : targetOrigin;
    }

    // 兼容 iframe（window.parent）和 window.open()（window.opener）两种场景。
    // 若既无 opener 也非 iframe，window.parent 会指向自身，发到自己没有意义，直接拒绝。
    const host = window.opener ?? window.parent;
    if (host === window) {
      this.logger.warn('ready() 跳过：当前窗口既无 opener 也不是 iframe（window.parent === self）');
      return;
    }

    this._listenForAck(host);
    const envelope: HandshakeEnvelope = {
      __sdk: '@kit/sdk',
      appId: this.core.appId,
      __sys: 'sdk:ready',
    };
    const finalTargetOrigin = this.expectedHostOrigin ?? '*';
    this.logger.log(`sdk:ready → host (targetOrigin: ${finalTargetOrigin})`);
    host.postMessage(envelope, finalTargetOrigin);
  }

  /**
   * 注册 window message 监听器，等待来自 host 的 `sdk:ack` 响应。
   * 收到合法响应后从事件中取出 MessagePort 交给基类绑定，之后立即移除自身。
   *
   * 安全校验：
   * - `event.source` 必须严格等于发起握手时的 host（防止第三方窗口伪造）
   * - 若启用了 origin 校验，`event.origin` 必须与 `expectedHostOrigin` 一致
   */
  private _listenForAck(expectedSource: Window | MessageEventSource): void {
    const listener = (event: MessageEvent) => {
      if (!isHandshakeEnvelope(event.data, 'sdk:ack', this.core.appId)) return;

      if (event.source !== expectedSource) {
        this.logger.warn('sdk:ack rejected: event.source 与发起握手时的 host 不一致');
        return;
      }

      if (this.expectedHostOrigin !== null && event.origin !== this.expectedHostOrigin) {
        this.logger.warn(
          `sdk:ack rejected: origin "${event.origin}" ≠ expected "${this.expectedHostOrigin}"`,
        );
        return;
      }

      if (!event.ports || event.ports.length === 0) {
        this.logger.warn('sdk:ack received but no MessagePort transferred');
        return;
      }

      this.logger.log(`sdk:ack ← ${event.origin}, MessageChannel established`);
      window.removeEventListener('message', listener);
      this.windowListener = null;
      this.peerOrigin = event.origin;
      // guest 侧仅一次握手（不支持重连，guest 重载就是全新文档新 channel）
      this._bindPort(event.ports[0]!, false);
    };

    this.windowListener = listener;
    window.addEventListener('message', listener);
  }

  /** dev 模式 3s 未握手成功时主动告警，帮助定位握手失败原因。 */
  private _startDevHandshakeWarning(): void {
    if (!this.core.debug) return;
    setTimeout(() => {
      if (this.port || this.disposed) return;
      this.logger.warn(
        '3s 未收到 host sdk:ack，请检查：host 是否已 asHost / expectedHostOrigin 是否匹配 host 页面 origin',
      );
    }, DEV_HANDSHAKE_WARNING_MS);
  }
}
