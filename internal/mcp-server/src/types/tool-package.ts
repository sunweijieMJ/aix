// src/types/tool-package.ts
import type { ComponentExample } from './index';

/**
 * API 文档段落
 */
export interface ApiSection {
  /** 段落标题，如 "createTrackerPlugin" 或 "CLI 命令" */
  title: string;
  /** 原始 markdown 内容 */
  content: string;
}

/**
 * 工具包信息
 */
export interface ToolPackageInfo {
  /** 显示名，如 "Tracker" */
  name: string;
  /** 包名，如 "@kit/tracker" */
  packageName: string;
  /** 版本号 */
  version: string;
  /** 一句话描述 */
  description: string;
  /** 分类：工具包 | 基础设施 | 开发工具 */
  category: string;
  /** 标签 */
  tags: string[];
  /** 作者 */
  author: string;
  /** 许可证 */
  license: string;
  /** 来源：kit | internal */
  scope: 'kit' | 'internal';

  /** 源码路径（相对 workspace 根，如 kit/tracker） */
  sourcePath: string;
  /** README 路径（相对 workspace 根） */
  readmePath?: string;

  /** README 正文快照，落盘时剥离到 docs-index.json（见 ComponentInfo.readmeContent） */
  readmeContent?: string;
  /** CHANGELOG 正文快照，去向同 readmeContent */
  changelogContent?: string;

  /** 依赖列表 */
  dependencies: string[];
  /** 对等依赖 */
  peerDependencies: string[];

  /** 特性列表 */
  features: string[];
  /** 代码示例 */
  examples: ComponentExample[];
  /** API 文档段落（粗粒度，保留 markdown 原文） */
  apiSections: ApiSection[];
}

/**
 * 工具包索引
 */
export interface ToolPackageIndex {
  /** 工具包列表 */
  packages: ToolPackageInfo[];
  /** 分类 */
  categories: string[];
  /** 标签 */
  tags: string[];
  /** 最后更新时间 */
  lastUpdated: string;
  /** 版本 */
  version: string;
}
