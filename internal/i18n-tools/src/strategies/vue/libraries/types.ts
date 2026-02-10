/**
 * Vue i18n 库适配器接口
 * 抽象不同 Vue 国际化库（vue-i18n / vue-i18next）的 API 差异
 *
 * Vue 模板层 $t() 用法两者一致，差异主要在：
 * - Composition API Hook 名称和导入包名
 * - 命名空间支持（vue-i18next）
 * - 还原时清理的导入/声明模式
 */
export interface VueI18nLibrary {
  /** 包名: 'vue-i18n' | 'vue-i18next' */
  readonly packageName: string;

  /** Hook 名称: 'useI18n' | 'useTranslation' */
  readonly hookName: string;

  /** Hook 声明代码: 'const { t } = useI18n()' | 'const { t } = useTranslation()' */
  readonly hookDeclaration: string;

  /** 模板全局函数名（两者都是 $t） */
  readonly templateFunctionName: string;

  /** 是否支持命名空间 */
  readonly supportsNamespace: boolean;

  /** 当前配置的命名空间（仅 vue-i18next 有值） */
  readonly namespace: string;

  /**
   * 检测导入声明是否属于本库（用于 restore 清理）
   */
  isLibraryImport(moduleName: string): boolean;

  /**
   * 检测变量声明是否为本库的 Hook 调用（用于 restore 清理）
   * vue-i18n:    const { t } = useI18n()
   * vue-i18next: const { t } = useTranslation()
   */
  isHookDeclaration(callExpressionName: string): boolean;

  /**
   * 生成导入语句
   * vue-i18n:    import { useI18n } from 'vue-i18n'
   * vue-i18next: import { useTranslation } from 'vue-i18next'
   */
  generateImportStatement(): string;

  /**
   * 生成 Hook 声明语句
   * vue-i18n:    const { t } = useI18n();
   * vue-i18next: const { t } = useTranslation();  或  const { t } = useTranslation('namespace');
   */
  generateHookDeclaration(): string;

  /**
   * 生成导入正则（用于检测是否已导入）
   */
  getImportCheckRegex(): RegExp;

  /**
   * 生成 Hook 声明检查正则（用于检测是否已声明）
   */
  getHookDeclarationCheckRegex(): RegExp;

  /**
   * 生成导入清理正则（用于 restore 时移除导入）
   */
  getImportCleanupRegex(): RegExp;

  /**
   * 生成 Hook 声明清理正则（用于 restore 时移除声明）
   */
  getHookDeclarationCleanupRegex(): RegExp;
}

/** 支持的 Vue i18n 库类型 */
export type VueI18nLibraryType = 'vue-i18n' | 'vue-i18next';
