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
      return new VueI18nLibraryImpl();
    default: {
      // 显式 default 抛错（而非静默回退到 vue-i18n）：避免「loader 放行 / 工厂未覆盖」
      // 时静默生成错误库。never 穷尽检查保证新增 union 成员必须补 case。
      const _exhaustive: never = type;
      throw new Error(`不支持的 Vue i18n 库: ${String(_exhaustive)}`);
    }
  }
}
