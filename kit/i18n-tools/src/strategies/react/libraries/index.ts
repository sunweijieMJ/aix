export type { ReactI18nLibrary, ReactI18nLibraryType } from './types';
export { ReactIntlLibrary } from './react-intl';
export { ReactI18nextLibrary } from './react-i18next';

import type { ReactI18nLibrary, ReactI18nLibraryType } from './types';
import { ReactIntlLibrary } from './react-intl';
import { ReactI18nextLibrary } from './react-i18next';

/**
 * 创建 React i18n 库适配器实例
 */
export function createReactI18nLibrary(
  type: ReactI18nLibraryType,
  options?: { namespace?: string },
): ReactI18nLibrary {
  switch (type) {
    case 'react-i18next':
      return new ReactI18nextLibrary(options);
    case 'react-intl':
    default:
      return new ReactIntlLibrary();
  }
}
