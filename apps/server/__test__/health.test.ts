/**
 * 健康检查路由测试
 */
import { describe, it, expect } from 'vitest';
import health from '../src/routes/health';

describe('Health Route', () => {
  it('should return healthy status', async () => {
    const res = await health.request('/');

    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.code).toBe(200);
    expect(json.message).toBe('Success');
    expect(json.data).toHaveProperty('status', 'healthy');
    expect(json.data).toHaveProperty('timestamp');
    expect(json.data).toHaveProperty('uptime');
  });

  it('should return valid timestamp', async () => {
    const res = await health.request('/');
    const json = await res.json();

    const timestamp = new Date(json.data.timestamp);
    expect(timestamp).toBeInstanceOf(Date);
    expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('should return positive uptime', async () => {
    const res = await health.request('/');
    const json = await res.json();

    expect(json.data.uptime).toBeGreaterThan(0);
  });
});
