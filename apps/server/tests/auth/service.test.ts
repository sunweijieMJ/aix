/**
 * 认证服务测试
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AuthService } from '../../src/auth/service';
import { UserRole } from '../../src/auth/types';
import { AppError } from '../../src/utils/errors';

// Create mock functions that will be reused
const mockGetUserByUsername = vi.fn();
const mockGetUserByEmail = vi.fn();
const mockGetUserById = vi.fn();
const mockCreateUser = vi.fn();

// Mock dependencies
vi.mock('../../src/database', () => ({
  getPostgresAdapter: vi.fn(() => ({
    getUserByUsername: mockGetUserByUsername,
    getUserByEmail: mockGetUserByEmail,
    getUserById: mockGetUserById,
    createUser: mockCreateUser,
  })),
}));

vi.mock('../../src/auth/password', () => ({
  PasswordUtil: {
    hash: vi.fn((pwd: string) => Promise.resolve(`hashed_${pwd}`)),
    verify: vi.fn((pwd: string) => Promise.resolve(pwd === 'correctPassword')),
    validateStrength: vi.fn((pwd: string) => ({
      valid: pwd.length >= 8,
      message: pwd.length >= 8 ? undefined : 'Password too short',
    })),
  },
}));

vi.mock('../../src/auth/jwt', () => ({
  JWTUtil: {
    sign: vi.fn(() => 'mock-jwt-token'),
    verify: vi.fn(() => ({ valid: true, payload: { userId: 1, username: 'testuser', role: 'user' } })),
    refresh: vi.fn(() => 'new-mock-jwt-token'),
    getExpiresIn: vi.fn(() => 86400),
  },
}));

import { PasswordUtil } from '../../src/auth/password';
import { JWTUtil } from '../../src/auth/jwt';

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      const mockUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        passwordHash: 'hashed_password',
        role: UserRole.USER,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      mockGetUserByUsername.mockResolvedValue(mockUser);
      vi.mocked(PasswordUtil.verify).mockResolvedValue(true);

      const result = await authService.login({
        username: 'testuser',
        password: 'correctPassword',
      });

      expect(result).toBeDefined();
      expect(result.token).toBe('mock-jwt-token');
      expect(result.user).toBeDefined();
      expect(result.user.username).toBe('testuser');
      expect(result.expiresIn).toBe(86400);
      expect(mockGetUserByUsername).toHaveBeenCalledWith('testuser');
    });

    it('should fail login with non-existent user', async () => {
      mockGetUserByUsername.mockResolvedValue(null);

      await expect(
        authService.login({
          username: 'nonexistent',
          password: 'password',
        }),
      ).rejects.toThrow(AppError);
    });

    it('should fail login with incorrect password', async () => {
      const mockUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        passwordHash: 'hashed_password',
        role: UserRole.USER,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      mockGetUserByUsername.mockResolvedValue(mockUser);
      vi.mocked(PasswordUtil.verify).mockResolvedValue(false);

      await expect(
        authService.login({
          username: 'testuser',
          password: 'wrongPassword',
        }),
      ).rejects.toThrow(AppError);
    });
  });

  describe('register', () => {
    it('should successfully register a new user', async () => {
      mockGetUserByUsername.mockResolvedValue(null);
      mockGetUserByEmail.mockResolvedValue(null);
      mockCreateUser.mockResolvedValue({
        id: 1,
        username: 'newuser',
        email: 'new@example.com',
        passwordHash: 'hashed_password',
        role: UserRole.USER,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      });

      vi.mocked(PasswordUtil.validateStrength).mockReturnValue({ valid: true });

      const result = await authService.register({
        username: 'newuser',
        email: 'new@example.com',
        password: 'ValidPass123!',
      });

      expect(result).toBeDefined();
      expect(result.username).toBe('newuser');
      expect(result.email).toBe('new@example.com');
      expect(mockCreateUser).toHaveBeenCalled();
    });

    it('should fail registration with weak password', async () => {
      vi.mocked(PasswordUtil.validateStrength).mockReturnValue({
        valid: false,
        message: 'Password too weak',
      });

      await expect(
        authService.register({
          username: 'newuser',
          email: 'new@example.com',
          password: 'weak',
        }),
      ).rejects.toThrow(AppError);
    });

    it('should fail registration with existing username', async () => {
      mockGetUserByUsername.mockResolvedValue({
        id: 1,
        username: 'existinguser',
      });

      vi.mocked(PasswordUtil.validateStrength).mockReturnValue({ valid: true });

      await expect(
        authService.register({
          username: 'existinguser',
          email: 'new@example.com',
          password: 'ValidPass123!',
        }),
      ).rejects.toThrow(AppError);
    });

    it('should fail registration with existing email', async () => {
      mockGetUserByUsername.mockResolvedValue(null);
      mockGetUserByEmail.mockResolvedValue({
        id: 1,
        email: 'existing@example.com',
      });

      vi.mocked(PasswordUtil.validateStrength).mockReturnValue({ valid: true });

      await expect(
        authService.register({
          username: 'newuser',
          email: 'existing@example.com',
          password: 'ValidPass123!',
        }),
      ).rejects.toThrow(AppError);
    });

    it('should register user with default role', async () => {
      mockGetUserByUsername.mockResolvedValue(null);
      mockGetUserByEmail.mockResolvedValue(null);
      mockCreateUser.mockResolvedValue({
        id: 1,
        username: 'newuser',
        email: 'new@example.com',
        passwordHash: 'hashed',
        role: UserRole.USER,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      });

      vi.mocked(PasswordUtil.validateStrength).mockReturnValue({ valid: true });

      await authService.register({
        username: 'newuser',
        email: 'new@example.com',
        password: 'ValidPass123!',
      });

      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          role: UserRole.USER,
        }),
      );
    });
  });

  describe('refreshToken', () => {
    it('should successfully refresh a valid token', async () => {
      vi.mocked(JWTUtil.refresh).mockReturnValue('new-mock-jwt-token');

      const result = await authService.refreshToken('old-token');

      expect(result).toBeDefined();
      expect(result.token).toBe('new-mock-jwt-token');
      expect(result.expiresIn).toBe(86400);
    });

    it('should fail to refresh invalid token', async () => {
      vi.mocked(JWTUtil.refresh).mockReturnValue(null);

      await expect(authService.refreshToken('invalid-token')).rejects.toThrow(AppError);
    });
  });

  describe('getUserInfo', () => {
    it('should successfully get user info', async () => {
      const mockUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        passwordHash: 'hashed',
        role: UserRole.USER,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      mockGetUserById.mockResolvedValue(mockUser);

      const result = await authService.getUserInfo(1);

      expect(result).toBeDefined();
      expect(result.username).toBe('testuser');
      expect(result.email).toBe('test@example.com');
      expect(mockGetUserById).toHaveBeenCalledWith(1);
    });

    it('should fail to get non-existent user', async () => {
      mockGetUserById.mockResolvedValue(null);

      await expect(authService.getUserInfo(999)).rejects.toThrow(AppError);
    });
  });
});
