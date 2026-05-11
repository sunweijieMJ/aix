import { FrameworkAdapter, type FrameworkConfig } from './FrameworkAdapter';
import type {
  ITextExtractor,
  ITransformer,
  IRestoreTransformer,
  IComponentInjector,
  IImportManager,
} from './FrameworkAdapter';
import {
  ReactTextExtractor,
  ReactTransformer,
  ReactRestoreTransformer,
  ReactComponentInjector,
  ReactImportManager,
} from '../strategies/react';
import { createReactI18nLibrary, type ReactI18nLibraryType } from '../strategies/react/libraries';

export interface ReactAdapterOptions {
  namespace?: string;
  /** 是否在生成的 i18n 调用中携带 defaultMessage（react-intl 等场景） */
  includeDefaultMessage?: boolean;
  /** 业务侧 config.extraction.rejectPatterns，由工厂从 ResolvedConfig 透传 */
  rejectPatterns?: readonly RegExp[];
}

/**
 * React 框架适配器
 *
 * 集中组装所有协作对象（library / importManager / componentInjector / transformer 等），
 * 由本适配器作为依赖注入容器；策略对象之间的依赖关系完全在此处声明，便于替换或 mock。
 */
export class ReactAdapter extends FrameworkAdapter {
  private textExtractor: ReactTextExtractor;
  private transformer: ReactTransformer;
  private restoreTransformer: ReactRestoreTransformer;
  private componentInjector: ReactComponentInjector;
  private importManager: ReactImportManager;

  constructor(
    tImport: string = '@/plugins/locale',
    libraryType: ReactI18nLibraryType = 'react-i18next',
    options: ReactAdapterOptions = {},
  ) {
    const library = createReactI18nLibrary(libraryType, { namespace: options.namespace });

    const config: FrameworkConfig = {
      type: 'react',
      extensions: ['.tsx', '.jsx', '.ts', '.js'],
      // 用 library.packageName 而非入参 libraryType，避免后续新增 library
      // 时 packageName 与枚举值不一致导致 FrameworkConfig.i18nLibrary 错位
      i18nLibrary: library.packageName,
      globalFunctionName: library.globalFunctionName,
      hookName: library.hookName,
    };
    super(config);

    this.textExtractor = new ReactTextExtractor(library, options.rejectPatterns ?? []);
    this.importManager = new ReactImportManager(tImport, library);
    this.componentInjector = new ReactComponentInjector(library, this.importManager);
    this.transformer = new ReactTransformer(library, this.importManager, this.componentInjector, {
      includeDefaultMessage: options.includeDefaultMessage,
    });
    this.restoreTransformer = new ReactRestoreTransformer(tImport, library);
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
