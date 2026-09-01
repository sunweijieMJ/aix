import type { ExtractedString, LocaleMap } from '../utils/types';
import type { ExtractionDiagnostics } from '../utils/extraction-diagnostics';
import type { BaseI18nLibrary } from '../strategies/base/i18n-library';

/**
 * 框架配置接口
 *
 * `type` 抽象层不再绑定到具体的框架字面量联合，新增框架时只需扩展具体 Adapter
 * 与 `createFrameworkAdapter` 工厂分支，无需修改本基类。封闭枚举仍保留在
 * `config/types.ts` 的用户输入边界。
 */
export interface FrameworkConfig {
  /** 框架类型（与 `config.framework` 保持一致；抽象层不约束字面量） */
  type: string;
  /** 支持的文件扩展名（含点号，如 '.tsx'） */
  extensions: string[];
  /** 框架展示名（用于日志/错误提示，如 'Vue'、'React'） */
  displayName?: string;
  /** i18n 库名称 */
  i18nLibrary: string;
  /**
   * 该 i18n 库的插值占位符语法是否为双花括号 `{{name}}`（否则为单花括号 `{name}`）。
   * 与具体 library 实现的 `usesDoubleBracePlaceholders` 保持一致，由各 Adapter
   * 在构造时透传。供 Doctor 的占位符校验、Translate 的 LLM prompt 使用，
   * 使其无需实例化具体 library 也能拿到该库的占位符语法约定。
   */
  usesDoubleBracePlaceholders: boolean;
}

/**
 * 提取器明确判定需要人工处理、因而未生成翻译调用的一处文本。
 *
 * 一条记录 = 一个调用点（由 category + dedupeKey/message 唯一确定，见 recordManualSkip 的
 * 去重）。曾有一个 count 字段，但所有记录点都恒传 1、recordManualSkip 也不做累加，
 * 消费端的展开循环永远只转一圈——是「看起来支持聚合、实际不支持」的假灵活，已移除。
 *
 * 不含 nested-interpolation：插值内中文走 ExtractionDiagnostics.recordSkippedNestedChinese
 * 一条通道（linter / coverage 都从那里取），此处再记一份必然被消费端过滤掉以避免双计。
 */
export interface ManualSkipDiagnostic {
  category: 'html-template' | 'class-property' | 'param-default';
  message: string;
  /** 同类展示文案不足以区分调用点时使用的稳定去重键。 */
  dedupeKey?: string;
}

/**
 * 文本提取器接口
 */
export interface ITextExtractor {
  extractFromFile(filePath: string): Promise<ExtractedString[]>;
  extractFromFiles(filePaths: string[]): Promise<ExtractedString[]>;
  /**
   * 取出并清空提取过程中累积的 warning（如跳过含 HTML 的模板字符串）。
   * 调用方（GenerateProcessor）负责把 warning 写入 RunReport 以供事后回查。
   */
  drainWarnings(): string[];
  /** 取出并清空本轮需要人工处理的结构化跳过项，供覆盖率统计。 */
  drainManualSkips(): ManualSkipDiagnostic[];
  /**
   * 本轮提取累积的「跳过但需暴露」诊断收集器（比较运算操作数 / 嵌套插值中文）。
   * 返回实例本身（非快照）：coverage 与 linter 必须消费同一份，由调用方决定 drain 时机。
   */
  getDiagnostics(): ExtractionDiagnostics;
}

// BaseTextExtractor 的实现已下沉至 strategies/base/text-extractor.ts，
// 维持"策略层提供具体实现、适配器层定义抽象接口"的分层语义。

/**
 * 代码转换器接口
 *
 * library 级别的转换选项（如 React 的 includeDefaultMessage）通过具体实现
 * 类的构造器传入，不在公共接口中暴露，避免框架特定参数污染抽象层。
 */
export interface ITransformer {
  /**
   * 转换源代码：在原文中应用 i18n 替换。
   *
   * @param filePath        - 原始文件路径（用于 SFC 解析、语言探测等）
   * @param extractedStrings - 已提取的待替换字符串
   * @param sourceText      - 可选：调用方已读取的原始内容。提供时跳过内部 readFileSync，
   *                          这样调用方可在 transform 前后基于同一份内容做哈希/比对，
   *                          避免在「读 → transform → 再读」窗口内文件被外部改动引发不一致。
   */
  transform(filePath: string, extractedStrings: ExtractedString[], sourceText?: string): string;
}

/**
 * 还原转换器接口
 */
