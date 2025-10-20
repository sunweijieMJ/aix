import { describe, expect, it } from 'vitest';
import { ERROR_CODES, HTTP_STATUS } from '../../src/constants';
import {
  AppError,
  createError,
  DatabaseError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../src/utils/errors';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create an AppError with default values', () => {
      const error = new AppError('Test error');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe(ERROR_CODES.GENERAL_ERROR);
      expect(error.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(error.name).toBe('AppError');
    });

    it('should create an AppError with custom values', () => {
      const error = new AppError('Custom error', -100, 418);
      expect(error.message).toBe('Custom error');
      expect(error.code).toBe(-100);
      expect(error.status).toBe(418);
    });
  });

  describe('ValidationError', () => {
    it('should create a ValidationError with correct values', () => {
      const error = new ValidationError('Invalid input');
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(error.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(error.name).toBe('ValidationError');
    });
  });

  describe('NotFoundError', () => {
    it('should create a NotFoundError with correct values', () => {
      const error = new NotFoundError('Resource not found');
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toBe('Resource not found');
      expect(error.code).toBe(ERROR_CODES.NOT_FOUND);
      expect(error.status).toBe(HTTP_STATUS.NOT_FOUND);
      expect(error.name).toBe('NotFoundError');
    });
  });

  describe('UnauthorizedError', () => {
    it('should create an UnauthorizedError with default message', () => {
      const error = new UnauthorizedError();
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error.message).toBe('未授权访问');
      expect(error.code).toBe(ERROR_CODES.UNAUTHORIZED);
      expect(error.status).toBe(HTTP_STATUS.UNAUTHORIZED);
      expect(error.name).toBe('UnauthorizedError');
    });

    it('should create an UnauthorizedError with custom message', () => {
      const error = new UnauthorizedError('Custom unauthorized message');
      expect(error.message).toBe('Custom unauthorized message');
    });
  });

  describe('DatabaseError', () => {
    it('should create a DatabaseError with default message', () => {
      const error = new DatabaseError();
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(DatabaseError);
      expect(error.message).toBe('数据库操作失败');
      expect(error.code).toBe(ERROR_CODES.DATABASE_ERROR);
      expect(error.status).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(error.name).toBe('DatabaseError');
    });

    it('should create a DatabaseError with custom message', () => {
      const error = new DatabaseError('Custom database error');
      expect(error.message).toBe('Custom database error');
    });
  });

  describe('createError', () => {
    it('should create a ValidationError', () => {
      const error = createError('validation', 'Invalid input');
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Invalid input');
    });

    it('should create a NotFoundError', () => {
      const error = createError('notFound', 'Resource not found');
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toBe('Resource not found');
    });

    it('should create an UnauthorizedError', () => {
      const error = createError('unauthorized', 'Unauthorized');
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error.message).toBe('Unauthorized');
    });

    it('should create a DatabaseError', () => {
      const error = createError('database', 'Database error');
      expect(error).toBeInstanceOf(DatabaseError);
      expect(error.message).toBe('Database error');
    });

    it('should create a generic AppError for unknown type', () => {
      const error = createError('unknown', 'Unknown error');
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Unknown error');
    });
  });
});
