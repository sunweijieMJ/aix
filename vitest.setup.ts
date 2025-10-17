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
vi.spyOn(console, 'warn').mockImplementation((msg) => {
  if (!msg.includes('某些特定警告')) {
    console.warn(msg); // 仅过滤特定的警告，避免误屏蔽重要信息
  }
});
vi.spyOn(console, 'error').mockImplementation(() => {});

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
