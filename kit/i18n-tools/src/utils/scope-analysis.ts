import ts from 'typescript';
import { parseSourceFile } from './ast-core';

/**
 * 作用域与遮蔽分析：回答「这个名字在这段代码里还有没有活着的引用」。
 *
 * 职责边界：只做只读的静态判定，供 generate/restore 决定「能否删掉某条 import
 * 或某个 hook 解构声明」。全部判定取保守方向——宁可漏删（留个 lint 警告）
 * 也不误删（产出 undefined 引用，TS2304，整文件编译失败）。
 * 依赖 parent 指针，故一律走 ast-core.parseSourceFile（setParentNodes=true）。
 */

/**
 * 标识符是否处于「值读取位置」（真正引用了同名变量），用于区分裸值引用与声明名 /
 * 绑定名 / 对象键 / 成员名 / import-export 具名 / JSX 属性名等非引用位置。
 *
 * 全库唯一实现：ReactRestoreTransformer 曾另有一份本地副本，两版各覆盖几种 case
 * （一版少 export/JSX 属性名，一版少 PropertySignature/MethodDeclaration），
 * 任一路径漏一种 case 都会把非引用位置当成使用、阻止 import/声明被清理。
 *
 * 依赖 parent 指针——调用方必须传入 parseSourceFile
 * （createSourceFile 的 setParentNodes=true）解析出的节点。
 *
 * 注：对象字面量简写 `{ t }`（ShorthandPropertyAssignment.name）是对 t 的真实值引用，
 * 不排除。
 */
export function isIdentifierValueReference(id: ts.Identifier): boolean {
  const p = id.parent;
  // Identifier 在 setParentNodes 解析结果里必有 parent，此分支实际不可达；
  // 取 true（"当作真实引用"）是保守方向——所有调用方都用本判定决定「能否删除某个
  // 声明/import」，误判为未使用会产出 undefined 引用（TS2304）。
  if (!p) return true;
  // 声明 / 绑定名位置
  if (ts.isBindingElement(p) && (p.name === id || p.propertyName === id)) return false;
  if (ts.isVariableDeclaration(p) && p.name === id) return false;
  if (ts.isParameter(p) && p.name === id) return false;
  if (ts.isFunctionDeclaration(p) && p.name === id) return false;
  if (ts.isClassDeclaration(p) && p.name === id) return false;
  // import / export 具名（含别名两侧）
  if (ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isExportSpecifier(p)) return false;
  // 属性访问名（x.t）/ 限定名右侧 / 对象字面量 key / JSX 属性名 / 各类成员名
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
  if (ts.isQualifiedName(p) && p.right === id) return false;
  if (ts.isPropertyAssignment(p) && p.name === id) return false;
  if (ts.isJsxAttribute(p) && p.name === id) return false;
  if (ts.isPropertySignature(p) && p.name === id) return false;
  if (ts.isPropertyDeclaration(p) && p.name === id) return false;
  if (ts.isMethodDeclaration(p) && p.name === id) return false;
  return true;
}

/** BindingName（标识符 / 对象解构 / 数组解构）是否绑定了名为 name 的局部变量。 */
function bindingDeclaresName(binding: ts.BindingName, name: string): boolean {
  if (ts.isIdentifier(binding)) return binding.text === name;
  if (ts.isObjectBindingPattern(binding)) {
    return binding.elements.some((el) => bindingDeclaresName(el.name, name));
  }
  if (ts.isArrayBindingPattern(binding)) {
    return binding.elements.some(
      (el) => ts.isBindingElement(el) && bindingDeclaresName(el.name, name),
    );
  }
  return false;
}

function isFunctionLikeScope(n: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n) ||
    ts.isConstructorDeclaration(n) ||
    ts.isGetAccessorDeclaration(n) ||
    ts.isSetAccessorDeclaration(n)
  );
}

/** VariableDeclaration 是否为 `var`（既非 let 也非 const，故提升到整个函数作用域）。 */
function isVarDeclaration(d: ts.VariableDeclaration): boolean {
  const list = d.parent;
  if (list && ts.isVariableDeclarationList(list)) {
    return (list.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) === 0;
  }
  return false;
}

