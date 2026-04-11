import type { SDKOptions } from './types.js';
import { IframeModule } from '../iframe/module.js';

/**
 * SDK 内部核心状态容器。
 *
 * 承载应用级配置（appId、debug），作为依赖注入对象向下传给各个模块。
 * 用户不直接构造此类，应通过 {@link createSDK} 工厂函数获取。
 */
export class SDKCore {
  /** 应用唯一标识，用于握手阶段过滤消息 */
  readonly appId: string;
  /** 是否开启 SDK 内部调试日志 */
  readonly debug: boolean;

  /**
   * @param options SDK 初始化配置
   * @throws 当 `options.appId` 为空时抛出
   */
  constructor(options: SDKOptions) {
    if (!options.appId) throw new Error('[SDK] appId is required');
    this.appId = options.appId;
    this.debug = options.debug ?? false;
  }
}

/**
 * 创建 SDK 实例。
 *
 * 返回值是按模块组织的对象，目前暴露 `iframe` 模块，后续会按需扩展更多模块。
 *
 * @param options SDK 初始化配置
 * @returns SDK 实例对象
 * @example
 * ```ts
 * const sdk = createSDK({ appId: 'my-app', debug: true });
 * const channel = sdk.iframe.asHost(iframeElement);
 * ```
 */
export function createSDK(options: SDKOptions) {
  const core = new SDKCore(options);
  return {
    iframe: new IframeModule(core),
  };
}
