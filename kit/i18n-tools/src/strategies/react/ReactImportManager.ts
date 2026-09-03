import type { IImportManager } from '../../adapters/FrameworkAdapter';
import ts from 'typescript';
import { parseSourceFile } from '../../utils/ast-core';
import {
  appendImportLine,
  findLastImportLineIndex,
  mergeNamedImport,
  removeNamedImports,
} from '../../utils/import-surgery';
import { isImportedNameUnused } from '../../utils/scope-analysis';
import { ExtractedString } from '../../utils/types';
import type { ReactI18nLibrary } from './libraries';

/**
 * 管理i18n转换中所需的import语句和相关代码
 */
export class ReactImportManager implements IImportManager {
  /** 全局函数 `t` 的导入路径。注入端据此把该路径的 t 视为 i18n 来源而非冲突绑定。 */
  readonly tImport: string;
  private library: ReactI18nLibrary;

  constructor(tImport: string = '@/plugins/locale', library: ReactI18nLibrary) {
    this.tImport = tImport;
    this.library = library;
  }

  // ==================== 添加 Imports ====================

  /**
   * 处理所有导入和全局声明
   */
  handleGlobalImports(code: string, fileStrings: ExtractedString[]): string {
    if (fileStrings.length === 0) {
      return code;
    }

    let updatedCode = code;

    // 检查是否需要全局函数 (非React组件上下文)
    if (this.needsGlobalFunction(fileStrings)) {
      updatedCode = this.addGlobalFunctionImport(updatedCode);
      const globalDeclaration = this.library.generateGlobalDeclaration();
      if (globalDeclaration) {
        updatedCode = this.addGlobalFunctionDeclaration(updatedCode, globalDeclaration);
      }
    }
    return updatedCode;
  }

  private needsGlobalFunction(fileStrings: ExtractedString[]): boolean {
    // jsx-text 会被替换成 JSX 组件（如 react-intl 的 <FormattedMessage>），不需要全局 t/intl。
    // 必须排除它：否则 react-intl 对纯 jsx-text 的模块作用域文本也注入 const intl = getIntl();，
    // 该声明永不被使用（no-unused-vars 失败），且因声明体引用 getIntl 无法被 finalizeImports 自愈。
    return fileStrings.some((str) => str.componentType === 'other' && str.context !== 'jsx-text');
  }

  private addGlobalFunctionImport(code: string): string {
    const funcName = this.library.globalFunctionName.split('.')[0]!;
    // mergeNamedImport 幂等且按命名精确去重，直接调用即可。不能用 `import {.*funcName.*}`
    // 这类宽松正则预检——funcName='t' 时会误命中任何含字母 t 的同路径导入而漏注入。
    return mergeNamedImport(code, this.tImport, [funcName]);
  }

  private addGlobalFunctionDeclaration(code: string, declaration: string): string {
    // 已存在判定走 AST：字符串 includes 只认逐字一致的写法，用户手写的
    // `const intl = getIntl()`（无分号 / 多空格）漏判即再插一条，块级重复声明（TS2451）。
    if (this.hasGlobalFunctionDeclaration(code)) {
      return code;
    }
    // 在最后一个 import 之后插入声明，前置空行便于阅读
    const lines = code.split('\n');
    const lastImportIndex = findLastImportLineIndex(lines);
    lines.splice(lastImportIndex + 1, 0, '\n' + declaration.trim());
    return lines.join('\n');
  }

  /** 模块顶层是否已有该库的全局函数声明（`const intl = getIntl()`）。 */
  private hasGlobalFunctionDeclaration(code: string): boolean {
    const sourceFile = parseSourceFile(code, 'global-decl-scan.tsx');
    return sourceFile.statements.some(
      (statement) =>
        ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.some((declaration) =>
          this.library.isGlobalFunctionDeclaration(declaration),
        ),
    );
  }

  /**
   * 添加 i18n 库导入 (实现接口方法)
   */
  addI18nImports(code: string, imports: string[]): string {
    return mergeNamedImport(code, this.library.packageName, imports);
  }

