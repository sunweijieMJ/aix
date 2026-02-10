export type { VueI18nLibrary, VueI18nLibraryType } from './types';
export { VueI18nLibraryImpl } from './vue-i18n';
export { VueI18nextLibrary } from './vue-i18next';

import type { VueI18nLibrary, VueI18nLibraryType } from './types';
import { VueI18nLibraryImpl } from './vue-i18n';
import { VueI18nextLibrary } from './vue-i18next';

/**
 * 创建 Vue i18n 库适配器实例
 */
export function createVueI18nLibrary(
  type: VueI18nLibraryType,
  options?: { namespace?: string },
): VueI18nLibrary {
  switch (type) {
    case 'vue-i18next':
      return new VueI18nextLibrary(options);
    case 'vue-i18n':
    default:
      return new VueI18nLibraryImpl();
  }
}