export interface IRestoreTransformer {
  /**
   * 还原源代码：把 i18n 调用还原回原始文本。
   *
   * @param filePath   - 原始文件路径（用于 SFC 解析、扩展名判定等）
   * @param localeMap  - key → 原文 的映射
   * @param sourceText - 可选：调用方已读取的原始内容。提供时跳过内部 readFileSync，
   *                     与 ITransformer 对齐——RestoreProcessor 已读过一次用于比对，
   *                     避免在 transform 内再读同一文件的重复 IO。
   */
  transform(filePath: string, localeMap: LocaleMap, sourceText?: string): string;
}

/**
 * 组件注入器接口
 */
export interface IComponentInjector {
  /**
   * @param code - 待注入的源代码
   * @param filePath - 原始文件路径（用于决定 ScriptKind，避免纯 .ts 文件被按 TSX 解析）。
   *   React 侧据此解析（`.ts` 走 TS、`.tsx/.jsx/.js` 走 TSX/JSX）；Vue 侧刻意忽略——
   *   本方法只在 `.vue` 上被调用，其内部一律按 SFC 分段处理（见 VueComponentInjector）。
   *   缺省时 React 侧退回 TSX，与历史行为一致。
   */
  inject(code: string, filePath?: string): string;
}

/**
 * 导入管理器接口
 */
export interface IImportManager {
  handleGlobalImports(code: string, fileStrings: ExtractedString[], filePath?: string): string;
  addI18nImports(code: string, imports: string[]): string;
  /**
   * 全部注入完成后的收尾清理（可选）。React 端用于删除「被注入的 useTranslation t 遮蔽后
   * 变成未使用」的 tImport `import { t }`，避免产出 ESLint no-unused-vars 的死导入。
   * 必须在 componentInjector.inject 之后调用（遮蔽由注入产生）。
   */
  finalizeImports?(code: string, filePath: string): string;
}

/**
 * 框架适配器抽象基类
 * 定义所有框架适配器必须实现的接口
 */
export abstract class FrameworkAdapter {
  protected config: FrameworkConfig;

  constructor(config: FrameworkConfig) {
    this.config = config;
  }

  /**
   * 获取支持的文件扩展名列表（含点号）。
   * 用于扫描目录、校验目标文件，使工具层不再硬编码框架。
   */
  getSupportedExtensions(): string[] {
    return this.config.extensions;
  }

  /**
   * 获取展示名。未显式提供时按 `type` 的首字母大写形式回退（如 'svelte' → 'Svelte'）。
   */
  getDisplayName(): string {
    if (this.config.displayName) return this.config.displayName;
    const t = this.config.type;
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  }

  /**
   * 获取当前选用的 i18n 库标识（如 'vue-i18n'、'react-i18next'）。
   * CLI / 日志层使用，避免在外层做 `framework === 'vue' ? config.vue.library : config.react.library`
   * 的硬编码分支——新增框架时该接口由各自适配器自然提供。
   */
  getLibraryName(): string {
    return this.config.i18nLibrary;
  }

  /**
   * 当前 i18n 库的插值占位符语法是否为双花括号 `{{name}}`。
   * CLI / Doctor / Translate 层使用，避免硬编码 library 名称到语法约定的映射。
   *
   * 命名带 get 前缀（而非与 FrameworkConfig.usesDoubleBracePlaceholders 同名）：
   * 避免方法名与同一个类里 `this.config.usesDoubleBracePlaceholders` 字段撞名——
   * 撞名时若未来有调用方误写成属性访问（漏掉调用括号），拿到的是函数引用，
   * 在布尔上下文里恒为真值，TS 不会报错，会静默走错分支。
   */
  getUsesDoubleBracePlaceholders(): boolean {
    return this.config.usesDoubleBracePlaceholders;
  }

  /**
   * 获取文本提取器
   */
  abstract getTextExtractor(): ITextExtractor;

  /**
   * 获取代码转换器
   */
  abstract getTransformer(): ITransformer;

  /**
   * 获取还原转换器
   */
  abstract getRestoreTransformer(): IRestoreTransformer;

  /**
   * 获取组件注入器
   */
  abstract getComponentInjector(): IComponentInjector;

  /**
   * 获取导入管理器
   */
  abstract getImportManager(): IImportManager;

  /**
   * 获取底层 i18n 库适配器（用于 locale 值定稿 / 还原：花括号策略、字面量转义）。
   */
  abstract getLibrary(): BaseI18nLibrary;
}
