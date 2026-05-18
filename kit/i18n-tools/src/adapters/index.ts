import type { ResolvedConfig } from '../config';
import { FrameworkAdapter } from './FrameworkAdapter';
import { ReactAdapter, type ReactAdapterOptions } from './ReactAdapter';
import { VueAdapter, type VueAdapterOptions } from './VueAdapter';
import type { VueI18nLibraryType } from '../strategies/vue/libraries';
import type { ReactI18nLibraryType } from '../strategies/react/libraries';

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
  const filterPatterns = config.extract.filterPatterns;
  const tImport = config.framework.tImport;
  switch (config.framework.type) {
    case 'vue': {
      const options: VueAdapterOptions = {
        namespace: config.framework.namespace || undefined,
        filterPatterns,
      };
      return new VueAdapter(tImport, config.framework.library as VueI18nLibraryType, options);
    }
    case 'react': {
      const options: ReactAdapterOptions = {
        namespace: config.framework.namespace || undefined,
        includeDefaultMessage: config.framework.includeDefaultMessage,
        filterPatterns,
      };
      return new ReactAdapter(tImport, config.framework.library as ReactI18nLibraryType, options);
    }
    default: {
      throw new Error(`不支持的框架: ${config.framework.type}`);
    }
  }
}
