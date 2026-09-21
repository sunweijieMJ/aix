import ts from 'typescript';
import { CHINESE_CHAR_RE } from './constants';

/**
 * 提取守卫与「中文泄漏」收集器：回答「这个节点该不该被提取 / 这里有没有会漏到运行时的中文」。
 *
 * 职责边界：只做**判定与收集**，不改写 AST、不生成文案形态。
 * 判定所需的 AST 基础操作（解析、取文本）不在这里实现，也刻意不依赖 ast-core——
 * 本模块的全部逻辑都只看节点自身与父链，保持依赖为零，供各端 TextExtractor 自由引用。
 */

/**
 * 判断字符串字面量是否是比较运算符（=== / !== / == / !=）的操作数，
 * 或 `'中文' in obj` 的左操作数（键位置）。
 *
 * 比较的右值通常是 locale 无关的状态常量（如 status === 'pending'）。
 * 一旦被提取并替换为 t(...)，运行时返回的是当前语言的翻译文本，与原始
 * 状态值脱钩，分支永远不命中，破坏业务逻辑。
 * `in` 的左操作数是对象键，与 PropertyAssignment 的 key、ElementAccess 的下标同一性质：
 * 换成译文即查不到该键。
 *
 * @param node 字符串字面量节点（也支持其他可能作为操作数的节点）
 */
export function isComparisonOperand(node: ts.Node): boolean {
  // 操作数被括号包裹时（如 `x === ('已完成')`、`case ('中文'):`），字面量的直接父节点是
  // ParenthesizedExpression 而非比较表达式 / case 子句。逐层上透括号后再判定父节点，
  // 否则守卫失效——比较用的中文被误提取成 t(...)，运行时比较分支永不命中。
  let current: ts.Node = node;
  while (current.parent && ts.isParenthesizedExpression(current.parent)) {
    current = current.parent;
  }
  const parent = current.parent;
  if (parent && ts.isBinaryExpression(parent)) {
    const op = parent.operatorToken.kind;
    if (op === ts.SyntaxKind.InKeyword) return parent.left === current;
    return (
      op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
      op === ts.SyntaxKind.EqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsToken
    );
  }
  // case '中文': 中的字面量也是比较场景（switch-case 与 === 等价）
  if (parent && ts.isCaseClause(parent) && parent.expression === current) {
    return true;
  }
  return false;
}

/**
 * 同文件内按名字找 type alias 的定义体。
 *
 * 只扫 sourceFile.statements（含 `export type`）：本模块零依赖、不建 Program 也不用
 * TypeChecker，故只认「与用法同处一份源码」的别名。带类型参数的别名（`type Maybe<T> = …`）
 * 与带类型实参的引用一律不认——实例化需要类型系统，猜不得。
 */
function findLocalTypeAlias(type: ts.TypeReferenceNode): ts.TypeAliasDeclaration | undefined {
  if (type.typeArguments && type.typeArguments.length > 0) return undefined;
  if (!ts.isIdentifier(type.typeName)) return undefined;
  const name = type.typeName.text;
  let sourceFile: ts.Node = type;
  while (sourceFile.parent) sourceFile = sourceFile.parent;
  if (!ts.isSourceFile(sourceFile)) return undefined;
  return sourceFile.statements.find(
    (st): st is ts.TypeAliasDeclaration =>
      ts.isTypeAliasDeclaration(st) &&
      st.name.text === name &&
      (st.typeParameters === undefined || st.typeParameters.length === 0),
  );
}

/**
 * 值在类型注解里的位置：从注解根部走到该字面量所经过的容器。
 * `['待办'] as S[]` 的路径是 [index]，`{ s: '待办' } satisfies { s: S }` 是 [prop 's']。
 */
type TypeValuePath = ReadonlyArray<{ kind: 'index' } | { kind: 'prop'; name: string }>;

