/**
 * @fileoverview 内容解析器
 * 负责解析原始内容，提取内容块
 * 参考 x-markdown 的块提取逻辑
 */

import { generateId } from '../utils/id';
import { getRendererPrimaryType } from '../utils/renderer';
import { rendererRegistry } from './RendererRegistry';
import type { ContentBlock, ContentType } from './types';

/**
 * 块提取匹配项
 */
interface BlockMatch {
  type: ContentType;
  start: number;
  end: number;
  content: string;
  raw: string;
  lang?: string;
}

/**
 * 内容解析器
 */
export class ContentParser {
  private registry: typeof rendererRegistry;

  constructor(registry?: typeof rendererRegistry) {
    this.registry = registry ?? rendererRegistry;
  }

  /**
   * 自动检测并解析内容
   * 支持混合内容（如 Markdown 中嵌入代码块、LaTeX）
   */
  parse(content: string): ContentBlock | ContentBlock[] {
    if (!content || content.trim() === '') {
      return {
        id: generateId(),
        type: 'text',
        raw: content,
        data: content,
        status: 'complete',
      };
    }

    // 尝试提取特殊块
    const extractedBlocks = this.extractBlocks(content);

    if (extractedBlocks.length === 1 && extractedBlocks[0]) {
      return extractedBlocks[0];
    }

    return extractedBlocks;
  }

  /**
   * 强制按指定类型解析
   */
  parseAs<T = unknown>(content: string, type: ContentType): ContentBlock<T> {
    const renderer = this.registry.getByType(type);
    const data = renderer?.parser?.(content) ?? content;

    return {
      id: generateId(),
      type,
      raw: content,
      data: data as T,
      status: 'complete',
    };
  }

  /**
   * 使用指定渲染器解析
   */
  parseWith<T = unknown>(
    content: string,
    rendererName: string,
  ): ContentBlock<T> | undefined {
    const renderer = this.registry.get(rendererName);
    if (!renderer) return undefined;

    const data = renderer.parser?.(content) ?? content;
    const finalType = getRendererPrimaryType(renderer, 'text');

    return {
      id: generateId(),
      type: finalType,
      raw: content,
      data: data as T,
      status: 'complete',
    };
  }

  /**
   * 提取内容块
   * 识别代码块、LaTeX 块等特殊语法，并分割内容
   */
  private extractBlocks(content: string): ContentBlock[] {
    // 收集所有特殊块的匹配
    const matches: BlockMatch[] = [];

    // 1. 提取代码块 ```lang\n...\n```
    this.extractCodeBlocks(content, matches);

    // 2. 提取 LaTeX 块 $$...$$ 或 \[...\]
    this.extractLatexBlocks(content, matches);

    // 3. 提取 Mermaid 块（已在代码块中识别）

    // 如果没有特殊块，整体使用自动检测
    if (matches.length === 0) {
      return [this.createBlockFromContent(content)];
    }

    // 按位置排序
    matches.sort((a, b) => a.start - b.start);

    // 分割内容为多个块
    const blocks: ContentBlock[] = [];
    let lastEnd = 0;

    for (const match of matches) {
      // 添加前面的文本块
      if (match.start > lastEnd) {
        const textContent = content.slice(lastEnd, match.start);
        if (textContent.trim()) {
          blocks.push(this.createBlockFromContent(textContent));
        }
      }

      // 添加特殊块
      blocks.push(this.createSpecialBlock(match));
      lastEnd = match.end;
    }

    // 添加剩余的文本块
    if (lastEnd < content.length) {
      const textContent = content.slice(lastEnd);
      if (textContent.trim()) {
        blocks.push(this.createBlockFromContent(textContent));
      }
    }

    return blocks.length > 0 ? blocks : [this.createBlockFromContent(content)];
  }

