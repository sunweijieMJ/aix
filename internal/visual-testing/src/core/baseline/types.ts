/**
 * 基准图提供器接口与类型定义
 */

/**
 * 基准图来源类型
 */
export type BaselineSourceType = 'figma-mcp' | 'local';

/**
 * 结构化基准图来源
 */
export interface BaselineSource {
  type: BaselineSourceType;
  /** 来源标识 (节点 ID / 文件路径 / URL) */
  source: string;
  /** Figma 文件 Key (figma 类型必需) */
  fileKey?: string;
}

/**
 * 基准图元数据
 */
export interface BaselineMetadata {
  dimensions?: { width: number; height: number };
  hash?: string;
  fetchedAt?: string;
  figmaInfo?: {
    fileKey: string;
    nodeId: string;
    nodeName?: string;
    lastModified?: string;
    version?: string;
  };
}

/**
 * 基准图获取结果
 */
export interface BaselineResult {
  /** 基准图本地路径 */
  path: string;
  /** 是否成功 */
  success: boolean;
  /** 元数据 */
  metadata?: BaselineMetadata;
  /** 错误信息 */
  error?: Error;
}

/**
 * 基准图获取选项
 */
export interface FetchBaselineOptions {
  /** 基准图来源（字符串或结构化来源） */
  source: string | BaselineSource;
  /** 输出路径 */
  outputPath: string;
  /** 缩放比例 (默认 2) */
  scale?: number;
  /** 超时时间 (ms) */
  timeout?: number;
}

/**
 * 基准图提供器接口
 *
 * 每种来源类型有对应的提供器实现。
 */
export interface BaselineProvider {
  readonly name: string;

  /**
   * 获取单张基准图
   */
  fetch(options: FetchBaselineOptions): Promise<BaselineResult>;

  /**
   * 检查基准图是否存在/可达
   */
  exists?(source: string | BaselineSource): Promise<boolean>;

  /**
   * 销毁/清理资源
   */
  dispose?(): Promise<void>;
}
