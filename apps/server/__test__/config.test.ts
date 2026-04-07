/**
 * 配置路由测试
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db, initDb } from '../src/db/index';
import { settings } from '../src/db/schema';
import config from '../src/routes/config';

beforeAll(async () => {
  await initDb();
});

afterEach(async () => {
  await db.delete(settings);
});

describe('Config Route - PUT /config/:path', () => {
  it('should create a new config', async () => {
    const res = await config.request('/config/app.settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { theme: 'dark', lang: 'zh' } }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.code).toBe(200);
    expect(json.data.path).toBe('app.settings');
    expect(json.data.data).toEqual({ theme: 'dark', lang: 'zh' });
  });

  it('should upsert existing config', async () => {
    await config.request('/config/app.settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { theme: 'dark' } }),
    });

    const res = await config.request('/config/app.settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { theme: 'light' } }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.data).toEqual({ theme: 'light' });
  });

  it('should accept nested object as data', async () => {
    const res = await config.request('/config/nested.config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { list: [1, 2, 3], enabled: true } }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.data).toEqual({ list: [1, 2, 3], enabled: true });
  });
});

describe('Config Route - GET /config/:path', () => {
  it('should read existing config', async () => {
    await config.request('/config/app.settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { theme: 'dark' } }),
    });

    const res = await config.request('/config/app.settings');

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.code).toBe(200);
    expect(json.data).toEqual({ theme: 'dark' });
  });

  it('should return 404 for non-existent config', async () => {
    const res = await config.request('/config/not.exist');

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.code).toBe(404);
  });
});
