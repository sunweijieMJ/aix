import type { IComponentInjector } from '../../adapters/FrameworkAdapter';
import ts from 'typescript';
import { parseSourceFile } from '../../utils/ast-core';
import { LoggerUtils } from '../../utils/logger';
import { ReactASTUtils, type ConflictingBindingOptions } from './react-ast-utils';
import type { ReactImportManager } from './ReactImportManager';
import { HOC_CLASS_SUFFIX } from './react-restore-cleanup';
import type { ReactI18nLibrary } from './libraries';

interface Transformation {
  start: number;
  end: number;
  text: string;
}
interface ComponentInfo {
  name: string;
  type: 'class' | 'function';
  node: ts.ClassDeclaration | ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;
  // 'none' = 无需注入（已有绑定 / 同名冲突跳过）；此类条目不会进 componentsToModify。
  injectionType: 'hook' | 'hoc' | 'class-destructure' | 'none';
}

/**
 * 负责向React组件注入国际化能力（由 library 适配器驱动）
 */
export class ReactComponentInjector implements IComponentInjector {
  private library: ReactI18nLibrary;
  private importManager: ReactImportManager;

  constructor(library: ReactI18nLibrary, importManager: ReactImportManager) {
    this.library = library;
    this.importManager = importManager;
  }

  inject(code: string, filePath?: string): string {
    // 解析用真实文件名（缺省退回 temp.tsx）：ScriptKind 由扩展名决定，
    // 把纯 `.ts` 按 TSX 解析会让 `<T>expr` 类型断言被当成 JSX 元素——TS 不抛错、就地
    // 恢复出错误的树，注入判定随之走偏（多注/漏注 hook）。
    const parseName = filePath ?? 'temp.tsx';
    // 类型实参 / `import type` 只能写进 TS 文件：.js/.jsx 里是语法错误（Babel 直接解析失败），
    // 而 FrameworkConfig.extensions 本就包含它们。
    const emitsTypes = /\.[cm]?tsx?$/i.test(parseName);
    // Phase 1: 分析原始代码，找出需要注入的组件
    const initialSourceFile = parseSourceFile(code, parseName);
    const componentsToModify: ComponentInfo[] = [];

    const warnedPlainlyCalled = new Set<string>();
    const initialVisitor = (node: ts.Node) => {
      // 渲染助手被当普通函数调用（`Tip()` / `dense ? Cell(r) : <Cell/>`）：注入 hook 会让
      // hook 在调用方组件里被条件执行，违反 Hooks 规则。判定收口在 getComponentInfo
      // （不认作可注入组件，文案改走模块级全局 t/getIntl），这里只补一条告警。
      const plainlyCalled = ReactASTUtils.getPlainlyCalledComponentName(node);
      if (plainlyCalled && !warnedPlainlyCalled.has(plainlyCalled)) {
        warnedPlainlyCalled.add(plainlyCalled);
        LoggerUtils.warn(
          `⚠️ 跳过注入：${plainlyCalled} 在文件内被当作普通函数调用（${plainlyCalled}(...)），` +
            `注入 ${this.library.hookName}() 会违反 Hooks 规则。` +
            `该处文案改用模块级 '${this.library.globalFunctionName}'；如需组件级 i18n，` +
            `请把调用点改成 JSX 用法（<${plainlyCalled} />）后重跑。`,
        );
      }

      const componentInfo = ReactASTUtils.getComponentInfo(node);
      if (componentInfo) {
        const injectionType = this.decideInjection(componentInfo, initialSourceFile, (name, why) =>
          LoggerUtils.warn(
            why === 'injected-name'
              ? `⚠️ 跳过注入：组件 ${name} 所在模块顶层已存在与待注入名同名、且非 i18n 来源的绑定，` +
                  `再从 '${this.library.packageName}' 导入会造成重复标识符。请人工确认该文件的 i18n 接入方式。`
              : `⚠️ 跳过注入：组件 ${name} 自身或其外层作用域（含模块顶层）已存在与 ` +
                  `'${this.library.translationVarName}' 同名的非 i18n 本地绑定，` +
                  `注入 ${this.library.hookName}() 会造成重复声明。请人工确认该组件的 i18n 接入方式。`,
          ),
        );
        if (injectionType !== 'none') {
          componentsToModify.push({ ...componentInfo, injectionType });
        }
      }
      ts.forEachChild(node, initialVisitor);
    };
    ts.forEachChild(initialSourceFile, initialVisitor);

    if (componentsToModify.length === 0) {
      return code;
    }

    // Phase 2: 添加必要的导入（使用注入的 importManager 以共享配置）
    let codeWithImports = code;
    if (componentsToModify.some((c) => c.injectionType === 'hook')) {
      codeWithImports = this.importManager.addI18nImports(codeWithImports, [this.library.hookName]);
    }
    if (componentsToModify.some((c) => c.injectionType === 'hoc')) {
      const hocImports = this.library.getImportSpecifiers({
        hasJsxComponent: false,
        hasHook: false,
        hasHOC: true,
      });
      codeWithImports = this.importManager.addI18nImports(codeWithImports, hocImports.values);
      // Props 类型（WithTranslation / WrappedComponentProps）走 `import type` 单独一行：
      // 并进值导入在 verbatimModuleSyntax 下是 TS1484。JS 文件不写类型导入。
      if (emitsTypes) {
        codeWithImports = this.importManager.addI18nTypeImports(codeWithImports, hocImports.types);
      }
    }

    // Phase 3: 重新解析带有新导入的代码并应用转换
    const sourceFileWithImports = parseSourceFile(codeWithImports, parseName);
    const transformations: Transformation[] = [];

    const finalVisitor = (node: ts.Node) => {
      const componentInfo = ReactASTUtils.getComponentInfo(node);
      if (componentInfo) {
        // 就地重算注入判定，**不**按 name+type 去 componentsToModify 里查表：文件内同名
        // 组件（不同作用域的两个 `function Panel()`）会全部命中同一条目，已有 hook 的那个
        // 也被再注入一次 → 同块双 const { t }（TS2451）。Phase 2 只在文件顶部增删 import，
        // 不改变任何组件内部的绑定情况，故重算结果与 Phase 1 逐个组件一一对应，
        // 且天然免疫 import 注入带来的偏移平移（无需记录/修正位置）。
        // Phase 1 的收集结果只用于决定「这一轮要补哪些 import」。
        const injectionType = this.decideInjection(componentInfo, sourceFileWithImports);

        if (injectionType === 'hook' && componentInfo.type === 'function') {
          this.injectHook(
            componentInfo.node as ts.ArrowFunction | ts.FunctionExpression,
            sourceFileWithImports,
            transformations,
          );
        } else if (injectionType === 'hoc' && componentInfo.type === 'class') {
          this.injectHOC(
            componentInfo.node as ts.ClassDeclaration,
            componentInfo.name,
            sourceFileWithImports,
            transformations,
            emitsTypes,
          );
        } else if (injectionType === 'class-destructure' && componentInfo.type === 'class') {
          // 已被 HOC 包裹的类组件：只补方法体 this.props 解构，不二次包裹。
          this.injectClassMethodDestructure(
            componentInfo.node as ts.ClassDeclaration,
            sourceFileWithImports,
            transformations,
          );
        }
      }
      ts.forEachChild(node, finalVisitor);
    };
    ts.forEachChild(sourceFileWithImports, finalVisitor);

    return this.applyTransformations(codeWithImports, transformations);
  }