/** 泛型容器：按值路径的一步取出对应的类型实参（数组取元素、Record 取值类型）。 */
function stepIntoTypeReference(
  type: ts.TypeReferenceNode,
  step: TypeValuePath[number],
): ts.TypeNode | undefined {
  if (!ts.isIdentifier(type.typeName)) return undefined;
  const name = type.typeName.text;
  const args = type.typeArguments;
  if (!args) return undefined;
  if (step.kind === 'index' && (name === 'Array' || name === 'ReadonlyArray')) return args[0];
  if (step.kind === 'prop' && (name === 'Record' || name === 'Partial')) {
    return name === 'Record' ? args[1] : undefined;
  }
  return undefined;
}

/**
 * 类型注解是否把该位置的值锁成字面量：字面量类型本身、`undefined`，或全部成员都满足的联合。
 *
 * path 非空时先按值在注解里的位置下钻（数组元素 / 对象成员 / `Array<T>` / `Record<K,V>`），
 * 再对下钻到的类型判定：`const tabs: Status[] = ['待办']`、`{ s: '待办' } as { s: S }`
 * 与直接标注字面量类型一样，换成 t() 返回的 string 即 TS2322。
 *
 * TypeReference（`const cur: Status = '待办'`）沿同文件的 type alias 展开一层再判：
 * 别名后面若是全字面量联合，赋值位置同样只接受字面量。
 * `seen` 防住 `type A = A` / `type A = B; type B = A` 这类自指链把递归吃满栈。
 * 跨文件引入的别名（`import type { Status }`）无从解析，这类漏网**有意**接受。
 * `undefined` 与 `null` 对称处理：二者都不接受 string，`'待办' | undefined` 同样锁死。
 */
function isLiteralTypeAnnotation(
  type: ts.TypeNode,
  path: TypeValuePath = [],
  seen: Set<string> = new Set(),
): boolean {
  if (ts.isParenthesizedTypeNode(type)) return isLiteralTypeAnnotation(type.type, path, seen);
  if (ts.isUnionTypeNode(type)) {
    return type.types.every((t) => isLiteralTypeAnnotation(t, path, seen));
  }
  if (path.length > 0) {
    const [step, ...rest] = path as Array<TypeValuePath[number]>;
    if (ts.isArrayTypeNode(type) && step!.kind === 'index') {
      return isLiteralTypeAnnotation(type.elementType, rest, seen);
    }
    if (ts.isTypeLiteralNode(type) && step!.kind === 'prop') {
      const member = type.members.find(
        (m): m is ts.PropertySignature =>
          ts.isPropertySignature(m) &&
          !!m.type &&
          (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name)) &&
          m.name.text === step!.name,
      );
      return !!member?.type && isLiteralTypeAnnotation(member.type, rest, seen);
    }
    if (ts.isTypeReferenceNode(type)) {
      const inner = stepIntoTypeReference(type, step!);
      if (inner) return isLiteralTypeAnnotation(inner, rest, seen);
      const alias = findLocalTypeAlias(type);
      if (!alias || seen.has(alias.name.text)) return false;
      seen.add(alias.name.text);
      return isLiteralTypeAnnotation(alias.type, path, seen);
    }
    return false;
  }
  if (ts.isLiteralTypeNode(type)) return true;
  if (type.kind === ts.SyntaxKind.UndefinedKeyword) return true;
  if (ts.isTypeReferenceNode(type)) {
    const alias = findLocalTypeAlias(type);
    if (!alias) return false;
    if (seen.has(alias.name.text)) return false;
    seen.add(alias.name.text);
    return isLiteralTypeAnnotation(alias.type, path, seen);
  }
  return false;
}

/** 沿父链找到包裹 node 的函数声明（不跨函数边界），用于取其返回类型注解。 */
function findEnclosingFunctionType(node: ts.Node): ts.TypeNode | undefined {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (ts.isFunctionLike(cur)) return (cur as ts.SignatureDeclaration).type;
    cur = cur.parent;
  }
  return undefined;
}

/** `as const` 断言：TS 把它表示为「类型是名为 const 的 TypeReference」。 */
function isConstAssertionType(type: ts.TypeNode): boolean {
  return (
    ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName) && type.typeName.text === 'const'
  );
}

