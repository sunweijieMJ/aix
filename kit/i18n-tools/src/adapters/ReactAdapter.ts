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
import {
  createReactI18nLibrary,
  type ReactI18nLibraryType,
} from '../strategies/react/libraries';

/**
 * React 框架适配器
 */
export class ReactAdapter extends FrameworkAdapter {
  private textExtractor: ReactTextExtractor;
  private transformer: ReactTransformer;
  private restoreTransformer: ReactRestoreTransformer;
  private componentInjector: ReactComponentInjector;
  private importManager: ReactImportManager;

  constructor(
    tImport: string = '@/plugins/locale',
    libraryType: ReactI18nLibraryType = 'react-intl',
    libraryOptions?: { namespace?: string },
  ) {
    const library = createReactI18nLibrary(libraryType, libraryOptions);

    const config: FrameworkConfig = {
      type: 'react',
      extensions: ['.tsx', '.jsx', '.ts', '.js'],
      i18nLibrary: libraryType,
      globalFunctionName: library.globalFunctionName,
      hookName: library.hookName,
    };
    super(config);

    this.textExtractor = new ReactTextExtractor(library);
    this.transformer = new ReactTransformer(tImport, library);
    this.restoreTransformer = new ReactRestoreTransformer(tImport, library);
    this.componentInjector = new ReactComponentInjector(tImport, library);
    this.importManager = new ReactImportManager(tImport, library);
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