  /**
   * 单个组件需要哪种注入 —— Phase 1（决定补哪些 import）与 Phase 3（真正落注入）共用的
   * 唯一判定点。两处曾各写一半（Phase 3 只按 name+type 查表），同名组件因此互相串号。
   *
   * @param onConflict 命中「同名非 i18n 绑定」时的回调，仅 Phase 1 传入，避免同一冲突告警两遍。
   */
  private decideInjection(
    componentInfo: { name: string; type: 'class' | 'function'; node: ts.Node },
    sourceFile: ts.SourceFile,
    onConflict?: (name: string, why: 'translation-var' | 'injected-name') => void,
  ): ComponentInfo['injectionType'] {
    if (!this.library.componentUsesTranslation(componentInfo.node, sourceFile)) {
      return 'none';
    }

    // 注入还要往模块顶层加 hook / HOC / props 类型的导入：这些名字被非 i18n 来源占用时
    // 再导入即重复标识符（TS2300）。提取端已用同一份判定把相关候选挡在 extractedStrings
    // 之外，这里兜住用户手写的裸 t()/intl 调用。
    const occupied = this.conflictingInjectedName(componentInfo.type, sourceFile);
    if (occupied) {
      onConflict?.(componentInfo.name, 'injected-name');
      return 'none';
    }

    if (componentInfo.type === 'function') {
      // 函数组件：仅有 props.intl（react-intl）不算本地绑定，需注入 useIntl 让裸 intl
      // 有定义（注入 useIntl 在 IntlProvider 下始终安全，不涉及类组件 HOC 二次包裹）。
      if (this.library.hasLocalTranslationBinding(componentInfo.node, sourceFile)) {
        return 'none';
      }
      // 同名冲突守卫：componentUsesTranslation 宽匹配任意裸 `t(`/`*.formatMessage` 调用，
      // 组件自身或其外层作用域可能已有**非 i18n 的同名绑定**（`const { t } = useTemperature()`、
      // 模块级 `import { t } from '@/utils/tiny-template'`）。再注入 hook 声明轻则同块双声明
      // （TS2451），重则遮蔽外层同名绑定产出「能编译、行为错」的代码。按「宁可漏注入，绝不产出
      // 坏代码」跳过并告警。提取端已用同一份判定把该组件的候选整体挡在 extractedStrings 之外，
      // 故这里不会留下已替换却无绑定的裸 t()。
      if (this.hasConflictingLocalBinding(componentInfo.node)) {
        onConflict?.(componentInfo.name, 'translation-var');
        return 'none';
      }
      return 'hook';
    }

    // 类组件：以「本作用域内是否已存在 this.props.<var> 访问」判定是否已被 HOC
    // （injectIntl / withTranslation）包裹。
    //   - 已包裹：generator 产出的裸 t()/intl 需本地解构 `const { t } = this.props`
    //     才有定义；但绝不能二次注入 HOC（否则 withTranslation()(withTranslation()(…))
    //     或重复 injectIntl）。故只补方法体解构。
    //   - 未包裹：注入完整 HOC（Props 类型 + 方法体解构 + wrapper）。
    return this.classAlreadyWrappedByHOC(componentInfo.node) ? 'class-destructure' : 'hoc';
  }

