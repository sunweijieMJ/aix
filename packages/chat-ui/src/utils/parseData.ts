/**
 * @fileoverview 渲染器数据解析工具
 * 提供统一的数据解析逻辑，减少渲染器组件中的重复代码
 */

/**
 * 解析 Markdown 数据
 * @internal 内部类型，不对外导出
 */
interface MarkdownParsedData {
  html: string;
  raw: string;
}

export function parseMarkdownData(data: MarkdownParsedData | string): {
  content: string;
  isPreParsed: boolean;
} {
  if (typeof data === 'string') {
    return { content: data, isPreParsed: false };
  }
  if (data && typeof data === 'object') {
    // 优先使用 html（如果非空），否则使用 raw
    if ('html' in data && data.html) {
      return { content: data.html, isPreParsed: true };
    }
    if ('raw' in data && data.raw) {
      return { content: data.raw, isPreParsed: false };
    }
  }
  return { content: String(data ?? ''), isPreParsed: false };
}

/**
 * 解析代码块数据
 * @internal 内部类型，不对外导出
 */
interface CodeParsedData {
  code: string;
  language?: string;
}

export function parseCodeData(data: CodeParsedData | string): CodeParsedData {
  if (typeof data === 'string') {
    // 检查是否是代码块格式 ```lang\ncode\n```
    const match = data.match(/^```(\w*)\n([\s\S]*?)```$/);
    if (match && match[2] !== undefined) {
      return { code: match[2], language: match[1] || 'text' };
    }
    return { code: data, language: 'text' };
  }
  return { code: data?.code ?? '', language: data?.language ?? 'text' };
}

/**
 * 解析 LaTeX 数据
 * @internal 内部类型，不对外导出
 */
interface LatexParsedData {
  expression: string;
  displayMode?: boolean;
}

export function parseLatexData(
  data: LatexParsedData | string,
): LatexParsedData {
  if (typeof data === 'string') {
    const isBlock = data.startsWith('$$') || data.startsWith('\\[');
    const expression = data
      .replace(/^\$\$|\$\$$/g, '')
      .replace(/^\$|\$$/g, '')
      .replace(/^\\\[|\\\]$/g, '')
      .replace(/^\\\(|\\\)$/g, '')
      .trim();
    return { expression, displayMode: isBlock };
  }
  return {
    expression: data?.expression || '',
    displayMode: data?.displayMode ?? false,
  };
}

/**
 * 图表数据验证结果
 */
export interface ChartValidationResult<T> {
  data: T;
  valid: boolean;
  error?: string;
}

/**
 * 验证图表数据是否有效
 */
export function isValidChartData(data: unknown): boolean {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const d = data as Record<string, unknown>;

  // 有效的图表数据应该包含以下之一：
  // 1. option 对象（ECharts 原生配置）
  // 2. data 对象（简化格式，包含 labels/datasets）
  // 3. series 数组（ECharts series 配置）
  // 4. xAxis 和 yAxis（ECharts 坐标轴配置）
  // 5. radar 配置（雷达图）
  return !!(
    d.option ||
    d.data ||
    d.series ||
    d.radar ||
    (d.xAxis && d.yAxis) ||
    d.chartType ||
    d.__type === 'chart'
  );
}

/**
 * 解析图表数据
 */
export function parseChartData<T>(data: T | string): T {
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (!trimmed) {
      return {} as T;
    }
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      // 解析失败时返回空对象
      return {} as T;
    }
  }
  return data || ({} as T);
}

/**
 * 解析并验证图表数据
 */
export function parseAndValidateChartData<T>(
  data: T | string,
): ChartValidationResult<T> {
  const parsed = parseChartData<T>(data);

  if (!isValidChartData(parsed)) {
    return {
      data: parsed,
      valid: false,
      error: '图表数据格式无效，需要包含 option、data、series 或坐标轴配置',
    };
  }

  return {
    data: parsed,
    valid: true,
  };
}

/**
 * 解析 Mermaid 数据
 * @internal 内部类型，不对外导出
 */
interface MermaidParsedData {
  code: string;
}

export function parseMermaidData(data: MermaidParsedData | string): string {
  if (typeof data === 'string') {
    return data;
  }
  return data?.code || '';
}
