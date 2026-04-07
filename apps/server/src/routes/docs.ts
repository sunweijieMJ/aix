/**
 * 文档分类路由
 */
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import AdmZip from 'adm-zip';
import { eq } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { db } from '../db/index';
import { categories } from '../db/schema';
import { ApiResponseSchema, ErrorResponseSchema } from '../schemas/common';
import {
  CategoryParamSchema,
  CategorySchema,
  CreateCategoryBodySchema,
  FileTreeNodeSchema,
  UpdateCategoryBodySchema,
  type FileTreeNode,
} from '../schemas/docs';
import { AppError } from '../utils/response';

const docs = new OpenAPIHono();

// 文档文件存储根目录
const UPLOADS_DIR = resolve(process.cwd(), 'storage/uploads/docs');

// ---- 工具函数 ----

async function ensureUploadsDir() {
  await mkdir(UPLOADS_DIR, { recursive: true });
}

// 递归生成文件树（目录在前，文件在后，各自字母排序）
async function buildFileTree(dirPath: string, basePath = ''): Promise<FileTreeNode[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  const files = entries.filter((e) => e.isFile()).sort((a, b) => a.name.localeCompare(b.name));

  const nodes: FileTreeNode[] = [];

  for (const dir of dirs) {
    const children = await buildFileTree(join(dirPath, dir.name), join(basePath, dir.name));
    nodes.push({ type: 'directory', name: dir.name, children });
  }

  for (const file of files) {
    nodes.push({
      type: 'file',
      name: file.name,
      path: join(basePath, file.name).replace(/\\/g, '/'),
    });
  }

  return nodes;
}

// 递归统计文件数量
async function countFiles(dirPath: string): Promise<number> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += await countFiles(join(dirPath, entry.name));
    } else {
      count++;
    }
  }
  return count;
}

// 根据扩展名返回 Content-Type
function getContentType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    '.md': 'text/markdown; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.json': 'application/json',
  };
  return types[ext] ?? 'application/octet-stream';
}

// 防止路径穿越攻击
function safeResolvePath(base: string, filePath: string): string {
  const resolved = normalize(join(base, filePath));
  if (!resolved.startsWith(resolve(base))) {
    throw new AppError(400, '非法文件路径');
  }
  return resolved;
}

// ---- 路由定义 ----

