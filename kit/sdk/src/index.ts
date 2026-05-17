export { createSDK } from './core/sdk.js';
export type { SDK } from './core/sdk.js';
export type { SDKOptions } from './core/types.js';
export type {
  MessageSource,
  MessageHandler,
  RequestHandler,
  RequestOptions,
  HeartbeatOptions,
  DisconnectReason,
  HostChannelOptions,
  GuestChannelOptions,
} from './cross-window/types.js';
export type { HostChannel, WindowTarget } from './cross-window/host-channel.js';
export type { GuestChannel } from './cross-window/guest-channel.js';
export { CrossWindowModule } from './cross-window/module.js';
