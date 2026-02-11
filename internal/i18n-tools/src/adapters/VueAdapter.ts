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

/**
 * Vue 框架适配器
 * 提供 Vue 项目的 i18n 处理实现
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
    libraryOptions?: { namespace?: string },
  ) {
    const library = createVueI18nLibrary(libraryType, libraryOptions);

    super({
      type: 'vue',
      extensions: ['.vue', '.ts', '.js'],
      i18nLibrary: library.packageName,
      globalFunctionName: library.templateFunctionName,
      hookName: library.hookName,
    });

    this.textExtractor = new VueTextExtractor(library);
    this.transformer = new VueTransformer(tImport, library);
    this.restoreTransformer = new VueRestoreTransformer(library, tImport);
    this.componentInjector = new VueComponentInjector(library);
    this.importManager = new VueImportManager(tImport, library);
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
