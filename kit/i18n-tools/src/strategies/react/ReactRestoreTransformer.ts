import fs from 'fs';
import ts from 'typescript';
import { parseSourceFile } from '../../utils/ast-core';
import { removeNamedImports } from '../../utils/import-surgery';
import {
  normalizeRestoreLocaleMap,
  normalizeRestoreMessage,
  parseTemplatePlaceholders,
} from '../../utils/message-shape';
import {
  createJsxFragmentFromTemplate,
  createStringOrTemplateNode,
} from '../../utils/restore-node-factory';
import {
  findInnermostBindingDeclaration,
  isIdentifierValueReference,
  isImportedNameUnused,
  unusedImportedLocalNames,
  isShadowedInsideScope,
} from '../../utils/scope-analysis';
import { convertUnicodeToChineseInCode } from '../../utils/string-escape';
import { LoggerUtils } from '../../utils/logger';
import { ReactASTUtils } from './react-ast-utils';
import { ReactImportManager } from './ReactImportManager';
import {
  HOC_CLASS_SUFFIX,
  cleanupHOCPropsType,
  cleanupHookDependencies,
  cleanupVariableStatements,
  renameComponent,
  unwrapHOC,
} from './react-restore-cleanup';
import { TRANSLATION_DEPENDENCY_HOOKS, resolveHookName } from './hooks-utils';
import { ReactTextExtractor } from './ReactTextExtractor';
import type { MessageInfo, TransformContext, LocaleMap } from '../../utils/types';
import type { IRestoreTransformer } from '../../adapters/FrameworkAdapter';
import type { ReactI18nLibrary } from './libraries';

// 内联的最小校验：消息必须含 id 或 defaultMessage 之一，否则无法用于翻译查找
const isValidMessage = (m: MessageInfo): boolean =>
  m.id !== undefined || m.defaultMessage !== undefined;

/**
 * React 还原代码转换器
 * 负责将国际化代码还原为原始文本（由 library 适配器驱动）
 */
export class ReactRestoreTransformer implements IRestoreTransformer {
  private library: ReactI18nLibrary;
  private tImport: string;

  // 与 VueRestoreTransformer 保持一致的 (library, tImport) 顺序。tImport 默认值
  // 由配置层（ReactAdapter）决定，不在策略类中提供，避免双源默认值漂移。
  constructor(library: ReactI18nLibrary, tImport: string) {
    this.library = library;
    this.tImport = tImport;
  }

  /** 已告警过的占位符失配位置，按 文件:偏移:key 去重（见 canRestorePlaceholders）。 */
  private readonly warnedPlaceholderMismatches = new Set<string>();

  /**
   * 还原前自检：locale 值里的占位符能否与调用/组件的 values 一一重建。
   *
   * 判据与 restore-node-factory 的守卫同源（每个占位符名都要在 values 里取到可重建的表达式、
   * values 不得多出占位符里没有的名），提前到调用侧做有两个原因：
   *  - 工厂只知道两侧数量，告警给不出「哪个 key、哪些名」，用户无从下手；
   *  - survivalScan 与正式 transform 对同一节点各调一次本方法，工厂告警会连打两遍。
   * 返回 false 时调用方保留原节点，与工厂返回 null 的处置完全一致。
   */
  private canRestorePlaceholders(
    messageText: string,
    values: Record<string, unknown>,
    id: string | undefined,
    node: ts.Node,
    sourceFile: ts.SourceFile,
  ): boolean {
    const { placeholderNames } = parseTemplatePlaceholders(messageText);
    const localeNames = [...new Set(placeholderNames)];
    const valueNames = Object.keys(values);
    // 与 findExpressionForVariable 同口径：只有携带 AST 节点的值能重建成表达式。
    const isExpression = (value: unknown): boolean =>
      typeof value === 'object' &&
      value !== null &&
      (('node' in value && 'text' in value) || 'kind' in value);

    const unresolved = localeNames.filter((name) => !isExpression(values[name]));
    const extraValues = valueNames.filter((name) => !localeNames.includes(name));
    if (unresolved.length === 0 && extraValues.length === 0) {
      return true;
    }

    const start = node.pos >= 0 ? node.getStart(sourceFile) : -1;
    const line = start >= 0 ? ts.getLineAndCharacterOfPosition(sourceFile, start).line + 1 : 0;
    const dedupeKey = `${sourceFile.fileName}:${start}:${id ?? ''}`;
    if (this.warnedPlaceholderMismatches.has(dedupeKey)) {
      return false;
    }
    this.warnedPlaceholderMismatches.add(dedupeKey);
    LoggerUtils.warn(
      `⚠️ [Restore Warning] 占位符与运行时 values 不匹配，保留原调用：${sourceFile.fileName}:${line}\n` +
        `   key：${id ?? '(无 id，用 defaultMessage 兜底)'}\n` +
        `   locale 值：「${messageText}」\n` +
        `   locale 值解析出的占位符：${localeNames.length ? localeNames.join('、') : '(无)'}\n` +
        `   调用 values 提供：${valueNames.length ? valueNames.join('、') : '(无)'}\n` +
        `   若文案含字面花括号（i18next 下「{说明}」与占位符「{{说明}}」归一后同形，无法自动区分），` +
        `需人工还原该处。`,
    );
    return false;
  }

  /** 变量声明（`const t = ...` 或 `const { t, ... } = ...`）是否绑定了名为 varName 的标识符。 */
  private declarationBindsVar(decl: ts.VariableDeclaration, varName: string): boolean {
    if (ts.isIdentifier(decl.name)) return decl.name.text === varName;
    if (ts.isObjectBindingPattern(decl.name)) {
      return decl.name.elements.some(
        (element) => ts.isIdentifier(element.name) && element.name.text === varName,
      );
    }
    return false;
  }

