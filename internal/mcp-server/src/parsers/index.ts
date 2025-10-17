import { readFile } from 'node:fs/promises';
import matter from 'gray-matter';
import type { ComponentExample } from '../types/index';
import { log } from '../utils/logger';

/**
 * Markdown 解析器
 */
export class MarkdownParser {
  /**
   * 解析 README 文件
   */
  async parseReadme(filePath: string): Promise<{
    title: string;
    description: string;
    content: string;
    metadata: Record<string, unknown>;
  } | null> {
    try {
      const content = await readFile(filePath, 'utf8');
      const { data, content: markdownContent } = matter(content);

      // 提取标题（第一个 # 标题）
      const titleMatch = markdownContent.match(/^#\s+(.+)$/m);
      const title = titleMatch?.[1]?.trim() ?? '';

      // 提取描述（标题后的第一段文字）
      const descMatch = markdownContent.match(/^#\s+.+\n\n(.+?)(\n\n|$)/s);
      const description = descMatch?.[1]?.trim() ?? '';

      return {
        title,
        description,
        content: markdownContent,
        metadata: data,
      };
    } catch (error) {
      log.warn(`Failed to parse README from ${filePath}:`, error);
      return null;
    }
  }

  /**
   * 从 Markdown 中提取代码示例
   */
  extractCodeExamples(content: string): ComponentExample[] {
    const examples: ComponentExample[] = [];
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)\n```/g;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const language = match[1] || 'text';
      const code = match[2]?.trim() ?? '';

      // 只处理 TypeScript/JavaScript 代码
      if (
        ['tsx', 'jsx', 'ts', 'js', 'typescript', 'javascript'].includes(
          language.toLowerCase(),
        )
      ) {
        // 尝试找到代码块前的描述
        const beforeCode = content.substring(0, match.index);
        const lines = beforeCode.split('\n');
        const descriptionLine =
          lines[lines.length - 1]?.trim() ||
          lines[lines.length - 2]?.trim() ||
          '';

        examples.push({
          title: `示例 ${examples.length + 1}`,
          description: descriptionLine.replace(/^#+\s*/, ''), // 移除 markdown 标题符号
          code,
          language: this.normalizeLanguage(language),
        });
      }
    }

    return examples;
  }

  /**
   * 标准化语言标识
   */
  private normalizeLanguage(lang: string): 'tsx' | 'jsx' | 'ts' | 'js' {
    const normalized = lang.toLowerCase();
    switch (normalized) {
      case 'tsx':
      case 'typescript':
        return 'tsx';
      case 'jsx':
        return 'jsx';
      case 'ts':
        return 'ts';
      case 'js':
      case 'javascript':
      default:
        return 'js';
    }
  }
}

/**
 * Stories 解析器
 */
export class StoriesParser {
  /**
   * 解析 Storybook stories 文件
   */
  async parseStories(filePath: string): Promise<ComponentExample[]> {
    try {
      const content = await readFile(filePath, 'utf8');
      return this.extractStoriesExamples(content);
    } catch (error) {
      log.warn(`Failed to parse stories from ${filePath}:`, error);
      return [];
    }
  }

  /**
   * 从 Stories 文件中提取示例（使用正则表达式解析）
   */
  private extractStoriesExamples(content: string): ComponentExample[] {
    return this.extractStoriesExamplesWithRegex(content);
  }

  /**
   * 使用正则表达式提取Stories示例
   */
  private extractStoriesExamplesWithRegex(content: string): ComponentExample[] {
    const examples: ComponentExample[] = [];
    const storyRegex =
      /export\s+const\s+(\w+)\s*=\s*([\s\S]*?)(?=\nexport\s+const|\n\n|$)/g;
    let match;

    while ((match = storyRegex.exec(content)) !== null) {
      const storyName = match[1];
      const storyCode = match[2]?.trim() ?? '';

      if (
        !storyName ||
        storyName === 'default' ||
        storyName.toLowerCase().includes('meta')
      ) {
        continue;
      }

      examples.push({
        title: this.formatStoryName(storyName),
        description: `${storyName} 示例`,
        code: this.cleanStoryCode(storyCode),
        language: 'tsx',
      });
    }

    return examples;
  }

  /**
   * 格式化 Story 名称
   */
  private formatStoryName(storyName: string): string {
    // 将 PascalCase 转换为可读文本
    return storyName
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .replace(/^\w/, (c) => c.toUpperCase());
  }

  /**
   * 清理 Story 代码
   */
  private cleanStoryCode(code: string): string {
    // 如果是对象形式的 story，提取 render 函数
    if (code.includes('render:')) {
      const renderMatch = code.match(/render:\s*([\s\S]*?)(?=,\s*\w+:|$)/);
      if (renderMatch?.[1]) {
        return renderMatch[1].trim().replace(/^[({]/, '').replace(/[)}]$/, '');
      }
    }

    // 如果是函数形式，返回函数体
    if (code.startsWith('(') || code.startsWith('function')) {
      return code;
    }

    // 其他情况直接返回
    return code;
  }
}

/**
 * JSDoc 解析器
 */
export class JSDocParser {
  /**
   * 从注释中提取 JSDoc 信息
   */
  parseJSDoc(comment: string): {
    description: string;
    params: Array<{ name: string; type: string; description: string }>;
    returns?: { type: string; description: string };
    examples: string[];
    tags: string[];
  } {
    // 更精确地清理JSDoc注释
    const cleaned = comment
      .replace(/^\/\*\*/, '') // 移除开头的 /**
      .replace(/\*\/$/, '') // 移除结尾的 */
      .replace(/^\s*\*/gm, '') // 移除每行开头的 *
      .trim();

    const lines = cleaned
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    let description = '';
    const params: Array<{ name: string; type: string; description: string }> =
      [];
    let returns: { type: string; description: string } | undefined;
    const examples: string[] = [];
    const tags: string[] = [];

    let currentSection = 'description';
    let currentExample = '';

    for (const line of lines) {
      if (line.startsWith('@param')) {
        currentSection = 'param';
        const paramMatch = line.match(
          /@param\s+(?:\{([^}]+)\})?\s+(\w+)\s*(.*)$/,
        );
        if (paramMatch?.[2]) {
          params.push({
            name: paramMatch[2],
            type: paramMatch[1] || 'unknown',
            description: paramMatch[3] || '',
          });
        }
      } else if (line.startsWith('@returns') || line.startsWith('@return')) {
        currentSection = 'returns';
        const returnMatch = line.match(/@returns?\s+(?:\{([^}]+)\})?\s*(.*)$/);
        if (returnMatch) {
          returns = {
            type: returnMatch[1] || 'unknown',
            description: returnMatch[2] || '',
          };
        }
      } else if (line.startsWith('@example')) {
        currentSection = 'example';
        currentExample = '';
      } else if (line.startsWith('@')) {
        // 其他标签（如@default, @since等）
        const tagMatch = line.match(/@(\w+)(?:\s+(.*))?/);
        if (tagMatch?.[1]) {
          tags.push(tagMatch[1]);
          // 对于@default标签，不要将其值添加到描述中
          if (tagMatch[1] === 'default' && tagMatch[2]) {
            // 忽略@default的值，不添加到描述中
          }
        }
        currentSection = 'other';
      } else {
        // 内容行
        switch (currentSection) {
          case 'description':
            description += (description ? ' ' : '') + line;
            break;
          case 'example':
            currentExample += (currentExample ? '\n' : '') + line;
            break;
          // 忽略'other' section的内容
        }
      }
    }

    if (currentExample) {
      examples.push(currentExample.trim());
    }

    return {
      description,
      params,
      returns,
      examples,
      tags,
    };
  }
}

/**
 * 创建解析器实例
 */
export function createParsers() {
  return {
    markdown: new MarkdownParser(),
    stories: new StoriesParser(),
    jsdoc: new JSDocParser(),
  };
}