/**
 * 字面量被「字面量类型上下文」锁死：换成 `t(...)` 调用即类型不合法。
 *
 * 三类：
 *  - `'标题' as const` / `['待办', '完成'] as const`：as const 要求操作数是字面量表达式，
 *    换成调用直接 TS1355（const 断言的操作数必须是字面量）。
 *  - `x as '待办'` / `x satisfies '待办' | '完成'`：断言目标是字面量类型，t() 返回 string
 *    不可赋值。
 *  - `const cur: '待办' | '完成' = '待办'`：声明的类型注解是字面量（联合），TS2322。
 *  - `function f(): Status { return '待办' }`：返回类型注解同样锁死返回值。
 *
 * 数组 / 对象字面量与括号会向上透传（`as const` 挂在最外层，字面量在里面），透传时记录
 * 值路径，注解按同一路径下钻（`Status[]` 的元素位、`{ s: Status }` 的成员位）。
 * 类型注解写成 TypeReference（`const cur: Status = '待办'`）时，只沿**同文件**的 type alias
 * 展开判定；跨文件引入的别名与 interface 成员位置无从解析，这类漏网**有意**接受——本模块
 * 刻意零依赖、不做类型检查器的活。
 */
function isInLiteralTypeContext(node: ts.StringLiteral): boolean {
  // 向上透传数组 / 对象字面量与括号的同时记录值路径，供类型注解按同一条路径下钻。
  const path: Array<{ kind: 'index' } | { kind: 'prop'; name: string }> = [];
  let current: ts.Node = node;
  let parent: ts.Node | undefined = current.parent;
  while (parent) {
    if (ts.isParenthesizedExpression(parent) || ts.isObjectLiteralExpression(parent)) {
      current = parent;
      parent = parent.parent;
      continue;
    }
    if (ts.isArrayLiteralExpression(parent)) {
      path.unshift({ kind: 'index' });
      current = parent;
      parent = parent.parent;
      continue;
    }
    if (ts.isPropertyAssignment(parent) && parent.initializer === current) {
      // 计算属性名对不上类型成员，路径不可解析：保持原有「不判定为字面量上下文」
      if (!ts.isIdentifier(parent.name) && !ts.isStringLiteral(parent.name)) return false;
      path.unshift({ kind: 'prop', name: parent.name.text });
      current = parent;
      parent = parent.parent;
      continue;
    }
    break;
  }
  if (!parent) return false;
  if (ts.isAsExpression(parent) || ts.isSatisfiesExpression(parent)) {
    return isConstAssertionType(parent.type) || isLiteralTypeAnnotation(parent.type, path);
  }
  if (
    (ts.isVariableDeclaration(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isParameter(parent)) &&
    parent.initializer === current
  ) {
    return !!parent.type && isLiteralTypeAnnotation(parent.type, path);
  }
  // `function f(): Status { return '待办' }` / `(): Status => '待办'`：返回值同样被
  // 函数的返回类型注解锁死，替换成 t() 即 TS2322。
  if (ts.isReturnStatement(parent) && parent.expression === current) {
    const returnType = findEnclosingFunctionType(parent);
    return !!returnType && isLiteralTypeAnnotation(returnType, path);
  }
  if (ts.isArrowFunction(parent) && parent.body === current) {
    return !!parent.type && isLiteralTypeAnnotation(parent.type, path);
  }
  return false;
}

/**
 * 判断 ts.StringLiteral 是否属于"应被国际化提取"的语义位置。
 *
 * 排除：
 * - 对象字面量属性 key（如 `{ '中文key': value }`，翻译会破坏数据结构）
 * - 计算属性 KEY（如 `{ ['进行中']: v }`，字面量直接父节点是 ComputedPropertyName，
 *   翻译后 key 变译文同样破坏数据结构——与非计算 key 对称）
 * - 计算属性访问的 key（如 `map['进行中']`，翻译后 `map[t(...)]` 返回译文，查找落空）
 * - 模块路径（静态 import / export-from / require() / 动态 import() / external module reference）
 * - 比较运算符 / case 子句 / `in` 左侧的操作数（翻译状态值会破坏分支判断与键查找）
 * - 字面量类型上下文（`as const`、字面量类型注解），替换成 t() 会直接编译不过
 *
 * Why: React/Vue 两端 TextExtractor 共用本方法，避免各写一遍相同的排除条件而维护漂移。
 *
 * 计算属性访问与对象字面量 key 是对称的：定义侧 `{ '进行中': x }` 已被 PropertyAssignment
 * 分支排除并原样保留，访问侧 `map['进行中']` 若被提取替换为 `map[t(...)]`，运行时返回译文
 * 导致与定义侧不匹配、查找失效——故同样排除（与 isComparisonOperand 守卫同一类不对称风险）。
 */
export function isExtractableStringLiteral(node: ts.StringLiteral): boolean {
  const parent = node.parent;
  if (!parent) return true;
  // 任何「带名字的声明 / 签名 / 说明符」的名字位置：对象属性 key、方法名、class 属性名、
  // interface 成员名、枚举成员名、import/export 具名、`declare module '…'`。
  // 名字槽位换成 `t('k')` 调用后源码不再可解析（printer 产出的文件整体报语法错误），
  // 故按节点身份统一排除，而不是逐个 SyntaxKind 追加。
  const named = parent as ts.Node & { name?: ts.Node; propertyName?: ts.Node };
  if (named.name === node || named.propertyName === node) return false;
  // 计算属性 KEY `{ ['进行中']: v }` / `class { ['进行中']() {} }`：字面量的直接父节点
  // 是 ComputedPropertyName，PropertyAssignment 分支无法命中（其父才是）。提取后 key 变译文，
  // 与非计算 key 同样破坏数据结构，需对称排除。
  if (ts.isComputedPropertyName(parent) && parent.expression === node) return false;
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return false;
  if (ts.isImportDeclaration(parent) || ts.isExternalModuleReference(parent)) return false;
  // `export … from './中文目录'`：ExportDeclaration 的 moduleSpecifier 与 import 同为模块路径。
  if (ts.isExportDeclaration(parent) && parent.moduleSpecifier === node) return false;
  // `require('./中文目录/工具')` / `await import('./帮助文档')`：路径是运行时解析的模块标识符，
  // 替换成 t() 后按译文去 resolve，直接 MODULE_NOT_FOUND。上面的静态 import 分支覆盖不到调用形式。
  if (
    ts.isCallExpression(parent) &&
    parent.arguments[0] === node &&
    ((ts.isIdentifier(parent.expression) && parent.expression.text === 'require') ||
      parent.expression.kind === ts.SyntaxKind.ImportKeyword)
  ) {
    return false;
  }
  if (isComparisonOperand(node)) return false;
  if (isInLiteralTypeContext(node)) return false;
  return true;
}

/**
 * 模板字符串的字面量片段（head + 各 span 的 literal.text）是否含中文。
 *
 * 仅当字面量片段命中中文时才视为可提取，避免对 `${user}: ${count}` 这类
 * 不含本地化文案的模板误处理。变量表达式中的中文（如 ${'中文'}）由
 * processTemplateExpression 内部的内联逻辑兜底。
 */
export function templateLiteralsContainChinese(node: ts.TemplateExpression): boolean {
  const test = (s: string): boolean => CHINESE_CHAR_RE.test(s);
  if (test(node.head.text)) return true;
  return node.templateSpans.some((span) => test(span.literal.text));
}

/**
 * 模板字符串文本是否包含 HTML 标签。
 *
 * 典型场景：`innerHTML = \`<div>...<span>中文</span></div>\`` 这种把 HTML
 * 拼装放进模板字符串的写法——整段提取会把 HTML / CSS / SVG 一起灌进 locale
 * value，多语言下样式结构不可控、翻译质量受 HTML 噪声干扰。
 *
 * 命中规则：`<` 后必须紧跟字母 / `/`，避免 `x < 10` 等不等式误命中。
 * 与 LocaleValueLinter 同 family，规则一致，便于双端校验。
 */
export function templateLiteralContainsHtmlTags(text: string): boolean {
  // `<` 与标签名之间不允许空白（HTML 规范如此）：写成 `<\s*` 会把 `当前值 < min 时`
  // 这类不等式误判为 HTML，导致含中文模板被跳过提取 / linter 误报 html-tag-in-value。
  return /<\/?[a-zA-Z][\w-]*(\s|>|\/)/.test(text);
}

/**
 * 「该节点是会作为运行时值泄漏的中文字面量吗」的唯一判定。
 *
 * 排除比较操作数（`x === '已完成'`）：那是逻辑值、不参与展示，由 isComparisonOperand
 * 路径单独诊断。下面两个收集器共用本谓词——两处曾各写一遍逐字相同的条件，任一处漏改
 * （如只在一边补新的排除条件）都会让同一段代码在不同诊断路径下给出互相矛盾的结论。
 */
function isRuntimeLeakingChineseLiteral(
  node: ts.Node,
): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return (
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
    CHINESE_CHAR_RE.test(node.text) &&
    !isComparisonOperand(node)
  );
}

