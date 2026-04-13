import { describe, expect, it } from 'vitest';
import { CreateAppError, wrapError } from '../src/utils/errors';

describe('CreateAppError', () => {
  it('创建时正确设置字段', () => {
    const err = new CreateAppError('E_INVALID_PROJECT_NAME', '项目名不合法', '请使用小写字母');
    expect(err.code).toBe('E_INVALID_PROJECT_NAME');
    expect(err.message).toBe('项目名不合法');
    expect(err.suggestion).toBe('请使用小写字母');
    expect(err.name).toBe('CreateAppError');
  });

  it('instanceof Error 为 true', () => {
    const err = new CreateAppError('E_UNKNOWN', 'test');
    expect(err instanceof Error).toBe(true);
    expect(err instanceof CreateAppError).toBe(true);
  });
});

describe('wrapError', () => {
  it('透传 CreateAppError', () => {
    const original = new CreateAppError('E_USER_CANCEL', '已取消');
    const wrapped = wrapError(original);
    expect(wrapped).toBe(original);
  });

  it('包装普通 Error', () => {
    const err = new Error('原始错误');
    const wrapped = wrapError(err, 'E_TEMPLATE_FETCH_FAILED');
    expect(wrapped.code).toBe('E_TEMPLATE_FETCH_FAILED');
    expect(wrapped.message).toBe('原始错误');
  });

  it('包装字符串', () => {
    const wrapped = wrapError('something went wrong');
    expect(wrapped.code).toBe('E_UNKNOWN');
    expect(wrapped.message).toBe('something went wrong');
  });
});
