import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import ts from 'typescript';
import { parse } from 'vue-docgen-api';
import type {
  ApiComponent,
  ApiEvent,
  ApiExposeMember,
  ApiPackage,
  ApiProp,
  ApiSlot,
} from './api-model';
import type { DiscoveredComponent } from './component-files';

/**
 * 组件 API 提取：vue-docgen-api 负责 Props / Events / Slots 的基础解析（含 withDefaults 默认值），
 * TypeScript AST 在其上补齐 docgen 拿不到的信息：源码里的原始类型文本、本包类型别名的展开、
 * 字符串字面量可选值、带引号的插槽名、插槽与事件的参数声明、Expose 成员。
 */

/** 包内顶层类型声明索引，按名字查找 */
interface TypeIndex {
  aliases: Map<string, ts.TypeAliasDeclaration>;
  interfaces: Map<string, ts.InterfaceDeclaration>;
}

/** 从类型节点上读出的一个成员 */
interface AstMember {
  name: string;
  typeNode?: ts.TypeNode;
  optional: boolean;
  description: string;
  defaultTag?: string;
}

interface AstProp {
  name: string;
  type: string;
  resolvedType?: string;
  values?: string[];
  optional: boolean;
  description: string;
  defaultTag?: string;
}

/** 一次 `defineModel` 调用：它同时声明一个 prop 和配套的 `update:<name>` 事件 */
interface ModelMacro {
  name: string;
  typeNode?: ts.TypeNode;
  options?: ts.ObjectLiteralExpression;
  /** 声明语句上的 JSDoc */
  description: string;
}

/** 组件脚本里各个宏的类型实参 / 实参 */
interface Macros {
  props?: ts.TypeNode;
  emits?: ts.TypeNode;
  slots?: ts.TypeNode;
  exposeType?: ts.TypeNode;
  exposeObject?: ts.ObjectLiteralExpression;
  models: ModelMacro[];
}

export interface PackageApiResult {
  api: ApiPackage;
  /**
   * `defineProps` 给了类型参数、却一个成员都解析不出来的组件文件（相对包根）。
   * 典型是类型来自外部包（`NodeProps<NodeData>`），包内类型索引查不到声明。
   * 这种组件的 API 表会整张为空，必须由调用方显式处置，不能当成「该组件没有 API」。
   */
  unresolvedProps: string[];
}

export async function extractPackageApi(
  packageDir: string,
  packageName: string,
  discovered: DiscoveredComponent[],
): Promise<PackageApiResult> {
  const packageIndex = await buildPackageTypeIndex(packageDir);
  const components: ApiComponent[] = [];
  const unresolvedProps: string[] = [];

  for (const component of discovered) {
    const { api, propsUnresolved } = await extractComponent(packageDir, component, packageIndex);
    components.push(api);
    if (propsUnresolved) unresolvedProps.push(api.file);
  }

  return {
    api: { package: packageName, generatedBy: 'pnpm docs:gen', components },
    unresolvedProps,
  };
}

async function extractComponent(
  packageDir: string,
  { name, file }: DiscoveredComponent,
  packageIndex: TypeIndex,
): Promise<{ api: ApiComponent; propsUnresolved: boolean }> {
  const absolutePath = path.join(packageDir, file);
  const doc: any = await parse(absolutePath);
  const source = await fs.readFile(absolutePath, 'utf-8');

  // 宏只在 setup 块里；类型声明可能写在同文件的另一个 <script lang="ts"> 块，索引要收全部块
  const sourceFile = ts.createSourceFile(
    `${file}.ts`,
    extractScriptContent(source),
    ts.ScriptTarget.Latest,
    true,
  );
  let index = packageIndex;
  for (const block of extractAllScriptBlocks(source)) {
    const blockFile = ts.createSourceFile(`${file}.block.ts`, block, ts.ScriptTarget.Latest, true);
    index = mergeIndexes(index, collectTopLevelTypes(blockFile));
  }
  const macros = findMacros(sourceFile);

  const astProps = macros.props ? propsFromType(macros.props, index) : new Map<string, AstProp>();
  const astEvents = macros.emits ? emitsFromType(macros.emits, index) : new Map<string, ApiEvent>();
  const astSlots = macros.slots ? slotsFromType(macros.slots, index) : new Map<string, ApiSlot>();
  addModelProps(astProps, macros.models, index);
  addModelEvents(astEvents, macros.models);

  const props = mergeProps(doc.props ?? [], astProps);

  return {
    api: {
      name,
      file,
      description: doc.description || scriptDescription(sourceFile) || undefined,
      props,
      events: mergeEvents(doc.events ?? [], astEvents),
      slots: mergeSlots(dropDynamicSlots(doc.slots ?? [], source), astSlots),
      expose: exposeMembers(macros, name, index),
    },
    propsUnresolved: Boolean(macros.props) && props.length === 0,
  };
}