/** collectNestedChineseLiterals 的带节点版本，供需要精确行列的诊断路径使用。 */
export function collectNestedChineseLiteralNodes(
  expression: ts.Node,
): Array<ts.StringLiteral | ts.NoSubstitutionTemplateLiteral> {
  const out: Array<ts.StringLiteral | ts.NoSubstitutionTemplateLiteral> = [];
  const walk = (n: ts.Node): void => {
    if (isRuntimeLeakingChineseLiteral(n)) {
      out.push(n);
    }
    ts.forEachChild(n, walk);
  };
  walk(expression);
  return out;
}

/**
 * 收集表达式子树内「会作为运行时值泄漏的中文字面量」。
 *
 * 仅收集非比较操作数的中文字符串字面量：比较操作数（`x === '已完成'`）是逻辑值、
 * 不参与展示，由 isComparisonOperand 路径单独诊断；三元/逻辑表达式的展示分支
 * （`cond ? '内部错误' : '网络异常'`）才是真正渲染给用户、需要 i18n 的文案。
 */
export function collectNestedChineseLiterals(expression: ts.Node): string[] {
  return collectNestedChineseLiteralNodes(expression).map((node) => node.text);
}

/**
 * 收集翻译调用运行时参数中的中文字符串。
 *
 * 第一个参数承载 key/message descriptor，属于翻译调用本身；从第二个参数开始才是
 * values/options 等运行时数据。这里仅扫描后者，并排除 defaultMessage/defaultValue/
 * defaults 这类已经由 i18n 库管理的默认文案字段。用于增量重跑时继续暴露第一次
 * generate 留在参数表达式里的中文分支，保证覆盖率口径幂等。
 */