  /**
   * 以 `import type { … } from '<packageName>'` 单独一行注入类型导入。
   *
   * 不并进 mergeNamedImport 的值导入：类型名作为值导入在 verbatimModuleSyntax 下报 TS1484。
   * 已从该包以任意形态（值 / type / 内联 type）导入过的名字不再追加，避免 TS2300 重复标识符，
   * 也让重复注入幂等。
   */
  addI18nTypeImports(code: string, imports: string[]): string {
    if (imports.length === 0) return code;
    const imported = this.importedNamesFrom(code, this.library.packageName);
    const missing = imports.filter((name) => !imported.has(name));
    if (missing.length === 0) return code;
    return appendImportLine(
      code,
      `import type { ${missing.join(', ')} } from '${this.library.packageName}';`,
    );
  }

  /** 代码里从 moduleName 导入的全部本地名（默认 / 命名空间 / 具名，含 type 形态）。 */
  private importedNamesFrom(code: string, moduleName: string): Set<string> {
    const names = new Set<string>();
    // 文件名只影响 ScriptKind，import 声明的解析与之无关；用 .tsx 覆盖 JSX 源码。
    const sourceFile = parseSourceFile(code, 'import-scan.tsx');
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      if (
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        statement.moduleSpecifier.text !== moduleName
      ) {
        continue;
      }
      const clause = statement.importClause;
      if (!clause) continue;
      if (clause.name) names.add(clause.name.text);
      const named = clause.namedBindings;
      if (!named) continue;
      if (ts.isNamespaceImport(named)) {
        names.add(named.name.text);
      } else {
        for (const element of named.elements) names.add(element.name.text);
      }
    }
    return names;
  }

  /**
   * 注入收尾：删除被 useTranslation 注入遮蔽后变成未使用的 tImport `t` 导入。
   *
   * 场景：组件原本 `import { t } from '@/plugins/locale'` 并在组件内用 t(...)；本工具
   * 给组件注入 `const { t } = useTranslation()` 后，组件内的 t 全部解析到注入的局部 t，
   * 原 import 沦为死导入（ESLint no-unused-vars，过不了 lint）。这里在确认 t 已无未遮蔽
   * 引用后精准摘除（与 Vue restore 侧 cleanupPluginLocaleImport 同构）。
   *
   * 保守：若模块级（组件外）仍有 t 使用，isImportedNameUnused 返回 false，导入保留。
   */
  finalizeImports(code: string, filePath: string): string {
    const funcName = this.library.globalFunctionName.split('.')[0]!;
    if (!isImportedNameUnused(code, filePath, this.tImport, funcName)) {
      return code;
    }
    return removeNamedImports(code, (moduleName) => moduleName === this.tImport, [funcName]);
  }

  // ==================== 清理 AST 节点 ====================

  /**
   * 清理 i18n 库导入 (AST)：restore 时从 `import ... from '<library.packageName>'` 中**仅摘除
   * 工具注入的 i18n 类型导入**（WithTranslation / WrappedComponentProps），保留用户在同一行
   * 手写的其它导入（如 I18nextProvider / IntlProvider）；摘除后若整条变空则移除。
   * 值导入（Trans / useTranslation / withTranslation）不在此摘，见下方 remaining 处注释。
   *
   * 注意：tImport（如 `@/plugins/locale`）下的全局函数 `t` **不在此处理**。它可能是用户原有、
   * 且仍被「locale 查不到而未被还原的存活 t() 调用」引用——若在逐节点遍历时无条件删除，会删掉
   * 仍被使用的 import，产出 `Cannot find name 't'`（TS2304）。因此 tImport 的 `t` 清理延后到
   * 「整文件还原完成、确认 t 已无任何引用」的收尾 pass（见 ReactRestoreTransformer.transform 末尾
   * 的 finalizeTImport + isImportedNameUnused 守卫），与 generate 侧
   * ReactImportManager.finalizeImports 对称。
   */
  static cleanupImports(
    node: ts.ImportDeclaration,
    library: ReactI18nLibrary,
    keepLibraryImport = false,
  ): ts.Node {
    if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) {
      return node;
    }
    // keepLibraryImport：还原后仍有未还原的翻译调用 / 组件存活（locale 缺 key），它们依赖
    // useTranslation / useIntl / Trans / FormattedMessage 等具名导入。此时保留整条 import，
    // 否则产出引用未定义标识符的不可编译代码（与下方 cleanupVariableStatements 守卫成对）。
    if (node.moduleSpecifier.text !== library.packageName || keepLibraryImport) {
      return node;
    }

    // 仅摘除工具注入的 i18n 具名导入（Trans / useTranslation / withTranslation / WithTranslation
    // 等），保留用户在同一行从该包手写的其它导入（如 react-i18next 的 I18nextProvider /
    // initReactI18next、react-intl 的 IntlProvider / createIntl）。整条 createNotEmittedStatement
    // 会把这些非 i18n 导入一并删除，产出 `Cannot find name '...'`（TS2304）的不可编译代码——
    // 故按具名精确摘除，与 Vue 端 VueRestoreTransformer.cleanupImports 对齐。
    const importClause = node.importClause;
    if (!importClause) return node; // 副作用导入（无具名/默认绑定），原样保留

    const named = importClause.namedBindings;
    // 命名空间导入（import * as X）不含工具注入的具名项，整体保留
    if (!named || !ts.isNamedImports(named)) return node;

    const specifiers = library.getImportSpecifiers({
      hasJsxComponent: true,
      hasHook: true,
      hasHOC: true,
    });
    // 值与类型两组都要摘：类型名以 `import type` 单独一行注入（见 addI18nTypeImports），
    // 整条只剩工具注入的类型名时下方 remaining.length === 0 分支会把该行整体移除。
    const injectable = new Set([...specifiers.values, ...specifiers.types]);
    // 仅删除「未改名、命中注入集、且处于类型位置」的 specifier：
    //  - 改名导入（`import { Trans as T }`）一定是用户代码（工具只注入裸名），一律保留；
    //  - 值导入（Trans / useTranslation / withTranslation）在此按名摘除是不安全的——本函数
    //    逐节点执行，看不到还原后的全文，任何非「翻译调用/组件/HOC/hook 声明」形态的引用
    //    （`React.createElement(Trans, …)`、`() => useTranslation` 转发等）都不在 keep* 旗标
    //    的枚举内，摘了就产出未定义标识符。值导入的存活判定统一交给
    //    ReactRestoreTransformer.finalizeLibraryImports 在最终代码上逐名判死。
    //  - 类型导入（`import type { WithTranslation }` 行或内联 `{ type WithTranslation }`）必须
    //    留在这里摘：finalizeLibraryImports 依赖的 removeNamedImports 只匹配值导入形态。
    //    其全部类型引用已由 cleanupHOCPropsType 在同一门控下剥除。
    const isTypeOnlySpecifier = (el: ts.ImportSpecifier): boolean =>
      importClause.isTypeOnly || el.isTypeOnly;
    const remaining = named.elements.filter(
      (el) =>
        el.propertyName !== undefined || !injectable.has(el.name.text) || !isTypeOnlySpecifier(el),
    );

    if (remaining.length === named.elements.length) return node; // 无工具注入名可摘，保留

    // 摘除后既无具名也无默认导入 → 整条移除
    if (remaining.length === 0 && !importClause.name) {
      return ts.factory.createNotEmittedStatement(node);
    }

    const newImportClause = ts.factory.updateImportClause(
      importClause,
      importClause.isTypeOnly,
      importClause.name,
      remaining.length > 0 ? ts.factory.updateNamedImports(named, remaining) : undefined,
    );
    return ts.factory.updateImportDeclaration(
      node,
      node.modifiers,
      newImportClause,
      node.moduleSpecifier,
      node.attributes,
    );
  }
}
