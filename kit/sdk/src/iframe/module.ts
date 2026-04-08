import type { SDKCore } from '../core/sdk.js';
import { IframeSender } from './sender.js';
import { IframeReceiver } from './receiver.js';
import type { ReceiverOptions } from './types.js';

export class IframeModule {
  constructor(private readonly core: SDKCore) {}

  createSender(): IframeSender {
    return new IframeSender(this.core);
  }

  createReceiver(options?: ReceiverOptions): IframeReceiver {
    return new IframeReceiver(this.core, options);
  }
}
