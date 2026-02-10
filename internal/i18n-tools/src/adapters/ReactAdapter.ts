import { FrameworkAdapter, type FrameworkConfig } from './FrameworkAdapter';
import {
  ReactTextExtractor,
  ReactTransformer,
  ReactRestoreTransformer,
  ReactComponentInjector,
  ReactImportManager,
} from '../strategies/react';

/**
 * React 框架适配器
 */
export class ReactAdapter extends FrameworkAdapter {
  constructor() {
    const config: FrameworkConfig = {
      type: 'react',
      extensions: ['.tsx', '.jsx', '.ts', '.js'],
      i18nLibrary: 'react-intl',
      globalFunctionName: 'getIntl',
      hookName: 'useIntl',
    };
    super(config);
  }

  getTextExtractor() {
    return new ReactTextExtractor();
  }

  getTransformer() {
    return new ReactTransformer();
  }

  getRestoreTransformer() {
    return new ReactRestoreTransformer();
  }

  getComponentInjector() {
    return new ReactComponentInjector();
  }

  getImportManager() {
    return new ReactImportManager();
  }
}
