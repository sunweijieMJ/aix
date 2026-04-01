/**
 * 平台适配器工厂和统一导出
 */

import type { Platform } from '../types/index.js';
import type { PlatformAdapter } from './types.js';
import { GitHubAdapter } from './github-adapter.js';

/**
 * 根据平台类型创建对应的适配器实例
 */
export function createPlatformAdapter(platform: Platform): PlatformAdapter {
  switch (platform) {
    case 'github':
      return new GitHubAdapter();
    default: {
      const _exhaustive: never = platform;
      throw new Error(`不支持的平台: ${_exhaustive}`);
    }
  }
}

export type { PlatformAdapter } from './types.js';
export { GitHubAdapter } from './github-adapter.js';
