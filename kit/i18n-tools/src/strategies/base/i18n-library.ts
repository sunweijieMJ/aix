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
  /**
   * locale 文件中占位符是否使用双花括号 `{{name}}`（i18next 系：react-i18next /
   * vue-i18next），否则使用单花括号 `{name}`（vue-i18n 的 named 格式 / react-intl 的 ICU）。
   *
   * Why: 工具内部统一以单花括号为规范形式生成/还原；写入 locale 前与从 locale 读出后，
   * 由该标志决定是否在边界做单↔双花括号转换。若 react-i18next 写成单花括号，运行时
   * 默认插值（双花括号）不会替换，会原样显示 `{name}`。
   */
  readonly usesDoubleBracePlaceholders: boolean;
}
