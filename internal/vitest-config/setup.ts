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

// ---------------【屏蔽测试错误输出】---------------
// console.warn 不拦截：Vue 开发警告走 warn，全量放行便于发现回归
// console.error 有意静音（沿用旧根 setup 行为）：仅损失调试期诊断输出，
// 不影响测试结果；需要断言 error 的测试请自建局部 spy
vi.spyOn(console, 'error').mockImplementation(() => {
  // 调试时可临时改为透传：console.info(...args)
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

// ---------------【jsdom 缺失的 DOM API 补丁】---------------
// jsdom 未实现 document.elementFromPoint，tiptap / ProseMirror 的坐标定位会调用它而抛
// unhandled error（测试断言不受影响，但会污染 vitest 退出码）。补一个安全空实现。
if (typeof document !== 'undefined' && !document.elementFromPoint) {
  document.elementFromPoint = () => null;
}
