import type { ResolvedConfig } from '../config';
import { FrameworkAdapter } from './FrameworkAdapter';
import { ReactAdapter, type ReactAdapterOptions } from './ReactAdapter';
import { VueAdapter, type VueAdapterOptions } from './VueAdapter';

export { FrameworkAdapter } from './FrameworkAdapter';
export { ReactAdapter, type ReactAdapterOptions } from './ReactAdapter';
export { VueAdapter, type VueAdapterOptions } from './VueAdapter';
export type {
  FrameworkConfig,
  ITextExtractor,
  ITransformer,
  IRestoreTransformer,
  IComponentInjector,
  IImportManager,
} from './FrameworkAdapter';

/**
 * 根据已解析的配置创建对应的框架适配器。
 *
 * 这是 core 层与具体适配器之间的唯一耦合点；新增框架时只需在此扩展 switch
 * 分支并提供新的 Adapter 实现，BaseProcessor 与所有 Processor 子类不需改动。
 */
export function createFrameworkAdapter(config: ResolvedConfig): FrameworkAdapter {
  const rejectPatterns = config.extraction.rejectPatterns;
  switch (config.framework) {
    case 'vue': {
      const options: VueAdapterOptions = {
        namespace: config.vue.namespace || undefined,
        rejectPatterns,
      };
      return new VueAdapter(config.paths.tImport, config.vue.library, options);
    }
    case 'react': {
      const options: ReactAdapterOptions = {
        namespace: config.react.namespace || undefined,
        includeDefaultMessage: config.react.includeDefaultMessage,
        rejectPatterns,
      };
      return new ReactAdapter(config.paths.tImport, config.react.library, options);
    }
    default: {
      const exhaustive: never = config.framework;
      throw new Error(`不支持的框架: ${exhaustive}`);
    }
  }
}