export function collectRuntimeChineseLiteralsFromI18nCall(
  call: ts.CallExpression,
): Array<{ text: string; node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral }> {
  const out: Array<{
    text: string;
    node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral;
  }> = [];
  const defaultFields = new Set(['defaultMessage', 'defaultValue', 'defaults']);

  const walk = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node)) {
      const name =
        ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : '';
      if (defaultFields.has(name)) return;
    }
    if (isRuntimeLeakingChineseLiteral(node)) {
      out.push({ text: node.text, node });
      return;
    }
    ts.forEachChild(node, walk);
  };

  for (const argument of call.arguments.slice(1)) walk(argument);
  return out;
}

function isCommonI18nCallee(expression: ts.Expression): boolean {
  return (
    (ts.isIdentifier(expression) && (expression.text === 't' || expression.text === '$t')) ||
    (ts.isPropertyAccessExpression(expression) &&
      (expression.name.text === 't' || expression.name.text === '$t'))
  );
}

/** 框架无关的 t/$t 调用判定，供提取守卫和增量诊断复用。 */
export function isCommonI18nCall(node: ts.CallExpression): boolean {
  return isCommonI18nCallee(node.expression);
}

/**
 * 「是否已国际化」父链遍历脚手架（react-i18next / react-intl 共用）。
 *
 * 从 node 沿 parent 向上走，命中以下任一即判定已国际化：
 * - 一个 i18n 调用（由 isI18nCall 判定，库特定：t/i18next.t vs formatMessage/defineMessages）
 * - 一个 i18n 组件（标签名 ∈ componentTags，库特定：Trans vs FormattedMessage）的属性或子节点
 * - 类型字面量 / 枚举成员值（编译期消费，不参与运行时本地化，跳过提取）
 * 遇到 Block / 函数 / 类作用域即停止并返回 false（已越过可能的 i18n 包裹）。
 */