/**
 * 函数作用域是否声明了名为 name 的绑定：参数 + 函数体内 `var`（提升到整个函数，含嵌套块
 * 但不含嵌套函数）。`let/const` 是块级，由 blockDirectlyDeclares 在对应块处理，这里不计。
 */
function functionScopeDeclares(fn: ts.Node, name: string): boolean {
  const decl = fn as ts.FunctionLikeDeclaration;
  for (const p of decl.parameters ?? []) {
    if (bindingDeclaresName(p.name, name)) return true;
  }
  const body = decl.body;
  if (!body) return false;
  let found = false;
  const walk = (n: ts.Node): void => {
    if (found) return;
    // 不下钻到内层函数：内层的局部声明不影响当前作用域对 name 的解析
    if (n !== body && isFunctionLikeScope(n)) return;
    if (ts.isVariableDeclaration(n) && isVarDeclaration(n) && bindingDeclaresName(n.name, name)) {
      found = true;
      return;
    }
    ts.forEachChild(n, walk);
  };
  walk(body);
  return found;
}

/**
 * 块作用域是否「直属」声明了名为 name 的 `let/const` 绑定（不下钻嵌套块/函数）。
 * 入参可为 Block / SourceFile / ModuleBlock（均有 statements）。
 */
function blockDirectlyDeclares(block: ts.Node, name: string): boolean {
  const statements = (block as ts.BlockLike).statements;
  if (!statements) return false;
  for (const stmt of statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    const list = stmt.declarationList;
    // 只认块级（let/const）；var 由 functionScopeDeclares 处理（提升语义）
    if ((list.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) === 0) continue;
    for (const d of list.declarations) {
      if (bindingDeclaresName(d.name, name)) return true;
    }
  }
  return false;
}

/**
 * 引用 ref 是否被某个「祖先作用域」的局部声明遮蔽了名为 name 的绑定。
 *
 * 关键：必须区分函数作用域与块级作用域——`const/let` 是块级，写在某个 if/块内的
 * `const { t } = ...` 只遮蔽该块内的引用；同函数内、该块之外的引用仍解析到 module import。
 * 旧实现把函数体内任意嵌套块的 const/let 都当成整个函数的声明，会误判块外引用被遮蔽，
 * 进而把仍在使用的 import 删掉（TS2304）。
 *
 * 因此沿 ref 的祖先链逐层向上：
 *  - 函数作用域：参数 + 函数体内 `var`（提升到整个函数，不含嵌套函数）遮蔽；
 *  - 块作用域（Block / SourceFile / ModuleBlock）：仅该块「直属」语句里的 `let/const` 遮蔽。
 */
function hasEnclosingLocalDeclaration(ref: ts.Node, name: string): boolean {
  let cur: ts.Node | undefined = ref.parent;
  while (cur) {
    if (isFunctionLikeScope(cur)) {
      if (functionScopeDeclares(cur, name)) return true;
    } else if (ts.isBlock(cur) || ts.isSourceFile(cur) || ts.isModuleBlock(cur)) {
      if (blockDirectlyDeclares(cur, name)) return true;
    }
    cur = cur.parent;
  }
  return false;
}

/**
 * hasEnclosingLocalDeclaration 的有界变体：只查 ref 到 boundary（含）之间的作用域链。
 *
 * 用于 hook 依赖注入的遮蔽判定——boundary 传 hook 回调节点：回调**内部**声明的同名绑定
 * （回调参数 `t => ...`、回调体 `const t = ...`）遮蔽引用，说明该引用不是翻译变量；而
 * boundary **之外**（组件层）的声明正是翻译变量自身的合法绑定（`const { t } = useTranslation()`，
 * 含工具即将注入的形态），不能当作遮蔽，否则常规注入全部失效。
 */