/**
 * 组件说明取 setup 脚本块顶部的块注释。
 * vue-docgen 的 `description` 只认 `<docs>` 块与 `export default` 上的注释，
 * `<script setup>` 写法下恒为空字符串。
 */
function scriptDescription(sourceFile: ts.SourceFile): string {
  const first = sourceFile.statements[0];
  return first ? readJsDocComment(first).trim() : '';
}

// ---------- 类型索引 ----------

async function buildPackageTypeIndex(packageDir: string): Promise<TypeIndex> {
  const files = await glob('src/**/*.ts', {
    cwd: packageDir,
    ignore: ['**/*.d.ts', '**/*.test.ts', '**/__test__/**'],
  });

  const index: TypeIndex = { aliases: new Map(), interfaces: new Map() };
  for (const file of files.sort()) {
    const content = await fs.readFile(path.join(packageDir, file), 'utf-8');
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    mergeInto(index, collectTopLevelTypes(sourceFile), false);
  }
  return index;
}

function collectTopLevelTypes(sourceFile: ts.SourceFile): TypeIndex {
  const index: TypeIndex = { aliases: new Map(), interfaces: new Map() };
  for (const statement of sourceFile.statements) {
    if (ts.isTypeAliasDeclaration(statement)) {
      index.aliases.set(statement.name.text, statement);
    } else if (ts.isInterfaceDeclaration(statement)) {
      index.interfaces.set(statement.name.text, statement);
    }
  }
  return index;
}

/** 组件脚本内的声明优先于包级声明 */
function mergeIndexes(base: TypeIndex, local: TypeIndex): TypeIndex {
  const merged: TypeIndex = {
    aliases: new Map(base.aliases),
    interfaces: new Map(base.interfaces),
  };
  mergeInto(merged, local, true);
  return merged;
}

function mergeInto(target: TypeIndex, source: TypeIndex, override: boolean): void {
  for (const [name, decl] of source.aliases) {
    if (override || !target.aliases.has(name)) target.aliases.set(name, decl);
  }
  for (const [name, decl] of source.interfaces) {
    if (override || !target.interfaces.has(name)) target.interfaces.set(name, decl);
  }
}

// ---------- SFC 脚本与宏 ----------

/**
 * SFC 里 `<script>` 块的正文，`setup` 块优先
 */
export function extractScriptContent(source: string): string {
  const blocks = [...source.matchAll(SCRIPT_BLOCK_RE)];
  const setupBlock = blocks.find((block) => /\bsetup\b/.test(block[1] ?? ''));
  return (setupBlock ?? blocks[0])?.[2] ?? '';
}

const SCRIPT_BLOCK_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;

/** SFC 里所有 `<script>` 块的正文 */
function extractAllScriptBlocks(source: string): string[] {
  return [...source.matchAll(SCRIPT_BLOCK_RE)].map((block) => block[2] ?? '');
}

