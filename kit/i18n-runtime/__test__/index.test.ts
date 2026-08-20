import { describe, expect, it } from 'vitest';
import * as IndexModule from '../src/index.js';
import { RUNTIME_NAME } from '../src/index.js';

describe('index', () => {
  it('应导出运行时包名常量', () => {
    expect(RUNTIME_NAME).toBe('@kit/i18n-runtime');
  });

  it('应导出 createEngine', () => {
    expect(typeof IndexModule.createEngine).toBe('function');
  });

  it('应导出 provider 相关工厂与实现', () => {
    expect(typeof IndexModule.createProvider).toBe('function');
    expect(typeof IndexModule.FallbackTranslator).toBe('function');
    expect(typeof IndexModule.BackendProvider).toBe('function');
    expect(typeof IndexModule.LibreTranslateProvider).toBe('function');
  });

  it('应导出 storage 相关工厂与实现', () => {
    expect(typeof IndexModule.resolveStorageAdapter).toBe('function');
    expect(typeof IndexModule.LocalStorageAdapter).toBe('function');
    expect(typeof IndexModule.IndexedDbAdapter).toBe('function');
  });
});
