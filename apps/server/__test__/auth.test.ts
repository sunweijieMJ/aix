/**
 * 认证路由测试
 */
import { describe, it, expect, beforeAll } from 'vitest';
import auth from '../src/routes/auth';
import { errorHandler } from '../src/middleware/error';

// 为测试环境添加错误处理
auth.onError(errorHandler);

describe('Auth Route', () => {
  let validToken: string;

  describe('POST /login', () => {
    it('should login successfully with valid credentials', async () => {
      const res = await auth.request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin',
          password: 'admin123',
        }),
      });

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.code).toBe(200);
      expect(json.data).toHaveProperty('token');
      expect(json.data).toHaveProperty('user');
      expect(json.data.user.username).toBe('admin');
      expect(json.data.user.role).toBe('admin');

      // 保存 token 用于后续测试
      validToken = json.data.token;
    });

    it('should reject invalid username', async () => {
      const res = await auth.request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'nonexistent',
          password: 'admin123',
        }),
      });

      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.code).toBe(401);
      expect(json.message).toContain('Invalid');
    });

    it('should reject invalid password', async () => {
      const res = await auth.request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin',
          password: 'wrongpassword',
        }),
      });

      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.code).toBe(401);
    });

    it('should reject request with missing fields', async () => {
      const res = await auth.request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin',
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /me', () => {
    beforeAll(async () => {
      // 确保有有效的 token
      const res = await auth.request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin',
          password: 'admin123',
        }),
      });
      const json = await res.json();
      validToken = json.data.token;
    });

    it('should return user info with valid token', async () => {
      const res = await auth.request('/me', {
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      });

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.code).toBe(200);
      expect(json.data.username).toBe('admin');
      expect(json.data.role).toBe('admin');
    });

    it('should reject request without token', async () => {
      const res = await auth.request('/me');

      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.code).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      const res = await auth.request('/me', {
        headers: {
          Authorization: 'Bearer invalid_token',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should reject request with malformed Authorization header', async () => {
      const res = await auth.request('/me', {
        headers: {
          Authorization: 'InvalidFormat',
        },
      });

      expect(res.status).toBe(401);
    });
  });
});
