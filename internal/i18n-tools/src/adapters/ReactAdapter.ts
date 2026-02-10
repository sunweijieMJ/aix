import { FrameworkAdapter, type FrameworkConfig } from './FrameworkAdapter';
import {
  ReactTextExtractor,
  ReactTransformer,
  ReactRestoreTransformer,
  ReactComponentInjector,
  ReactImportManager,
} from '../strategies/react';
import {
  createReactI18nLibrary,
  type ReactI18nLibrary,
  type ReactI18nLibraryType,
} from '../strategies/react/libraries';

/**
 * React 框架适配器
 */
export class ReactAdapter extends FrameworkAdapter {
  private tImport: string;
  private library: ReactI18nLibrary;

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
    this.tImport = tImport;
    this.library = library;
  }

  getTextExtractor() {
    return new ReactTextExtractor(this.library);
  }

  getTransformer() {
    return new ReactTransformer(this.tImport, this.library);
  }

  getRestoreTransformer() {
    return new ReactRestoreTransformer(this.tImport, this.library);
  }

  getComponentInjector() {
    return new ReactComponentInjector(this.tImport, this.library);
  }

  getImportManager() {
    return new ReactImportManager(this.tImport, this.library);
  }
}
