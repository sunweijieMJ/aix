import ts from 'typescript';
import { decodeJsStringEscapes, stripMatchedDelimiters } from './string-escape';

/**
 * 框架无关的 TypeScript AST 基础设施：解析源码、定位节点、读取节点文本、按偏移改写源码。
 *
 * 职责边界：这里只关心「源码 ↔ AST ↔ 偏移」三者之间的换算，不含任何 i18n 语义
 * （提取该不该做归 ast-guards，文案形态归 message-shape，节点重建归 restore-node-factory）。
 */

/**
 * 获取文件类型
 * @param filePath - 文件路径
 * @returns 脚本类型
 */
export function getScriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
    return ts.ScriptKind.TSX;
  }
  // .js/.mjs/.cjs 文件使用 JSX 模式，以支持 React 项目中 .js 文件内的 JSX 语法
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) {
    return ts.ScriptKind.JSX;
  }
  return ts.ScriptKind.TS;
}

/**
 * 解析源代码为AST
 * @param sourceText - 源代码文本
 * @param filePath - 文件路径
 * @returns TypeScript源文件对象
 */
export function parseSourceFile(sourceText: string, filePath: string): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath),
  );
}

/**
 * 以「表达式上下文」解析一段源码片段（Vue 动态属性 / 插值绑定本质都是表达式）。
 *
 * 直接 parseSourceFile 是语句上下文：`{ '提示信息': msg }` 会被当成 Block 而非对象
 * 字面量，里面的字符串失去 PropertyAssignment 父节点，isExtractableStringLiteral 的
 * 对象-key 排除便无从生效，导致中文对象 KEY 被误当文案提取。包一层括号 `(${expr})`
 * 强制按表达式解析，对象字面量、三元、序列等都得到正确的父节点结构。
 */
export function parseExpressionSource(sourceText: string, filePath: string): ts.SourceFile {
  return parseSourceFile(`(${sourceText})`, filePath);
}

/**
 * 获取字符串字面量的值
 * @param node - TypeScript AST节点
 * @returns 字符串值，如果不是字符串字面量则返回undefined
 */
export function getStringLiteralValue(node: ts.Node): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return undefined;
}

/**
 * 将AST节点转换为源代码文本
 * @param node - TypeScript AST节点
 * @param sourceFile - 源文件
 * @returns 源代码文本
 */
export function nodeToText(node: ts.Node, sourceFile: ts.SourceFile): string {
  // 用 getStart（跳过前导 trivia：空白与注释）而非 getFullStart。
  // getFullStart 会把节点前的注释一并纳入，导致 `const msg = /* x */ '你好'`
  // 这类带前导注释的字面量在 shouldReplaceNode 比较时首字符变成注释字符、
  // 比较失败 → 提取阶段已生成 key 写入 locale，但替换阶段被静默跳过。
  return sourceFile.text.substring(node.getStart(sourceFile), node.getEnd()).trim();
}

/**
 * 查找指定位置的节点
 * @param sourceFile - 源文件
 * @param position - 位置
 * @returns 找到的节点，如果没找到则返回undefined
 */
export function findNodeAtPosition(
  sourceFile: ts.SourceFile,
  position: number,
): ts.Node | undefined {
  function find(node: ts.Node): ts.Node | undefined {
    if (position >= node.getFullStart() && position < node.getEnd()) {
      return ts.forEachChild(node, find) || node;
    }
    return undefined;
  }
  return find(sourceFile);
}

/**
 * 获取属性键名
 * @param name - 属性名节点
 * @returns 属性键名
 */
function getPropertyKey(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name)) {
    return name.text;
  } else if (ts.isStringLiteral(name)) {
    return name.text;
  }
  return undefined;
}

/**
 * 获取属性值
 * @param initializer - 初始化表达式
 * @param sourceFile - 源文件（可选）
 * @returns 属性值
 */
