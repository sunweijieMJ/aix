/**
 * 基准图提供器模块
 *
 * 根据配置自动选择合适的提供器。
 * 支持按 variant source type 动态路由到对应 provider。
 */

import type { VisualTestConfig } from '../config/schema';
import { FigmaMcpProvider } from './figma-mcp-provider';
import { LocalProvider } from './local-provider';
import type {
  BaselineProvider,
  BaselineSource,
  BaselineSourceType,
  FetchBaselineOptions,
  BaselineResult,
} from './types';

/**
 * 根据配置创建基准图提供器
 *
 * 返回的 provider 会根据每个 variant 的 source type 自动路由到对应 provider，
 * 支持同一项目中混用 local 和 figma-mcp 基准图。
 */
export function createBaselineProvider(
  config: VisualTestConfig,
): BaselineProvider {
  return new RoutingBaselineProvider(config);
}

/**
 * 路由型 BaselineProvider
 *
 * 根据 fetch 请求中 source 的类型动态选择底层 provider。
 * 延迟创建 provider 实例，避免不必要的初始化。
 */
class RoutingBaselineProvider implements BaselineProvider {
  readonly name = 'routing';

  private providers = new Map<BaselineSourceType, BaselineProvider>();
  private config: VisualTestConfig;
  private defaultType: BaselineSourceType;

  constructor(config: VisualTestConfig) {
    this.config = config;
    this.defaultType = config.baseline.provider;
  }

  async fetch(options: FetchBaselineOptions): Promise<BaselineResult> {
    const providerType = this.resolveProviderType(options.source);
    const provider = this.getOrCreateProvider(providerType);
    return provider.fetch(options);
  }

  async exists(source: string | BaselineSource): Promise<boolean> {
    const providerType = this.resolveProviderType(source);
    const provider = this.getOrCreateProvider(providerType);
    return provider.exists?.(source) ?? false;
  }

  async dispose(): Promise<void> {
    for (const provider of this.providers.values()) {
      await provider.dispose?.();
    }
    this.providers.clear();
  }

  private resolveProviderType(
    source: string | BaselineSource,
  ): BaselineSourceType {
    if (typeof source === 'object' && source.type) {
      return source.type;
    }
    return this.defaultType;
  }

  private getOrCreateProvider(type: BaselineSourceType): BaselineProvider {
    if (!this.providers.has(type)) {
      this.providers.set(type, createProviderByType(type, this.config));
    }
    return this.providers.get(type)!;
  }
}

/**
 * 根据来源类型创建对应的提供器（内部使用）
 */
function createProviderByType(
  type: BaselineSourceType,
  config: VisualTestConfig,
): BaselineProvider {
  switch (type) {
    case 'local':
      return new LocalProvider(config.directories.baselines);

    case 'figma-mcp':
      return new FigmaMcpProvider({
        fileKey: config.baseline.figma?.fileKey,
      });

    default:
      throw new Error(`Unknown baseline provider type: ${type}`);
  }
}

// 导出类型
export type {
  BaselineMetadata,
  BaselineProvider,
  BaselineResult,
  BaselineSource,
  BaselineSourceType,
  FetchBaselineOptions,
} from './types';
