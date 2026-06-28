import type { BaseI18nLibrary } from '../../base';

/**
 * Vue i18n 库适配器接口
 * 抽象不同 Vue 国际化库（vue-i18n / vue-i18next）的 API 差异
 *
 * Vue 模板层 $t() 用法两者一致，差异主要在：
 * - Composition API Hook 名称和导入包名
 * - 命名空间支持（vue-i18next）
 * - 还原时清理的导入/声明模式
 *
 * 公共标识（packageName / hookName / hookDeclaration）下沉到 BaseI18nLibrary，
 * 与 React 端保持一致的命名约定。
 */
export interface VueI18nLibrary extends BaseI18nLibrary {
  /** 是否支持命名空间 */
  readonly supportsNamespace: boolean;

  /** 当前配置的命名空间（仅 vue-i18next 有值） */
  readonly namespace: string;

  /**
   * 检测导入声明是否属于本库（用于 restore 清理）
   */
  isLibraryImport(moduleName: string): boolean;

  /**
   * 生成 Hook 声明语句
   * vue-i18n:    const { t } = useI18n();
   * vue-i18next: const { t } = useTranslation();  或  const { t } = useTranslation('namespace');
   */
  generateHookDeclaration(): string;

  /**
   * 生成 Hook 声明检查正则（用于检测是否已声明）
   */
  getHookDeclarationCheckRegex(): RegExp;

  /**
   * 生成 Hook 声明清理正则（用于 restore 时移除声明）
   */
  getHookDeclarationCleanupRegex(): RegExp;
}

/**
 * 支持的 Vue i18n 库（单一事实源）：union 类型由此 const 派生，工厂亦从此校验，
 * 避免「类型 union / 工厂 switch」各维护一份导致漂移。
 */
export const VUE_I18N_LIBRARIES = ['vue-i18n', 'vue-i18next'] as const;
export type VueI18nLibraryType = (typeof VUE_I18N_LIBRARIES)[number];