function getPropertyValue(initializer: ts.Expression, sourceFile?: ts.SourceFile): any {
  const stringValue = getStringLiteralValue(initializer);

  if (stringValue !== undefined) {
    return stringValue;
  }
  if (ts.isNumericLiteral(initializer)) {
    return Number(initializer.text);
  }
  // 其余任意表达式（标识符 / 属性访问 / 调用，以及 ?? / 三元 / 二元等复杂表达式）：
  // 一律保留 AST 节点 + 源文本，供 restore 的 findExpressionForVariable 重建。
  // 早先对复杂表达式返回 `{{text}}` 字符串会丢失节点，导致这类占位符 restore 失败。
  if (sourceFile) {
    return { node: initializer, text: nodeToText(initializer, sourceFile) };
  }
  return initializer;
}

/**
 * 提取对象字面量中的属性值
 * @param node - 对象字面量表达式节点
 * @param sourceFile - 源文件（可选）
 * @returns 属性键值对
 */
export function extractObjectLiteralProperties(
  node: ts.ObjectLiteralExpression,
  sourceFile?: ts.SourceFile,
): Record<string, any> {
  const props: Record<string, any> = {};

  for (const property of node.properties) {
    if (ts.isPropertyAssignment(property)) {
      const key = getPropertyKey(property.name);
      if (key) {
        props[key] = getPropertyValue(property.initializer, sourceFile);
      }
    } else if (ts.isShorthandPropertyAssignment(property)) {
      // 对象简写 `{ count }` 等价于 `{ count: count }`：值即同名标识符节点。
      // 不补这一分支，手写/被 ESLint object-shorthand 改写的 values 会被静默丢弃 →
      // restore 端 values 为空 → 占位符整体字面化、变量引用被删且无告警。
      props[property.name.text] = sourceFile
        ? { node: property.name, text: property.name.text }
        : property.name;
    }
    // SpreadAssignment 无法静态解析成键值对，由 objectLiteralHasSpread 单独探测，
    // restore 端据此保留原调用（与 Vue 端 VueRestoreTransformer 的处理对齐）。
  }

  return props;
}

/**
 * 对象字面量是否含展开属性 `{ ...rest }`。restore 端在含展开时无法静态重建完整
 * values 映射，应保留原 i18n 调用不还原，而非丢着变量强行字面化。
 */
export function objectLiteralHasSpread(node: ts.ObjectLiteralExpression): boolean {
  return node.properties.some((property) => ts.isSpreadAssignment(property));
}

/**
 * 按绝对偏移替换代码中的字符串。
 *
 * 重叠即抛错、不做任何取舍：能构造出重叠区间说明上游定位逻辑已经出错，
 * 静默丢弃其中一个会让某个调用点保留中文原文却不再有对应 key（假绿）。
 *
 * @param sourceText - 源代码文本
 * @param replacements - 替换项列表（顺序无关）
 * @returns 替换后的代码
 */
export function applyReplacements(
  sourceText: string,
  replacements: Array<{ start: number; end: number; replacement: string }>,
): string {
  if (replacements.length === 0) {
    return sourceText;
  }

  const validReplacements: typeof replacements = [];
  for (const replacement of replacements) {
    const overlapping = validReplacements.find(
      (selected) => replacement.start < selected.end && replacement.end > selected.start,
    );
    if (overlapping) {
      throw new Error(
        `检测到重叠替换: [${replacement.start},${replacement.end}] 与 [${overlapping.start},${overlapping.end}] 冲突，已中止以避免静默丢失翻译调用点`,
      );
    }
    validReplacements.push(replacement);
  }

  // 倒序写入：先改后面的区间，前面区间的偏移才不会因长度变化而失效。
  validReplacements.sort((a, b) => b.start - a.start);

  let result = sourceText;
  for (const { start, end, replacement } of validReplacements) {
    result = result.substring(0, start) + replacement + result.substring(end);
  }

  return result;
}

/**
 * 决定是否应该替换一个给定的AST节点
 */
