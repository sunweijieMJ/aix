/**
 * 密码工具测试
 */
import { describe, expect, it } from 'vitest';
import { PasswordUtil } from '../../src/auth/password';

describe('PasswordUtil', () => {
  const testPassword = 'TestPassword123!';

  describe('hash', () => {
    it('should hash a password', async () => {
      const hash = await PasswordUtil.hash(testPassword);
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash).not.toBe(testPassword);
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should generate different hashes for same password', async () => {
      const hash1 = await PasswordUtil.hash(testPassword);
      const hash2 = await PasswordUtil.hash(testPassword);
      expect(hash1).not.toBe(hash2); // bcrypt使用随机salt
    });

    it('should handle empty password', async () => {
      const hash = await PasswordUtil.hash('');
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });
  });

  describe('verify', () => {
    it('should verify correct password', async () => {
      const hash = await PasswordUtil.hash(testPassword);
      const isValid = await PasswordUtil.verify(testPassword, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const hash = await PasswordUtil.hash(testPassword);
      const isValid = await PasswordUtil.verify('WrongPassword', hash);
      expect(isValid).toBe(false);
    });

    it('should reject empty password against valid hash', async () => {
      const hash = await PasswordUtil.hash(testPassword);
      const isValid = await PasswordUtil.verify('', hash);
      expect(isValid).toBe(false);
    });

    it('should handle invalid hash format', async () => {
      const isValid = await PasswordUtil.verify(testPassword, 'invalid-hash');
      expect(isValid).toBe(false);
    });
  });

  describe('validateStrength', () => {
    it('should accept strong password', () => {
      const result = PasswordUtil.validateStrength('StrongPass123!');
      expect(result.valid).toBe(true);
      expect(result.message).toBeUndefined();
    });

    it('should reject password shorter than 8 characters', () => {
      const result = PasswordUtil.validateStrength('Short1!');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('8');
    });

    it('should reject password without uppercase letter', () => {
      const result = PasswordUtil.validateStrength('lowercase123!');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('uppercase');
    });

    it('should reject password without lowercase letter', () => {
      const result = PasswordUtil.validateStrength('UPPERCASE123!');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('lowercase');
    });

    it('should reject password without number', () => {
      const result = PasswordUtil.validateStrength('NoNumberPass!');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('number');
    });

    it('should accept password with various special characters', () => {
      const passwords = ['Password123!', 'Password123@', 'Password123#', 'Password123$', 'Password123%'];

      passwords.forEach(pwd => {
        const result = PasswordUtil.validateStrength(pwd);
        expect(result.valid).toBe(true);
      });
    });

    it('should handle very long password', () => {
      const longPassword = 'A1!' + 'a'.repeat(100);
      const result = PasswordUtil.validateStrength(longPassword);
      expect(result.valid).toBe(true);
    });

    it('should handle empty password', () => {
      const result = PasswordUtil.validateStrength('');
      expect(result.valid).toBe(false);
      expect(result.message).toBeDefined();
    });
  });

  describe('Integration: hash and verify', () => {
    it('should work together for valid password flow', async () => {
      const password = 'MySecurePassword123!';

      // 验证密码强度
      const strengthCheck = PasswordUtil.validateStrength(password);
      expect(strengthCheck.valid).toBe(true);

      // 哈希密码
      const hash = await PasswordUtil.hash(password);
      expect(hash).toBeDefined();

      // 验证密码
      const isValid = await PasswordUtil.verify(password, hash);
      expect(isValid).toBe(true);

      // 错误密码应该失败
      const isInvalid = await PasswordUtil.verify('WrongPassword', hash);
      expect(isInvalid).toBe(false);
    });

    it('should handle weak password rejection', async () => {
      const weakPwd = '123';

      // 弱密码应该被拒绝
      const strengthCheck = PasswordUtil.validateStrength(weakPwd);
      expect(strengthCheck.valid).toBe(false);

      // 但仍然可以哈希（业务层应该阻止）
      const hash = await PasswordUtil.hash(weakPwd);
      const isValid = await PasswordUtil.verify(weakPwd, hash);
      expect(isValid).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should hash password in reasonable time', async () => {
      const start = Date.now();
      await PasswordUtil.hash(testPassword);
      const duration = Date.now() - start;

      // bcrypt应该在1秒内完成（通常100-300ms）
      expect(duration).toBeLessThan(1000);
    });

    it('should verify password in reasonable time', async () => {
      const hash = await PasswordUtil.hash(testPassword);
      const start = Date.now();
      await PasswordUtil.verify(testPassword, hash);
      const duration = Date.now() - start;

      // 验证应该很快（通常<100ms）
      expect(duration).toBeLessThan(1000);
    });
  });
});
