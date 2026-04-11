export { createSDK } from './core/sdk.js';
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
} from './iframe/types.js';
export type { HostChannel, WindowTarget } from './iframe/host-channel.js';
export type { GuestChannel } from './iframe/guest-channel.js';