function findMacros(sourceFile: ts.SourceFile): Macros {
  const macros: Macros = { models: [] };

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const typeArg = node.typeArguments?.[0];
      switch (node.expression.text) {
        case 'defineProps':
          macros.props ??= typeArg;
          break;
        case 'defineEmits':
          macros.emits ??= typeArg;
          break;
        case 'defineSlots':
          macros.slots ??= typeArg;
          break;
        case 'defineModel': {
          // 首个字符串实参是 model 名，省略时为 modelValue；选项对象带 default / required
          const first = node.arguments[0];
          macros.models.push({
            name: first && ts.isStringLiteral(first) ? first.text : 'modelValue',
            typeNode: typeArg,
            options: node.arguments.find((arg) => ts.isObjectLiteralExpression(arg)),
            description: readJsDocComment(outermostStatement(node)),
          });
          break;
        }
        case 'defineExpose': {
          // 三种写法：defineExpose<T>({...}) / defineExpose({...} satisfies T) / defineExpose({...})
          let arg = node.arguments[0];
          let exposeType = typeArg;
          if (arg && (ts.isSatisfiesExpression(arg) || ts.isAsExpression(arg))) {
            exposeType ??= arg.type;
            arg = arg.expression;
          }
          macros.exposeType ??= exposeType;
          if (arg && ts.isObjectLiteralExpression(arg)) macros.exposeObject ??= arg;
          break;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return macros;
}

// ---------- 成员读取 ----------

/**
 * JSDoc 正文。按原文逐行取，而不是读 `doc.comment`：TypeScript 把行中间的 `@aix/popper`
 * 这类写法也当成标签起点，正文会在那里被悄悄截断。标签一律写在行首，故只在行首的
 * `@tag` 处收尾（`{@link X}` 不在行首，原样保留）。
 */
function readJsDocComment(node: ts.Node): string {
  const doc = (node as any).jsDoc?.at(-1) as ts.JSDoc | undefined;
  if (!doc) return '';

  const lines: string[] = [];
  for (const raw of doc.getText().split('\n')) {
    const line = raw
      .replace(/^\s*\/\*\*+/, '')
      .replace(/\*\/\s*$/, '')
      .replace(/^\s*\*+ ?/, '');
    if (/^\s*@\w/.test(line)) break;
    lines.push(line);
  }
  return lines.join('\n').trim();
}

/** 节点所在的顶层语句，宏的 JSDoc 挂在它上面 */
function outermostStatement(node: ts.Node): ts.Node {
  let current = node;
  while (current.parent && !ts.isSourceFile(current.parent)) current = current.parent;
  return current;
}

function readJsDocTag(node: ts.Node, tagName: string): string | undefined {
  const tag = ts.getJSDocTags(node).find((t) => t.tagName.text === tagName);
  if (!tag?.comment) return undefined;
  const text =
    typeof tag.comment === 'string' ? tag.comment : (ts.getTextOfJSDocComment(tag.comment) ?? '');
  return text.trim() || undefined;
}

function memberName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

/**
 * 类型文本归一化：用 scanner 剥掉注释（字符串字面量里的 `//` 不受影响），压缩空白，
 * `import('./x').Foo` 这种内联导入类型只留 `Foo`，多行联合的前导竖线去掉
 */
export function normalizeTypeText(text: string): string {
  return stripComments(text)
    .replace(/import\((['"]).*?\1\)\./g, '')
    .replace(/\s+/g, ' ')
    .replace(/([<([]) /g, '$1')
    .replace(/ ([>)\]])/g, '$1')
    .trim()
    .replace(/^\| /, '');
}

function stripComments(text: string): string {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    text,
  );
  let out = '';
  let token = scanner.scan();
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (
      token !== ts.SyntaxKind.SingleLineCommentTrivia &&
      token !== ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      out += scanner.getTokenText();
    }
    token = scanner.scan();
  }
  return out;
}

/**
 * 把类型引用 / 类型字面量解析成成员列表
 */
function membersOfType(
  typeNode: ts.TypeNode,
  index: TypeIndex,
  seen = new Set<string>(),
): AstMember[] {
  if (ts.isTypeLiteralNode(typeNode)) {
    return typeNode.members.map(toAstMember).filter((m): m is AstMember => m !== null);
  }
  if (ts.isTypeReferenceNode(typeNode)) {
    return membersOfNamed(typeNode.typeName.getText(), index, seen);
  }
  return [];
}

/**
 * 按名字解析接口或类型别名的成员。
 * 接口的 `extends` 只跟进能按名字查到的接口，`Omit<...>` 这类带实参的工具类型不展开。
 */
function membersOfNamed(name: string, index: TypeIndex, seen = new Set<string>()): AstMember[] {
  if (seen.has(name)) return [];
  seen.add(name);

  const iface = index.interfaces.get(name);
  if (iface) {
    const inherited: AstMember[] = [];
    for (const clause of iface.heritageClauses ?? []) {
      for (const type of clause.types) {
        if (type.typeArguments?.length) continue;
        inherited.push(...membersOfNamed(type.expression.getText(), index, seen));
      }
    }
    const own = iface.members.map(toAstMember).filter((m): m is AstMember => m !== null);
    const ownNames = new Set(own.map((m) => m.name));
    return [...inherited.filter((m) => !ownNames.has(m.name)), ...own];
  }

  const alias = index.aliases.get(name);
  if (alias && !alias.typeParameters?.length) {
    return membersOfType(alias.type, index, seen);
  }

  return [];
}

function toAstMember(member: ts.TypeElement): AstMember | null {
  if (!ts.isPropertySignature(member) && !ts.isMethodSignature(member)) return null;
  const name = memberName(member.name);
  if (name === null) return null;

  return {
    name,
    typeNode: ts.isPropertySignature(member) ? member.type : undefined,
    optional: member.questionToken !== undefined,
    description: readJsDocComment(member),
    defaultTag: readJsDocTag(member, 'default'),
  };
}

// ---------- Props ----------

function propsFromType(typeNode: ts.TypeNode, index: TypeIndex): Map<string, AstProp> {
  const props = new Map<string, AstProp>();
  for (const member of membersOfType(typeNode, index)) {
    if (!member.typeNode) continue;
    const { type, resolvedType, values } = describeType(member.typeNode, index);
    props.set(member.name, {
      name: member.name,
      type,
      resolvedType,
      values,
      optional: member.optional,
      description: member.description,
      defaultTag: member.defaultTag,
    });
  }
  return props;
}

/**
 * 把 `defineModel` 声明的 prop 并进 props 表。
 * props 类型里已声明的同名项优先——那里的 JSDoc 更完整，defineModel 只补它没覆盖到的。
 */
function addModelProps(props: Map<string, AstProp>, models: ModelMacro[], index: TypeIndex): void {
  for (const model of models) {
    if (props.has(model.name)) continue;
    const described = model.typeNode
      ? describeType(model.typeNode, index)
      : { type: 'any', resolvedType: undefined, values: undefined };
    const defaultText = optionText(model.options, 'default');

    props.set(model.name, {
      name: model.name,
      type: described.type,
      resolvedType: described.resolvedType,
      values: described.values,
      optional: optionText(model.options, 'required') !== 'true',
      description: model.description,
      defaultTag: defaultText ? formatDefaultExpression(defaultText) : undefined,
    });
  }
}

/** `defineModel` 配套的 `update:<name>` 事件；emits 类型里已声明的优先 */
function addModelEvents(events: Map<string, ApiEvent>, models: ModelMacro[]): void {
  for (const model of models) {
    const name = `update:${model.name}`;
    if (events.has(name)) continue;
    events.set(name, {
      name,
      params: model.typeNode ? `value: ${normalizeTypeText(model.typeNode.getText())}` : undefined,
      description: model.description,
    });
  }
}

/** 选项对象里某个键的初始化表达式文本 */
function optionText(
  options: ts.ObjectLiteralExpression | undefined,
  key: string,
): string | undefined {
  const property = options?.properties.find(
    (p) => ts.isPropertyAssignment(p) && memberName(p.name) === key,
  );
  return property && ts.isPropertyAssignment(property)
    ? property.initializer.getText().trim()
    : undefined;
}

/**
 * 类型文本、别名一层展开、字符串字面量可选值
 */
function describeType(
  typeNode: ts.TypeNode,
  index: TypeIndex,
): { type: string; resolvedType?: string; values?: string[] } {
  const type = normalizeTypeText(typeNode.getText());
  let effective = typeNode;
  let resolvedType: string | undefined;

  if (ts.isTypeReferenceNode(typeNode) && !typeNode.typeArguments?.length) {
    const alias = index.aliases.get(typeNode.typeName.getText());
    if (alias && !alias.typeParameters?.length) {
      effective = alias.type;
      const text = normalizeTypeText(alias.type.getText());
      if (text !== type) resolvedType = text;
    }
  }

  const values = stringLiteralValues(effective);
  return { type, resolvedType, values: values.length > 0 ? values : undefined };
}

/**
 * 封闭的字符串字面量联合的取值；混有 `(string & {})` 之类非字面量成员的开放联合不给可选值，
 * 否则消费方会把它当成穷举
 */
function stringLiteralValues(typeNode: ts.TypeNode): string[] {
  if (!ts.isUnionTypeNode(typeNode)) return [];
  const values: string[] = [];
  for (const member of typeNode.types) {
    if (!ts.isLiteralTypeNode(member) || !ts.isStringLiteral(member.literal)) return [];
    values.push(member.literal.text);
  }
  return values;
}

function mergeProps(docProps: any[], astProps: Map<string, AstProp>): ApiProp[] {
  const result: ApiProp[] = [];
  const covered = new Set<string>();

  for (const prop of docProps) {
    const ast = astProps.get(prop.name);
    covered.add(prop.name);
    result.push({
      name: prop.name,
      type: ast?.type ?? formatDocgenType(prop),
      resolvedType: ast?.resolvedType,
      values: ast?.values,
      defaultValue: formatDocgenDefault(prop.defaultValue) ?? ast?.defaultTag,
      required: Boolean(prop.required),
      description: (prop.description || ast?.description || '').trim(),
    });
  }

  for (const ast of astProps.values()) {
    if (covered.has(ast.name)) continue;
    result.push({
      name: ast.name,
      type: ast.type,
      resolvedType: ast.resolvedType,
      values: ast.values,
      defaultValue: ast.defaultTag,
      required: !ast.optional,
      description: ast.description.trim(),
    });
  }

  return result;
}

/**
 * docgen 类型对象转文本，只在 AST 拿不到声明文本时兜底
 */
export function formatDocgenType(prop: any): string {
  const { type } = prop;
  if (!type) return 'any';

  if (type.name === 'union') {
    const elements = type.elements
      ?.map((e: any) => (e.value !== undefined ? `"${e.value}"` : (e.name ?? String(e))))
      .join(' | ');
    return elements || 'any';
  }
  if (type.name === 'array') {
    return `${type.elements?.[0]?.name || 'any'}[]`;
  }
  if (type.elements && type.elements.length > 0) {
    return `${type.name}<${type.elements.map((e: any) => e.name || 'any').join(', ')}>`;
  }
  if (type.name === 'func' || type.name === 'function' || type.name === 'TSFunctionType') {
    return 'Function';
  }
  if (type.name === 'object') return 'Object';
  if (typeof type.name === 'string' && type.name.startsWith('TS')) return 'any';
  return String(type.name);
}

/** docgen 默认值转文本 */
export function formatDocgenDefault(defaultValue: any): string | undefined {
  if (!defaultValue || defaultValue.value === undefined) return undefined;
  return formatDefaultExpression(String(defaultValue.value));
}

/**
 * 默认值表达式文本 -> 文档展示文本。只认能静态求值的字面量：
 * 字符串 / 数字 / 布尔 / null / 对象与数组字面量，以及返回这些字面量的工厂函数；
 * 模板字符串、标识符、成员访问、带语句的函数体返回 undefined，交给 `@default` 标签。
 */
export function formatDefaultExpression(expression: string): string | undefined {
  const parsed = parseExpression(expression);
  if (!parsed) return undefined;

  const value = unwrapExpression(parsed);
  if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) {
    // 对象 / 数组默认值在 Vue 里必须包一层工厂，工厂本身不是要展示的值
    const returned = returnedExpression(value);
    return returned ? literalText(unwrapExpression(returned)) : undefined;
  }
  return literalText(value);
}

/** 文本解析成表达式；外层括号必不可少，否则 `{}` 会被当成语句块 */
function parseExpression(text: string): ts.Expression | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const sourceFile = ts.createSourceFile(
    'default-value.ts',
    `const value = (${trimmed});`,
    ts.ScriptTarget.Latest,
    true,
  );
  const statement = sourceFile.statements[0];
  if (!statement || !ts.isVariableStatement(statement)) return undefined;
  return statement.declarationList.declarations[0]?.initializer;
}

/** 剥掉括号与 `as` / `satisfies` 断言，留下值本身 */
function unwrapExpression(node: ts.Expression): ts.Expression {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

/** 工厂函数返回的表达式；函数体带语句（不止一条 return）时拿不到 */
function returnedExpression(
  fn: ts.ArrowFunction | ts.FunctionExpression,
): ts.Expression | undefined {
  if (!ts.isBlock(fn.body)) return fn.body;
  const [statement, ...rest] = fn.body.statements;
  return rest.length === 0 && statement && ts.isReturnStatement(statement)
    ? statement.expression
    : undefined;
}

/** 字面量的展示文本；非字面量返回 undefined */
function literalText(node: ts.Expression): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text === '' ? "''" : `'${node.text}'`;
  }
  if (ts.isNumericLiteral(node)) return node.getText();
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return node.getText();
  }
  if (
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword
  ) {
    return node.getText();
  }
  if (ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node)) {
    return node.getText().replace(/\s+/g, ' ');
  }
  return undefined;
}

