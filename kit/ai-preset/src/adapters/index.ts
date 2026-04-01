/**
 * 平台适配器工厂
 */

import type { AIPlatform, PlatformAdapter } from '../types.js';
import { ClaudeAdapter } from './claude.js';
import { CursorAdapter } from './cursor.js';
import { CopilotAdapter } from './copilot.js';
import { CodexAdapter } from './codex.js';
import { WindsurfAdapter } from './windsurf.js';
import { TraeAdapter } from './trae.js';
import { TongyiAdapter } from './tongyi.js';
import { QoderAdapter } from './qoder.js';
import { GeminiAdapter } from './gemini.js';

/** 已实现的适配器注册表 */
const ADAPTER_MAP: Partial<Record<AIPlatform, new () => PlatformAdapter>> = {
  claude: ClaudeAdapter,
  cursor: CursorAdapter,
  copilot: CopilotAdapter,
  codex: CodexAdapter,
  windsurf: WindsurfAdapter,
  trae: TraeAdapter,
  tongyi: TongyiAdapter,
  qoder: QoderAdapter,
  gemini: GeminiAdapter,
};

/**
 * 创建平台适配器实例
 *
 * @throws 当平台适配器尚未实现时抛出错误
 */
export function createAdapter(platform: AIPlatform): PlatformAdapter {
  const AdapterClass = ADAPTER_MAP[platform];
  if (!AdapterClass) {
    throw new Error(
      `平台 "${platform}" 的适配器尚未实现。` +
        `当前可用: ${Object.keys(ADAPTER_MAP).join(', ')}`,
    );
  }
  return new AdapterClass();
}

/** 获取所有已实现的适配器平台列表 */
export function getAvailablePlatforms(): AIPlatform[] {
  return Object.keys(ADAPTER_MAP) as AIPlatform[];
}

export { ClaudeAdapter } from './claude.js';
export { CursorAdapter } from './cursor.js';
export { CopilotAdapter } from './copilot.js';
export { CodexAdapter } from './codex.js';
export { WindsurfAdapter } from './windsurf.js';
export { TraeAdapter } from './trae.js';
export { TongyiAdapter } from './tongyi.js';
export { QoderAdapter } from './qoder.js';
export { GeminiAdapter } from './gemini.js';
