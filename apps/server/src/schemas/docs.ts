/**
 * 文档分类 Schema 定义
 */
import { z } from 'zod';

// 文档分类
export const CategorySchema = z.object({
  id: z.string().openapi({ example: 'a1b2c3d4' }),
  name: z.string().openapi({ example: '项目A文档' }),
  fileCount: z.number().openapi({ example: 12 }),
  createdAt: z.string().openapi({ example: '2026-04-07T10:00:00.000Z' }),
  updatedAt: z.string().openapi({ example: '2026-04-07T10:00:00.000Z' }),
});

export type Category = z.infer<typeof CategorySchema>;

// 文件树节点（TypeScript 类型，用于内部实现）
export type FileTreeNode =
  | { type: 'file'; name: string; path: string }
  | { type: 'directory'; name: string; children: FileTreeNode[] };

// OpenAPI schema 中用 unknown 替代（z.lazy 不兼容 openapi 生成器）
export const FileTreeNodeSchema = z.unknown().openapi({
  description: '文件树节点（file 或 directory）',
  example: {
    type: 'directory',
    name: 'src',
    children: [{ type: 'file', name: 'README.md', path: 'src/README.md' }],
  },
});

// 请求 Schema
export const CreateCategoryBodySchema = z.object({
  name: z.string().min(1).openapi({ example: '项目A文档' }),
});

export const UpdateCategoryBodySchema = z.object({
  name: z.string().min(1).openapi({ example: '项目A文档（更新）' }),
});

export const CategoryParamSchema = z.object({
  id: z.string().openapi({ example: 'a1b2c3d4' }),
});
