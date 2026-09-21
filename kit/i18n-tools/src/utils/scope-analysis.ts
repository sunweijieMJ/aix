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
 * 全库唯一实现，不得在调用方另开副本：漏掉任一种非引用位置（export 具名、JSX 属性名、
 * PropertySignature、MethodDeclaration…）都会把该位置当成真实使用，
 * 阻止本已可清理的 import / 声明被删除。
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
  // import 具名（含别名两侧）：都是绑定名位置，不是对已有绑定的引用
  if (ts.isImportSpecifier(p) || ts.isImportClause(p)) return false;
  // export 具名：**本地名一侧**（`export { t }` 的 t、`export { t as x }` 的 propertyName）
  // 是对本地绑定的真实引用——re-export 需要它存在，删掉声明即 TS2304；导出名一侧
  // （`export { x as t }` 的 name）只是对外名字。`export { t } from 'mod'` 两侧都不引用
  // 本地绑定（直接转发模块导出），一律不算。
  if (ts.isExportSpecifier(p)) {
    const decl = p.parent.parent;
    if (ts.isExportDeclaration(decl) && decl.moduleSpecifier) return false;
    return p.propertyName ? p.propertyName === id : p.name === id;
  }
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
 * 块作用域是否「直属」声明了名为 name 的块级绑定（不下钻嵌套块/函数）。
 * 入参可为 Block / SourceFile / ModuleBlock（均有 statements）。
 *
 * 覆盖三种块级声明形态：`let/const` 变量语句、`function name()`、`class Name`。
 * 后两者在 ES 模块（恒严格模式）下同样是块级绑定，只在本块内遮蔽外层同名。
 */
