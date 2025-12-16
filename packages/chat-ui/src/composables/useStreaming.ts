/**
 * @fileoverview 流式渲染 Hook
 * 处理流式内容的渲染和状态管理
 * 参考 ant-design/x 的令牌缓存机制优化
 */

import { ref, watch, computed, type Ref } from 'vue';
import type { StreamStatus, StreamingConfig } from '../core/types';

/**
 * 流式令牌类型
 */
export enum StreamTokenType {
  Text = 'text',
  Link = 'link',
  Image = 'image',
  Emphasis = 'emphasis',
  Code = 'code',
  CodeBlock = 'codeBlock',
  Table = 'table',
}

/**
 * 流式缓存状态
 */
interface StreamCache {
  /** 待处理的不完整内容 */
  pending: string;
  /** 当前令牌类型 */
  token: StreamTokenType;
  /** 已处理的长度 */
  processedLength: number;
  /** 已完成的 Markdown */
  completeMarkdown: string;
}

/**
 * 不完整令牌检测正则表达式
 * 参考 ant-design/x 的实现
 * 优化：使用预编译正则，避免重复创建
 */
const INCOMPLETE_PATTERNS = {
  // 图片: ![alt](url 或 ![alt]
  image: [/^!\[[^\]\r\n]{0,1000}$/, /^!\[[^\r\n]{0,1000}\]\([^)\r\n]{0,1000}$/],
  // 链接: [text](url 或 [text]
  link: [/^\[[^\]\r\n]{0,1000}$/, /^\[[^\r\n]{0,1000}\]\([^)\r\n]{0,1000}$/],
  // 强调: *text 或 **text 或 _text 或 __text
  emphasis: [/^(\*{1,3}|_{1,3})(?!\s)(?!.*\1$)[^\r\n]{0,1000}$/],
  // 行内代码: `code
  code: [/^`(?!`)[^`\r\n]{0,1000}$/],
  // 代码块: ```lang\ncode
  codeBlock: [/^```\w*\n[\s\S]*$/],
} as const;

// 预编译的快速检测字符集
const TOKEN_START_CHARS = new Set(['!', '[', '*', '_', '`', '|']);

/**
 * 检测令牌是否开始（优化：使用字符检测代替正则）
 */
function isTokenStart(pending: string, type: StreamTokenType): boolean {
  if (!pending) return false;
  const firstChar = pending[0];
  const secondChar = pending[1];

  switch (type) {
    case StreamTokenType.Image:
      return firstChar === '!' && secondChar === '[';
    case StreamTokenType.Link:
      // Link 以 '[' 开头，但不是 Image（Image 以 '![' 开头，由上面的 case 处理）
      return firstChar === '[';
    case StreamTokenType.Emphasis:
      return firstChar === '*' || firstChar === '_';
    case StreamTokenType.Code:
      return firstChar === '`' && secondChar !== '`' && pending[2] !== '`';
    case StreamTokenType.CodeBlock:
      return pending.startsWith('```');
    case StreamTokenType.Table:
      return firstChar === '|';
    default:
      return false;
  }
}

/**
 * 快速检测是否可能是令牌开始
 */
function maybeTokenStart(char: string): boolean {
  return TOKEN_START_CHARS.has(char);
}

/**
 * 检测令牌是否仍在流式中（不完整）
 */
function isTokenIncomplete(pending: string, type: StreamTokenType): boolean {
  const patterns =
    INCOMPLETE_PATTERNS[type as keyof typeof INCOMPLETE_PATTERNS];
  if (!patterns) return false;
  return patterns.some((pattern) => pattern.test(pending));
}

/**
 * 检测表格是否不完整
 */
function isTableIncomplete(content: string): boolean {
  const lines = content.split('\n');
  if (lines.length < 2) return true;

  // 检查是否有分隔行 (|---|---|)
  const hasSeparator = lines.some((line) => /^\|[\s-:|]+\|$/.test(line.trim()));
  if (!hasSeparator) return true;

  // 检查最后一行是否完整
  const lastLine = lines[lines.length - 1]?.trim() ?? '';
  if (lastLine && !lastLine.endsWith('|')) return true;

  return false;
}

/**
 * 创建初始缓存状态
 */
function createInitialCache(): StreamCache {
  return {
    pending: '',
    token: StreamTokenType.Text,
    processedLength: 0,
    completeMarkdown: '',
  };
}

/**
 * 安全的 URI 编码（处理 Unicode 代理对）
 * @description 独立导出的工具函数，处理 Unicode 代理对问题
 */
export function safeEncodeURIComponent(input: string): string {
  let result = '';
  for (let i = 0; i < input.length; i++) {
    const charCode = input.charCodeAt(i);
    const currentChar = input[i];
    const nextChar = input[i + 1];

    // 处理 Unicode 代理对
    if (charCode >= 0xd800 && charCode <= 0xdbff) {
      // 高代理
      if (i + 1 < input.length && nextChar !== undefined) {
        const nextCharCode = input.charCodeAt(i + 1);
        if (nextCharCode >= 0xdc00 && nextCharCode <= 0xdfff) {
          // 完整的代理对
          result += currentChar + nextChar;
          i++; // 跳过低代理
          continue;
        }
      }
      // 孤立的高代理，跳过
      continue;
    } else if (charCode >= 0xdc00 && charCode <= 0xdfff) {
      // 孤立的低代理，跳过
      continue;
    }

    if (currentChar !== undefined) {
      result += currentChar;
    }
  }

  try {
    return encodeURIComponent(result);
  } catch {
    return result;
  }
}

/**
 * 处理流式内容
 */
function processStreamContent(
  content: string,
  cache: StreamCache,
  isStreaming: boolean,
): { processed: string; newCache: StreamCache } {
  if (!isStreaming) {
    // 流式完成，返回原始内容
    return {
      processed: content,
      newCache: createInitialCache(),
    };
  }

  // 计算新增内容
  const newContent = content.slice(cache.processedLength);
  if (!newContent) {
    return {
      processed: cache.completeMarkdown + cache.pending,
      newCache: cache,
    };
  }

  let pending = cache.pending + newContent;
  let token = cache.token;
  let completeMarkdown = cache.completeMarkdown;

  // 处理不同类型的令牌
  const tokenTypes = [
    StreamTokenType.Image,
    StreamTokenType.Link,
    StreamTokenType.CodeBlock,
    StreamTokenType.Code,
    StreamTokenType.Emphasis,
    StreamTokenType.Table,
  ];

  // 检测是否开始了新令牌
  if (token === StreamTokenType.Text) {
    for (const type of tokenTypes) {
      if (isTokenStart(pending, type)) {
        token = type;
        break;
      }
    }
  }

  // 检测令牌是否完成
  if (token !== StreamTokenType.Text) {
    const isIncomplete =
      token === StreamTokenType.Table
        ? isTableIncomplete(pending)
        : isTokenIncomplete(pending, token);

    if (!isIncomplete) {
      // 令牌完成，添加到已完成内容
      completeMarkdown += pending;
      pending = '';
      token = StreamTokenType.Text;
    }
  } else {
    // 普通文本，直接添加到已完成内容
    // 但保留最后可能是令牌开始的部分
    // 优化：从后向前查找，避免多次 lastIndexOf
    let lastSpecialIndex = -1;
    for (let i = pending.length - 1; i >= 0; i--) {
      const char = pending[i];
      if (char && maybeTokenStart(char)) {
        // 特殊处理 '![' 的情况
        if (char === '[' && i > 0 && pending[i - 1] === '!') {
          lastSpecialIndex = i - 1;
        } else {
          lastSpecialIndex = i;
        }
        break;
      }
    }

    if (lastSpecialIndex >= 0) {
      // 有特殊字符（包括在第一个位置的情况）
      if (lastSpecialIndex > 0) {
        completeMarkdown += pending.slice(0, lastSpecialIndex);
      }
      pending = pending.slice(lastSpecialIndex);

      // 重新检测令牌类型
      for (const type of tokenTypes) {
        if (isTokenStart(pending, type)) {
          token = type;
          break;
        }
      }
    } else {
      // lastSpecialIndex === -1，没有特殊字符，全部完成
      completeMarkdown += pending;
      pending = '';
    }
  }

  const newCache: StreamCache = {
    pending,
    token,
    processedLength: content.length,
    completeMarkdown,
  };

  // 处理不完整的内容显示
  let processedPending = pending;
  if (pending && token !== StreamTokenType.Text) {
    // 对于不完整的令牌，进行特殊处理
    switch (token) {
      case StreamTokenType.Image:
        // 单独的 "!" 不显示
        if (pending === '!' || pending === '![') {
          processedPending = '';
        }
        break;
      case StreamTokenType.Link:
        // 单独的 "[" 不显示
        if (pending === '[') {
          processedPending = '';
        }
        break;
      case StreamTokenType.CodeBlock:
        // 未闭合的代码块，添加闭合标记
        if (!pending.endsWith('```')) {
          processedPending = pending + '\n```';
        }
        break;
      case StreamTokenType.Code:
        // 未闭合的行内代码，添加闭合标记
        processedPending = pending + '`';
        break;
      case StreamTokenType.Emphasis:
        // 未闭合的强调，移除标记
        processedPending = pending.replace(/^[*_]+/, '');
        break;
    }
  }

  return {
    processed: completeMarkdown + processedPending,
    newCache,
  };
}

/**
 * 流式渲染 Hook
 *
 * @param content 源内容
 * @param options 配置选项
 */
export function useStreaming(
  content: Ref<string>,
  options?: {
    /** 流式配置 */
    config?: StreamingConfig;
    /** 状态变化回调 */
    onStatusChange?: (status: StreamStatus) => void;
  },
) {
  const config = computed(() => options?.config);

  /** 流式状态 */
  const status = ref<StreamStatus>('idle');

  /** 是否正在流式输出 */
  const isStreaming = computed(() => status.value === 'streaming');

  /** 处理后的内容（用于处理不完整的 Markdown） */
  const processedContent = ref('');

  /** 流式缓存 */
  let cache = createInitialCache();

  // 监听内容变化
  watch(
    content,
    (newVal) => {
      const hasNextChunk = config.value?.hasNextChunk ?? false;

      if (hasNextChunk) {
        // 流式中
        status.value = 'streaming';
        // 使用令牌缓存处理
        const result = processStreamContent(newVal, cache, true);
        processedContent.value = result.processed;
        cache = result.newCache;
      } else {
        // 流式完成
        status.value = newVal ? 'complete' : 'idle';
        processedContent.value = newVal;
        // 重置缓存
        cache = createInitialCache();
      }

      options?.onStatusChange?.(status.value);
    },
    { immediate: true },
  );

  // 监听配置变化
  watch(
    () => config.value?.hasNextChunk,
    (hasNext) => {
      if (hasNext === false && status.value === 'streaming') {
        status.value = 'complete';
        processedContent.value = content.value;
        cache = createInitialCache();
        options?.onStatusChange?.(status.value);
      }
    },
  );

  /**
   * 重置流式状态
   */
  function reset() {
    status.value = 'idle';
    processedContent.value = '';
    cache = createInitialCache();
  }

  return {
    /** 处理后的内容 */
    processedContent,
    /** 流式状态 */
    status,
    /** 是否正在流式输出 */
    isStreaming,
    /** 重置状态 */
    reset,
  };
}