  /**
   * 注入 Hook 到函数组件
   */
  private injectHook(
    node: ts.ArrowFunction | ts.FunctionExpression,
    sourceFile: ts.SourceFile,
    transformations: Transformation[],
  ): void {
    const body = node.body;
    if (!body) return;

    if (ts.isBlock(body)) {
      const injectionPos = this.bodyInjectionPos(body, sourceFile);
      const injectionText = `\n  ${this.library.hookDeclaration}`;
      transformations.push({
        start: injectionPos,
        end: injectionPos,
        text: injectionText,
      });
      return;
    }

    // 表达式体箭头组件（`() => <jsx/>`）没有 Block 可插入 hook 声明。
    // 此时属性中的文案仍会被 ReactTransformer 替换为 t()/intl 调用，若不注入
    // hook 就会产出引用未声明 t 的代码（运行时 `t is not defined`）。
    // 解法：把表达式体包成块体 `=> { hookDecl return <expr>; }`。
    // 只有 ArrowFunction 可能是表达式体；FunctionExpression 必带 Block。
    if (ts.isArrowFunction(node)) {
      const start = body.getStart(sourceFile);
      const end = body.getEnd();
      transformations.push({
        start,
        end: start,
        text: `{\n  ${this.library.hookDeclaration}\n  return `,
      });
      transformations.push({
        start: end,
        end,
        text: `;\n}`,
      });
    }
  }

