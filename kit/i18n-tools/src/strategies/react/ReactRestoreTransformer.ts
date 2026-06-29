import fs from 'fs';
import ts from 'typescript';
import { CommonASTUtils } from '../../utils/common-ast-utils';
import { ReactImportManager, HOC_CLASS_SUFFIX } from './ReactImportManager';
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

  /**
   * 判断一个 Identifier 是否处于「值读取位置」（真正引用了同名变量），用于区分裸值引用与
   * 声明 / 绑定名 / 对象键 / 成员名 / import-export 具名 / JSX 属性名等非引用位置。
   *
   * 依赖 parent 指针——本守卫作用于 CommonASTUtils.parseSourceFile（createSourceFile 的
   * setParentNodes=true）解析出的原始 sourceFile，parent 完整可用。
   * 注意：对象简写 `{ t }`（ShorthandPropertyAssignment.name）属值引用，不排除。
   */
  private isIdentifierValueReference(id: ts.Identifier): boolean {
    const parent = id.parent;
    if (!parent) return true;
    // 声明 / 绑定名位置
    if (
      (ts.isBindingElement(parent) && (parent.name === id || parent.propertyName === id)) ||
      (ts.isVariableDeclaration(parent) && parent.name === id) ||
      (ts.isParameter(parent) && parent.name === id) ||
      (ts.isFunctionDeclaration(parent) && parent.name === id) ||
      (ts.isClassDeclaration(parent) && parent.name === id)
    ) {
      return false;
    }
    // 成员名 obj.t（接收者非 t）/ 对象键 { t: x } / JSX 属性名 t={...} / 限定名
    if (ts.isPropertyAccessExpression(parent) && parent.name === id) return false;
    if (ts.isPropertyAssignment(parent) && parent.name === id) return false;
    if (ts.isJsxAttribute(parent) && parent.name === id) return false;
    if (ts.isQualifiedName(parent) && parent.right === id) return false;
    // import / export 具名（含别名两侧）
    if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) return false;
    return true;
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

  transform(filePath: string, localeMap: LocaleMap): string {
    const sourceText = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = CommonASTUtils.parseSourceFile(sourceText, filePath);

    // locale 值归一：i18next 系库双花括号 → 单花括号；并 unescape 写盘时转义的字面量花括号。
    // 与 Vue restore 共用 CommonASTUtils.normalizeRestoreLocaleMap（消除两端重复实现）。
    const normalizedLocaleMap = CommonASTUtils.normalizeRestoreLocaleMap(localeMap, this.library);

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
      return sourceText;
    }

    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    let transformedCode = printer.printFile(result.transformed[0]!);
    // React 端 includeJsx=true：处理 `{'...'}` 形式的 JSX 表达式包裹
    transformedCode = CommonASTUtils.convertUnicodeToChineseInCode(transformedCode, true);

    result.dispose();

    // 收尾：删除 restore 后已无引用的 tImport `t` 导入（与 generate 侧 finalizeImports 对称）。
    // 保守守卫：仅当 t 在还原后的整文件中已无任何引用时删除——若存在「locale 查不到、未被还原」
    // 的存活 t() 调用，t 仍被使用，必须保留 import，否则产出 `Cannot find name 't'`（TS2304）。
    transformedCode = this.finalizeTImport(transformedCode, filePath);

    return transformedCode;
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
    if (!CommonASTUtils.isImportedNameUnused(code, filePath, this.tImport, funcName)) {
      return code;
    }
    return CommonASTUtils.removeNamedImports(code, (m) => m === this.tImport, [funcName]);
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
    if (!this.library.isTranslationCall(node)) {
      return null;
    }

    const messageInfo = this.library.extractCallInfo(node, definedMessages, sourceFile);
    if (!isValidMessage(messageInfo)) {
      return null;
    }

    const messageTemplate = messageInfo.id ? localeMap[messageInfo.id] : undefined;
    const templateToUse =
      messageTemplate ?? this.normalizeDefaultMessage(messageInfo.defaultMessage);
    if (templateToUse === undefined) {
      return null;
    }

    return CommonASTUtils.createStringOrTemplateNode(templateToUse, messageInfo.values);
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
      : CommonASTUtils.normalizeRestoreMessage(defaultMessage, this.library);
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

    const messageInfo = this.library.extractJSXInfo(openingElement, definedMessages, sourceFile);
    if (!isValidMessage(messageInfo)) {
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
      // JSX 子节点位置：重建为 JSX 片段 `<>文本 {expr} 文本</>`，避免把模板字面量
      // (`` `文本 ${expr}` ``)当作字面文本渲染。非 JSX 位置(如 attr={<Trans/>})
      // 仍用模板字面量。
      if (inJsxChildContext) {
        const fragment = CommonASTUtils.createJsxFragmentFromTemplate(
          finalText,
          messageInfo.values,
        );
        if (fragment) return fragment;
      }
      return CommonASTUtils.createStringOrTemplateNode(finalText, messageInfo.values);
    }

    if (inJsxChildContext) {
      // JsxText 不能含 JSX 元字符（`<` 非法、`{}` 会被当表达式容器）。含元字符时改用字符串
      // 表达式容器 `{'...'}` 原样承载，与 createJsxFragmentFromTemplate.pushText 同款守卫；
      // 否则产出不可编译的 TSX（如文案 "1 < 2" / "点击 {这里}"）。
      return /[<>{}]/.test(finalText)
        ? ts.factory.createJsxExpression(undefined, ts.factory.createStringLiteral(finalText))
        : ts.factory.createJsxText(finalText, false);
    }
    return ts.factory.createStringLiteral(finalText);
  }

  /**
   * 创建 AST 转换器
   */
  private createTransformer(context: TransformContext): ts.TransformerFactory<ts.SourceFile> {
    const library = this.library;

    // 预备遍历，收集 HOC 组件的名称映射
    function prepass(node: ts.Node) {
      if (ts.isVariableDeclaration(node)) {
        if (ts.isIdentifier(node.name) && node.initializer) {
          const wrappedComponent = library.getHOCWrappedComponent(node.initializer);
          if (wrappedComponent) {
            context.componentNameMap.set(node.name.text, wrappedComponent);
            // 类组件 HOC 约定：内部类名 = 原名 + 'WithOutIntl'。若该 HOC 导出语句带 export，
            // 记录内部类名，供 unwrapHOC 把类改回原名时恢复 export（Bug B3）。
            if (
              wrappedComponent === node.name.text + HOC_CLASS_SUFFIX &&
              ts.isVariableDeclarationList(node.parent) &&
              ts.isVariableStatement(node.parent.parent) &&
              node.parent.parent.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
            ) {
              context.exportedHocInnerNames!.add(wrappedComponent);
            }
          }
        }
      }
      // `export default HOC(FooWithOutIntl)`：记录内部类名，供 unwrapHOC 删除该默认导出语句、
      // 并在类改回原名时恢复 `export default`（Bug #1 的 restore 配套）。
      if (
        ts.isExportAssignment(node) &&
        !node.isExportEquals &&
        ts.isCallExpression(node.expression)
      ) {
        const wrappedComponent = library.getHOCWrappedComponent(node.expression);
        if (wrappedComponent && wrappedComponent.endsWith(HOC_CLASS_SUFFIX)) {
          context.defaultExportedHocInnerNames!.add(wrappedComponent);
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
        }
      }
      if (ts.isCallExpression(node) && library.isTranslationCall(node)) {
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
    // 关键：只在「绑定 varName 的 i18n hook 声明所在的函数作用域」内扫描，而非全文件——否则其它
    // 组件里同名但来源无关的变量（如 `const { t } = useTemperature()`）会被按名误判为翻译变量的
    // 使用，错误地阻止删除真正的 i18n 声明。无 hook 声明（如 standalone tImport 路径）则返回 false。
    //
    // 历史上本守卫只认成员访问、漏判裸标识符，导致 react-i18next 把 t 当裸值透传且全部 t() 可还原时
    // 误删声明与 import、留下未定义 t（ReferenceError / TS2304）。与 ReactImportManager
    // .callbackUsesVarOutsideTranslationCalls 的裸标识符判定口径对齐。
    const translationVarUsedOutsideTranslationCalls = (root: ts.Node): boolean => {
      const varName = library.translationVarName;

      // 收集所有「绑定了 varName 的 i18n hook 声明」所属的函数作用域（去重）
      const hookScopes = new Set<ts.Node>();
      const collect = (node: ts.Node): void => {
        if (ts.isVariableStatement(node)) {
          for (const decl of node.declarationList.declarations) {
            if (library.isHookDeclaration(decl) && this.declarationBindsVar(decl, varName)) {
              hookScopes.add(this.enclosingScope(node));
            }
          }
        }
        ts.forEachChild(node, collect);
      };
      collect(root);
      if (hookScopes.size === 0) return false;

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
          node.expression.text === varName
        ) {
          found = true;
          return;
        }
        // 裸标识符值引用（排除声明/键/成员名/import 等非引用位置）
        if (
          ts.isIdentifier(node) &&
          node.text === varName &&
          this.isIdentifierValueReference(node)
        ) {
          found = true;
          return;
        }
        ts.forEachChild(node, visit);
      };
      for (const scope of hookScopes) {
        if (found) break;
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

    return (transformationContext: ts.TransformationContext) => {
      // 父节点栈：判断当前 visit 节点是否在 JsxElement.children 位置；
      // 在 JsxAttribute / JsxExpression 内部时不能用 JsxText 替换 SelfClosingElement。
      const parentStack: ts.Node[] = [];

      const visit = (node: ts.Node): ts.Node | ts.Node[] => {
        const parent = parentStack[parentStack.length - 1];
        const inJsxChildContext =
          parent !== undefined && (ts.isJsxElement(parent) || ts.isJsxFragment(parent));
        let currentNode = node;

        // 1. 重命名组件引用
        currentNode = ReactImportManager.renameComponent(currentNode, context);
        if (currentNode !== node) context.hasChanges = true;

        // 2-3. 解除 HOC + 清理 HOC Props 类型引用。
        // 仅当无存活翻译用法时才执行：若某翻译调用/组件未被还原（locale 缺 key 等），它可能
        // 依赖 HOC 注入的 intl/props（如 class 组件 `this.props.intl.formatMessage(...)`），此时
        // 解除 HOC 会删掉 wrapper 与 WrappedComponentProps 类型 → intl 运行时 undefined + TS 报错，
        // 正是 keepTranslationVar/keepLibraryImport 守卫要防止的不可编译输出。与下方
        // cleanupImports/cleanupVariableStatements 的 keep* 守卫采用一致的保守策略。
        if (!keepTranslationVar && !keepLibraryImport) {
          // 2. 解除 HOC
          currentNode = ReactImportManager.unwrapHOC(currentNode, context, library);
          if (currentNode !== node) context.hasChanges = true;

          // 3. 清理 HOC Props 类型引用
          currentNode = ReactImportManager.cleanupHOCPropsType(currentNode, library);
          if (currentNode !== node) context.hasChanges = true;
        }

        let nodeChanged = false;

        // 转换翻译函数调用
        if (ts.isCallExpression(currentNode)) {
          const transformedNode = this.transformTranslationCall(
            currentNode,
            context.localeMap,
            context.definedMessages,
            context.sourceFile,
          );
          if (transformedNode) {
            context.hasChanges = true;
            currentNode = transformedNode;
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
            const cleanedNode = ReactImportManager.cleanupVariableStatements(
              currentNode,
              library,
              keepTranslationVar,
            );
            if (cleanedNode !== currentNode) {
              context.hasChanges = true;
              currentNode = cleanedNode;
            }
          }

          // 清理Hook依赖数组（与上面的导入/变量清理共用 keepTranslationVar 守卫：
          // 翻译变量被保留时不得从 deps 数组剥离 t，避免悬空 deps + 陈旧闭包）
          if (ts.isCallExpression(currentNode)) {
            const cleanedNode = ReactImportManager.cleanupHookDependencies(
              currentNode,
              library,
              keepTranslationVar,
            );
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
