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
  /**
   * 远端 onRequest 显式返回 `{ ok: false, retryable: true }` 时设为 true，
   * SDK 据此触发自动重试。handler 抛出异常时此字段为 false（异常不可重试）。
   */
  retryable?: boolean;
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
  /** 单次请求超时时间（毫秒），默认 10000。retry 启用时每次重试独立计时。 */
  timeout?: number;
  /**
   * 失败重试次数。0 表示不重试（默认）。
   * 可重试的失败：① 单次超时 ② 远端 onRequest 返回 `{ ok: false, retryable: true }`。
   * 不可重试：① 远端 handler 抛异常 ② 通道已 dispose ③ 远端响应 `retryable: false / 不带该字段`。
   */
  retry?: number;
  /**
   * 每次重试前的退避（毫秒）。可传固定数字或函数 `(attempt) => delay`。
   * `attempt` 从 1 开始（第 1 次重试前调用）。默认 0（立即重试）。
   */
  retryBackoff?: number | ((attempt: number) => number);
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

/**
 * 断连原因：
 * - `heartbeat-timeout`：心跳超时，对端无响应
 * - `peer-reconnect`：对端重新握手（Host 侧旧连接被替换为新连接时触发）
 * - `handshake-timeout`：Host 启用 handshakeTimeout 后超时仍未收到 guest 握手
 * - `handshake-failed`：Host 向 guest 投递 sdk:ack 时 postMessage 抛出异常（如目标窗口已关闭）
 */
export type DisconnectReason =
  | 'heartbeat-timeout'
  | 'peer-reconnect'
  | 'handshake-timeout'
  | 'handshake-failed';

/**
 * onConnect 回调事件参数。
 * - reconnected=false：首次握手成功
 * - reconnected=true：对端重载后重新握手成功（host 侧 guest 重载、guest 侧不触发，由 _bindPort 传入）
 */
export interface ChannelConnectEvent {
  reconnected: boolean;
}

/** Host 侧频道配置 */
export interface HostChannelOptions {
  /** 允许握手的 guest origin 白名单，不传则接受所有来源 */
  allowedOrigins?: string[];
  /**
   * 握手超时阈值（ms）。
   * 未设置或 <=0 时不启用。超时后触发 onDisconnect('handshake-timeout')。
   * 仅首次握手计入，握手成功后该定时器立即清除，重连不再启动。
   */
  handshakeTimeout?: number;
  /** 心跳 / 断连检测配置。不传则不启用 */
  heartbeat?: HeartbeatOptions;
}

/** Guest 侧频道配置 */
export interface GuestChannelOptions {
  /**
   * host 页面的 origin。生产环境强烈建议明确指定。语法与 host 侧 allowedOrigins 对称：
   * - 精确 origin：`'https://host.example.com'`（最严格，推荐）
   * - glob 通配：`'https://*.example.com'`（`*` 不跨 `/`）
   * - 数组：`['https://a.example.com', 'https://*.example.com']`（任一命中即通过）
   * - `'*'` 或未传：跳过 origin 校验，仅推荐用于开发环境。
   *
   * 注意：发送 sdk:ready 时的 postMessage targetOrigin 仅在"单条精确 origin"时使用该值，
   * 其它情况（含通配/多条/'*'）会降级为 '*'；ready 包不含敏感数据，host 端有 allowedOrigins 反向校验。
   */
  expectedHostOrigin?: string | string[];
  /**
   * 构造完是否自动通过 microtask 发起握手。默认 true。
   * 仅在需要延迟握手（例如等待外部数据准备好再握手）的特殊场景设为 false。
   */
  autoReady?: boolean;
  /** 心跳 / 断连检测配置。不传则不启用 */
  heartbeat?: HeartbeatOptions;
}
