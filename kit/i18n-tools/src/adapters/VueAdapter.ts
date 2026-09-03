import { FrameworkAdapter } from './FrameworkAdapter';
import type {
  ITextExtractor,
  ITransformer,
  IRestoreTransformer,
  IComponentInjector,
} from './FrameworkAdapter';
import {
  VueTextExtractor,
  VueTransformer,
  VueRestoreTransformer,
  VueComponentInjector,
  VueImportManager,
} from '../strategies/vue';
import type { VueI18nLibraryType } from '../strategies/vue/libraries';
import { createVueI18nLibrary } from '../strategies/vue/libraries';

export interface VueAdapterOptions {
  namespace?: string;
  /** 业务侧 config.extract.filterPatterns，由工厂从 ResolvedConfig 透传 */
  filterPatterns?: readonly RegExp[];
}

/**
 * Vue 框架适配器
 * 提供 Vue 项目的 i18n 处理实现
 *
 * 集中组装所有协作对象，作为依赖注入容器；策略对象之间的依赖关系完全在此处声明。
 */
export class VueAdapter extends FrameworkAdapter {
  private textExtractor: VueTextExtractor;
  private transformer: VueTransformer;
  private restoreTransformer: VueRestoreTransformer;
  private componentInjector: VueComponentInjector;
  private importManager: VueImportManager;
  private library: ReturnType<typeof createVueI18nLibrary>;

  constructor(
    tImport: string = '@/plugins/locale',
    libraryType: VueI18nLibraryType = 'vue-i18n',
    options: VueAdapterOptions = {},
  ) {
    const library = createVueI18nLibrary(libraryType, { namespace: options.namespace });

    super({
      type: 'vue',
      // 含 .tsx/.jsx：Vue 3 支持 tsx 渲染函数组件，且 DEFAULT_IO.include 默认就扫这两类。
      // 扩展名列表同时决定目录扫描范围与 `--path` 单文件校验，两处口径必须一致。
      extensions: ['.vue', '.tsx', '.jsx', '.ts', '.js'],
      i18nLibrary: library.packageName,
      usesDoubleBracePlaceholders: library.usesDoubleBracePlaceholders,
    });

    this.library = library;
    // 透传 i18n 模块白名单：提取端据此判断模块顶层的同名 t 是工具注入的还是用户自己的
    // （后者要整处跳过，见 VueTextExtractor.detectConflictingLocalT）。
    this.textExtractor = new VueTextExtractor(options.filterPatterns ?? [], [
      tImport,
      library.packageName,
    ]);
    this.importManager = new VueImportManager(tImport, library);
    this.componentInjector = new VueComponentInjector(library, this.importManager);
    this.transformer = new VueTransformer(library, this.importManager, this.componentInjector);
    this.restoreTransformer = new VueRestoreTransformer(library, tImport);
  }

  getTextExtractor(): ITextExtractor {
    return this.textExtractor;
  }

  getTransformer(): ITransformer {
    return this.transformer;
  }

  getRestoreTransformer(): IRestoreTransformer {
    return this.restoreTransformer;
  }

  getComponentInjector(): IComponentInjector {
    return this.componentInjector;
  }

  getLibrary() {
    return this.library;
  }
}