// ---------- Events ----------

function emitsFromType(typeNode: ts.TypeNode, index: TypeIndex): Map<string, ApiEvent> {
  const events = new Map<string, ApiEvent>();
  const target = resolveToDeclaration(typeNode, index);
  if (!target) return events;

  for (const member of target.members) {
    // 调用签名写法：(e: 'select', payload: X): void
    if (ts.isCallSignatureDeclaration(member)) {
      const [first, ...rest] = member.parameters;
      const literal = first?.type;
      if (!literal || !ts.isLiteralTypeNode(literal) || !ts.isStringLiteral(literal.literal)) {
        continue;
      }
      const name = literal.literal.text;
      if (events.has(name)) continue;
      const params = rest.map((p) => normalizeTypeText(p.getText())).join(', ');
      events.set(name, {
        name,
        params: params || undefined,
        description: readJsDocComment(member),
      });
      continue;
    }

    // 属性写法：select: [payload: X]
    if (ts.isPropertySignature(member) && member.type) {
      const name = memberName(member.name);
      if (name === null || events.has(name)) continue;
      const params = ts.isTupleTypeNode(member.type)
        ? member.type.elements.map((e) => normalizeTypeText(e.getText())).join(', ')
        : normalizeTypeText(member.type.getText());
      events.set(name, {
        name,
        params: params || undefined,
        description: readJsDocComment(member),
      });
    }
  }

  return events;
}

