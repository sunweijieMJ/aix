/**
 * 文档分类路由测试
 */
import AdmZip from 'adm-zip';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db, initDb } from '../src/db/index';
import { categories } from '../src/db/schema';
import docs from '../src/routes/docs';

const UPLOADS_DIR = resolve(process.cwd(), 'storage/uploads/docs');

function createZipFormData(name: string, files: Record<string, string>): FormData {
  const zip = new AdmZip();
  for (const [filename, content] of Object.entries(files)) {
    zip.addFile(filename, Buffer.from(content));
  }
  const formData = new FormData();
  formData.append('name', name);
  formData.append('file', new Blob([zip.toBuffer()], { type: 'application/zip' }), 'docs.zip');
  return formData;
}

async function createCategory(name = 'Test Category') {
  const formData = createZipFormData(name, { 'README.md': '# Hello', 'guide.md': '## Guide' });
  const res = await docs.request('/categories', { method: 'POST', body: formData });
  return res.json() as Promise<{ data: { id: string; name: string; fileCount: number } }>;
}

beforeAll(async () => {
  await initDb();
});

afterEach(async () => {
  const rows = await db.select().from(categories);
  for (const row of rows) {
    const dir = resolve(UPLOADS_DIR, row.id);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
  await db.delete(categories);
});

afterAll(() => {
  if (existsSync(UPLOADS_DIR)) rmSync(UPLOADS_DIR, { recursive: true, force: true });
});

// ---- POST /categories ----

describe('POST /categories', () => {
  it('should create a category from ZIP', async () => {
    const formData = createZipFormData('My Docs', { 'README.md': '# Hello' });
    const res = await docs.request('/categories', { method: 'POST', body: formData });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.code).toBe(200);
    expect(json.data.name).toBe('My Docs');
    expect(json.data.fileCount).toBe(1);
    expect(json.data.id).toBeTruthy();
  });

  it('should return 400 when name is missing', async () => {
    const zip = new AdmZip();
    zip.addFile('README.md', Buffer.from('# Hello'));
    const formData = new FormData();
    formData.append('file', new Blob([zip.toBuffer()], { type: 'application/zip' }), 'docs.zip');

    const res = await docs.request('/categories', { method: 'POST', body: formData });
    expect(res.status).toBe(400);
  });

  it('should return 400 when file is missing', async () => {
    const formData = new FormData();
    formData.append('name', 'Test');

    const res = await docs.request('/categories', { method: 'POST', body: formData });
    expect(res.status).toBe(400);
  });

  it('should return 400 when file is not a ZIP', async () => {
    const formData = new FormData();
    formData.append('name', 'Test');
    formData.append('file', new Blob(['hello'], { type: 'text/plain' }), 'docs.txt');

    const res = await docs.request('/categories', { method: 'POST', body: formData });
    expect(res.status).toBe(400);
  });
});

// ---- GET /categories ----

describe('GET /categories', () => {
  it('should return empty list initially', async () => {
    const res = await docs.request('/categories');

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual([]);
  });

  it('should return all created categories', async () => {
    await createCategory('Docs A');
    await createCategory('Docs B');

    const res = await docs.request('/categories');
    const json = await res.json();

    expect(json.data).toHaveLength(2);
    const names = json.data.map((c: { name: string }) => c.name);
    expect(names).toContain('Docs A');
    expect(names).toContain('Docs B');
  });
});

// ---- PATCH /categories/:id ----

describe('PATCH /categories/:id', () => {
  it('should update category name', async () => {
    const { data } = await createCategory('Old Name');

    const res = await docs.request(`/categories/${data.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Name' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.name).toBe('New Name');
  });

  it('should return 404 for non-existent category', async () => {
    const res = await docs.request('/categories/nonexistent', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Name' }),
    });

    expect(res.status).toBe(404);
  });
});

// ---- DELETE /categories/:id ----

describe('DELETE /categories/:id', () => {
  it('should delete category and its files', async () => {
    const { data } = await createCategory();
    const categoryDir = resolve(UPLOADS_DIR, data.id);
    expect(existsSync(categoryDir)).toBe(true);

    const res = await docs.request(`/categories/${data.id}`, { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(existsSync(categoryDir)).toBe(false);
  });

  it('should return 404 for non-existent category', async () => {
    const res = await docs.request('/categories/nonexistent', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});

// ---- PUT /categories/:id/upload ----

describe('PUT /categories/:id/upload', () => {
  it('should replace category files', async () => {
    const { data } = await createCategory();

    const zip = new AdmZip();
    zip.addFile('new.md', Buffer.from('# New'));
    zip.addFile('extra.md', Buffer.from('## Extra'));
    zip.addFile('third.md', Buffer.from('## Third'));
    const newFormData = new FormData();
    newFormData.append('file', new Blob([zip.toBuffer()], { type: 'application/zip' }), 'new.zip');

    const res = await docs.request(`/categories/${data.id}/upload`, {
      method: 'PUT',
      body: newFormData,
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.fileCount).toBe(3);
  });

  it('should return 404 for non-existent category', async () => {
    const zip = new AdmZip();
    zip.addFile('new.md', Buffer.from('# New'));
    const formData = new FormData();
    formData.append('file', new Blob([zip.toBuffer()], { type: 'application/zip' }), 'new.zip');

    const res = await docs.request('/categories/nonexistent/upload', {
      method: 'PUT',
      body: formData,
    });

    expect(res.status).toBe(404);
  });
});

// ---- GET /categories/:id/tree ----

describe('GET /categories/:id/tree', () => {
  it('should return file tree', async () => {
    const { data } = await createCategory();

    const res = await docs.request(`/categories/${data.id}/tree`);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
    const names = json.data.map((n: { name: string }) => n.name);
    expect(names).toContain('README.md');
    expect(names).toContain('guide.md');
  });

  it('should return 404 for non-existent category', async () => {
    const res = await docs.request('/categories/nonexistent/tree');
    expect(res.status).toBe(404);
  });
});

// ---- GET /categories/:id/files/* ----

describe('GET /categories/:id/files/*', () => {
  it('should return file content', async () => {
    const { data } = await createCategory();

    const res = await docs.request(`/categories/${data.id}/files/README.md`);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/markdown');
    const text = await res.text();
    expect(text).toBe('# Hello');
  });

  it('should return 404 for non-existent file', async () => {
    const { data } = await createCategory();
    const res = await docs.request(`/categories/${data.id}/files/not-exist.md`);
    expect(res.status).toBe(404);
  });

  it('should return 404 for non-existent category', async () => {
    const res = await docs.request('/categories/nonexistent/files/README.md');
    expect(res.status).toBe(404);
  });

  it('should block path traversal', async () => {
    const { data } = await createCategory();
    // URL 标准化会将 ../../ 解析掉，路由匹配不到 → 404
    const res = await docs.request(`/categories/${data.id}/files/../../secret`);
    expect(res.status).toBe(404);
  });
});
