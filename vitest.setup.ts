import { vi } from 'vitest';

// ---------------【Mock API】---------------
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ message: 'Hello, World!' }),
    headers: new Headers({ 'Content-Type': 'application/json' }),
  } as Response),
);

// ---------------【屏蔽测试警告】---------------
// 保存原始 console 方法引用，避免递归调用
const originalWarn = console.warn.bind(console);

vi.spyOn(console, 'warn').mockImplementation((...args) => {
  const msg = args[0];
  // 过滤掉测试中不重要的警告
  if (typeof msg === 'string' && msg.includes('某些特定警告')) {
    return;
  }
  originalWarn(...args);
});
vi.spyOn(console, 'error').mockImplementation(() => {
  // 可选：在测试中也打印错误（用于调试）
  // originalError(...args);
});

// ---------------【Mock LocalStorage】---------------
const localStorageStore = new Map<string, string>();

global.localStorage = {
  getItem: vi.fn((key: string) => localStorageStore.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageStore.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    localStorageStore.delete(key);
  }),
  clear: vi.fn(() => {
    localStorageStore.clear();
  }),
  get length() {
    return localStorageStore.size;
  },
  key: vi.fn((index: number) => {
    const keys = Array.from(localStorageStore.keys());
    return keys[index] ?? null;
  }),
} as unknown as Storage;