export function isAlreadyInternationalizedByScaffold(
  node: ts.Node,
  options: {
    isI18nCall: (expression: ts.Expression) => boolean;
    componentTags: readonly string[];
  },
): boolean {
  let parent = node.parent;
  while (parent) {
    if (ts.isCallExpression(parent) && options.isI18nCall(parent.expression)) {
      return true;
    }
    // <Tag attr={...} />：属性挂在 opening/self-closing 元素上
    if (ts.isJsxAttribute(parent)) {
      const jsxElement = parent.parent.parent;
      if (
        (ts.isJsxOpeningElement(jsxElement) || ts.isJsxSelfClosingElement(jsxElement)) &&
        ts.isIdentifier(jsxElement.tagName) &&
        options.componentTags.includes(jsxElement.tagName.text)
      ) {
        return true;
      }
    }
    if (ts.isJsxElement(parent)) {
      const openingElement = parent.openingElement;
      if (
        ts.isIdentifier(openingElement.tagName) &&
        options.componentTags.includes(openingElement.tagName.text)
      ) {
        return true;
      }
    }
    // 类型字面量与枚举成员值在编译期就被消费，不参与运行时本地化，应跳过提取。
    if (ts.isLiteralTypeNode(parent) || ts.isEnumMember(parent)) {
      return true;
    }
    if (ts.isBlock(parent) || ts.isFunctionLike(parent) || ts.isClassLike(parent)) {
      return false;
    }
    parent = parent.parent;
  }
  return false;
}

/**
 * 检查节点是否应跳过提取：
 *   - 已被框架无关的 t()/$t() 调用包裹
 *   - 位于不可提取的位置：类型字面量（type X = '中文'）、枚举成员值
 *
 * 框架/库特定的 JSX 组件（如 FormattedMessage/Trans）由各 i18n 库适配器自行覆盖。
 * 调用方语义为"是否应跳过"，因此类型字面量/枚举成员返回 true（跳过）。
 */
export function isAlreadyInternationalized(node: ts.Node): boolean {
  // 框架无关的 t()/$t()（标识符或成员调用，如 i18n.t / this.$t）即为已国际化。
  // 复用 isAlreadyInternationalizedByScaffold 的父链遍历，componentTags 传空数组——
  // 本场景不识别 i18n 组件标签，JSX 分支恒不命中、退化为纯调用判定。
  return isAlreadyInternationalizedByScaffold(node, {
    isI18nCall: (expression) => isCommonI18nCallee(expression),
    componentTags: [],
  });
}

/**
 * 对象字面量是否是「组件选项对象」：`export default { ... }` 或
 * `defineComponent({ ... })` / `Vue.extend({ ... })` 的参数（后者可再套一层 export default）。
 *
 * 用于把组件选项里的 setup 与「用户自己类 / 普通对象里恰好叫 setup 的方法」区分开——
 * 后者的 this 语义正常，不能一刀切当作不可绑定。
 */
const COMPONENT_FACTORY_NAMES = new Set(['defineComponent', 'extend', 'defineAsyncComponent']);
/** 全局/应用注册：选项对象是**第二个**实参（`Vue.component('x', { … })`、`app.component(…)`）。 */
const COMPONENT_REGISTER_NAMES = new Set(['component']);

function isComponentOptionsObject(node: ts.ObjectLiteralExpression): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isExportAssignment(parent)) return true;
  if (ts.isCallExpression(parent)) {
    const callee = parent.expression;
    const name = ts.isIdentifier(callee)
      ? callee.text
      : ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : undefined;
    if (!name) return false;
    if (parent.arguments[0] === node) return COMPONENT_FACTORY_NAMES.has(name);
    if (parent.arguments[1] === node) return COMPONENT_REGISTER_NAMES.has(name);
  }
  return false;
}

