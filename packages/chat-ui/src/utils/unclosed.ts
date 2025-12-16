/**
 * @fileoverview 未闭合标签检测工具
 * 参考 x-markdown 的栈式检测算法
 */

/**
 * 自闭合标签列表
 */
const SELF_CLOSING_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/**
 * 检测 HTML 字符串中未闭合的标签
 *
 * @param html HTML 字符串
 * @returns 未闭合标签名称集合
 *
 * @example
 * ```ts
 * detectUnclosedTags('<div><p>text</div>'); // Set(['p'])
 * detectUnclosedTags('<div><span>'); // Set(['div', 'span'])
 * detectUnclosedTags('<div></div>'); // Set([])
 * ```
 */
export function detectUnclosedTags(html: string): Set<string> {
  const stack: string[] = [];
  // 匹配 HTML 标签：开始、结束、自闭合
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*)?>/g;

  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(html)) !== null) {
    const [fullMatch, tagName] = match;
    if (!tagName) continue;

    const lowerTagName = tagName.toLowerCase();
    const isClosing = fullMatch.startsWith('</');
    const isSelfClosing =
      fullMatch.endsWith('/>') || SELF_CLOSING_TAGS.has(lowerTagName);

    if (isClosing) {
      // 闭合标签：从栈中移除匹配的开始标签
      const lastIndex = stack.lastIndexOf(lowerTagName);
      if (lastIndex !== -1) {
        stack.splice(lastIndex, 1);
      }
    } else if (!isSelfClosing) {
      // 开始标签（非自闭合）：添加到栈
      stack.push(lowerTagName);
    }
  }

  return new Set(stack);
}

/**
 * 检查特定标签是否在未闭合标签集合中
 *
 * @param unclosedTags 未闭合标签集合
 * @param tagName 标签名
 * @returns 是否未闭合
 */
export function isTagUnclosed(
  unclosedTags: Set<string>,
  tagName: string,
): boolean {
  return unclosedTags.has(tagName.toLowerCase());
}

/**
 * 获取流式状态
 *
 * @param unclosedTags 未闭合标签集合
 * @param tagName 当前标签名
 * @returns 'loading' | 'done'
 */
export function getStreamStatus(
  unclosedTags: Set<string> | undefined,
  tagName: string,
): 'loading' | 'done' {
  if (!unclosedTags) return 'done';
  return unclosedTags.has(tagName.toLowerCase()) ? 'loading' : 'done';
}

/**
 * 检测代码块是否未闭合
 *
 * @param content 内容
 * @returns 是否未闭合
 */
export function isCodeBlockUnclosed(content: string): boolean {
  // 计算 ``` 或 ~~~ 的数量
  const fenceMatches = content.match(/^(`{3,}|~{3,})/gm);
  if (!fenceMatches) return false;

  // 奇数个栅栏意味着未闭合
  return fenceMatches.length % 2 === 1;
}

/**
 * 自动补全未闭合的代码块
 *
 * @param content 内容
 * @returns 补全后的内容
 */
export function autoCloseCodeBlock(content: string): string {
  if (!isCodeBlockUnclosed(content)) {
    return content;
  }

  // 找到最后一个开始栅栏
  const lines = content.split('\n');
  let fenceChar = '`';

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? '';
    const fence = line.match(/^(`{3,}|~{3,})/);
    if (fence) {
      fenceChar = fence[1]?.[0] ?? '`';
      break;
    }
  }

  return content + '\n' + fenceChar.repeat(3);
}