  /**
   * 函数体内注入声明的落点：跳过函数体前缀的字符串指令序言（`'use no memo'` /
   * `'use strict'`）。指令只有作为**首批语句**才生效，把声明插到它前面会让 React Compiler
   * 的 opt-out 静默失效、`'use strict'` 退化成普通表达式语句。
   */
  private bodyInjectionPos(body: ts.Block, sourceFile: ts.SourceFile): number {
    let pos = body.getStart(sourceFile) + 1;
    for (const statement of body.statements) {
      if (
        ts.isExpressionStatement(statement) &&
        (ts.isStringLiteral(statement.expression) ||
          ts.isNoSubstitutionTemplateLiteral(statement.expression))
      ) {
        pos = statement.getEnd();
        continue;
      }
      break;
    }
    return pos;
  }

  /**
   * 注入 HOC 到类组件
   */
  private injectHOC(
    classNode: ts.ClassDeclaration,
    className: string,
    sourceFile: ts.SourceFile,
    transformations: Transformation[],
    emitsTypes: boolean,
  ): void {
    if (!className) return;

    const propsType = this.library.hocPropsType;

    // 1. 添加 Props 类型（仅 TS 文件：JS 里写类型实参是语法错误，HOC 包裹与解构照常进行）
    if (emitsTypes && classNode.heritageClauses) {
      for (const clause of classNode.heritageClauses) {
        if (clause.token === ts.SyntaxKind.ExtendsKeyword && clause.types[0]) {
          const typeNode = clause.types[0];
          const typeName = typeNode.expression.getText(sourceFile);
          // 与 isClassComponent 对齐：PureComponent 也是类组件，HOC 注入后同样需要
          // 在 Props 泛型上追加 WithTranslation，否则 this.props.t 类型检查报错。
          if (
            typeName === 'Component' ||
            typeName === 'React.Component' ||
            typeName === 'PureComponent' ||
            typeName === 'React.PureComponent'
          ) {
            if (typeNode.typeArguments && typeNode.typeArguments.length > 0) {
              const propsTypeArg = typeNode.typeArguments[0]!;
              // 按类型引用名精确判定（含交叉类型成员），与 classAlreadyWrappedByHOC 同口径：
              // 子串匹配会把 `PanelWithTranslationToggleProps` 误当成已加宽。
              if (!ReactASTUtils.typeReferencesName(propsTypeArg, propsType)) {
                transformations.push({
                  start: propsTypeArg.getEnd(),
                  end: propsTypeArg.getEnd(),
                  text: ` & ${propsType}`,
                });
              }
            } else {
              transformations.push({
                start: typeNode.expression.getEnd(),
                end: typeNode.expression.getEnd(),
                text: `<${propsType}>`,
              });
            }
          }
        }
      }
    }

    // 2. 修复 constructor props 类型（同步骤 1，仅 TS 文件）
    const constructor = classNode.members.find((member): member is ts.ConstructorDeclaration =>
      ts.isConstructorDeclaration(member),
    );
    if (emitsTypes && constructor && constructor.parameters.length > 0) {
      const propsParam = constructor.parameters[0]!;
      // 认「首个具名形参」而非形参名恰为 props：类的 Props 泛型已被上面加宽成
      // `P & 本类型`，构造器形参类型不同步加宽时 `super(myProps)` 实参与基类签名不兼容（TS2345）。
      // 解构形参（`constructor({ x }: P)`）不在此列：其类型加宽会改变解构目标的可见成员，
      // 且无标识符可传给 super，维持原样交由人工处理。
      if (
        ts.isIdentifier(propsParam.name) &&
        propsParam.type &&
        !ReactASTUtils.typeReferencesName(propsParam.type, propsType)
      ) {
        transformations.push({
          start: propsParam.type.getEnd(),
          end: propsParam.type.getEnd(),
          text: ` & ${propsType}`,
        });
      }
    }

    // 3. 在使用翻译的方法中添加解构声明
    this.injectClassMethodDestructure(classNode, sourceFile, transformations);

    // 4. 用 HOC 包裹组件
    const exportModifier = classNode.modifiers?.find((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    // `export default class Foo` 的修饰符是 [export, default]。仅删 export 会遗留孤立的
    // `default` 关键字 → 产出 `default class FooWithOutIntl {...}`（语法错误，整文件无法编译）。
    // 故需同时识别 default，并把删除范围扩到 default 末尾、HOC 导出改用 `export default`。
    const defaultModifier = classNode.modifiers?.find(
      (m) => m.kind === ts.SyntaxKind.DefaultKeyword,
    );
    const tempClassName = `${className}${HOC_CLASS_SUFFIX}`;

    if (classNode.name) {
      if (exportModifier) {
        // 删除 `export `（具名导出）或 `export default `（默认导出，含 default 关键字）
        const removeEnd = defaultModifier
          ? defaultModifier.getEnd() + 1
          : exportModifier.getEnd() + 1;
        transformations.push({
          start: exportModifier.getStart(sourceFile),
          end: removeEnd,
          text: '',
        });
      }

      transformations.push({
        start: classNode.name.getStart(sourceFile),
        end: classNode.name.getEnd(),
        text: tempClassName,
      });

      const hocWrapper = this.library.generateHOCWrapper(tempClassName);
      let hocStatement: string;
      if (defaultModifier) {
        // 默认导出：先用原类名绑定包裹结果、再默认导出该绑定。直接 `export default HOC(Inner)`
        // 会让原类名在模块内消失——同文件的 `<Foo />` 自递归到内部未包裹类、`Foo.displayName`
        // 引用未定义标识符（TS2304）。与具名导出路径（`export const Foo = HOC(Inner)`）同形。
        hocStatement = `\n\nconst ${className} = ${hocWrapper};\nexport default ${className};`;
      } else if (exportModifier) {
        hocStatement = `\n\nexport const ${className} = ${hocWrapper};`;
      } else {
        hocStatement = `\nconst ${className} = ${hocWrapper};`;
      }

      transformations.push({
        start: classNode.getEnd(),
        end: classNode.getEnd(),
        text: hocStatement,
      });
    } else if (defaultModifier) {
      // 匿名默认导出类组件（`export default class extends React.Component {…}`）无 name
      // token：在 `class` 关键字后插入合成类名、剥离 `export default`，再追加
      // `export default HOC(Inner)`，与具名默认导出路径产出相同形态（restore 同样可逆）。
      const classKeyword = classNode
        .getChildren(sourceFile)
        .find((child) => child.kind === ts.SyntaxKind.ClassKeyword);
      if (!classKeyword) return;

      const removeStart = (exportModifier ?? defaultModifier).getStart(sourceFile);
      transformations.push({
        start: removeStart,
        end: defaultModifier.getEnd() + 1,
        text: '',
      });
      transformations.push({
        start: classKeyword.getEnd(),
        end: classKeyword.getEnd(),
        text: ` ${tempClassName}`,
      });
      const hocWrapper = this.library.generateHOCWrapper(tempClassName);
      transformations.push({
        start: classNode.getEnd(),
        end: classNode.getEnd(),
        text: `\n\nexport default ${hocWrapper};`,
      });
    }
  }

  /**
   * 组件内是否存在与 translationVarName 同名的非 i18n 本地绑定 —— 判定收口在
   * ReactASTUtils.hasConflictingTranslationBinding，与提取端（ReactTextExtractor 对该组件
   * 整体跳过提取）共用同一份口径。两端分叉会产出「已替换成裸 t() 却没注入」的错误代码。
   */
  private hasConflictingLocalBinding(node: ts.Node): boolean {
    return ReactASTUtils.hasConflictingTranslationBinding(
      node,
      this.library.translationVarName,
      this.library.hookName,
      this.bindingOptions(),
    );
  }

  /**
   * 「哪些同名绑定属于 i18n 来源」的豁免口径，与提取端
   * （ReactTextExtractor.bindingOptions）同源，两端分叉即产出坏代码。
   */
  private bindingOptions(): ConflictingBindingOptions {
    return {
      i18nModules: [this.importManager.tImport, this.library.packageName],
      isI18nDeclaration: (declaration) => this.library.isGlobalFunctionDeclaration(declaration),
      hookName: this.library.hookName,
      hocPropsType: this.library.hocPropsType,
      isHOCCall: (expression) => this.library.isHOCCall(expression),
    };
  }

  /**
   * 本次注入要往模块顶层加的名字里，第一个已被非 i18n 来源占用的名字（无则 undefined）。
   * 函数组件加 hook 名，类组件加 HOC 名与其 props 类型名；来自 i18n 库包名 / tImport 的
   * 同名导入是工具自身上一轮的产物，不算占用（保证增量重跑幂等）。
   */
  private conflictingInjectedName(
    componentType: 'class' | 'function',
    sourceFile: ts.SourceFile,
  ): string | undefined {
    const options = this.bindingOptions();
    const names: Array<{ name: string; kind: 'value' | 'type' }> =
      componentType === 'function'
        ? [{ name: this.library.hookName, kind: 'value' }]
        : (() => {
            const specifiers = this.library.getImportSpecifiers({
              hasJsxComponent: false,
              hasHook: false,
              hasHOC: true,
            });
            return [
              ...specifiers.values.map((name) => ({ name, kind: 'value' as const })),
              ...specifiers.types.map((name) => ({ name, kind: 'type' as const })),
            ];
          })();
    for (const { name, kind } of names) {
      if (!ReactASTUtils.canBindName(sourceFile, name, { ...options, kind })) return name;
    }
    return undefined;
  }

  /**
   * 类组件是否已被 HOC（injectIntl / withTranslation）包裹。已包裹时只需补方法体解构、
   * 绝不能二次包裹（否则 withTranslation()(withTranslation()(…)) 且类名反复叠加后缀）。
   *
   * 判定为「已包裹」需满足以下任一信号（缺一不可，三者覆盖手写与工具自身产出两种形态）：
   *   1. extends 子句的 Props 泛型已含 hocPropsType（WithTranslation / WrappedComponentProps）——
   *      这是本工具 HOC 注入留下的最强幂等标记（见 injectHOC 步骤 1），只要包裹过一次必然存在，
   *      仅 restore 才会清除。判定与 injectHOC 步骤 1 共用 typeReferencesName：按类型引用名
   *      精确比对，名字含 propsType 子串的业务类型（PanelWithTranslationToggleProps）不算。
   *   2. 作用域内存在 `this.props.<var>` 成员访问（用户手写 HOC 后直接用 this.props.t 的形态）。
   *   3. 作用域内存在 `const { <var> } = this.props` 解构（工具自身首次注入产出的形态——
   *      配合裸 t()/intl，类体内不会出现 this.props.t 成员访问，故信号 2 漏判，必须靠本信号兜底）。
   *
   * 信号 2、3 用 someWithinComponentScope 在嵌套组件边界停止，避免把内层组件的访问误算到外层。
   */
  private classAlreadyWrappedByHOC(node: ts.Node): boolean {
    const varName = this.library.translationVarName;
    const propsType = this.library.hocPropsType;

    // 信号 1：extends 泛型已含 HOC 注入的 propsType。
    if (ts.isClassDeclaration(node) && node.heritageClauses) {
      for (const clause of node.heritageClauses) {
        if (clause.token !== ts.SyntaxKind.ExtendsKeyword) continue;
        for (const type of clause.types) {
          if (type.typeArguments?.some((arg) => ReactASTUtils.typeReferencesName(arg, propsType))) {
            return true;
          }
        }
      }
    }

    // 信号 2、3：作用域内的 this.props.<var> 成员访问，或 `const { <var> } = this.props` 解构。
    return ReactASTUtils.someWithinComponentScope(node, (n) => {
      if (
        ts.isPropertyAccessExpression(n) &&
        ts.isIdentifier(n.name) &&
        n.name.text === varName &&
        ts.isPropertyAccessExpression(n.expression) &&
        ts.isIdentifier(n.expression.name) &&
        n.expression.name.text === 'props' &&
        n.expression.expression.kind === ts.SyntaxKind.ThisKeyword
      ) {
        return true;
      }
      if (
        ts.isVariableDeclaration(n) &&
        n.initializer &&
        ts.isPropertyAccessExpression(n.initializer) &&
        n.initializer.expression.kind === ts.SyntaxKind.ThisKeyword &&
        n.initializer.name.text === 'props' &&
        ts.isObjectBindingPattern(n.name)
      ) {
        return n.name.elements.some((el) => ts.isIdentifier(el.name) && el.name.text === varName);
      }
      return false;
    });
  }

  /**
   * 在类组件中「使用了翻译变量」的方法体内注入 `const { <var> } = this.props;`。
   * 供两条路径复用：完整 HOC 注入（injectHOC 步骤 3）与「已被 HOC 包裹仅补解构」路径。
   * bodyDestructuresProp 防止与已有解构重复声明；表达式体箭头成员会被包成块体后注入。
   */
  private injectClassMethodDestructure(
    classNode: ts.ClassDeclaration,
    sourceFile: ts.SourceFile,
    transformations: Transformation[],
  ): void {
    const varName = this.library.translationVarName;
    for (const member of classNode.members) {
      // static 成员的 this 是类构造函数、没有 props：注入 `const { t } = this.props` 会在
      // 求值时抛 TypeError。提取端已对 static 成员整体跳过提取（ReactASTUtils
      // .isInClassStaticMember），这里是防御纵深，兜住用户手写的 static 里的 t()。
      if (ReactASTUtils.hasStaticModifier(member)) continue;

      let body: ts.Block | ts.ConciseBody | undefined;
      let isConstructor = false;
      // 成员自身（形参 + 体内顶层）已把 varName 绑到别处（`(t: Tab) => …`、
      // `const t = setTimeout(...)`）：再注入解构就是同块重复声明（TS2451/TS2300），
      // 且替换出的 t() 本就会解析到那个业务绑定上。提取端已同口径跳过该成员内的候选。
      const memberFunc = ts.isPropertyDeclaration(member) ? member.initializer : member;
      // 方法 / 访问器（getter/setter）成员体内的裸 t()/intl 同样需要 this.props 解构，
      // 否则 `get label() { return t('x'); }`、constructor 里 `this.state = { x: t('y') }`
      // 会引用未声明的 t（getComponentType 对类组件任意后代均判 'class' → 产出裸 t()）。
      if (
        ts.isMethodDeclaration(member) ||
        ts.isGetAccessorDeclaration(member) ||
        ts.isSetAccessorDeclaration(member)
      ) {
        body = member.body;
      } else if (ts.isConstructorDeclaration(member)) {
        body = member.body;
        isConstructor = true;
      } else if (
        ts.isPropertyDeclaration(member) &&
        member.initializer &&
        ts.isArrowFunction(member.initializer)
      ) {
        body = member.initializer.body;
      }

      if (body) {
        const usesTranslation = this.library.componentUsesTranslation(body, sourceFile);
        const hasDeclaration = this.bodyDestructuresProp(body, varName);
        const hasConflictingBinding =
          !!memberFunc && this.memberBindsConflictingVar(memberFunc, varName);

        if (usesTranslation && !hasDeclaration && !hasConflictingBinding) {
          if (ts.isBlock(body)) {
            let injectionPos = this.bodyInjectionPos(body, sourceFile);
            if (isConstructor) {
              // this.props 只有在 super() 调用后才被父类赋值：把解构插到 super(...) 语句
              // 之后，否则 constructor 顶部读 this.props 得到 undefined，t 仍未定义。
              const superStmt = body.statements.find(
                (stmt) =>
                  ts.isExpressionStatement(stmt) &&
                  ts.isCallExpression(stmt.expression) &&
                  stmt.expression.expression.kind === ts.SyntaxKind.SuperKeyword,
              );
              if (superStmt) {
                injectionPos = superStmt.getEnd();
              }
            }
            transformations.push({
              start: injectionPos,
              end: injectionPos,
              text: `\n    const { ${varName} } = this.props;\n`,
            });
          } else if (
            ts.isPropertyDeclaration(member) &&
            member.initializer &&
            ts.isArrowFunction(member.initializer)
          ) {
            // 表达式体箭头类成员（`foo = () => t('x')`）无 Block：transformer 已把字面量
            // 替换为裸 t()/intl 引用，若不注入解构则运行时 `t is not defined`。与 injectHook
            // 的表达式体处理对称，把体包成块体并注入 this.props 解构。
            const start = body.getStart(sourceFile);
            const end = body.getEnd();
            transformations.push({
              start,
              end: start,
              text: `{\n    const { ${varName} } = this.props;\n    return `,
            });
            transformations.push({
              start: end,
              end,
              text: `;\n  }`,
            });
          }
        }
      }
    }
  }

  /**
   * 类成员函数（形参 + 体内直属语句）是否已把 varName 绑到非 i18n 来源。
   *
   * 与 bodyDestructuresProp 分工：后者只认 `= this.props` 形态（判「是否已注入过」），
   * 本判定认业务自己的同名绑定（判「能不能注入」）。两者任一命中都不再注入。
   *
   * 只看该成员自身的作用域、不上溯外层：解构注入落在成员体内，外层同名绑定被它遮蔽的
   * 范围也仅限该成员——与提取端对类组件候选的判定边界一致。
   */
  private memberBindsConflictingVar(member: ts.Node, varName: string): boolean {
    return ReactASTUtils.functionScopeBindsConflictingVar(
      member,
      varName,
      this.library.hookName,
      this.bindingOptions(),
    );
  }

  /**
   * 方法体内是否已从 `this.props` 解构出 varName。
   *
   * 取代脆弱的固定字符串 `includes('const { t } = this.props')` 匹配：后者只认单变量、
   * 单空格的精确写法，对 `const { t, data } = this.props`、`const {t} = this.props` 等
   * 合法形态一律漏判，导致在同一块作用域内重复注入 `const { t } = this.props`，块级
   * 重复声明 t/intl → TS2451 不可编译。改用 AST：扫描体内任意「ObjectBindingPattern =
   * this.props」且绑定名（而非源属性名）等于 varName 的声明。
   *
   * 注意比对的是 BindingElement.name（引入作用域的标识符），而非 propertyName：
   * `const { t: tt } = this.props` 引入的是 tt 而非 t，不构成对 t 的重复声明。
   */
  private bodyDestructuresProp(body: ts.Block | ts.ConciseBody, varName: string): boolean {
    let found = false;
    const visit = (node: ts.Node): void => {
      if (found) return;
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        ts.isPropertyAccessExpression(node.initializer) &&
        node.initializer.expression.kind === ts.SyntaxKind.ThisKeyword &&
        node.initializer.name.text === 'props' &&
        ts.isObjectBindingPattern(node.name)
      ) {
        for (const element of node.name.elements) {
          if (ts.isIdentifier(element.name) && element.name.text === varName) {
            found = true;
            return;
          }
        }
      }
      // 不下钻嵌套函数作用域：回调/嵌套函数里的 `const { t } = this.props` 只作用于该函数，
      // 不构成对当前方法体顶层的声明。继续下钻会误判顶层"已解构"而跳过注入 → 顶层用到 t()
      // 时运行时 `t is not defined`。块语句（if/for 等）不是函数边界，仍照常下钻。
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node) ||
        ts.isConstructorDeclaration(node)
      ) {
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(body);
    return found;
  }

  private applyTransformations(code: string, transformations: Transformation[]): string {
    transformations.sort((a, b) => b.start - a.start);
    let result = code;
    for (const { start, end, text } of transformations) {
      result = result.slice(0, start) + text + result.slice(end);
    }
    return result;
  }
}