/** 类型引用解析到接口或类型字面量本体 */
function resolveToDeclaration(
  typeNode: ts.TypeNode,
  index: TypeIndex,
): ts.InterfaceDeclaration | ts.TypeLiteralNode | null {
  if (ts.isTypeLiteralNode(typeNode)) return typeNode;
  if (!ts.isTypeReferenceNode(typeNode)) return null;

  const name = typeNode.typeName.getText();
  const iface = index.interfaces.get(name);
  if (iface) return iface;

  const alias = index.aliases.get(name);
  if (alias && ts.isTypeLiteralNode(alias.type)) return alias.type;
  return null;
}

function mergeEvents(docEvents: any[], astEvents: Map<string, ApiEvent>): ApiEvent[] {
  const result: ApiEvent[] = [];
  const covered = new Set<string>();

  for (const event of docEvents) {
    const ast = astEvents.get(event.name);
    covered.add(event.name);
    result.push({
      name: event.name,
      params: ast?.params ?? formatDocgenEventParams(event),
      description: (event.description || ast?.description || '').trim(),
    });
  }

  for (const ast of astEvents.values()) {
    if (!covered.has(ast.name)) result.push({ ...ast, description: ast.description.trim() });
  }

  return result;
}

function formatDocgenEventParams(event: any): string | undefined {
  const names: string[] | undefined = event.type?.names;
  const elements: any[] | undefined = event.type?.elements;
  if (!names || names.length === 0) return undefined;

  if (names[0] === 'Array' && elements?.length) return `${elements[0].name || 'any'}[]`;
  if (names[0] === 'union' && elements?.length) {
    return elements.map((e) => e.name || e.value || 'any').join(' | ');
  }
  return names.join(' | ');
}