  /**
   * 类组件路径：translationVar 来自 `const { intl } = this.props`（injectIntl / withTranslation
   * HOC 注入），它不是 i18n hook 声明，故 isHookDeclaration 不认。但它同样是 translationVar 的绑定
   * 来源，守卫必须把其所在作用域纳入「翻译调用之外是否仍被引用」的扫描——否则函数组件 `const intl =
   * useIntl()` 有守卫、类组件这条对称路径却漏判，导致 intl.formatNumber 等非翻译用法被忽略，
   * cleanupVariableStatements 误删该绑定 + unwrapHOC 解除 injectIntl，残留未定义的 intl（TS2304 /
   * ReferenceError）。仅认初始化器恰为 `this.props` 的绑定，不影响 standalone tImport 路径。
   */
  private declarationBindsVarFromThisProps(decl: ts.VariableDeclaration, varName: string): boolean {
    if (!this.declarationBindsVar(decl, varName)) return false;
    let init = decl.initializer;
    // 手写代码常给 props 加类型断言（`this.props as WithTranslation`）或括号，剥掉再判本体。
    while (
      init &&
      (ts.isAsExpression(init) ||
        ts.isTypeAssertionExpression(init) ||
        ts.isParenthesizedExpression(init) ||
        ts.isNonNullExpression(init))
    ) {
      init = init.expression;
    }
    return (
      !!init &&
      ts.isPropertyAccessExpression(init) &&
      init.expression.kind === ts.SyntaxKind.ThisKeyword &&
      init.name.text === 'props'
    );
  }

  /**
   * translationVar 的全部合法绑定来源（单一判定点，勿在调用处各自枚举）：
   *  1. i18n hook 声明：`const { t } = useTranslation()` / `const intl = useIntl()`；
   *  2. 全局函数声明：`const intl = getIntl()`（react-intl 模块级 'other' 作用域的标准注入形态）；
   *  3. HOC 注入的 props 解构：`const { t/intl } = this.props`。
   *
   * 不变量：本方法必须覆盖 cleanupVariableStatements 会删除的每一种声明
   * 形态——任何可能被删除的绑定，其作用域都必须先经「翻译调用之外是否仍被引用」扫描，否则
   * 删声明后残留引用未定义标识符（TS2304）。历史上 hook / this.props / getIntl 三处曾分散在
   * 各调用点枚举，先后漏掉 this.props 与 getIntl 各出过一次同型 Bug，故收口于此。
   */
  private declarationBindsTranslationVar(decl: ts.VariableDeclaration, varName: string): boolean {
    return (
      ((this.library.isHookDeclaration(decl) || this.library.isGlobalFunctionDeclaration(decl)) &&
        this.declarationBindsVar(decl, varName)) ||
      this.declarationBindsVarFromThisProps(decl, varName)
    );
  }

  /** 取 node 最近的函数式作用域（函数 / 箭头 / 方法 / 访问器），到顶则返回 SourceFile。 */
  private enclosingScope(node: ts.Node): ts.Node {
    let cur: ts.Node | undefined = node.parent;
    while (cur) {
      if (
        ts.isFunctionDeclaration(cur) ||
        ts.isFunctionExpression(cur) ||
        ts.isArrowFunction(cur) ||
        ts.isMethodDeclaration(cur) ||
        ts.isConstructorDeclaration(cur) ||
        ts.isGetAccessorDeclaration(cur) ||
        ts.isSetAccessorDeclaration(cur) ||
        ts.isSourceFile(cur)
      ) {
        return cur;
      }
      cur = cur.parent;
    }
    return node;
  }