/** 该函数是否是组件选项对象的 `setup`（方法简写 `setup() {}` 或 `setup: function () {}`）。 */
function isComponentSetupFunction(fn: ts.Node): boolean {
  if (ts.isMethodDeclaration(fn)) {
    return (
      ts.isIdentifier(fn.name) &&
      fn.name.text === 'setup' &&
      ts.isObjectLiteralExpression(fn.parent) &&
      isComponentOptionsObject(fn.parent)
    );
  }
  if (ts.isFunctionExpression(fn)) {
    const prop = fn.parent;
    return (
      !!prop &&
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === 'setup' &&
      ts.isObjectLiteralExpression(prop.parent) &&
      isComponentOptionsObject(prop.parent)
    );
  }
  return false;
}

/**
 * 匿名 `function` 表达式且直接作为调用实参（`list.forEach(function (x) { … })`）。
 *
 * 这类回调的 this 由调用方决定，绝大多数库不传 thisArg（严格模式下为 undefined），
 * Vue 2 遗留代码里的 `var self = this` 模式正是为此存在。产出 `this.$t(...)` 会在运行时
 * 抛 TypeError——静默到执行才暴露，故保守判为不可绑定，走裸 t() + import 路径。
 */
function isAnonymousCallbackFunction(fn: ts.Node): boolean {
  if (!ts.isFunctionExpression(fn) || fn.name) return false;
  const parent = fn.parent;
  return !!parent && ts.isCallExpression(parent) && parent.arguments.includes(fn);
}

/**
 * 判断节点是否处于"可绑定 this"的词法作用域。
 *
 * 用于 Vue SFC 普通 <script> 块的转换：data() / methods / computed / watch /
 * mounted 等 Options API 选项内部的字符串可以写 `this.$t(...)`，因为运行时
 * `this` 指向组件实例；但同一 <script> 块的**模块顶层**（如顶层
 * `const X = ...`、IIFE 顶部、模块级 import 等）`this` 是 undefined，
 * 强行写 `this.$t` 会运行时崩溃。
 *
 * 规则（按 JavaScript this 绑定语义）：
 * - 普通函数 / 方法 / getter / setter / 构造器 → this 绑定到调用点 → 返回 true
 * - 箭头函数 → 透明，沿父链继续向上判定
 * - 类声明体 → 透明（类成员的 this 由方法层判定，类字段初始化器无 this）
 * - 模块顶层 / 块语句直接挂 SourceFile → 返回 false
 *
 * 注意：类字段初始化器（class field initializer）严格说有 this（指向实例），
 * 但实际场景里 SFC 不写 class，故不特别处理。
 *
 * 两类例外同样走裸 t() + import 路径（写 `this.$t(...)` 会在运行时抛 TypeError）：
 *  - 组件选项对象里的 `setup()`：Vue 3 调用 setup 时不绑定组件实例（严格模式下 this 为 undefined）；
 *  - 作为调用实参的匿名 `function` 回调：this 由调用方决定，通常不是组件实例。
 */
export function isInThisBindableScope(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isArrowFunction(current)) {
      current = current.parent;
      continue;
    }
    if (
      ts.isMethodDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isFunctionDeclaration(current) ||
      ts.isGetAccessor(current) ||
      ts.isSetAccessor(current) ||
      ts.isConstructorDeclaration(current)
    ) {
      if (isComponentSetupFunction(current)) return false;
      if (isAnonymousCallbackFunction(current)) return false;
      return true;
    }
    if (ts.isSourceFile(current)) {
      return false;
    }
    current = current.parent;
  }
  return false;
}

/**
 * 检查节点是否在console调用中
 * @param node - TypeScript AST节点
 * @returns 是否在console调用中
 */
export function isInConsoleCall(node: ts.Node): boolean {
  let parent = node.parent;
  while (parent) {
    if (ts.isCallExpression(parent)) {
      const expression = parent.expression;
      if (ts.isPropertyAccessExpression(expression)) {
        const object = expression.expression;
        if (ts.isIdentifier(object) && object.text === 'console') {
          return true;
        }
      }
    }
    parent = parent.parent;
  }
  return false;
}