// ---------- Slots ----------

function slotsFromType(typeNode: ts.TypeNode, index: TypeIndex): Map<string, ApiSlot> {
  const slots = new Map<string, ApiSlot>();
  for (const member of membersOfType(typeNode, index)) {
    let params: string | undefined;
    if (member.typeNode && ts.isFunctionTypeNode(member.typeNode)) {
      params =
        member.typeNode.parameters.map((p) => normalizeTypeText(p.getText())).join(', ') ||
        undefined;
    }
    slots.set(member.name, { name: member.name, params, description: member.description });
  }
  return slots;
}

/**
 * `<slot :name="name">` 这种动态转发的插槽，docgen 会把表达式文本当成插槽名收进来。
 * 模板里没有同名静态 `name="x"` 声明的，一律视为动态转发丢弃。
 */
function dropDynamicSlots(docSlots: any[], source: string): any[] {
  const dynamicNames = new Set(
    [...source.matchAll(/<slot\b[^>]*?(?::|v-bind:)name="([^"]+)"/g)].map((m) => m[1]!.trim()),
  );
  if (dynamicNames.size === 0) return docSlots;

  const staticNames = new Set(
    [...source.matchAll(/<slot\b[^>]*?\sname="([^"]+)"/g)].map((m) => m[1]!),
  );
  return docSlots.filter((slot) => !dynamicNames.has(slot.name) || staticNames.has(slot.name));
}

