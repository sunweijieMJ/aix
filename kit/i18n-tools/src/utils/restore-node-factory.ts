import ts from 'typescript';
import { LoggerUtils } from './logger';
import { parseTemplatePlaceholders } from './message-shape';

/**
 * restore 侧的节点工厂：把「locale 文案 + 运行时 values」重建成源码 AST 节点。
 *
 * 职责边界：只做「文案 → 节点」的构造，占位符切分口径由 message-shape 提供，
 * 何时调用、失败后如何回退由各端 RestoreTransformer 决定。
 * 所有工厂函数在无法忠实重建时一律返回 null（而非退化为字面串），
 * 由调用方保留原 i18n 调用——静默字面化会把占位符写死进源码、删掉运行时变量。
 */

/**
 * 从values映射中查找变量名对应的AST表达式节点
 */
function findExpressionForVariable(
  varName: string,
  values: Record<string, any>,
): ts.Expression | undefined {
  const value = values[varName];

  if (value && typeof value === 'object') {
    if ('node' in value && 'text' in value) {
      return value.node as ts.Expression;
    } else if ('kind' in value) {
      return value as ts.Expression;
    }
  }

  return undefined;
}

/**
 * 根据消息文本和变量值，创建一个字符串字面量或模板表达式节点
 * @param messageText - 从语言文件中获取的、包含占位符的消息文本
 * @param values - 包含变量名到其原始AST节点映射的对象
 * @returns 创建的节点；占位符与 values 无法对齐（无占位符 / 数量失配 / 找不到表达式）时返回 null，
 *          调用方应保留原调用/组件——此前这两条路径退化为字面串，会把占位符字面化写进
 *          源码、静默删除运行时变量。
 */
export function createStringOrTemplateNode(
  messageText: string,
  values?: Record<string, any>,
): ts.Node | null {
  if (!values || Object.keys(values).length === 0) {
    return ts.factory.createStringLiteral(messageText);
  }

  const { literalParts, placeholderNames } = parseTemplatePlaceholders(messageText);

  // values 非空却一个占位符都没有 → 与下方「数量比对」同属失配，必须返回 null 保留原调用。
  // 此前在比对之前提前返回字符串字面量，绕开了整道失配守卫：values 里的运行时变量被静默
  // 丢弃，且在 JSX 子节点位置这个 StringLiteral 会连引号一起渲染成可见文本。
  if (placeholderNames.length === 0) {
    LoggerUtils.warn(
      `[Restore Warning] Message has no placeholder but ${
        Object.keys(values).length
      } value(s) were provided. Keeping original call. Template: "${messageText}"`,
    );
    return null;
  }

  // 按「唯一占位符名」而非「出现次数」与 values 比对：同一变量在文案中重复出现
  // （`欢迎 ${name}，再次 ${name}`）时，generate 侧 placeholderMap 以表达式为 key，
  // values 只含 1 项，但 message 含 2 个同名占位符。若用出现次数比对会误判不匹配、
  // 退化为字面串、丢失运行时变量。下方 span 循环按名查表达式，可天然复用同名占位符。
  if (new Set(placeholderNames).size !== Object.keys(values).length) {
    LoggerUtils.warn(
      `[Restore Warning] Mismatch between placeholders (${
        new Set(placeholderNames).size
      }) and variables (${
        Object.keys(values).length
      }). Keeping original call. Template: "${messageText}"`,
    );
    return null;
  }

  const templateSpans: ts.TemplateSpan[] = [];
  const headText = literalParts[0];

  for (let i = 0; i < placeholderNames.length; i++) {
    const placeholderName = placeholderNames[i];
    const expressionNode = findExpressionForVariable(placeholderName!, values);
    const literal = literalParts[i + 1] || '';

    if (!expressionNode) {
      LoggerUtils.warn(
        `[Restore Warning] Could not find expression for placeholder "{${placeholderName}}". Keeping original call.`,
      );
      return null;
    }

    if (i === placeholderNames.length - 1) {
      templateSpans.push(
        ts.factory.createTemplateSpan(expressionNode, ts.factory.createTemplateTail(literal)),
      );
    } else {
      templateSpans.push(
        ts.factory.createTemplateSpan(expressionNode, ts.factory.createTemplateMiddle(literal)),
      );
    }
  }

  return ts.factory.createTemplateExpression(
    ts.factory.createTemplateHead(headText ?? ''),
    templateSpans,
  );
}

/**
 * 把含占位符的文案重建为 JSX 片段：`共 {itemCount} 项` → `<>共 {itemCount} 项</>`
 * （文本段为 JsxText，占位符为 JsxExpression `{expr}`）。
 *
 * 用于 restore 时把「JSX 子节点位置、带 values 的 <Trans>」还原回 JSX 形态——
 * 不能用 createStringOrTemplateNode 的模板字面量(`` `共 ${n}` ``)，否则在 JSX 子节点
 * 位置会被当作字面文本渲染(反引号/`${}` 原样显示、变量不插值)。
 *
 * 返回 null 表示无法重建(无占位符 / 占位符与 values 不匹配 / 找不到表达式)，
 * 调用方据此回退到原有路径。
 */
export function createJsxFragmentFromTemplate(
  messageText: string,
  values?: Record<string, any>,
): ts.JsxFragment | null {
  if (!values || Object.keys(values).length === 0) return null;

  const { literalParts, placeholderNames } = parseTemplatePlaceholders(messageText);

  if (placeholderNames.length === 0) return null;

  const children: ts.JsxChild[] = [];
  // 含 JSX 元字符（`<` `>` `{` `}`）的字面段不能直接当 JsxText（`<` 非法、`{}` 会被当
  // 表达式容器），改用字符串表达式容器 `{'...'}` 原样承载。正常占位符文案（中文 + 已被
  // 正则消费的花括号）走 JsxText 快路径，行为不变。
  const pushText = (t: string): void => {
    if (t.length === 0) return;
    if (/[<>{}]/.test(t)) {
      children.push(ts.factory.createJsxExpression(undefined, ts.factory.createStringLiteral(t)));
    } else {
      children.push(ts.factory.createJsxText(t, false));
    }
  };

  pushText(literalParts[0] ?? '');
  for (let i = 0; i < placeholderNames.length; i++) {
    const expr = findExpressionForVariable(placeholderNames[i]!, values);
    if (!expr) return null;
    children.push(ts.factory.createJsxExpression(undefined, expr));
    pushText(literalParts[i + 1] ?? '');
  }

  return ts.factory.createJsxFragment(
    ts.factory.createJsxOpeningFragment(),
    children,
    ts.factory.createJsxJsxClosingFragment(),
  );
}
