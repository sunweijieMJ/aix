import type { SDKOptions } from './types.js';
import { IframeModule } from '../iframe/module.js';

export class SDKCore {
  readonly appId: string;
  readonly debug: boolean;

  constructor(options: SDKOptions) {
    if (!options.appId) throw new Error('[SDK] appId is required');
    this.appId = options.appId;
    this.debug = options.debug ?? false;
  }
}

export function createSDK(options: SDKOptions) {
  const core = new SDKCore(options);
  return {
    iframe: new IframeModule(core),
  };
}
