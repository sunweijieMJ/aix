import type { SDKCore } from '../core/sdk.js';
import { HostChannel } from './host-channel.js';
import { GuestChannel } from './guest-channel.js';
import type { GuestChannelOptions, HostChannelOptions } from './types.js';
import type { WindowTarget } from './host-channel.js';

/**
 * Iframe 通信模块入口。
 *
 * 根据调用方在握手中的角色暴露两个工厂方法：
 * - {@link IframeModule.asHost} 主页面使用，持有目标窗口引用
 * - {@link IframeModule.asGuest} 被嵌入/被打开的页面使用
 *
 * 模块实例由 {@link createSDK} 创建并注入，用户无需直接实例化。
 */
export class IframeModule {
  /**
   * @param core SDK 内部状态容器（依赖注入）
   */
  constructor(private readonly core: SDKCore) {}

  /**
   * Host 侧使用：创建与目标窗口的通信频道。
   * 支持 iframe（HTMLIFrameElement）和 window.open() 打开的新窗口（Window）。
   * 自动等待 sdk:ready 握手，握手后建立私有 MessageChannel。
   * 支持 guest 页面重载后自动重新握手。
   *
   * @param target iframe 元素或 window.open() 的返回值
   * @param options 可选配置，包括 origin 白名单和重连回调
   * @returns 可用于收发消息的 HostChannel 实例
   */
  asHost(target: WindowTarget, options?: HostChannelOptions): HostChannel {
    return new HostChannel(this.core, target, options);
  }

  /**
   * Guest 侧使用：创建与 host 页面的通信频道。
   * 适用于 iframe 内页面和 window.open() 打开的页面。
   * 创建后调用 {@link GuestChannel.ready} 触发握手流程。
   *
   * @param options 可选配置（心跳等）
   * @returns 可用于收发消息的 GuestChannel 实例
   */
  asGuest(options?: GuestChannelOptions): GuestChannel {
    return new GuestChannel(this.core, options);
  }
}
