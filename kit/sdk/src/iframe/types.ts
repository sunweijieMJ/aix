/** 握手阶段系统消息类型 */
export type SystemMessageType = 'sdk:ready' | 'sdk:ack';

/** 握手阶段信封（window.postMessage，握手完成后不再使用） */
export interface HandshakeEnvelope {
  __sdk: '@kit/sdk';
  appId: string;
  __sys: SystemMessageType;
}

/**
 * HandshakeEnvelope 运行时类型守卫：
 * 同时校验消息结构、期望的 __sys 与本地 appId，过滤掉所有不属于当前 SDK/应用的消息。
 */
export function isHandshakeEnvelope(
  data: unknown,
  sys: SystemMessageType,
  appId: string,
): data is HandshakeEnvelope {
  if (!data || typeof data !== 'object') return false;
  const env = data as Partial<HandshakeEnvelope>;
  return env.__sdk === '@kit/sdk' && env.__sys === sys && env.appId === appId;
}

/** 通道建立后的普通消息信封（MessagePort，用户不感知） */
export interface PortEnvelope<T = unknown> {
  payload: T;
}

/** 请求信封：request() 生成的消息，期待对端回复 ResponseEnvelope */
export interface RequestEnvelope<T = unknown> {
  __req: true;
  reqId: string;
  payload: T;
}

/** 成功响应信封 */
export interface ResponseEnvelopeOk<T = unknown> {
  __res: true;
  reqId: string;
  ok: true;
  payload: T;
}

/** 失败响应信封（远端 handler 抛错或未注册 handler） */
export interface ResponseEnvelopeErr {
  __res: true;
  reqId: string;
  ok: false;
  error: string;
}

export type ResponseEnvelope<T = unknown> = ResponseEnvelopeOk<T> | ResponseEnvelopeErr;

/** RequestEnvelope 运行时类型守卫 */
export function isRequestEnvelope(data: unknown): data is RequestEnvelope {
  if (!data || typeof data !== 'object') return false;
  const env = data as Partial<RequestEnvelope>;
  return env.__req === true && typeof env.reqId === 'string';
}

/** ResponseEnvelope 运行时类型守卫 */
export function isResponseEnvelope(data: unknown): data is ResponseEnvelope {
  if (!data || typeof data !== 'object') return false;
  const env = data as Partial<ResponseEnvelopeOk>;
  return env.__res === true && typeof env.reqId === 'string';
}

/** 消息来源（用户 handler 透传） */
export interface MessageSource {
  /** 握手时确认的对端 origin */
  origin: string;
  /**
   * 应用 id。握手过程已校验两端 appId 相等，
   * 故此字段恒等于本地 SDKOptions.appId，仅用于在多实例场景下归属识别。
   */
  appId: string;
}

/** 通道消息处理器签名（用于 onMessage） */
export type MessageHandler<T = unknown> = (payload: T, source: MessageSource) => void;

/**
 * 请求处理器签名（用于 onRequest）。
 * 可返回同步值或 Promise；抛出异常会作为 error 响应回发给请求方。
 */
export type RequestHandler<Req = unknown, Res = unknown> = (
  req: Req,
  source: MessageSource,
) => Res | Promise<Res>;

/** request() 调用选项 */
export interface RequestOptions {
  /** 请求超时时间（毫秒），默认 10000 */
  timeout?: number;
}

/**
 * 心跳信封。通道绑定 port 后发送 ping、收到 ping 立即回 pong。
 * 纯内部类型，用户不感知。
 */
export interface HeartbeatEnvelope {
  __hb: 'ping' | 'pong';
}

/** HeartbeatEnvelope 运行时类型守卫 */
export function isHeartbeatEnvelope(data: unknown): data is HeartbeatEnvelope {
  if (!data || typeof data !== 'object') return false;
  const env = data as Partial<HeartbeatEnvelope>;
  return env.__hb === 'ping' || env.__hb === 'pong';
}

/**
 * 心跳 / 断连检测配置。**opt-in**：不传则不启用心跳，通道行为与旧版一致。
 *
 * 工作原理：
 * - 每隔 `interval` ms 向对端发一次 ping（若最近刚发过业务消息则跳过）
 * - 收到任何对端消息都视为对端存活，刷新最后活动时间戳
 * - 超过 `timeout` ms 未收到任何对端消息则判定为断连，触发 onDisconnect('heartbeat-timeout')
 *   并主动关闭 port
 */
export interface HeartbeatOptions {
  /** 心跳间隔（毫秒），默认 5000 */
  interval?: number;
  /** 判定为断连的超时时间（毫秒），必须大于 interval。默认 15000 */
  timeout?: number;
}

/** 断连原因 */
export type DisconnectReason = 'heartbeat-timeout';

/** Host 侧频道配置 */
export interface HostChannelOptions {
  /** 允许握手的 guest origin 白名单，不传则接受所有来源 */
  allowedOrigins?: string[];
  /**
   * guest 页面重载后重新握手完成时触发。
   * 注意：同时注册的 onConnect 也会在重连时触发，二者可独立订阅。
   */
  onReconnect?: () => void;
  /** 心跳 / 断连检测配置。不传则不启用 */
  heartbeat?: HeartbeatOptions;
}

/** Guest 侧频道配置 */
export interface GuestChannelOptions {
  /** 心跳 / 断连检测配置。不传则不启用 */
  heartbeat?: HeartbeatOptions;
}