export function shouldReplaceNode(
  nodeText: string,
  originalText: string,
  _isTemplateString: boolean,
  opts?: { nodeDelimited?: boolean; originalDelimited?: boolean },
): boolean {
  // nodeDelimited / originalDelimited 默认 true：保持历史「两侧都剥一层成对定界符」的行为，
  // 未显式标注的调用点完全不受影响。仅当调用方明确知道「该侧是不含源码定界符的裸内容」
  // （如提取阶段存的 StringLiteral node.text）时传 false。
  //
  // Why：stripMatchedDelimiters 对「首尾恰为同种 ASCII 引号/反引号」的内容也会剥一层。
  // 当字面量的值本身被同种引号包裹（源码 `'"提示"'`，值即 `"提示"`），裸内容侧被误当作
  // 带定界符再剥一层 → 归一化后 `提示` ≠ 带定界符源码侧的 `"提示"` → 静默漏替换
  // （提取阶段已写入 locale key，源码却残留中文，形成孤儿）。对裸内容侧关掉剥定界符即可。
  const nodeDelimited = opts?.nodeDelimited ?? true;
  const originalDelimited = opts?.originalDelimited ?? true;

  // 转义解码只作用于「带定界符的源码侧」：裸内容侧（StringLiteral 的 node.text / JsxText）
  // 已是解码后的运行时形态，再解码一次会把内容里的字面 `\n`（如 `目录：C:\news` 的
  // 反斜杠+n 两个字符）误转成换行 → 两侧不相等 → 静默漏替换（locale 已写 key、源码残留中文）。
  const normalizeText = (text: string, delimited: boolean) => {
    if (delimited) {
      text = stripMatchedDelimiters(text);
      text = decodeJsStringEscapes(text);
    }
    return text.replace(/\r?\n/g, '\n');
  };

  return normalizeText(nodeText, nodeDelimited) === normalizeText(originalText, originalDelimited);
}

/**
 * 重构JSX元素的混合内容
 */
function reconstructJsxMixedContent(
  jsxElement: ts.JsxElement | ts.JsxFragment,
  sourceFile: ts.SourceFile,
): string {
  const children = jsxElement.children;
  if (!children || children.length === 0) {
    return '';
  }

  let inner = '';
  for (const child of children) {
    if (ts.isJsxText(child)) {
      // 必须与 ReactTextExtractor.extractJsxMixedContent 的空白处理逐字一致：
      // 仅跳过【含换行】的纯空白节点（JSX 折叠删除），不含换行的纯空白（相邻插值间的
      // 单个空格）保留，含内容的把换行+缩进压缩为单空格、但保留词间空格。
      // 若此处两端逻辑不一致（如漏掉相邻插值间的空格「共 ${a} ${b} 项」→「共 ${a}${b} 项」），
      // 与提取端产出的 original 不相等，findExactStringNode 的 `=== originalText`
      // 比对失败 → 该 JSX 混合内容被静默漏替换（locale 写了 key 但源码残留中文）。
      if (!child.text.trim() && /\n/.test(child.text)) continue;
      inner += child.text.replace(/\s*\n\s*/g, ' ');
    } else if (ts.isJsxExpression(child) && child.expression) {
      const expressionText = nodeToText(child.expression, sourceFile);
      inner += `\${${expressionText}}`;
    }
  }
  // 整体首尾去空白：与 extractJsxMixedContent 同步（边界换行压成的首尾空格不进 locale）。
  return '`' + inner.trim() + '`';
}

/**
 * 在指定位置附近模糊查找匹配的字符串节点。
 *
 * Why ±NEARBY_OFFSET：上游传入的 position 由不同 AST 工具计算，可能因引号、
 * leading whitespace、JSX `{ ' ' }` 等场景偏移 1~3 字符；±5 是经验值，覆盖常见
 * 偏移又不会越界跳到相邻 token。改大无明显收益（命中率边际为 0），改小则有
 * 漏命中风险。如未来发现 ±5 不够，调整这一处常量即可。
 */
const NEARBY_SEARCH_OFFSET = 5;

