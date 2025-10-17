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
global.localStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
} as unknown as Storage;
