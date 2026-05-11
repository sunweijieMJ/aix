import { FrameworkAdapter } from './FrameworkAdapter';
import type {
  ITextExtractor,
  ITransformer,
  IRestoreTransformer,
  IComponentInjector,
  IImportManager,
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
  /** 业务侧 config.extraction.rejectPatterns，由工厂从 ResolvedConfig 透传 */
  rejectPatterns?: readonly RegExp[];
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

  constructor(
    tImport: string = '@/plugins/locale',
    libraryType: VueI18nLibraryType = 'vue-i18n',
    options: VueAdapterOptions = {},
  ) {
    const library = createVueI18nLibrary(libraryType, { namespace: options.namespace });

    super({
      type: 'vue',
      extensions: ['.vue', '.ts', '.js'],
      i18nLibrary: library.packageName,
      globalFunctionName: library.templateFunctionName,
      hookName: library.hookName,
    });

    this.textExtractor = new VueTextExtractor(library, options.rejectPatterns ?? []);
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

  getImportManager(): IImportManager {
    return this.importManager;
  }
}
