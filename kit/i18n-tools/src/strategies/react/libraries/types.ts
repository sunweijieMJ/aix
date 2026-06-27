import ts from 'typescript';
import type { BaseI18nLibrary } from '../../base';
import type { MessageInfo } from '../../../utils/types';

/**
 * React i18n 库适配器接口
 * 抽象不同 React 国际化库（react-intl / react-i18next）的 API 差异
 *
 * 公共标识（packageName / hookName / hookDeclaration）下沉到 BaseI18nLibrary，
 * 与 Vue 端保持一致的命名约定。
 */
export interface ReactI18nLibrary extends BaseI18nLibrary {
  // ===== Hook 相关 =====

  /** 翻译函数/对象变量名: 'intl' | 't' */
  readonly translationVarName: string;

  // ===== JSX 组件 =====

  /** JSX 组件名: 'FormattedMessage' | 'Trans' */
  readonly jsxComponentName: string;
  /** JSX 组件中 ID 属性名: 'id' | 'i18nKey' */
  readonly jsxIdPropName: string;

  // ===== HOC (类组件) =====

  /** HOC 函数名: 'injectIntl' | 'withTranslation' */
  readonly hocName: string;
  /** HOC Props 类型名: 'WrappedComponentProps' | 'WithTranslation' */
  readonly hocPropsType: string;

  // ===== 非组件上下文 =====

  /** 全局函数名: 'getIntl' | 'i18next.t' */
  readonly globalFunctionName: string;

  // ===== 代码生成 =====

  /**
   * 生成翻译函数调用代码
   * react-intl:    intl.formatMessage({ id: 'key' })
   * react-i18next: t('key')
   */
  generateFunctionCall(
    id: string,
    values?: Map<string, string>,
    includeDefaultMessage?: boolean,
    defaultMessage?: string,
    // 是否处于非组件（模块顶层）作用域。react-i18next 此时须用 globalFunctionName
    // （i18next.t），因为没有 useTranslation 注入的 t；组件内仍用 t。
    isGlobalScope?: boolean,
  ): string;

  /**
   * 生成 JSX 组件代码
   * react-intl:    <FormattedMessage id="key" />
   * react-i18next: <Trans i18nKey="key" />
   */
  generateJSXComponent(
    id: string,
    values?: Map<string, string>,
    includeDefaultMessage?: boolean,
    defaultMessage?: string,
  ): string;

  /**
   * 生成 HOC 包裹代码
   * react-intl:    injectIntl(ComponentName)
   * react-i18next: withTranslation()(ComponentName)
   */
  generateHOCWrapper(componentName: string): string;

  /**
   * 获取需要从包中导入的命名列表
   * 根据实际使用的上下文决定导入哪些
   */
  getImportSpecifiers(usage: {
    hasJsxComponent: boolean;
    hasHook: boolean;
    hasHOC: boolean;
  }): string[];

  /**
   * 生成非组件上下文的全局函数声明
   * react-intl:    const intl = getIntl();
   * react-i18next: (不需要，直接 import i18next)
   */
  generateGlobalDeclaration(): string;

  // ===== 检测 (用于 Restore) =====

  /**
   * 检测是否为翻译函数调用
   * react-intl:    intl.formatMessage(...)
   * react-i18next: t(...)
   */
  isTranslationCall(node: ts.CallExpression): boolean;

  /**
   * 检测是否为翻译 JSX 组件
   */
  isTranslationComponent(tagName: string): boolean;

  /**
   * 检测是否为 Hook 声明 (用于 cleanup)
   * react-intl:    const intl = useIntl()
   * react-i18next: const { t } = useTranslation()
   */
  isHookDeclaration(declaration: ts.VariableDeclaration): boolean;

  /**
   * 检测是否为全局函数声明 (用于 cleanup)
   * react-intl:    const intl = getIntl()
   * react-i18next: (import i18next)
   */
  isGlobalFunctionDeclaration(declaration: ts.VariableDeclaration): boolean;

  /**
   * 检测是否为 HOC 调用 (用于 prepass / cleanup)
   * react-intl:    injectIntl(Component)
   * react-i18next: withTranslation()(Component)
   */
  isHOCCall(expression: ts.Expression): boolean;

  /**
   * 获取 HOC 调用中被包裹的组件名
   */
  getHOCWrappedComponent(expression: ts.Expression): string | undefined;

  /**
   * 检测组件内是否使用了翻译函数
   * react-intl:    检测 *.formatMessage
   * react-i18next: 检测 t(...)
   */
  componentUsesTranslation(node: ts.Node, sourceFile: ts.SourceFile): boolean;

  /**
   * 检测作用域内是否已有翻译变量
   */
  isTranslationAvailableInScope(node: ts.Node, sourceFile: ts.SourceFile): boolean;

  /**
   * 检测节点是否已经国际化（避免重复处理）
   */
  isAlreadyInternationalized(node: ts.Node): boolean;

  // ===== Restore 提取 (供 RestoreTransformer 多态分发，消除 packageName 字符串分支) =====

  /**
   * 从翻译函数调用节点中提取 MessageInfo。
   *   react-intl:    intl.formatMessage({ id, defaultMessage }, values?)
   *   react-i18next: t('namespace:key', { defaultValue?, ...values })
   *
   * 入参 `node` 已由 RestoreTransformer 通过 `isTranslationCall` 过滤过。
   */
  extractCallInfo(
    node: ts.CallExpression,
    definedMessages: Map<string, MessageInfo>,
    sourceFile: ts.SourceFile,
  ): MessageInfo;

  /**
   * 从翻译 JSX 组件节点中提取 MessageInfo。
   *   react-intl:    <FormattedMessage id defaultMessage values />
   *   react-i18next: <Trans i18nKey defaults values />
   */
  extractJSXInfo(
    openingElement: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
    definedMessages: Map<string, MessageInfo>,
    sourceFile: ts.SourceFile,
  ): MessageInfo;
}

/**
 * 支持的 React i18n 库（单一事实源）：union 类型由此 const 派生，工厂亦从此校验，
 * 避免「类型 union / 工厂 switch」各维护一份导致漂移。
 */
export const REACT_I18N_LIBRARIES = ['react-intl', 'react-i18next'] as const;
export type ReactI18nLibraryType = (typeof REACT_I18N_LIBRARIES)[number];
