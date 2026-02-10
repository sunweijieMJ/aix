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

  constructor() {
    super({
      type: 'vue',
      extensions: ['.vue'],
      i18nLibrary: 'vue-i18n',
      globalFunctionName: '$t',
      hookName: 'useI18n',
    });

    this.textExtractor = new VueTextExtractor();
    this.transformer = new VueTransformer();
    this.restoreTransformer = new VueRestoreTransformer();
    this.componentInjector = new VueComponentInjector();
    this.importManager = new VueImportManager();
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