export function hasLocalDeclarationWithin(ref: ts.Node, name: string, boundary: ts.Node): boolean {
  // ref 就是 boundary 自身（如 useCallback(t, deps) 直传标识符）：不存在"回调内部"，
  // 遮蔽不可能成立。不提前返回的话下方循环从 parent 起步永远遇不到 boundary，
  // 会把 boundary 之外（组件层）的翻译绑定误判为遮蔽。
  if (ref === boundary) return false;
  let cur: ts.Node | undefined = ref.parent;
  while (cur) {
    if (isFunctionLikeScope(cur)) {
      if (functionScopeDeclares(cur, name)) return true;
    } else if (ts.isBlock(cur) || ts.isSourceFile(cur) || ts.isModuleBlock(cur)) {
      if (blockDirectlyDeclares(cur, name)) return true;
    }
    if (cur === boundary) return false;
    cur = cur.parent;
  }
  return false;
}

/**
 * 判断「从 moduleName 具名导入的 importedName」在 code 中是否已无有效引用——
 * 即所有同名标识符引用都被某个内层函数作用域的局部声明（如
 * `const { t } = useTranslation()` / `const { t } = this.props`）遮蔽，导入沦为死导入。
 *
 * 用途：React generate 给组件注入 useTranslation 的 t 后，组件内原先引用 tImport 的 t
 * 全被遮蔽，原 `import { t } from '@/plugins/locale'` 变成未使用导入（ESLint
 * no-unused-vars，过不了 lint）。删除前必须确认「确实零未遮蔽引用」，避免误删模块级
 * （组件外）仍在使用的导入。
 *
 * 保守语义：仅当「导入存在」且「不存在任何未被遮蔽的值引用」时返回 true；任一引用未被
 * 遮蔽即返回 false（宁可漏删，不可误删）。重命名导入（`t as foo`）按本地名 foo 判定。
 */
export function isImportedNameUnused(
  code: string,
  filePath: string,
  moduleName: string,
  importedName: string,
): boolean {
  const sf = parseSourceFile(code, filePath);

  // 1. 找到 `import { ...importedName... } from moduleName`，取其本地名（处理 `as` 重命名）
  let localName: string | undefined;
  const findImport = (n: ts.Node): void => {
    if (
      ts.isImportDeclaration(n) &&
      ts.isStringLiteral(n.moduleSpecifier) &&
      n.moduleSpecifier.text === moduleName
    ) {
      const nb = n.importClause?.namedBindings;
      if (nb && ts.isNamedImports(nb)) {
        for (const el of nb.elements) {
          const original = el.propertyName?.text ?? el.name.text;
          if (original === importedName) localName = el.name.text;
        }
      }
    }
    ts.forEachChild(n, findImport);
  };
  findImport(sf);
  if (!localName) return false;

  // 2. 扫描所有「以本地名作为值引用」的标识符，逐个判断是否被内层局部声明遮蔽
  const name = localName;
  let usedUnshadowed = false;
  const visit = (n: ts.Node): void => {
    if (usedUnshadowed) return;
    if (
      ts.isIdentifier(n) &&
      n.text === name &&
      isIdentifierValueReference(n) &&
      !hasEnclosingLocalDeclaration(n, name)
    ) {
      usedUnshadowed = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return !usedUnshadowed;
}

/**
 * 判断名为 `name` 的标识符在 code 中是否已无任何「值引用」（不含其自身的声明 / 绑定名）。
 *
 * 与 isImportedNameUnused（针对 import 绑定、含遮蔽判定）互补：本方法面向「非 import
 * 来源」的绑定，典型是 hook 解构 `const { t } = useI18n()`。restore 清理 hook 声明前调用——
 * 若仍有未被还原的存活 `t(...)` 调用（locale 缺 key / 动态 key），则视为仍在使用，
 * 不可删除声明，否则产出未定义 `t`（TS2304）。
 *
 * 保守取向：任意位置出现对 name 的值引用即判为「仍在使用」，宁可保留多余声明（lint 警告）
 * 也不冒删除致编译错误的风险。
 */
export function isLocalNameUnused(code: string, filePath: string, name: string): boolean {
  const sf = parseSourceFile(code, filePath);
  let used = false;
  const visit = (n: ts.Node): void => {
    if (used) return;
    if (ts.isIdentifier(n) && n.text === name && isIdentifierValueReference(n)) {
      used = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return !used;
}