function findNearbyStringNode(
  sourceFile: ts.SourceFile,
  position: number,
  originalText: string,
): ts.Node | undefined {
  const range = NEARBY_SEARCH_OFFSET;
  for (let offset = -range; offset <= range; offset++) {
    const nearbyPosition = position + offset;
    if (nearbyPosition < 0 || nearbyPosition >= sourceFile.text.length) {
      continue;
    }

    const node = findNodeAtPosition(sourceFile, nearbyPosition);
    if (!node) continue;

    if (
      ts.isStringLiteral(node) ||
      ts.isJsxText(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      const nodeText = nodeToText(node, sourceFile);
      // 与精确路径同口径传形态旗标：originalText 仅反引号包裹时是源码形式，其余为裸内容；
      // JsxText 源码侧本身无定界符。漏传会让「值本身被同种引号包裹」的字面量在本回退
      // 路径被再剥一层 → 两侧不相等 → 漏替换（精确路径已修过的同型 bug）。
      const originalIsSourceForm = originalText.startsWith('`') && originalText.endsWith('`');
      if (
        shouldReplaceNode(nodeText, originalText, false, {
          nodeDelimited: !ts.isJsxText(node),
          originalDelimited: originalIsSourceForm,
        })
      ) {
        return node;
      }
    }
  }

  return undefined;
}

/**
 * 基于位置和原始文本，在源文件中查找最精确的字符串、模板或JSX文本节点
 */
export function findExactStringNode(
  sourceFile: ts.SourceFile,
  position: number,
  originalText: string,
): ts.Node | undefined {
  const node = findNodeAtPosition(sourceFile, position);
  if (!node) return undefined;

  if (originalText.startsWith('`') && originalText.endsWith('`')) {
    let parent = node;
    while (parent) {
      // Fragment 与元素同为混合内容宿主（提取端两者都会合成 `…${expr}…`），
      // 这里漏判 Fragment 会让 Fragment 的合成 original 定位不到节点 → 转换整文件中止。
      if (ts.isJsxElement(parent) || ts.isJsxFragment(parent)) {
        const mixedContent = reconstructJsxMixedContent(parent, sourceFile);
        if (mixedContent === originalText) {
          return parent;
        }
      }
      parent = parent.parent;
    }

    if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const nodeText = nodeToText(node, sourceFile);
      if (shouldReplaceNode(nodeText, originalText, true)) {
        return node;
      }
    }

    let parent2 = node.parent;
    while (parent2) {
      if (ts.isTemplateExpression(parent2) || ts.isNoSubstitutionTemplateLiteral(parent2)) {
        const nodeText = nodeToText(parent2, sourceFile);
        if (shouldReplaceNode(nodeText, originalText, true)) {
          return parent2;
        }
      }
      parent2 = parent2.parent;
    }
  }

  // 此处 originalText 是提取阶段存的裸内容（StringLiteral 的 node.text），不含源码定界符；
  // nodeText 是含定界符的源码片段 → 仅源码侧剥定界符，裸内容侧不剥（见 shouldReplaceNode 注释）。
  if (ts.isStringLiteral(node)) {
    const nodeText = nodeToText(node, sourceFile);
    if (
      shouldReplaceNode(nodeText, originalText, false, {
        originalDelimited: false,
      })
    ) {
      return node;
    }

    let parent = node.parent;
    while (parent) {
      if (ts.isStringLiteral(parent)) {
        const parentText = nodeToText(parent, sourceFile);
        if (
          shouldReplaceNode(parentText, originalText, false, {
            originalDelimited: false,
          })
        ) {
          return parent;
        }
      }
      parent = parent.parent;
    }
  }

  // JsxText：源码侧本身就是无定界符的裸文本，两侧都不剥（避免内容自带成对引号被误剥）。
  if (ts.isJsxText(node)) {
    const nodeText = nodeToText(node, sourceFile);
    if (
      shouldReplaceNode(nodeText, originalText, false, {
        nodeDelimited: false,
        originalDelimited: false,
      })
    ) {
      return node;
    }
  }

  // 处理无变量模板字符串（`文本` 没有 ${} 的场景）。能走到这里说明 originalText 非反引号包裹
  // （反引号原文已在上方分支处理并返回），即裸内容 → 仅源码侧（带反引号）剥定界符。
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    const nodeText = nodeToText(node, sourceFile);
    if (
      shouldReplaceNode(nodeText, originalText, false, {
        originalDelimited: false,
      })
    ) {
      return node;
    }
  }

  const nearbyNode = findNearbyStringNode(sourceFile, position, originalText);
  if (nearbyNode) {
    return nearbyNode;
  }

  return undefined;
}