  /**
   * 提取代码块
   * 使用状态机方式解析，避免正则表达式反向引用问题
   */
  private extractCodeBlocks(content: string, matches: BlockMatch[]): void {
    const lines = content.split('\n');
    let inCodeBlock = false;
    let fenceChar = '';
    let fenceLength = 0;
    let lang = '';
    let codeLines: string[] = [];
    let startIndex = 0;
    let currentIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const lineLength = line.length + 1; // +1 for newline

      if (!inCodeBlock) {
        // 检测代码块开始
        const fenceMatch = line.match(/^(`{3,}|~{3,})([a-zA-Z0-9_+-]*)$/);
        if (fenceMatch && fenceMatch[1]) {
          inCodeBlock = true;
          fenceChar = fenceMatch[1]?.[0] ?? '`';
          fenceLength = fenceMatch[1].length;
          lang = fenceMatch[2] ?? '';
          codeLines = [];
          startIndex = currentIndex;
        }
      } else {
        // 检测代码块结束
        const closingRegex = new RegExp(`^${fenceChar}{${fenceLength},}$`);
        if (closingRegex.test(line)) {
          // 代码块结束
          const code = codeLines.join('\n');
          const raw = content.slice(startIndex, currentIndex + lineLength);
          const type: ContentType =
            lang === 'mermaid'
              ? 'mermaid'
              : lang === 'mindmap'
                ? 'mindmap'
                : lang === 'chart' ||
                    lang === 'json:chart' ||
                    lang === 'echarts'
                  ? 'chart'
                  : 'code';

          matches.push({
            type,
            start: startIndex,
            end: currentIndex + lineLength,
            content: code,
            raw,
            lang: lang || undefined,
          });

          inCodeBlock = false;
          fenceChar = '';
          fenceLength = 0;
          lang = '';
          codeLines = [];
        } else {
          codeLines.push(line);
        }
      }

      currentIndex += lineLength;
    }

    // 处理未闭合的代码块（流式场景）
    if (inCodeBlock && codeLines.length > 0) {
      const code = codeLines.join('\n');
      const raw = content.slice(startIndex);
      const type: ContentType =
        lang === 'mermaid'
          ? 'mermaid'
          : lang === 'mindmap'
            ? 'mindmap'
            : lang === 'chart' || lang === 'json:chart' || lang === 'echarts'
              ? 'chart'
              : 'code';

      matches.push({
        type,
        start: startIndex,
        end: content.length,
        content: code,
        raw,
        lang: lang || undefined,
      });
    }
  }

  /**
   * 提取 LaTeX 块
   */
  private extractLatexBlocks(content: string, matches: BlockMatch[]): void {
    // 匹配 $$...$$ (块级)
    const blockLatexRegex = /\$\$([\s\S]+?)\$\$/g;
    let match: RegExpExecArray | null;

    while ((match = blockLatexRegex.exec(content)) !== null) {
      const [raw, latex] = match;
      // 检查是否在代码块内
      if (!this.isInsideCodeBlock(content, match.index)) {
        matches.push({
          type: 'latex',
          start: match.index,
          end: match.index + raw.length,
          content: latex ?? '',
          raw,
        });
      }
    }

    // 匹配 \[...\] (块级)
    const bracketLatexRegex = /\\\[([\s\S]+?)\\\]/g;
    while ((match = bracketLatexRegex.exec(content)) !== null) {
      const [raw, latex] = match;
      if (!this.isInsideCodeBlock(content, match.index)) {
        matches.push({
          type: 'latex',
          start: match.index,
          end: match.index + raw.length,
          content: latex ?? '',
          raw,
        });
      }
    }
  }

  /**
   * 检查位置是否在代码块内
   */
  private isInsideCodeBlock(content: string, position: number): boolean {
    const beforeContent = content.slice(0, position);
    let inFenced = false;
    let fenceChar = '';
    let fenceLen = 0;

    const lines = beforeContent.split('\n');
    for (const line of lines) {
      const fence = line.match(/^(`{3,}|~{3,})/);
      if (fence) {
        const char = fence[1]?.[0] ?? '';
        const len = fence[1]?.length ?? 0;

        if (!inFenced) {
          inFenced = true;
          fenceChar = char;
          fenceLen = len;
        } else if (char === fenceChar && len >= fenceLen) {
          inFenced = false;
        }
      }
    }

    return inFenced;
  }

  /**
   * 从内容创建块（自动检测类型）
   */
  private createBlockFromContent(content: string): ContentBlock {
    const renderer = this.registry.detect(content);
    const type = getRendererPrimaryType(renderer, 'markdown');
    const data = renderer?.parser?.(content) ?? content;

    return {
      id: generateId(),
      type,
      raw: content,
      data,
      status: 'complete',
    };
  }

  /**
   * 创建特殊块
   */
  private createSpecialBlock(match: BlockMatch): ContentBlock {
    const renderer = this.registry.getByType(match.type);
    let data: unknown = match.content;

    if (renderer?.parser) {
      data = renderer.parser(match.content);
    } else if (match.type === 'code') {
      // 代码块数据结构
      data = {
        code: match.content,
        language: match.lang,
      };
    } else if (match.type === 'chart') {
      // 尝试解析图表 JSON
      try {
        data = JSON.parse(match.content);
      } catch {
        data = match.content;
      }
    }

    return {
      id: generateId(),
      type: match.type,
      raw: match.raw,
      data,
      status: 'complete',
    };
  }
}
