/**
 * i18n 库适配器的最小公共契约
 *
 * Vue 与 React 的 i18n 库在检测/还原层用的是不同抽象（Vue 走正则字符串、
 * React 走 TS AST），无法在方法层面统一。但二者都共享一组用于 import / hook
 * 注入的字符串元数据，提取到本基接口后：
 *  - 上层（CLI、日志、Adapter.getLibraryName）可以以"任何 i18n 库"为类型
 *    入参，不必区分框架；
 *  - 新增框架时也有统一的命名约定可以参照。
 *
 * 框架特定的方法（regex 集合 / AST 谓词）由各自的 VueI18nLibrary /
 * ReactI18nLibrary 子接口扩展，不下沉到此处。
 */
export interface BaseI18nLibrary {
  /** npm 包名，用于注入/清理 import 语句 */
  readonly packageName: string;
  /** Composition Hook 名（如 useI18n / useTranslation / useIntl） */
  readonly hookName: string;
  /** 默认 Hook 声明语句（如 `const { t } = useI18n()`） */
  readonly hookDeclaration: string;
}