function blockDirectlyDeclares(block: ts.Node, name: string): boolean {
  const statements = (block as ts.BlockLike).statements;
  if (!statements) return false;
  for (const stmt of statements) {
    if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) {
      if (stmt.name && stmt.name.text === name) return true;
      continue;
    }
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
 * for / for-of / for-in 头部声明是否绑定 name。
 * 头部的 `let/const` 作用域覆盖整条循环语句（含循环体），但它不在任何 Block 的
 * statements 里，blockDirectlyDeclares 看不到，必须在祖先链上单独识别。
 * 头部的 `var` 提升到函数作用域，由 functionScopeDeclares 覆盖。
 */
function forStatementDeclares(node: ts.Node, name: string): boolean {
  if (!ts.isForStatement(node) && !ts.isForOfStatement(node) && !ts.isForInStatement(node)) {
    return false;
  }
  const initializer = node.initializer;
  if (!initializer || !ts.isVariableDeclarationList(initializer)) return false;
  return initializer.declarations.some((d) => bindingDeclaresName(d.name, name));
}

/**
 * 遮蔽判定的共享内核：沿 ref 的祖先链逐层向上，看有没有哪一层作用域声明了名为 name
 * 的绑定。boundary 非空时，检查完 boundary 自身那一层即停止（只覆盖 ref 到 boundary
 * 之间的作用域链）；为空则一路走到 SourceFile。
 *
 * 关键：必须区分函数作用域与块级作用域——`const/let` 是块级，写在某个 if/块内的
 * `const { t } = ...` 只遮蔽该块内的引用；同函数内、该块之外的引用仍解析到 module import。
 * 把函数体内任意嵌套块的 const/let 都当成整个函数的声明，会误判块外引用被遮蔽，
 * 进而把仍在使用的 import 删掉（TS2304）。故逐层分四类处理：
 *  - 函数作用域：参数 + 函数体内 `var`（提升到整个函数，不含嵌套函数）遮蔽；
 *  - 块作用域（Block / SourceFile / ModuleBlock）：仅该块「直属」语句里的
 *    `let/const` / `function` / `class` 遮蔽；
 *  - for / for-of / for-in 语句：头部 `let/const` 声明遮蔽整条循环语句；
 *  - catch 子句：`catch (e)` 的参数遮蔽 catch 块。
 * 后两类的声明不落在任何 Block 的 statements 里，漏掉会把「循环变量 / catch 参数」
 * 当成外层同名绑定的引用。
 *
 * 判定必须**贴合语言的作用域规则**、不能往任一侧放宽：公开变体的安全方向相反——
 * hasLocalDeclarationWithin 漏判遮蔽会把循环变量当成翻译变量、给 hook deps 注入不存在的
 * 标识符（TS2304）；isImportedNameUnused 多判遮蔽则会把仍在使用的 import 判成死导入删掉
 * （同样 TS2304）。任何一侧的偏移都会在另一侧变成 bug。
 *
 * boundaryMode 决定 boundary 那一层自身算不算遮蔽源：
 *  - 'inclusive'：检查完 boundary 再停。boundary 是「引用不该越过的外沿」（hook 回调），
 *    回调参数 `t => …` 同样遮蔽；
 *  - 'exclusive'：到 boundary 即停、不检查它。boundary 是**目标绑定自身所在的作用域**
 *    （`const { t } = useTranslation()` 所在的块），该层的同名声明就是目标绑定本身，
 *    按遮蔽处理会让作用域内每个引用都被判成"不是它"。
 */
function hasShadowingDeclaration(
  ref: ts.Node,
  name: string,
  boundary?: ts.Node,
  boundaryMode: 'inclusive' | 'exclusive' = 'inclusive',
): boolean {
  let cur: ts.Node | undefined = ref.parent;
  while (cur) {
    if (boundary && boundaryMode === 'exclusive' && cur === boundary) return false;
    if (isFunctionLikeScope(cur)) {
      if (functionScopeDeclares(cur, name)) return true;
    } else if (ts.isBlock(cur) || ts.isSourceFile(cur) || ts.isModuleBlock(cur)) {
      if (blockDirectlyDeclares(cur, name)) return true;
    } else if (forStatementDeclares(cur, name)) {
      return true;
    } else if (
      ts.isCatchClause(cur) &&
      cur.variableDeclaration &&
      bindingDeclaresName(cur.variableDeclaration.name, name)
    ) {
      return true;
    }
    if (boundary && cur === boundary) return false;
    cur = cur.parent;
  }
  return false;
}

/** 引用 ref 是否被某个「祖先作用域」的局部声明遮蔽了名为 name 的绑定（无边界，查到顶）。 */
function hasEnclosingLocalDeclaration(ref: ts.Node, name: string): boolean {
  return hasShadowingDeclaration(ref, name);
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
  // 遮蔽不可能成立。不提前返回的话内核从 parent 起步永远遇不到 boundary，
  // 会把 boundary 之外（组件层）的翻译绑定误判为遮蔽。
  if (ref === boundary) return false;
  return hasShadowingDeclaration(ref, name, boundary);
}

/**
 * 引用 ref 是否被「declarationScope 内层」的同名局部声明遮蔽。
 *
 * declarationScope 传目标绑定所在的直接作用域节点（其 VariableStatement 的父块 /
 * SourceFile）：只检查 ref 到该层**之间**的作用域链，该层自身的同名声明即目标绑定本身。
 *
 * 用于 restore 判「标识符是否真的引用翻译变量」：`for (const t of tabs)` 的循环变量、
 * catch 参数、内层块的 `const t` 等虽然同名，但解析到别的绑定，不能算翻译变量还活着——
 * 否则 hook 声明与库导入被无谓保留，产出两条 no-unused-vars。
 */
export function isShadowedInsideScope(
  ref: ts.Node,
  name: string,
  declarationScope: ts.Node,
): boolean {
  if (ref === declarationScope) return false;
  return hasShadowingDeclaration(ref, name, declarationScope, 'exclusive');
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
  const usage = collectImportedLocalNameUsage(code, filePath, moduleName, importedName);
  if (usage.size === 0) return false;
  for (const used of usage.values()) if (used) return false;
  return true;
}

/**
 * 返回 `import { ...importedName... } from moduleName` 绑出的、已无任何未被遮蔽值引用的
 * **本地名**列表（按 import 中出现顺序）。
 *
 * 与 isImportedNameUnused 的区别是粒度：后者要求同一源名的全部本地名都死了才算未使用，
 * 面向「整条导入能否删」；本方法面向「哪几个说明符能单独摘」——`import { t as tr, t }`
 * 里 tr 仍在用、t 已死时返回 `['t']`，调用方按本地名摘除 t，tr 原样保留。
 * 无该 import 时返回空数组。
 */
export function unusedImportedLocalNames(
  code: string,
  filePath: string,
  moduleName: string,
  importedName: string,
): string[] {
  const usage = collectImportedLocalNameUsage(code, filePath, moduleName, importedName);
  const unused: string[] = [];
  for (const [localName, used] of usage) if (!used) unused.push(localName);
  return unused;
}

/**
 * 收集 moduleName 导入的源名 importedName 对应的全部本地名，并逐个标记是否仍有
 * 未被内层局部声明遮蔽的值引用。
 *
 * 同一源名可以绑出多个本地名（`import { t as tr, t }`，工具追加 t 时正是这个形态）；
 * 只记最后一个会让前面的别名凭空"消失"，调用方据此删掉整条 import → 别名引用 TS2304。
 */
function collectImportedLocalNameUsage(
  code: string,
  filePath: string,
  moduleName: string,
  importedName: string,
): Map<string, boolean> {
  const sf = parseSourceFile(code, filePath);
  const usage = new Map<string, boolean>();
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
          if (original === importedName && !usage.has(el.name.text)) usage.set(el.name.text, false);
        }
      }
    }
    ts.forEachChild(n, findImport);
  };
  findImport(sf);
  if (usage.size === 0) return usage;

  const visit = (n: ts.Node): void => {
    if (
      ts.isIdentifier(n) &&
      usage.has(n.text) &&
      isIdentifierValueReference(n) &&
      !hasEnclosingLocalDeclaration(n, n.text)
    ) {
      usage.set(n.text, true);
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return usage;
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

/**
 * 从引用点 ref 沿祖先作用域链向上，返回**最内层**绑定了 name 的那个声明节点
 * （Parameter / VariableDeclaration / FunctionDeclaration / ClassDeclaration），无则 undefined。
 *
 * 与 hasShadowingDeclaration 的布尔判定共用同一套作用域规则（函数作用域的参数与 `var`、
 * 块作用域直属的 `let/const`/`function`/`class`、for 头部、catch 参数），区别只在返回值：
 * 调用方拿到声明节点后可再判它是不是 i18n 来源（`const { t } = useTranslation()` /
 * `const { t } = this.props`）——"最内层绑定决定这个引用点看到的是谁"，只有布尔遮蔽结论
 * 无法区分「被工具自己注入的绑定遮蔽」与「被用户的同名变量遮蔽」，前者正常、后者必须跳过。
 *
 * boundary / boundaryMode 语义同 hasShadowingDeclaration：'inclusive' 检查完 boundary 那一层
 * 再停（含其形参），'exclusive' 到 boundary 即停、不检查它自身。
 * 依赖 parent 指针，调用方须传 parseSourceFile 解析出的节点。
 *
 * 注意：import 绑定不在此列（import 不落在任何块的 let/const/function/class 声明里）——
 * 模块顶层的同名导入需由调用方另行判定来源模块。
 */
export function findInnermostBindingDeclaration(
  ref: ts.Node,
  name: string,
  boundary?: ts.Node,
  boundaryMode: 'inclusive' | 'exclusive' = 'inclusive',
): ts.Node | undefined {
  const fromFunctionScope = (fn: ts.Node): ts.Node | undefined => {
    const decl = fn as ts.FunctionLikeDeclaration;
    for (const p of decl.parameters ?? []) {
      if (bindingDeclaresName(p.name, name)) return p;
    }
    const body = decl.body;
    if (!body) return undefined;
    let found: ts.Node | undefined;
    const walk = (n: ts.Node): void => {
      if (found) return;
      // 不下钻内层函数：内层的局部声明不影响当前作用域对 name 的解析
      if (n !== body && isFunctionLikeScope(n)) return;
      if (ts.isVariableDeclaration(n) && isVarDeclaration(n) && bindingDeclaresName(n.name, name)) {
        found = n;
        return;
      }
      ts.forEachChild(n, walk);
    };
    walk(body);
    return found;
  };

  const fromBlockScope = (block: ts.Node): ts.Node | undefined => {
    const statements = (block as ts.BlockLike).statements;
    if (!statements) return undefined;
    for (const stmt of statements) {
      if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) {
        if (stmt.name && stmt.name.text === name) return stmt;
        continue;
      }
      if (!ts.isVariableStatement(stmt)) continue;
      const list = stmt.declarationList;
      // 只认块级（let/const）；var 由 fromFunctionScope 处理（提升语义）
      if ((list.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) === 0) continue;
      for (const d of list.declarations) {
        if (bindingDeclaresName(d.name, name)) return d;
      }
    }
    return undefined;
  };

  let cur: ts.Node | undefined = ref.parent;
  while (cur) {
    if (boundary && boundaryMode === 'exclusive' && cur === boundary) return undefined;
    let hit: ts.Node | undefined;
    if (isFunctionLikeScope(cur)) {
      hit = fromFunctionScope(cur);
    } else if (ts.isBlock(cur) || ts.isSourceFile(cur) || ts.isModuleBlock(cur)) {
      hit = fromBlockScope(cur);
    } else if (ts.isForStatement(cur) || ts.isForOfStatement(cur) || ts.isForInStatement(cur)) {
      const initializer = cur.initializer;
      if (initializer && ts.isVariableDeclarationList(initializer)) {
        hit = initializer.declarations.find((d) => bindingDeclaresName(d.name, name));
      }
    } else if (
      ts.isCatchClause(cur) &&
      cur.variableDeclaration &&
      bindingDeclaresName(cur.variableDeclaration.name, name)
    ) {
      hit = cur.variableDeclaration;
    }
    if (hit) return hit;
    if (boundary && cur === boundary) return undefined;
    cur = cur.parent;
  }
  return undefined;
}