function mergeSlots(docSlots: any[], astSlots: Map<string, ApiSlot>): ApiSlot[] {
  const result: ApiSlot[] = [];
  const covered = new Set<string>();

  for (const slot of docSlots) {
    const name = slot.name || 'default';
    const ast = astSlots.get(name);
    covered.add(name);
    result.push({
      name,
      params: ast?.params,
      description: (slot.description || ast?.description || '').trim(),
    });
  }

  for (const ast of astSlots.values()) {
    if (!covered.has(ast.name)) result.push({ ...ast, description: ast.description.trim() });
  }

  return result;
}

// ---------- Expose ----------

/**
 * Expose 成员只认有类型声明的来源：`defineExpose<T>()` 的类型实参、`satisfies T` 标注，
 * 或包内名为 `<组件名>Expose` 的接口（对象字面量不能含展开元素，且每个键都必须是该接口的成员，否则不采用）。
 * 裸对象字面量只有名字没有类型，不进 API 表。
 */
function exposeMembers(macros: Macros, componentName: string, index: TypeIndex): ApiExposeMember[] {
  let members: AstMember[] = [];

  if (macros.exposeType) {
    members = membersOfType(macros.exposeType, index);
  } else if (macros.exposeObject) {
    const candidates = membersOfNamed(`${componentName}Expose`, index);
    const memberNames = new Set(candidates.map((m) => m.name));
    const exposedKeys = macros.exposeObject.properties.map((property) =>
      property.name ? memberName(property.name) : null,
    );
    const allKnown =
      candidates.length > 0 &&
      exposedKeys.every((key): key is string => key !== null && memberNames.has(key));
    if (allKnown) members = candidates;
  }

  return members.map((member) => ({
    name: member.name,
    type: member.typeNode ? normalizeTypeText(member.typeNode.getText()) : undefined,
    description: member.description.trim(),
  }));
}