  /**
   * 文件里是否存在「手写 HOC 注入 + 形参解构接 t/intl」的组件
   * （`interface Props extends WithTranslation` + `function Inner({ t, x }: Props)` +
   * `withTranslation()(Inner)`）。
   *
   * 这类组件的 t/intl 由 HOC 以 prop 形式传入。还原时若照常剥掉 heritage 里的
   * WithTranslation / WrappedComponentProps、解开 HOC 包裹，形参 `{ t, x }` 仍在，t 立刻变成
   * Props 上不存在的属性（TS2339）且运行时恒为 undefined。工具自产形态从不把绑定放在形参上
   * （函数组件注入到体内、类组件走 this.props），故本判定只会命中手写代码。
   *
   * 判定必须落在**同一个函数节点**上：既要形参解构绑定 translationVarName、渲染 JSX，又要
   * 该形参确实由 HOC 注入——形参类型引用 hocPropsType，或该函数被库 HOC 包裹
   * （componentParamBindsVar 传 options 后与注入端「见到该形态就跳过注入」同一判定）。
   * 两个信号若各自在文件级独立成立，`list.map(({ t }) => <li/>)` 这类返回 JSX 的普通回调
   * 撞上文件里任意一处 HOC 调用 / hocPropsType 类型引用就会误判，整文件停止清理并误告警。
   */
  private hasHandwrittenHocParamInjection(root: ts.Node, library: ReactI18nLibrary): boolean {
    const varName = library.translationVarName;
    const hocOptions = {
      hocPropsType: library.hocPropsType,
      isHOCCall: (expression: ts.Expression) => library.isHOCCall(expression),
    };
    let found = false;
    const visit = (node: ts.Node): void => {
      if (found) return;
      if (
        (ts.isFunctionDeclaration(node) ||
          ts.isFunctionExpression(node) ||
          ts.isArrowFunction(node)) &&
        ReactASTUtils.componentParamBindsVar(node, varName, hocOptions) &&
        ReactASTUtils.containsJsxNode(node)
      ) {
        found = true;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(root);
    return found;
  }

  transform(filePath: string, localeMap: LocaleMap, sourceText?: string): string {
    // 优先用调用方已读取的内容，缺省才回退读盘（消除 RestoreProcessor 的二次读盘）。
    const source = sourceText ?? fs.readFileSync(filePath, 'utf-8');
    const sourceFile = parseSourceFile(source, filePath);

    // locale 值归一：i18next 系库双花括号 → 单花括号；并 unescape 写盘时转义的字面量花括号。
    // 与 Vue restore 共用 normalizeRestoreLocaleMap（消除两端重复实现）。
    const normalizedLocaleMap = normalizeRestoreLocaleMap(localeMap, this.library);

    const context: TransformContext = {
      localeMap: normalizedLocaleMap,
      definedMessages: new Map(),
      hasChanges: false,
      sourceFile,
      componentNameMap: new Map(),
      exportedHocInnerNames: new Set(),
      defaultExportedHocInnerNames: new Set(),
    };

    // 提取 defineMessages 中的消息定义
    ts.forEachChild(sourceFile, function visit(node: ts.Node) {
      if (ts.isCallExpression(node)) {
        ReactTextExtractor.extractDefineMessages(node, context.definedMessages, sourceFile);
      }
      ts.forEachChild(node, visit);
    });

    // 应用转换
    const transformer = this.createTransformer(context);
    const result = ts.transform(sourceFile, [transformer]);

    if (!context.hasChanges) {
      return source;
    }

    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    let transformedCode = printer.printFile(result.transformed[0]!);
    // printer 会把中文打成 \uXXXX 转义，还原回字面字符（JSX 表达式容器 `{'…'}` 的内层
    // 就是普通引号字符串，同样被覆盖）。
    transformedCode = convertUnicodeToChineseInCode(transformedCode);

    result.dispose();

    // 收尾：删除 restore 后已无引用的 tImport `t` 导入（与 generate 侧 finalizeImports 对称）。
    // 保守守卫：仅当 t 在还原后的整文件中已无任何引用时删除——若存在「locale 查不到、未被还原」
    // 的存活 t() 调用，t 仍被使用，必须保留 import，否则产出 `Cannot find name 't'`（TS2304）。
    transformedCode = this.finalizeTImport(transformedCode, filePath);
    transformedCode = this.finalizeLibraryImports(transformedCode, filePath);

    return transformedCode;
  }

  /**
   * restore 收尾：逐个具名导入复核存活性，摘除还原后已无引用的工具注入名。
   *
   * 这是库**值导入**（Trans / useTranslation / withTranslation）唯一的摘除点：在最终代码上
   * 按名逐个判死——JSX 标签、hook 调用、HOC 调用、裸值透传与类型引用都算引用（都是标识符的
   * 值/类型位置读取，isImportedNameUnused 一并覆盖），零引用才摘。守卫保守——任一未遮蔽引用
   * 即保留。相比 AST 侧按名摘除，它不依赖「引用形态枚举」，`React.createElement(Trans, …)`、
   * `() => useTranslation` 这类形态自然被保住。
   *
   * 只处理未改名的注入名：改名导入（`Trans as T`）一定是用户代码，与 cleanupImports 同口径跳过。
   * `import type { … }` 行不在 removeNamedImports 的匹配形态内，其类型名由 cleanupImports 在
   * 常规路径摘除。
   */
  private finalizeLibraryImports(code: string, filePath: string): string {
    const specifiers = this.library.getImportSpecifiers({
      hasJsxComponent: true,
      hasHook: true,
      hasHOC: true,
    });
    const injectable = new Set([...specifiers.values, ...specifiers.types]);
    const packageName = this.library.packageName;

    const sourceFile = parseSourceFile(code, filePath);
    const candidates: string[] = [];
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      if (
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        statement.moduleSpecifier.text !== packageName
      ) {
        continue;
      }
      const named = statement.importClause?.namedBindings;
      if (!named || !ts.isNamedImports(named)) continue;
      for (const element of named.elements) {
        if (element.propertyName !== undefined) continue;
        if (injectable.has(element.name.text)) candidates.push(element.name.text);
      }
    }

    const dead = candidates.filter((name) =>
      isImportedNameUnused(code, filePath, packageName, name),
    );
    if (dead.length === 0) return code;
    return removeNamedImports(code, (m) => m === packageName, dead);
  }

  /**
   * restore 收尾：tImport 的全局函数 `t` 在还原后若已无任何引用，则删除其 import
   * （独占则删整条，混合则仅摘 t、保留同路径其他命名）。
   *
   * 用 isImportedNameUnused 守卫：还原后 hook 声明已被清理、不存在遮蔽，故「仍有 t 引用」
   * 必然是存活的 t() 调用（locale 查不到、未被还原），此时必须保留 import。与 generate 侧
   * ReactImportManager.finalizeImports 对称——一个防死导入，一个防误删仍用的导入。
   */
  private finalizeTImport(code: string, filePath: string): string {
    const funcName = this.library.globalFunctionName.split('.')[0]!;
    // 按本地名逐个摘：`import { t as tr, t }` 里 tr 仍在用时只摘死掉的 t，与 Vue 端
    // VueRestoreTransformer.cleanupPluginLocaleImport 同口径。
    const deadNames = unusedImportedLocalNames(code, filePath, this.tImport, funcName);
    if (deadNames.length === 0) return code;
    return removeNamedImports(code, (m) => m === this.tImport, deadNames, { byLocalName: true });
  }

  /**
   * 需要补行内前导注释的槽位：printer 对这些位置只走列表 / 标点输出，不会从源文本取回
   * 「前一个 token 与本节点之间」的注释，替换成合成节点后该注释整条消失。
   *
   * 反过来，`=` / `=>` / `?` / `:` 这类槽位的注释由 printer 随 token 一起输出（
   * `const u = /* c *\/ t('k')`、三元两分支、箭头表达式体），这里再补一份就会打印两遍，
   * 故白名单只收「已实测会丢」的三种：对象属性值、数组元素、调用实参。
   */
  private static needsLeadingCommentTransplant(node: ts.Node): boolean {
    const parent = node.parent;
    if (!parent) return false;
    if (ts.isPropertyAssignment(parent)) return parent.initializer === node;
    if (ts.isArrayLiteralExpression(parent)) return true;
    if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) {
      return parent.expression !== node;
    }
    return false;
  }

  /**
   * 把「夹在父节点起点与原节点之间」的行内注释搬到替换节点上。
   *
   * printer 只对带原始位置的节点从源文本取 trivia，而还原产出的是 ts.factory 新节点
   * （pos = -1）：`title: /* 配置标题 *\/ t('k')` 里那条注释于是随调用节点一起消失。
   *
   * 只取父节点起点之后的注释：父节点保留原范围，它自己的前导注释仍由 printer 按源文本
   * 输出；若把这些也复制一份，`// 说明\nt('k');` 这类「注释在语句上方」的形态会被打印两遍。
   */
  private static withLeadingComments<T extends ts.Node>(
    replacement: T,
    original: ts.Node,
    sourceFile: ts.SourceFile,
  ): T {
    const parent = original.parent;
    if (
      original.pos < 0 ||
      !parent ||
      !ReactRestoreTransformer.needsLeadingCommentTransplant(original)
    ) {
      return replacement;
    }
    const fullStart = original.getFullStart();
    // 两路都要取：getLeadingCommentRanges 只从换行之后开始收集，与前一个 token 同行的
    // `title: /* 配置标题 *\/ t(...)` 只出现在 getTrailingCommentRanges 里。
    const ranges = [
      ...(ts.getTrailingCommentRanges(sourceFile.text, fullStart) ?? []),
      ...(ts.getLeadingCommentRanges(sourceFile.text, fullStart) ?? []),
    ];
    if (ranges.length === 0) return replacement;
    const parentStart = parent.getStart(sourceFile);
    const seen = new Set<number>();
    const inline: ts.CommentRange[] = [];
    for (const range of ranges) {
      if (range.pos < parentStart || seen.has(range.pos)) continue;
      seen.add(range.pos);
      inline.push(range);
    }
    inline.sort((a, b) => a.pos - b.pos);
    if (inline.length === 0) return replacement;
    return ts.setSyntheticLeadingComments(
      replacement,
      inline.map((range) => ({
        kind: range.kind,
        // SynthesizedComment.text 不含定界符：块注释去掉首尾各 2 字符，行注释只去掉 `//`
        text: sourceFile.text.slice(
          range.pos + 2,
          range.kind === ts.SyntaxKind.MultiLineCommentTrivia ? range.end - 2 : range.end,
        ),
        hasTrailingNewLine: range.hasTrailingNewLine,
        pos: -1,
        end: -1,
      })),
    );
  }

