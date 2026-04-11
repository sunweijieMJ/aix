import type { SDKCore } from '../core/sdk.js';
import type { Logger } from '../shared/logger.js';
import {
  isHeartbeatEnvelope,
  isRequestEnvelope,
  isResponseEnvelope,
  type DisconnectReason,
  type HeartbeatEnvelope,
  type HeartbeatOptions,
  type MessageHandler,
  type MessageSource,
  type PortEnvelope,
  type RequestEnvelope,
  type RequestHandler,
  type RequestOptions,
  type ResponseEnvelope,
  type ResponseEnvelopeErr,
  type ResponseEnvelopeOk,
} from './types.js';

/** 默认 request 超时时间（毫秒） */
const DEFAULT_REQUEST_TIMEOUT = 10_000;
/** 默认心跳间隔（毫秒） */
const DEFAULT_HEARTBEAT_INTERVAL = 5_000;
/** 默认心跳断连判定时间（毫秒） */
const DEFAULT_HEARTBEAT_TIMEOUT = 15_000;

/** pending request 的内部记录 */
interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Host / Guest 通道共享的基类。
 *
 * 承载两侧对称的部分：消息队列、handler 注册、连接事件、request/response 路由、dispose 生命周期；
 * 子类专注于各自的握手流程，握手成功后调用 {@link BaseChannel._bindPort}
 * 将 MessagePort 交给基类完成后续绑定和 flush。
 */
export abstract class BaseChannel {
  protected port: MessagePort | null = null;
  protected peerOrigin: string | null = null;
  protected pendingQueue: Array<unknown> = [];
  protected handlers: Array<MessageHandler> = [];
  protected connectListeners: Array<() => void> = [];
  protected windowListener: ((event: MessageEvent) => void) | null = null;
  protected disposed = false;

  /** 正在等待对端响应的 request 记录，key = reqId */
  private pendingRequests: Map<string, PendingRequest> = new Map();
  /** 接收对端 request 的 handler，最多一个 */
  private requestHandler: RequestHandler | null = null;
  /** 生成唯一 reqId 的自增序号（进程内） */
  private reqSeq = 0;

  /** 心跳配置（解析后的最终值），null 表示未启用 */
  private readonly heartbeatOptions: Required<HeartbeatOptions> | null;
  /** 心跳定时器句柄 */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  /** 最近一次从对端收到任何消息的时间戳（ms） */
  private lastRecvAt = 0;
  /** 最近一次向对端发出任何消息的时间戳（ms），用于 piggyback：刚发过就跳过 ping */
  private lastSentAt = 0;
  /** 断连回调列表 */
  private disconnectListeners: Array<(reason: DisconnectReason) => void> = [];

  /**
   * @param core      SDK 内部状态容器
   * @param logger    子类注入的带模块标签的 Logger 实例
   * @param peerLabel 日志中指代对端的标签，纯粹用于调试输出
   * @param heartbeat 可选的心跳配置；不传则不启用心跳
   */
  constructor(
    protected readonly core: SDKCore,
    protected readonly logger: Logger,
    protected readonly peerLabel: 'host' | 'guest',
    heartbeat?: HeartbeatOptions,
  ) {
    if (heartbeat) {
      const interval = heartbeat.interval ?? DEFAULT_HEARTBEAT_INTERVAL;
      const timeout = heartbeat.timeout ?? DEFAULT_HEARTBEAT_TIMEOUT;
      if (timeout <= interval) {
        this.logger.warn(
          `heartbeat.timeout (${timeout}ms) 必须大于 interval (${interval}ms)，已禁用心跳`,
        );
        this.heartbeatOptions = null;
      } else {
        this.heartbeatOptions = { interval, timeout };
      }
    } else {
      this.heartbeatOptions = null;
    }
  }

  /** 通道是否已完成握手并绑定 MessagePort */
  get connected(): boolean {
    return this.port !== null;
  }

  /**
   * 向对端发消息。握手完成前自动入队，握手后立即通过 port 投递。
   */
  send<T>(payload: T): void {
    if (this.disposed) {
      this.logger.warn('send() 调用无效：channel 已销毁');
      return;
    }
    const envelope: PortEnvelope<T> = { payload };
    if (this.port) {
      this.logger.log(`Message sent → ${this.peerLabel}`);
      this.port.postMessage(envelope);
      this.lastSentAt = Date.now();
    } else {
      this.pendingQueue.push(envelope);
      this.logger.log(
        `Message queued (handshake pending), queue size: ${this.pendingQueue.length}`,
      );
    }
  }