// POST /categories — 上传 ZIP 创建分类
const createCategoryRoute = createRoute({
  method: 'post',
  path: '/categories',
  tags: ['文档分类'],
  summary: '上传 ZIP 创建分类',
  description: '上传包含 Markdown 文档的 ZIP 文件，创建一个新的文档分类',
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            name: CreateCategoryBodySchema.shape.name,
            file: z.any().openapi({ type: 'string', format: 'binary', description: 'ZIP 文件' }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: '创建成功',
      content: { 'application/json': { schema: ApiResponseSchema(CategorySchema) } },
    },
    400: {
      description: '请求错误',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

docs.openapi(createCategoryRoute, async (c) => {
  await ensureUploadsDir();

  const formData = await c.req.formData();
  const name = formData.get('name') as string;
  const file = formData.get('file') as File | null;

  if (!name?.trim()) throw new AppError(400, '分类名称不能为空');
  if (!file) throw new AppError(400, '请上传 ZIP 文件');
  if (!file.name.endsWith('.zip')) throw new AppError(400, '仅支持 ZIP 格式');

  const id = crypto.randomUUID().slice(0, 8);
  const categoryDir = join(UPLOADS_DIR, id);
  await mkdir(categoryDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const zip = new AdmZip(buffer);
  zip.extractAllTo(categoryDir, true);

  const fileCount = await countFiles(categoryDir);
  const now = new Date().toISOString();

  await db
    .insert(categories)
    .values({ id, name: name.trim(), fileCount, createdAt: now, updatedAt: now });

  return c.json({
    code: 200,
    message: 'Success',
    data: { id, name: name.trim(), fileCount, createdAt: now, updatedAt: now },
  });
});

// GET /categories — 获取分类列表
const listCategoriesRoute = createRoute({
  method: 'get',
  path: '/categories',
  tags: ['文档分类'],
  summary: '获取所有分类',
  responses: {
    200: {
      description: '分类列表',
      content: {
        'application/json': { schema: ApiResponseSchema(z.array(CategorySchema)) },
      },
    },
  },
});

docs.openapi(listCategoriesRoute, async (c) => {
  const rows = await db.select().from(categories).orderBy(categories.createdAt);
  return c.json({ code: 200, message: 'Success', data: rows });
});

// PATCH /categories/:id — 修改分类名称
const updateCategoryRoute = createRoute({
  method: 'patch',
  path: '/categories/{id}',
  tags: ['文档分类'],
  summary: '修改分类名称',
  request: {
    params: CategoryParamSchema,
    body: {
      content: { 'application/json': { schema: UpdateCategoryBodySchema } },
    },
  },
  responses: {
    200: {
      description: '更新成功',
      content: { 'application/json': { schema: ApiResponseSchema(CategorySchema) } },
    },
    404: {
      description: '分类不存在',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

docs.openapi(updateCategoryRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { name } = c.req.valid('json');

  const existing = await db.select().from(categories).where(eq(categories.id, id)).get();
  if (!existing) throw new AppError(404, '分类不存在');

  const updatedAt = new Date().toISOString();
  await db.update(categories).set({ name: name.trim(), updatedAt }).where(eq(categories.id, id));

  return c.json({
    code: 200,
    message: 'Success',
    data: { ...existing, name: name.trim(), updatedAt },
  });
});

// DELETE /categories/:id — 删除分类
const deleteCategoryRoute = createRoute({
  method: 'delete',
  path: '/categories/{id}',
  tags: ['文档分类'],
  summary: '删除分类',
  request: { params: CategoryParamSchema },
  responses: {
    200: {
      description: '删除成功',
      content: { 'application/json': { schema: ApiResponseSchema(z.null()) } },
    },
    404: {
      description: '分类不存在',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

docs.openapi(deleteCategoryRoute, async (c) => {
  const { id } = c.req.valid('param');

  const existing = await db.select().from(categories).where(eq(categories.id, id)).get();
  if (!existing) throw new AppError(404, '分类不存在');

  const categoryDir = join(UPLOADS_DIR, id);
  if (existsSync(categoryDir)) {
    await rm(categoryDir, { recursive: true, force: true });
  }

  await db.delete(categories).where(eq(categories.id, id));

  return c.json({ code: 200, message: 'Success', data: null });
});

// PUT /categories/:id/upload — 重新上传更新文档内容
const reuploadCategoryRoute = createRoute({
  method: 'put',
  path: '/categories/{id}/upload',
  tags: ['文档分类'],
  summary: '重新上传更新文档',
  description: '用新版本的 ZIP 替换现有分类的文档内容，分类名称保留不变',
  request: {
    params: CategoryParamSchema,
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: z.any().openapi({ type: 'string', format: 'binary', description: 'ZIP 文件' }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: '更新成功',
      content: { 'application/json': { schema: ApiResponseSchema(CategorySchema) } },
    },
    400: {
      description: '请求错误',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: '分类不存在',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

docs.openapi(reuploadCategoryRoute, async (c) => {
  const { id } = c.req.valid('param');

  const existing = await db.select().from(categories).where(eq(categories.id, id)).get();
  if (!existing) throw new AppError(404, '分类不存在');

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;

  if (!file) throw new AppError(400, '请上传 ZIP 文件');
  if (!file.name.endsWith('.zip')) throw new AppError(400, '仅支持 ZIP 格式');

  const categoryDir = join(UPLOADS_DIR, id);
  await rm(categoryDir, { recursive: true, force: true });
  await mkdir(categoryDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const zip = new AdmZip(buffer);
  zip.extractAllTo(categoryDir, true);

  const fileCount = await countFiles(categoryDir);
  const updatedAt = new Date().toISOString();
  await db.update(categories).set({ fileCount, updatedAt }).where(eq(categories.id, id));

  return c.json({ code: 200, message: 'Success', data: { ...existing, fileCount, updatedAt } });
});

// GET /categories/:id/tree — 获取文件树
const getTreeRoute = createRoute({
  method: 'get',
  path: '/categories/{id}/tree',
  tags: ['文档分类'],
  summary: '获取分类文件树',
  request: { params: CategoryParamSchema },
  responses: {
    200: {
      description: '文件树',
      content: {
        'application/json': { schema: ApiResponseSchema(z.array(FileTreeNodeSchema)) },
      },
    },
    404: {
      description: '分类不存在',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

docs.openapi(getTreeRoute, async (c) => {
  const { id } = c.req.valid('param');

  const existing = await db.select().from(categories).where(eq(categories.id, id)).get();
  if (!existing) throw new AppError(404, '分类不存在');

  const categoryDir = join(UPLOADS_DIR, id);
  if (!existsSync(categoryDir)) throw new AppError(404, '分类文件不存在');

  const tree = await buildFileTree(categoryDir);
  return c.json({ code: 200, message: 'Success', data: tree });
});

// GET /categories/:id/files/* — 读取文件内容（通配符路径，不走 OpenAPI）
docs.get('/categories/:id/files/*', async (c) => {
  const id = c.req.param('id');
  const filePath = c.req.param('*') ?? '';

  if (!filePath) throw new AppError(400, '文件路径不能为空');

  const existing = await db.select().from(categories).where(eq(categories.id, id)).get();
  if (!existing) throw new AppError(404, '分类不存在');

  const categoryDir = join(UPLOADS_DIR, id);
  const absolutePath = safeResolvePath(categoryDir, filePath);

  if (!existsSync(absolutePath)) throw new AppError(404, '文件不存在');

  const fileStat = await stat(absolutePath);
  if (!fileStat.isFile()) throw new AppError(400, '路径不是文件');

  const contentType = getContentType(filePath);
  const buffer = await readFile(absolutePath);
  return new Response(buffer, { headers: { 'Content-Type': contentType } });
});

export default docs;
