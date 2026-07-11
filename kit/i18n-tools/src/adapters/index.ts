import type { ResolvedConfig } from '../config';
import { FrameworkAdapter } from './FrameworkAdapter';
import { ReactAdapter, type ReactAdapterOptions } from './ReactAdapter';
import { VueAdapter, type VueAdapterOptions } from './VueAdapter';
import { createVueI18nLibrary, type VueI18nLibraryType } from '../strategies/vue/libraries';
import { createReactI18nLibrary, type ReactI18nLibraryType } from '../strategies/react/libraries';

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
 * 当前支持的框架类型枚举——本文件唯一权威来源。
 *
 * `createFrameworkAdapter`（构建完整适配器）与 `resolveUsesDoubleBracePlaceholders`
 * （仅解析占位符语法）各自需要按 `framework.type` 构造不同种类的对象（前者是
 * ReactAdapter/VueAdapter 实例，后者是裸 library 实例），无法合并成一份 switch，
 * 但两者覆盖的框架集合必须保持一致。新增框架时：两处 switch 都要加 case，
 * 且都应加进这个数组，唯一权威来源与 default 分支的错误信息用它，减少漏改。
 */
const SUPPORTED_FRAMEWORK_TYPES = ['vue', 'react'] as const;

/**
 * 根据已解析的配置创建对应的框架适配器。
 *
 * 这是 core 层与具体适配器之间的唯一耦合点；新增框架时只需在此扩展 switch
 * 分支并提供新的 Adapter 实现，BaseProcessor 与所有 Processor 子类不需改动。
 * 新增 case 时请同步检查 resolveUsesDoubleBracePlaceholders（见 SUPPORTED_FRAMEWORK_TYPES 注释）。
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
      throw new Error(
        `不支持的框架: ${config.framework.type}（支持：${SUPPORTED_FRAMEWORK_TYPES.join(' / ')}）`,
      );
    }
  }
}

/**
 * 仅解析当前配置对应 i18n 库的插值占位符语法（双花括号 `{{name}}` 或单花括号
 * `{name}`），不构建完整适配器。
 *
 * 供不需要 AST 处理能力的处理器（如 TranslateProcessor：只读写 locale JSON、
 * 调 LLM，不解析/改写源代码）使用，避免为了这一个布尔标志付出构建
 * TextExtractor / Transformer / ComponentInjector 等整条链路的代价——
 * BaseProcessor 明确约定只有真正需要解析源码的处理器才应持有完整 adapter。
 * 新增 case 时请同步检查 createFrameworkAdapter（见 SUPPORTED_FRAMEWORK_TYPES 注释）。
 */
export function resolveUsesDoubleBracePlaceholders(
  framework: ResolvedConfig['framework'],
): boolean {
  switch (framework.type) {
    case 'vue':
      return createVueI18nLibrary(framework.library as VueI18nLibraryType)
        .usesDoubleBracePlaceholders;
    case 'react':
      return createReactI18nLibrary(framework.library as ReactI18nLibraryType)
        .usesDoubleBracePlaceholders;
    default: {
      throw new Error(
        `不支持的框架: ${framework.type}（支持：${SUPPORTED_FRAMEWORK_TYPES.join(' / ')}）`,
      );
    }
  }
}