  /**
   * 模块顶层是否把 varName 从「非 i18n 来源」的模块导入进来
   * （`import { t } from '@/utils/tiny-template'`）。
   * 局部作用域的绑定由 findInnermostBindingDeclaration 覆盖，import 绑定不在其列，故单列一判。
   */
  private importsTranslationVarFromForeignModule(
    sourceFile: ts.SourceFile,
    varName: string,
  ): boolean {
    // i18next 是 react-i18next 的运行时本体，其导出的 t / i18next 实例同属 i18n 来源。
    const i18nModules = new Set([this.tImport, this.library.packageName, 'i18next']);
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
        continue;
      }
      const clause = statement.importClause;
      if (!clause) continue;
      const named = clause.namedBindings;
      const binds =
        clause.name?.text === varName ||
        (named !== undefined &&
          (ts.isNamespaceImport(named)
            ? named.name.text === varName
            : named.elements.some((element) => element.name.text === varName)));
      if (binds && !i18nModules.has(statement.moduleSpecifier.text)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 翻译调用是否真的调在 i18n 绑定上——按名匹配之外再解析这一处引用「看到的是谁」。
   *
   * library.isTranslationCall 只看形态：react-i18next 认任何裸 `t(...)`、react-intl 认任何
   * `intl.formatMessage(...)`。业务代码里的同名绑定（`const { t } = useTemperature()`、
   * `import { t } from '@/utils/tiny-template'`、`const intl = createIntl(...)`）一旦实参恰好
   * 撞上 locale 里的 key，就会被静默替换成翻译文案——改写的是与 i18n 无关的业务调用。
   *
   * 合法来源与 generate 端 hasConflictingTranslationBinding 同一份口径
   * （isI18nSourceDeclaration）：i18n hook 解构 / 库全局函数声明 / `this.props` 解构 /
   * HOC 注入的形参，加上 tImport 与库自身模块的具名导入。
   * 保守方向：查不到任何绑定（模块级注入的裸 t、跨文件全局）时按 i18n 来源处理，照常还原。
   */
  private isRestorableTranslationCall(node: ts.CallExpression, sourceFile: ts.SourceFile): boolean {
    if (!this.library.isTranslationCall(node)) {
      return false;
    }
    const varName = this.library.translationVarName;
    const callee = node.expression;
    // 取调用的根标识符：裸 `t(...)` 取 t，`intl.formatMessage(...)` 取 intl。
    // `props.t` / `this.props.t` / `i18next.t` 的根不是翻译变量，其接收者已由 library 的
    // 白名单收窄，不再重复判定。
    const root = ts.isIdentifier(callee)
      ? callee
      : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)
        ? callee.expression
        : undefined;
    if (!root || root.text !== varName) {
      return true;
    }

    const declaration = findInnermostBindingDeclaration(root, varName);
    if (declaration) {
      return ReactASTUtils.isI18nSourceDeclaration(declaration, {
        hookName: this.library.hookName,
        hocPropsType: this.library.hocPropsType,
        isHOCCall: (expression) => this.library.isHOCCall(expression),
        isI18nDeclaration: (decl) =>
          this.library.isHookDeclaration(decl) ||
          this.library.isGlobalFunctionDeclaration(decl) ||
          this.declarationBindsVarFromThisProps(decl, varName),
      });
    }
    return !this.importsTranslationVarFromForeignModule(sourceFile, varName);
  }

  /**
   * 转换翻译函数调用
   */
  private transformTranslationCall(
    node: ts.CallExpression,
    localeMap: Record<string, string>,
    definedMessages: Map<string, MessageInfo>,
    sourceFile: ts.SourceFile,
  ): ts.Node | null {
    if (!this.isRestorableTranslationCall(node, sourceFile)) {
      return null;
    }

    const messageInfo = this.library.extractCallInfo(node, definedMessages, sourceFile);
    if (!isValidMessage(messageInfo)) {
      return null;
    }
    // values 含展开等无法静态解析的形态：保留原调用（返回 null 会触发 survivalScan 的
    // keep* 守卫，声明与导入一并保留），避免残缺 values 导致占位符字面化、变量被删。
    if (messageInfo.hasUnresolvableValues) {
      return null;
    }

    const messageTemplate = messageInfo.id ? localeMap[messageInfo.id] : undefined;
    const templateToUse =
      messageTemplate ?? this.normalizeDefaultMessage(messageInfo.defaultMessage);
    if (templateToUse === undefined) {
      return null;
    }

    const values = messageInfo.values;
    if (
      values &&
      Object.keys(values).length > 0 &&
      !this.canRestorePlaceholders(templateToUse, values, messageInfo.id, node, sourceFile)
    ) {
      return null;
    }

    return createStringOrTemplateNode(templateToUse, values);
  }

  /**
   * locale 缺 key 时用源码里的 defaultMessage 当兜底模板——但 localeMap 已在 transform()
   * 入口经 normalizeRestoreLocaleMap 归一，defaultMessage 来自源码尚未归一（i18next 系为
   * 双花括号 `{{name}}`、可能含写盘转义的字面量花括号）。不归一就喂给单花括号还原逻辑会把
   * `{{name}}` 解析成字面量 `{name`、丢失运行时变量。这里套用同一口径补齐。
   */
  private normalizeDefaultMessage(defaultMessage: string | undefined): string | undefined {
    return defaultMessage === undefined
      ? undefined
      : normalizeRestoreMessage(defaultMessage, this.library);
  }

