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
      return new ReactIntlLibrary();
    default: {
      // 显式 default 抛错（而非静默回退到 react-intl）：避免「loader 放行 / 工厂未覆盖」
      // 时静默生成错误库。never 穷尽检查保证新增 union 成员必须补 case。
      const _exhaustive: never = type;
      throw new Error(`不支持的 React i18n 库: ${String(_exhaustive)}`);
    }
  }
}
