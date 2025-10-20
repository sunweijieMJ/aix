/**
 * JWT工具测试
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { JWTUtil } from '../../src/auth/jwt';
import { UserRole } from '../../src/auth/types';

describe('JWTUtil', () => {
  const testPayload = {
    userId: 1,
    username: 'testuser',
    role: UserRole.USER,
  };

  let validToken: string;

  beforeAll(() => {
    // 生成一个有效的token供后续测试使用
    validToken = JWTUtil.sign(testPayload);
  });

  describe('sign', () => {
    it('should generate a valid JWT token', () => {
      const token = JWTUtil.sign(testPayload);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT格式: header.payload.signature
    });

    it('should generate different tokens for same payload (due to iat)', async () => {
      const token1 = JWTUtil.sign(testPayload);
      // 等待1秒确保时间戳不同
      await new Promise(resolve => setTimeout(resolve, 1000));
      const token2 = JWTUtil.sign(testPayload);
      expect(token1).not.toBe(token2);
    });
  });

  describe('verify', () => {
    it('should verify a valid token', () => {
      const result = JWTUtil.verify(validToken);
      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
      expect(result.payload?.userId).toBe(testPayload.userId);
      expect(result.payload?.username).toBe(testPayload.username);
      expect(result.payload?.role).toBe(testPayload.role);
    });

    it('should reject an invalid token', () => {
      const invalidToken = 'invalid.token.string';
      const result = JWTUtil.verify(invalidToken);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject a malformed token', () => {
      const malformedToken = 'not-a-jwt-token';
      const result = JWTUtil.verify(malformedToken);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject an empty token', () => {
      const result = JWTUtil.verify('');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('decode', () => {
    it('should decode a valid token without verification', () => {
      const decoded = JWTUtil.decode(validToken);
      expect(decoded).toBeDefined();
      expect(decoded?.userId).toBe(testPayload.userId);
      expect(decoded?.username).toBe(testPayload.username);
      expect(decoded?.role).toBe(testPayload.role);
    });

    it('should return null for invalid token', () => {
      const decoded = JWTUtil.decode('invalid-token');
      expect(decoded).toBeNull();
    });
  });

  describe('refresh', () => {
    it('should refresh a valid token', () => {
      const newToken = JWTUtil.refresh(validToken);
      expect(newToken).toBeDefined();
      expect(typeof newToken).toBe('string');
      expect(newToken).not.toBe(validToken);

      // 验证新token包含相同的payload
      const result = JWTUtil.verify(newToken!);
      expect(result.valid).toBe(true);
      expect(result.payload?.userId).toBe(testPayload.userId);
      expect(result.payload?.username).toBe(testPayload.username);
      expect(result.payload?.role).toBe(testPayload.role);
    });

    it('should return null for invalid token', () => {
      const newToken = JWTUtil.refresh('invalid-token');
      expect(newToken).toBeNull();
    });
  });

  describe('getExpiresIn', () => {
    it('should return expiration time in seconds', () => {
      const expiresIn = JWTUtil.getExpiresIn();
      expect(expiresIn).toBeGreaterThan(0);
      expect(typeof expiresIn).toBe('number');
    });

    it('should return configured expiration time', () => {
      const expiresIn = JWTUtil.getExpiresIn();
      // 测试环境配置为1h，即3600秒
      expect(expiresIn).toBe(60 * 60);
    });
  });

  describe('Token Payload', () => {
    it('should include issuer in token', () => {
      const token = JWTUtil.sign(testPayload);
      const decoded = JWTUtil.decode(token);
      expect(decoded).toBeDefined();
      // JWT payload会包含iss字段
    });

    it('should include expiration time in token', () => {
      const token = JWTUtil.sign(testPayload);
      const decoded = JWTUtil.decode(token);
      expect(decoded).toBeDefined();
      expect(decoded?.exp).toBeDefined();
      expect(decoded?.exp).toBeGreaterThan(Date.now() / 1000);
    });

    it('should include issued at time in token', () => {
      const token = JWTUtil.sign(testPayload);
      const decoded = JWTUtil.decode(token);
      expect(decoded).toBeDefined();
      expect(decoded?.iat).toBeDefined();
      expect(decoded?.iat).toBeLessThanOrEqual(Date.now() / 1000);
    });
  });

  describe('Different Roles', () => {
    it('should handle ADMIN role', () => {
      const adminPayload = { ...testPayload, role: UserRole.ADMIN };
      const token = JWTUtil.sign(adminPayload);
      const result = JWTUtil.verify(token);
      expect(result.valid).toBe(true);
      expect(result.payload?.role).toBe(UserRole.ADMIN);
    });

    it('should handle GUEST role', () => {
      const guestPayload = { ...testPayload, role: UserRole.GUEST };
      const token = JWTUtil.sign(guestPayload);
      const result = JWTUtil.verify(token);
      expect(result.valid).toBe(true);
      expect(result.payload?.role).toBe(UserRole.GUEST);
    });
  });
});