  /**
   * 转换翻译 JSX 组件
   *
   * @param inJsxChildContext - 调用方是否处于 JsxElement.children 位置。
   *   - true: 返回 JsxText（JSX children 合法）；
   *   - false: 返回 StringLiteral（适用于 JsxAttribute={<Trans />} 等表达式位置，
   *            JsxText 在此处会产生非法 AST）。
   */
  private transformTranslationComponent(
    node: ts.JsxElement | ts.JsxSelfClosingElement,
    localeMap: Record<string, string>,
    definedMessages: Map<string, MessageInfo>,
    sourceFile: ts.SourceFile,
    inJsxChildContext: boolean,
  ): ts.Node | null {
    const openingElement = ts.isJsxElement(node) ? node.openingElement : node;

    if (
      !ts.isIdentifier(openingElement.tagName) ||
      !this.library.isTranslationComponent(openingElement.tagName.text)
    ) {
      return null;
    }

    // 带非空 children 的翻译组件是用户手写形态（富文本 <Trans>你好 <b>{name}</b></Trans>、
    // <FormattedMessage>{txt => …}</FormattedMessage> render-prop）：extractJSXInfo 只读
    // 属性、完全不解析 children，整节点替换会把 <b>/<Link> 子树、render-prop 不可恢复地
    // 删除。工具自产的组件恒为自闭合无 children，此守卫不影响还原自产代码。
    if (ts.isJsxElement(node)) {
      const hasMeaningfulChild = node.children.some(
        (child) => !(ts.isJsxText(child) && child.text.trim() === ''),
      );
      if (hasMeaningfulChild) {
        return null;
      }
    }

    const messageInfo = this.library.extractJSXInfo(openingElement, definedMessages, sourceFile);
    if (!isValidMessage(messageInfo)) {
      return null;
    }
    // 与 transformTranslationCall 同款守卫：values 无法静态解析时保留原组件
    if (messageInfo.hasUnresolvableValues) {
      return null;
    }

    const messageTemplate = messageInfo.id ? localeMap[messageInfo.id] : undefined;
    const finalText = messageTemplate ?? this.normalizeDefaultMessage(messageInfo.defaultMessage);
    // 与 transformTranslationCall 的 `templateToUse === undefined → return null` 对称：
    // id 查不到且无 defaultMessage 时返回 null 保留原组件，避免 `?? ''` 兜底把
    // <Trans>/<FormattedMessage> 静默替换成空节点，造成不可恢复的 JSX 内容丢失。
    if (finalText === undefined) {
      return null;
    }

    if (messageInfo.values && Object.keys(messageInfo.values).length > 0) {
      // 与 transformTranslationCall 同款自检：失配时保留原组件，并只产出一条可操作告警。
      if (
        !this.canRestorePlaceholders(
          finalText,
          messageInfo.values,
          messageInfo.id,
          node,
          sourceFile,
        )
      ) {
        return null;
      }
      // JSX 子节点位置：重建为 JSX 片段 `<>文本 {expr} 文本</>`，避免把模板字面量
      // (`` `文本 ${expr}` ``)当作字面文本渲染。非 JSX 位置(如 attr={<Trans/>})
      // 仍用模板字面量。
      if (inJsxChildContext) {
        const fragment = createJsxFragmentFromTemplate(finalText, messageInfo.values);
        if (fragment) return fragment;
      }
      return createStringOrTemplateNode(finalText, messageInfo.values);
    }

    if (inJsxChildContext) {
      // JsxText 不能含 JSX 元字符（`<` 非法、`{}` 会被当表达式容器）。含元字符时改用字符串
      // 表达式容器 `{'...'}` 原样承载，与 createJsxFragmentFromTemplate.pushText 同款守卫；
      // 否则产出不可编译的 TSX（如文案 "1 < 2" / "点击 {这里}"）。
      // U+00A0 重编码为 `&nbsp;`：字面 NBSP 渲染无差，但会触发 eslint no-irregular-whitespace
      // （error 级）挂掉项目 lint。与 restore-node-factory 的 JsxText 分支、Vue 端同口径。
      return /[<>{}]/.test(finalText)
        ? ts.factory.createJsxExpression(undefined, ts.factory.createStringLiteral(finalText))
        : ts.factory.createJsxText(finalText.replace(/\u00A0/g, '&nbsp;'), false);
    }
    return ts.factory.createStringLiteral(finalText);
  }