  /**
   * 向对端发起请求，等待 ResponseEnvelope。握手前的请求自动入队。
   *
   * @param payload 请求负载，需可 structuredClone
   * @param options 请求选项（超时等）
   * @returns 对端 handler 返回的结果 Promise
   * @throws `Error` 超时、对端 handler 抛错、通道销毁或连接断开时 reject
   */
  request<Req, Res>(payload: Req, options: RequestOptions = {}): Promise<Res> {
    if (this.disposed) {
      return Promise.reject(new Error('[SDK] request() 调用无效：channel 已销毁'));
    }
    const reqId = this._genReqId();
    const timeoutMs = options.timeout ?? DEFAULT_REQUEST_TIMEOUT;
    return new Promise<Res>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.delete(reqId)) {
          reject(new Error(`[SDK] request "${reqId}" 超时（${timeoutMs}ms）`));
        }
      }, timeoutMs);
      this.pendingRequests.set(reqId, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });
      const envelope: RequestEnvelope<Req> = { __req: true, reqId, payload };
      if (this.port) {
        this.logger.log(`Request sent → ${this.peerLabel} (reqId: ${reqId})`);
        this.port.postMessage(envelope);
        this.lastSentAt = Date.now();
      } else {
        this.pendingQueue.push(envelope);
        this.logger.log(
          `Request queued (handshake pending), reqId: ${reqId}, queue size: ${this.pendingQueue.length}`,
        );
      }
    });
  }

  /**
   * 注册消息处理器，返回取消该监听的函数。可多次调用注册多个 handler。
   */
  onMessage<T>(handler: MessageHandler<T>): () => void {
    if (this.disposed) {
      this.logger.warn('onMessage() 调用无效：channel 已销毁');
      return () => {};
    }
    this.handlers.push(handler as MessageHandler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  /**
   * 注册请求处理器。每个通道最多一个 handler，重复注册会覆盖并告警。
   * 返回取消注册的函数。
   *
   * handler 可返回同步值或 Promise；
   * 抛出的任何异常都会序列化为 error 响应回发给请求方。
   */
  onRequest<Req, Res>(handler: RequestHandler<Req, Res>): () => void {
    if (this.disposed) {
      this.logger.warn('onRequest() 调用无效：channel 已销毁');
      return () => {};
    }
    if (this.requestHandler) {
      this.logger.warn('onRequest() 覆盖了已存在的 handler');
    }
    this.requestHandler = handler as RequestHandler;
    return () => {
      if (this.requestHandler === handler) {
        this.requestHandler = null;
      }
    };
  }

  /**
   * 注册连接建立回调。首次握手成功和每次重连成功都会触发。
   * 返回取消订阅的函数。
   */
  onConnect(handler: () => void): () => void {
    if (this.disposed) {
      this.logger.warn('onConnect() 调用无效：channel 已销毁');
      return () => {};
    }
    this.connectListeners.push(handler);
    return () => {
      this.connectListeners = this.connectListeners.filter((h) => h !== handler);
    };
  }

  /**
   * 注册断连回调。当心跳超时判定对端不可达时触发，参数为断连原因。
   * 正常的 dispose 不会触发此回调。
   *
   * 返回取消订阅的函数。
   */
  onDisconnect(handler: (reason: DisconnectReason) => void): () => void {
    if (this.disposed) {
      this.logger.warn('onDisconnect() 调用无效：channel 已销毁');
      return () => {};
    }
    this.disconnectListeners.push(handler);
    return () => {
      this.disconnectListeners = this.disconnectListeners.filter((h) => h !== handler);
    };
  }

  /**
   * 销毁频道：关闭 MessagePort、停止心跳、移除 window 监听器、清空所有订阅、
   * 并 reject 所有 pending 请求。幂等。
   */
  dispose(): void {
    if (this.disposed) return;
    this._stopHeartbeat();
    this._rejectAllPending('channel disposed');
    if (this.windowListener) {
      window.removeEventListener('message', this.windowListener);
      this.windowListener = null;
    }
    this.port?.close();
    this.port = null;
    this.peerOrigin = null;
    this.pendingQueue = [];
    this.handlers = [];
    this.connectListeners = [];
    this.disconnectListeners = [];
    this.requestHandler = null;
    this.disposed = true;
    this.logger.log('Channel disposed');
  }

  // ---- 子类协议 ----

  /**
   * 握手完成后由子类调用：挂 onmessage、flush 队列、触发 onConnect、启动心跳（若启用）。
   * 调用前必须已设置 {@link peerOrigin}。
   * 注：赋值 onmessage 会隐式启用 port，无需再显式调用 port.start()。
   */
  protected _bindPort(port: MessagePort): void {
    this.port = port;
    port.onmessage = (event: MessageEvent) => this._dispatchMessage(event.data);
    this._flush();
    this._startHeartbeat();
    this._emitConnect();
  }

  /**
   * 关闭当前连接：停止心跳、close port、清空 peerOrigin、
   * reject 通过旧 port 已发出的 pending 请求。
   *
   * 注意：只有在 port 已绑定（即真正存在过一次连接）时才 reject pending 请求。
   * 若此前从未握手过，pending 请求仍在 pendingQueue 里等待 flush，不应被 reject。
   *
   * 保留 handlers / connectListeners / disconnectListeners / requestHandler，供重新握手后继续使用。
   */
  protected _closeConnection(): void {
    this._stopHeartbeat();
    if (this.port) {
      this._rejectAllPending('connection closed');
      this.port.close();
    }
    this.port = null;
    this.peerOrigin = null;
  }

  // ---- 内部方法 ----

  private _dispatchMessage(data: unknown): void {
    // 任何来自对端的消息都视为对端存活
    this.lastRecvAt = Date.now();

    if (isHeartbeatEnvelope(data)) {
      this._handleIncomingHeartbeat(data);
      return;
    }
    if (isRequestEnvelope(data)) {
      void this._handleIncomingRequest(data);
      return;
    }
    if (isResponseEnvelope(data)) {
      this._handleIncomingResponse(data);
      return;
    }
    // 默认作为普通 message 处理
    const envelope = data as PortEnvelope<unknown>;
    const source: MessageSource = { origin: this.peerOrigin!, appId: this.core.appId };
    this.logger.log(`Message received ← ${this.peerLabel}`);
    for (const handler of this.handlers) {
      handler(envelope.payload, source);
    }
  }

  private _handleIncomingHeartbeat(env: HeartbeatEnvelope): void {
    if (env.__hb === 'ping') {
      // 立即回 pong；pong 本身不需要处理（lastRecvAt 已在 _dispatchMessage 里刷新）
      const pong: HeartbeatEnvelope = { __hb: 'pong' };
      this.port?.postMessage(pong);
      this.lastSentAt = Date.now();
    }
  }

  /** 启动心跳定时器；若未配置则 no-op */
  private _startHeartbeat(): void {
    const opts = this.heartbeatOptions;
    if (!opts) return;
    this.lastRecvAt = Date.now();
    this.lastSentAt = Date.now();
    this.heartbeatTimer = setInterval(() => this._tickHeartbeat(), opts.interval);
  }

  /** 停止心跳定时器（在 dispose / _closeConnection 中调用） */
  private _stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private _tickHeartbeat(): void {
    const opts = this.heartbeatOptions;
    if (!opts || this.disposed || !this.port) return;
    const now = Date.now();

    // 1. 判定断连
    if (now - this.lastRecvAt > opts.timeout) {
      this.logger.warn(
        `heartbeat timeout: no message from ${this.peerLabel} for ${now - this.lastRecvAt}ms`,
      );
      this._emitDisconnect('heartbeat-timeout');
      this._closeConnection();
      return;
    }

    // 2. piggyback：刚发过业务消息就跳过这轮 ping
    if (now - this.lastSentAt < opts.interval) return;

    // 3. 发 ping
    const ping: HeartbeatEnvelope = { __hb: 'ping' };
    this.port.postMessage(ping);
    this.lastSentAt = now;
  }

  private _emitDisconnect(reason: DisconnectReason): void {
    for (const cb of this.disconnectListeners) {
      try {
        cb(reason);
      } catch (err) {
        this.logger.warn('onDisconnect callback threw', err);
      }
    }
  }

  private async _handleIncomingRequest(req: RequestEnvelope): Promise<void> {
    const handler = this.requestHandler;
    const source: MessageSource = { origin: this.peerOrigin!, appId: this.core.appId };
    this.logger.log(`Request received ← ${this.peerLabel} (reqId: ${req.reqId})`);
    if (!handler) {
      this._replyError(req.reqId, 'No request handler registered');
      return;
    }
    try {
      const result = await handler(req.payload, source);
      this._replyOk(req.reqId, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._replyError(req.reqId, message);
    }
  }

  private _handleIncomingResponse(res: ResponseEnvelope): void {
    const pending = this.pendingRequests.get(res.reqId);
    if (!pending) {
      // 对应的 request 可能已超时或通道已关闭 — 静默忽略即可
      this.logger.log(`Ignoring response for unknown reqId: ${res.reqId}`);
      return;
    }
    this.pendingRequests.delete(res.reqId);
    clearTimeout(pending.timer);
    if (res.ok) {
      pending.resolve(res.payload);
    } else {
      pending.reject(new Error(`[SDK] remote error: ${res.error}`));
    }
  }

  private _replyOk(reqId: string, payload: unknown): void {
    if (!this.port) return;
    const envelope: ResponseEnvelopeOk = { __res: true, reqId, ok: true, payload };
    this.port.postMessage(envelope);
  }

  private _replyError(reqId: string, error: string): void {
    if (!this.port) return;
    const envelope: ResponseEnvelopeErr = { __res: true, reqId, ok: false, error };
    this.port.postMessage(envelope);
  }

  private _rejectAllPending(reason: string): void {
    if (this.pendingRequests.size === 0) return;
    for (const [reqId, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`[SDK] request "${reqId}" aborted: ${reason}`));
    }
    this.pendingRequests.clear();
  }

  private _emitConnect(): void {
    for (const cb of this.connectListeners) {
      try {
        cb();
      } catch (err) {
        this.logger.warn('onConnect callback threw', err);
      }
    }
  }

  private _flush(): void {
    const queue = this.pendingQueue.splice(0);
    if (queue.length === 0) return;
    this.logger.log(`Flushing ${queue.length} queued messages`);
    for (const envelope of queue) {
      this.port!.postMessage(envelope);
    }
  }

  /** 生成进程内唯一的 reqId。组合时间戳和自增序号，避免 crypto API 依赖。 */
  private _genReqId(): string {
    this.reqSeq = (this.reqSeq + 1) >>> 0;
    return `${Date.now().toString(36)}-${this.reqSeq.toString(36)}`;
  }
}
