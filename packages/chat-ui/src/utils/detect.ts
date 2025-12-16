/**
 * @fileoverview 内容类型检测工具
 */

import type { ContentType } from '../core/types';

/**
 * 检测内容类型
 */
export function detectContentType(content: string): ContentType {
  if (!content || content.trim() === '') {
    return 'text';
  }

  // LaTeX 检测（优先级高）
  if (isLatex(content)) {
    return 'latex';
  }

  // JSON 图表检测
  if (isChartJson(content)) {
    return 'chart';
  }

  // Mermaid 检测
  if (isMermaid(content)) {
    return 'mermaid';
  }

  // 代码块检测
  if (isCodeBlock(content)) {
    return 'code';
  }

  // HTML 检测
  if (isHtml(content)) {
    return 'html';
  }

  // Markdown 检测
  if (isMarkdown(content)) {
    return 'markdown';
  }

  // 默认为文本
  return 'text';
}

/**
 * 检测是否为 LaTeX
 */
export function isLatex(content: string): boolean {
  // 块级 LaTeX: $$...$$
  if (/^\s*\$\$[\s\S]+\$\$\s*$/.test(content)) {
    return true;
  }
  // 行内 LaTeX 为主内容
  if (/^\s*\$[^$]+\$\s*$/.test(content)) {
    return true;
  }
  // \[...\] 或 \(...\)
  if (
    /^\s*\\\[[\s\S]+\\\]\s*$/.test(content) ||
    /^\s*\\\([\s\S]+\\\)\s*$/.test(content)
  ) {
    return true;
  }
  return false;
}

/**
 * 检测是否为图表 JSON
 */
export function isChartJson(content: string): boolean {
  try {
    const data = JSON.parse(content.trim());
    // 检查是否有图表特征
    return (
      data.__type === 'chart' ||
      data.chartType !== undefined ||
      (data.series !== undefined && Array.isArray(data.series)) ||
      (data.xAxis !== undefined && data.yAxis !== undefined)
    );
  } catch {
    return false;
  }
}

/**
 * 检测是否为 Mermaid
 */
export function isMermaid(content: string): boolean {
  const trimmed = content.trim();
  // graph, flowchart, sequenceDiagram, classDiagram, mindmap, timeline, etc.
  return /^(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|xychart-beta|sankey-beta|block-beta)\s/i.test(
    trimmed,
  );
}

/**
 * 检测是否为代码块
 */
export function isCodeBlock(content: string): boolean {
  const trimmed = content.trim();
  // 完整的代码块
  return /^```[\s\S]*```$/.test(trimmed);
}

/**
 * 检测是否为 HTML
 */
export function isHtml(content: string): boolean {
  const trimmed = content.trim();
  // 以 HTML 标签开头
  return /^<(!DOCTYPE|html|head|body|div|span|p|table|ul|ol)/i.test(trimmed);
}

/**
 * 检测是否为 Markdown
 */
export function isMarkdown(content: string): boolean {
  // 检测 Markdown 特征
  const markdownPatterns = [
    /^#{1,6}\s/m, // 标题
    /^\*\s|-\s|\+\s/m, // 无序列表
    /^\d+\.\s/m, // 有序列表
    /\[.+\]\(.+\)/, // 链接
    /!\[.*\]\(.+\)/, // 图片
    /```/, // 代码块
    /\*\*.+\*\*/, // 粗体
    /\*.+\*/, // 斜体
    /^>/m, // 引用
    /\|.+\|/, // 表格
  ];

  return markdownPatterns.some((pattern) => pattern.test(content));
}