  /**
   * 创建 AST 转换器
   */
  private createTransformer(context: TransformContext): ts.TransformerFactory<ts.SourceFile> {
    const library = this.library;

    // unwrapHOC 真正能解包 / 删除的那些 HOC 调用节点。survivalScan 用它反查「命中 isHOCCall
    // 但不在此集合」的调用——那些 HOC 会原样保留在产物里（见 keepLibraryImport 处注释）。
    // 由 prepass 填充，口径必须与 unwrapHOC 的 case 1（export default HOC(x)）/ case 2
    // （声明名进 componentNameMap）严格一致，否则会漏保留 import 或过度保留。
    const unwrappableHocCalls = new Set<ts.Node>();

    // `export default <Identifier>` 导出的标识符名：类组件默认导出的 HOC 注入形态是
    // 「const 原名 = HOC(内部名) + export default 原名」，据此把该内部名记入
    // defaultExportedHocInnerNames，让 unwrapHOC 把 `export default` 还给改回原名的类。
    const defaultExportedIdentifiers = new Set<string>();
    for (const statement of context.sourceFile.statements) {
      if (
        ts.isExportAssignment(statement) &&
        !statement.isExportEquals &&
        ts.isIdentifier(statement.expression)
      ) {
        defaultExportedIdentifiers.add(statement.expression.text);
      }
    }

    // 预备遍历，收集 HOC 组件的名称映射
    function prepass(node: ts.Node) {
      if (ts.isVariableDeclaration(node)) {
        if (ts.isIdentifier(node.name) && node.initializer) {
          const wrappedComponent = library.getHOCWrappedComponent(node.initializer);
          if (wrappedComponent) {
            unwrappableHocCalls.add(node.initializer);
            context.componentNameMap.set(node.name.text, wrappedComponent);
            // 类组件 HOC 约定：内部类名 = 原名 + 'WithOutIntl'。若该 HOC 导出语句带 export，
            // 记录内部类名，供 unwrapHOC 把类改回原名时恢复 export。
            // 两个判定并列而非互斥：源文件可以同时具名导出与默认导出同一个类
            // （`export class Foo` + `export default Foo`），只记其一会永久丢掉另一条导出。
            if (wrappedComponent === node.name.text + HOC_CLASS_SUFFIX) {
              if (
                ts.isVariableDeclarationList(node.parent) &&
                ts.isVariableStatement(node.parent.parent) &&
                node.parent.parent.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
              ) {
                context.exportedHocInnerNames!.add(wrappedComponent);
              }
              if (defaultExportedIdentifiers.has(node.name.text)) {
                context.defaultExportedHocInnerNames!.add(wrappedComponent);
              }
            }
          }
        }
      }
      // `export default HOC(FooWithOutIntl)`：记录内部类名，供 unwrapHOC 删除该默认导出语句、
      // 并在类改回原名时恢复 `export default`。
      if (
        ts.isExportAssignment(node) &&
        !node.isExportEquals &&
        ts.isCallExpression(node.expression)
      ) {
        const wrappedComponent = library.getHOCWrappedComponent(node.expression);
        if (wrappedComponent) {
          unwrappableHocCalls.add(node.expression);
          if (wrappedComponent.endsWith(HOC_CLASS_SUFFIX)) {
            context.defaultExportedHocInnerNames!.add(wrappedComponent);
          }
        }
      }
      ts.forEachChild(node, prepass);
    }
    prepass(context.sourceFile);

    // 还原存活性预扫描：判断还原后是否仍有「未被还原」的翻译调用 / 组件（locale 缺 key、
    // 动态 key、t(变量) 等 → transformTranslationCall/Component 返回 null、原节点存活）。
    //  - keepTranslationVar：任一翻译【调用】存活 → 翻译变量(t/intl)仍被引用，保留其声明
    //  - keepLibraryImport：任一翻译【调用或组件】存活 → 其依赖的具名导入必须保留
    // 皆为保守保留：宁可多留一条声明/导入（最多触发 no-unused lint），也不产出引用未定义
    // 标识符的不可编译代码。完整 localeMap 的常规往返两者均为 false，行为与既有一致。
    let keepTranslationVar = false;
    let keepLibraryImport = false;
    // 混合解构 hook（`const { t, i18n } = useTranslation()`）中，cleanupVariableStatements 会剥掉
    // 翻译项 t、保留 `const { i18n } = useTranslation()`；此时该声明仍引用库的具名导入
    // （useTranslation），整条 import 必须保留，否则产出引用未定义符号的不可编译代码。此情形与
    // 「翻译调用/组件存活」无关，故用独立标志，且仅作用于 import 清理、不影响 HOC 解除的 keep* 门控。
    let keepLibraryImportForBinding = false;
    const survivalScan = (node: ts.Node): void => {
      if (keepTranslationVar && keepLibraryImport && keepLibraryImportForBinding) return;
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (library.isHookDeclaration(decl) && ts.isObjectBindingPattern(decl.name)) {
            const hasResidualBinding = decl.name.elements.some(
              (element) =>
                ts.isBindingElement(element) &&
                ts.isIdentifier(element.name) &&
                element.name.text !== library.translationVarName,
            );
            if (hasResidualBinding) keepLibraryImportForBinding = true;
          }
          // 改名的 hook 声明（如 react-intl `const myIntl = useIntl()`，绑定名非 translationVarName）
          // 经 isHookDeclaration 收窄后不再被删（Bug 1），但它仍引用库的具名导入（useIntl）。若不保留
          // 整条 import，摘除 useIntl 后该声明引用未定义符号（TS2304）。用初始化器调用 hookName、且
          // 非标准 hook 声明来识别。仅认 hookName（非 globalFunctionName），避免 react-i18next 的
          // globalFunctionName='t' 把 `const x = t('key')`（可还原翻译调用）误判为需保留导入。
          if (
            decl.initializer &&
            ts.isCallExpression(decl.initializer) &&
            ts.isIdentifier(decl.initializer.expression) &&
            decl.initializer.expression.text === library.hookName &&
            !library.isHookDeclaration(decl)
          ) {
            keepLibraryImportForBinding = true;
          }
        }
      }
      // 解不掉的 HOC 调用（`withTranslation()(connect()(X))`、路由表对象里的
      // `{ component: injectIntl(Foo) }` 等 unwrapHOC 不覆盖的位置）会原样留在产物里，
      // 仍引用库的具名导入（withTranslation / injectIntl）。它们既不是翻译调用也不是翻译
      // 组件，只统计翻译调用/组件的话 survivalScan 一条都不会计 → keepLibraryImport 保持
      // false → import 被摘除而调用还在，运行时 ReferenceError。故凡命中 isHOCCall 却不在
      // unwrappableHocCalls 里的调用一律保留导入（走 library 抽象，两个库同型）。
      if (ts.isCallExpression(node) && library.isHOCCall(node) && !unwrappableHocCalls.has(node)) {
        keepLibraryImport = true;
      }
      // 用 isRestorableTranslationCall 而非 library.isTranslationCall：调在业务同名绑定上的
      // 伪翻译调用本就不该还原，若把它计入「存活翻译调用」会让整文件的 keep* 旗标恒为 true，
      // 真正的 hook 声明与库导入反而清理不掉。
      if (ts.isCallExpression(node) && this.isRestorableTranslationCall(node, context.sourceFile)) {
        const restored = this.transformTranslationCall(
          node,
          context.localeMap,
          context.definedMessages,
          context.sourceFile,
        );
        if (restored === null) {
          keepTranslationVar = true;
          keepLibraryImport = true;
        }
      } else if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const opening = ts.isJsxElement(node) ? node.openingElement : node;
        if (
          ts.isIdentifier(opening.tagName) &&
          library.isTranslationComponent(opening.tagName.text)
        ) {
          const restored = this.transformTranslationComponent(
            node,
            context.localeMap,
            context.definedMessages,
            context.sourceFile,
            false,
          );
          if (restored === null) keepLibraryImport = true;
        }
      }
      ts.forEachChild(node, survivalScan);
    };
    survivalScan(context.sourceFile);

    // 判定翻译变量(varName)是否经「成员访问」被用于非翻译用途（如 intl.formatNumber /
    // intl.formatDate / intl.locale）。这正是 react-intl 缺口的精确特征：intl 是多用途对象，
    // 还原 formatMessage 后这些成员用途仍引用 intl，删声明即产出未定义引用。
    //
    // 计入两类「翻译调用之外」对 varName 的引用：
    //  1. 成员访问 `varName.<member>`（intl.formatNumber / intl.locale 等多用途对象成员）；
    //  2. 裸标识符值引用（passToChild(t) / <Child t={t}/> / const x = t / 透传等手写用法）。
    // 刻意排除的非引用 / 机器注入位置：
    //  - 翻译调用接收者（t / intl.formatMessage）随还原整体消失，跳过其被调表达式、只查实参；
    //  - 翻译依赖 hook（useCallback/useMemo/useEffect/useLayoutEffect）的依赖数组 `[t]` 是机器
    //    注入的镜像项，由 cleanupHookDependencies 单独按「回调体是否真用 t」清理，不计为独立使用
    //    （只查回调体，跳过 deps 数组），否则常规往返 `[t]` 删不掉；
    //  - 声明 / 解构绑定名（尤其 `const { t } = useTranslation()` 自身）、对象键、成员名、
    //    import/export 具名、JSX 属性名等非值读取位置（见 isIdentifierValueReference）。
    //
    // 关键：只在「绑定 varName 的合法声明（hook / getIntl 全局声明 / this.props 解构，见
    // declarationBindsTranslationVar）所在的函数作用域」内扫描，而非全文件——否则其它组件里
    // 同名但来源无关的变量（如 `const { t } = useTemperature()`）会被按名误判为翻译变量的
    // 使用，错误地阻止删除真正的 i18n 声明。无绑定声明（如 standalone tImport 路径）则返回 false。
    //
    // 历史上本守卫只认成员访问、漏判裸标识符，导致 react-i18next 把 t 当裸值透传且全部 t() 可还原时
    // 误删声明与 import、留下未定义 t（ReferenceError / TS2304）。与 ReactImportManager
    // .callbackUsesVarOutsideTranslationCalls 的裸标识符判定口径对齐。
    const translationVarUsedOutsideTranslationCalls = (root: ts.Node): boolean => {
      const varName = library.translationVarName;

      // 收集所有「绑定了 varName 的合法声明（hook / getIntl / this.props）」的扫描区间：
      // scope 是要遍历的函数作用域，declarationScope 是该声明所在的直接块——后者作为遮蔽
      // 判定的下界，使块内同名的循环变量 / catch 参数 / 内层 const 不被当成翻译变量引用。
      const hookScopes = new Map<ts.Node, ts.Node>();
      const collect = (node: ts.Node): void => {
        if (ts.isVariableStatement(node)) {
          for (const decl of node.declarationList.declarations) {
            if (this.declarationBindsTranslationVar(decl, varName)) {
              const scope = this.enclosingScope(node);
              if (!hookScopes.has(scope)) hookScopes.set(scope, node.parent);
            }
          }
        }
        ts.forEachChild(node, collect);
      };
      collect(root);
      if (hookScopes.size === 0) return false;

      let declarationScope: ts.Node = root;
      let found = false;
      const visit = (node: ts.Node): void => {
        if (found) return;
        // 翻译调用：跳过被调表达式，仅查实参
        if (ts.isCallExpression(node) && library.isTranslationCall(node)) {
          node.arguments.forEach(visit);
          return;
        }
        // 翻译依赖 hook：跳过依赖数组（arg[1]），其余（含回调体）正常遍历
        if (ts.isCallExpression(node)) {
          const hookName = resolveHookName(node);
          if (hookName && TRANSLATION_DEPENDENCY_HOOKS.includes(hookName)) {
            visit(node.expression);
            node.arguments.forEach((arg, i) => {
              if (i === 1 && ts.isArrayLiteralExpression(arg)) return;
              visit(arg);
            });
            return;
          }
        }
        // 成员访问 varName.<member> → 非翻译用途的残留引用
        if (
          ts.isPropertyAccessExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === varName &&
          !isShadowedInsideScope(node.expression, varName, declarationScope)
        ) {
          found = true;
          return;
        }
        // 裸标识符值引用（排除声明/键/成员名/import 等非引用位置，以及解析到别的同名绑定的引用）
        if (
          ts.isIdentifier(node) &&
          node.text === varName &&
          isIdentifierValueReference(node) &&
          !isShadowedInsideScope(node, varName, declarationScope)
        ) {
          found = true;
          return;
        }
        ts.forEachChild(node, visit);
      };
      for (const [scope, declScope] of hookScopes) {
        if (found) break;
        declarationScope = declScope;
        visit(scope);
      }
      return found;
    };

    // 翻译变量在「翻译调用之外」的引用守卫：survivalScan 仅把翻译【调用】计入存活，
    // 但 react-intl 的 intl 是多用途对象——`const intl = useIntl()` 既可 intl.formatMessage(...)（翻译，
    // 还原后消失），也可 intl.formatNumber/formatDate/locale 等（非翻译，还原不动）。若 formatMessage
    // 全部可还原，keepTranslationVar 保持 false → 删 intl 声明与 useIntl 导入，残留的 intl.formatNumber
    // 便引用未定义的 intl（TS2304 / 运行时 ReferenceError）。react-i18next 的 t 作为值被传递（如
    // `[t]` 依赖、`<Child t={t} />`）同理。补一次全文件扫描：翻译变量在翻译调用之外仍被引用 → 保留
    // 其声明与库导入（与既有 keep* 同为保守保留；变量仅用于可还原 formatMessage 时不命中、照常删除）。
    if (!keepTranslationVar && translationVarUsedOutsideTranslationCalls(context.sourceFile)) {
      keepTranslationVar = true;
      keepLibraryImport = true;
    }

    // 手写「HOC 注入 + 形参解构」组件的守卫（见 hasHandwrittenHocParamInjection）：形参 `{ t, x }`
    // 不是本转换器能安全改写的东西（删 t 会改函数签名、留 t 又要求类型里有 t），所以整组
    // 保守保留——不剥 hocPropsType heritage、不解包 HOC、不删库导入与翻译变量声明。文案本身
    // 照常还原，只是 HOC 脚手架留在原地交人工摘除。与上面的 keep* 一致：宁可多留、不产坏代码。
    if (
      !(keepTranslationVar && keepLibraryImport) &&
      this.hasHandwrittenHocParamInjection(context.sourceFile, library)
    ) {
      keepTranslationVar = true;
      keepLibraryImport = true;
      LoggerUtils.warn(
        `⚠️ 跳过 HOC 解包与 ${library.hocPropsType} 类型清理：${context.sourceFile.fileName}\n` +
          `   原因：组件把 '${library.translationVarName}' 绑定在形参解构上（由 HOC 以 prop 传入），` +
          `自动剥离会留下类型上不存在的属性（TS2339）。\n` +
          `   建议：人工移除形参中的 '${library.translationVarName}'、Props 的 ${library.hocPropsType} 继承与 HOC 包裹。`,
      );
    }

    return (transformationContext: ts.TransformationContext) => {
      // 父节点栈：判断当前 visit 节点是否在 JsxElement.children 位置；
      // 在 JsxAttribute / JsxExpression 内部时不能用 JsxText 替换 SelfClosingElement。
      const parentStack: ts.Node[] = [];

      const visit = (node: ts.Node): ts.Node | ts.Node[] => {
        const parent = parentStack[parentStack.length - 1];
        const inJsxChildContext =
          parent !== undefined && (ts.isJsxElement(parent) || ts.isJsxFragment(parent));
        let currentNode = node;

        // 1-3. 重命名组件引用 + 解除 HOC + 清理 HOC Props 类型引用。
        // 仅当无存活翻译用法时才执行：若某翻译调用/组件未被还原（locale 缺 key 等），它可能
        // 依赖 HOC 注入的 intl/props（如 class 组件 `this.props.intl.formatMessage(...)`），此时
        // 解除 HOC 会删掉 wrapper 与 WrappedComponentProps 类型 → intl 运行时 undefined + TS 报错，
        // 正是 keepTranslationVar/keepLibraryImport 守卫要防止的不可编译输出。与下方
        // cleanupImports/cleanupVariableStatements 的 keep* 守卫采用一致的保守策略。
        //
        // 重命名（步骤 1）必须与解除 HOC（步骤 2）受同一守卫门控：二者是一对逆操作——把
        // `<Injected/>` 改回 `<MyComp/>` 只有在同时解除 HOC 包裹语句时才自洽。守卫为 true 时
        // HOC 包裹语句被保留（`const Injected = injectIntl(MyComp)`），若仍单独重命名 JSX 引用
        // 会绕过 HOC 渲染裸类，运行时 this.props.intl undefined。故三步同门控。
        // 注：工具自产形态（XxxWithOutIntl 后缀）在 renameComponent/unwrapHOC 内各有提前 return，
        // 常规往返（守卫为 false）行为不变。
        if (!keepTranslationVar && !keepLibraryImport) {
          // 1. 重命名组件引用
          currentNode = renameComponent(currentNode, context);
          if (currentNode !== node) context.hasChanges = true;

          // 2. 解除 HOC
          currentNode = unwrapHOC(currentNode, context, library);
          if (currentNode !== node) context.hasChanges = true;

          // 3. 清理 HOC Props 类型引用
          currentNode = cleanupHOCPropsType(currentNode, library);
          if (currentNode !== node) context.hasChanges = true;
        }

        let nodeChanged = false;

        // JSX 静态属性：`title={t('key')}` 的调用还原成纯字符串字面量时，连表达式容器一并
        // 去掉，还原回源码里的 `title="标题"`。只替换容器内的调用会留下源码中不存在的
        // `title={"标题"}`。含 `"` / 换行的文案保留容器：JSX 属性值不解析反斜杠转义，
        // 直接落成属性会提前闭合引号。
        if (
          ts.isJsxExpression(currentNode) &&
          parent !== undefined &&
          ts.isJsxAttribute(parent) &&
          currentNode.expression &&
          ts.isCallExpression(currentNode.expression)
        ) {
          const restored = this.transformTranslationCall(
            currentNode.expression,
            context.localeMap,
            context.definedMessages,
            context.sourceFile,
          );
          if (restored && ts.isStringLiteral(restored) && !/["\r\n]/.test(restored.text)) {
            context.hasChanges = true;
            return restored;
          }
        }

        // 转换翻译函数调用
        if (ts.isCallExpression(currentNode)) {
          const original = currentNode;
          const transformedNode = this.transformTranslationCall(
            original,
            context.localeMap,
            context.definedMessages,
            context.sourceFile,
          );
          if (transformedNode) {
            context.hasChanges = true;
            currentNode = ReactRestoreTransformer.withLeadingComments(
              transformedNode,
              original,
              context.sourceFile,
            );
            nodeChanged = true;
          }
        }

        // 对象字面量内的翻译调用（如 `{ label: t('key') }`）无需专门处理：
        // 下方 ts.visitEachChild 会递归到每个属性 initializer，其中的 CallExpression
        // 由上面的通用分支转换，产出与手工重建 ObjectLiteral 完全一致（且能覆盖
        // 三元/嵌套等通用分支才处理的形态）。故此处不再重复实现。

        if (!nodeChanged) {
          // 转换翻译 JSX 组件
          if (ts.isJsxElement(currentNode) || ts.isJsxSelfClosingElement(currentNode)) {
            const transformedNode = this.transformTranslationComponent(
              currentNode,
              context.localeMap,
              context.definedMessages,
              context.sourceFile,
              inJsxChildContext,
            );
            if (transformedNode) {
              context.hasChanges = true;
              currentNode = transformedNode;
            }
          }

          // 清理导入（仅整条移除 i18n 库 import；tImport 的 t 延后到收尾 pass 带守卫处理）
          if (ts.isImportDeclaration(currentNode)) {
            const cleanedNode = ReactImportManager.cleanupImports(
              currentNode,
              library,
              keepLibraryImport || keepLibraryImportForBinding,
            );
            if (cleanedNode !== currentNode) {
              context.hasChanges = true;
              currentNode = cleanedNode;
            }
          }

          // 清理变量声明
          if (ts.isVariableStatement(currentNode)) {
            const cleanedNode = cleanupVariableStatements(currentNode, library, keepTranslationVar);
            if (cleanedNode !== currentNode) {
              context.hasChanges = true;
              currentNode = cleanedNode;
            }
          }

          // 清理Hook依赖数组（与上面的导入/变量清理共用 keepTranslationVar 守卫：
          // 翻译变量被保留时不得从 deps 数组剥离 t，避免悬空 deps + 陈旧闭包）
          if (ts.isCallExpression(currentNode)) {
            const cleanedNode = cleanupHookDependencies(currentNode, library, keepTranslationVar);
            if (cleanedNode !== currentNode) {
              context.hasChanges = true;
              currentNode = cleanedNode;
            }
          }
        }

        parentStack.push(currentNode);
        const result = ts.visitEachChild(currentNode, visit, transformationContext);
        parentStack.pop();
        return result;
      };

      return (sourceFile: ts.SourceFile) => ts.visitNode(sourceFile, visit) as ts.SourceFile;
    };
  }
}
