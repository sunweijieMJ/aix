import { describe, expect, it } from 'vitest';
import { createSDK, SDKCore } from '../../src/core/sdk.js';

describe('createSDK', () => {
  it('appId 为空时应抛出错误', () => {
    expect(() => createSDK({ appId: '' })).toThrow('[SDK] appId is required');
  });

  it('appId 有效时应正常初始化', () => {
    const sdk = createSDK({ appId: 'test-app' });
    expect(sdk).toBeDefined();
    expect(sdk.iframe).toBeDefined();
  });

  it('debug 默认为 false', () => {
    const core = new SDKCore({ appId: 'test-app' });
    expect(core.debug).toBe(false);
  });
});
