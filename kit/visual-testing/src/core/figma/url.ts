/**
 * Figma 引用解析
 *
 * 支持的输入形态：
 * - 完整 URL：https://www.figma.com/design/<fileKey>/<name>?node-id=12-34
 *              https://www.figma.com/file/<fileKey>/<name>?node-id=12%3A34
 * - 短格式：<fileKey>:<nodeId>（nodeId 本身含冒号，只按第一个冒号切分）
 * - 纯 nodeId：12:34 或 12-34（需要外部提供 fileKey）
 */

export interface FigmaRef {
  fileKey?: string;
  nodeId: string;
}

const FIGMA_HOST = /(^|\.)figma\.com$/i;

/**
 * 将 URL 形式的节点 ID（12-34）归一化为 API 形式（12:34）
 */
export function normalizeNodeId(nodeId: string): string {
  const decoded = decodeURIComponent(nodeId.trim());
  // URL 中用 "-" 代替 ":"；API 与设计稿内部都用 ":"
  return decoded.includes(':') ? decoded : decoded.replace(/-/g, ':');
}

/**
 * 是否为纯节点 ID（不含 fileKey）：12:34、12-34、I12:34;56:78
 */
export function isBareNodeId(value: string): boolean {
  return /^I?\d+[:-]\d+(;\d+[:-]\d+)*$/.test(value.trim());
}

/**
 * 解析 Figma 引用。解析失败时抛出带示例的错误。
 */
export function parseFigmaRef(input: string, defaultFileKey?: string): Required<FigmaRef> {
  const value = input.trim();
  if (!value) {
    throw new Error('Figma reference is empty');
  }

  let ref: FigmaRef;

  if (/^https?:\/\//i.test(value)) {
    ref = parseFigmaUrl(value);
  } else if (isBareNodeId(value)) {
    // 纯 nodeId：12:34 / 12-34 / 实例内节点 I12:34;56:78
    ref = { nodeId: normalizeNodeId(value) };
  } else if (value.includes(':')) {
    // 短格式 "<fileKey>:<nodeId>"：fileKey 不含冒号，只按第一个冒号切分
    const idx = value.indexOf(':');
    const fileKey = value.slice(0, idx);
    const nodeId = value.slice(idx + 1);
    if (!/^[A-Za-z0-9_-]+$/.test(fileKey) || !isBareNodeId(nodeId)) {
      throw new Error(
        `Cannot parse Figma reference "${input}". ` +
          'Expected a Figma URL with node-id, "<fileKey>:<nodeId>", or "<nodeId>".',
      );
    }
    ref = { fileKey, nodeId: normalizeNodeId(nodeId) };
  } else {
    throw new Error(
      `Cannot parse Figma reference "${input}". ` +
        'Expected a Figma URL with node-id, "<fileKey>:<nodeId>", or "<nodeId>".',
    );
  }

  const fileKey = ref.fileKey ?? defaultFileKey;
  if (!fileKey) {
    throw new Error(
      `Figma fileKey is missing for node "${ref.nodeId}". ` +
        'Pass a full Figma URL, use "<fileKey>:<nodeId>", or set baseline.figma.fileKey.',
    );
  }

  return { fileKey, nodeId: ref.nodeId };
}

function parseFigmaUrl(value: string): FigmaRef {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid Figma URL: ${value}`);
  }

  if (!FIGMA_HOST.test(url.hostname)) {
    throw new Error(`Not a figma.com URL: ${value}`);
  }

  // /design/<key>/..., /file/<key>/..., /proto/<key>/..., /board/<key>/...
  const segments = url.pathname.split('/').filter(Boolean);
  const kindIndex = segments.findIndex((s) => ['design', 'file', 'proto', 'board'].includes(s));
  const fileKey = kindIndex >= 0 ? segments[kindIndex + 1] : undefined;
  if (!fileKey) {
    throw new Error(`Cannot find fileKey in Figma URL: ${value}`);
  }

  const nodeParam = url.searchParams.get('node-id');
  if (!nodeParam) {
    throw new Error(
      `Figma URL has no node-id parameter: ${value}. ` +
        'Select the target frame in Figma and copy the link to it.',
    );
  }

  return { fileKey, nodeId: normalizeNodeId(nodeParam) };
}
