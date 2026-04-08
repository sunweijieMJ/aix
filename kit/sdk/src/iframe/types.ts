/** 消息信封（内部使用，用户不感知） */
export interface IframeEnvelope<T = unknown> {
  __sdk: '@kit/sdk';
  appId: string;
  payload: T;
}

/** 消息来源（接收方 handler 中透传） */
export interface MessageSource {
  origin: string;
  appId: string;
}

/** 接收方配置 */
export interface ReceiverOptions {
  /** 允许接收消息的 origin 白名单，不传则接受所有来源 */
  allowedOrigins?: string[];
}
