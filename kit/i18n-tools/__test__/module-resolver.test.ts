import { describe, it, expect } from 'vitest';
import { BucketResolver } from '../src/utils/bucket-resolver';

const baseConfig = {
  defaultBucket: 'common',
  emitManifest: true as const,
  layout: 'by-locale' as const,
};

describe('BucketResolver', () => {
  it('glob 字符串匹配', () => {
    const r = new BucketResolver({
      ...baseConfig,
      rules: [{ name: 'order', match: 'src/views/order/**' }],
    });
    expect(r.resolve('src/views/order/list.vue', 'order.list.title', '订单列表')).toBe('order');
    expect(r.resolve('src/views/user/list.vue', 'user.list.title', '用户')).toBe('common');
  });

  it('glob 数组匹配（任一命中）', () => {
    const r = new BucketResolver({
      ...baseConfig,
      rules: [{ name: 'user', match: ['src/views/user/**', 'src/api/user/**'] }],
    });
    expect(r.resolve('src/api/user/auth.ts', 'k', 'v')).toBe('user');
    expect(r.resolve('src/views/user/profile.vue', 'k', 'v')).toBe('user');
    expect(r.resolve('src/views/order/list.vue', 'k', 'v')).toBe('common');
  });

  it('RegExp 匹配', () => {
    const r = new BucketResolver({
      ...baseConfig,
      rules: [{ name: 'admin', match: /\/admin\// }],
    });
    expect(r.resolve('src/views/admin/dashboard.vue', 'k', 'v')).toBe('admin');
    expect(r.resolve('src/views/user.vue', 'k', 'v')).toBe('common');
  });

  it('函数匹配（接收 filePath/key/message）', () => {
    const r = new BucketResolver({
      ...baseConfig,
      rules: [
        {
          name: 'mobile',
          match: (filePath) => filePath.includes('.mobile.'),
        },
      ],
    });
    expect(r.resolve('src/views/list.mobile.vue', 'k', 'v')).toBe('mobile');
    expect(r.resolve('src/views/list.vue', 'k', 'v')).toBe('common');
  });

  it('matchKey 按 key 归属', () => {
    const r = new BucketResolver({
      ...baseConfig,
      rules: [{ name: 'error', matchKey: (key) => key.startsWith('error.') }],
    });
    expect(r.resolve('src/anywhere.ts', 'error.notFound', '未找到')).toBe('error');
    expect(r.resolve('src/anywhere.ts', 'order.list', '订单')).toBe('common');
  });

  it('rules 数组顺序优先（先匹配先归属）', () => {
    const r = new BucketResolver({
      ...baseConfig,
      rules: [
        { name: 'admin', match: 'src/views/admin/**' },
        { name: 'views', match: 'src/views/**' },
      ],
    });
    expect(r.resolve('src/views/admin/x.vue', 'k', 'v')).toBe('admin');
    expect(r.resolve('src/views/order/x.vue', 'k', 'v')).toBe('views');
  });

  it('Windows 风格路径自动规范化为 POSIX', () => {
    const r = new BucketResolver({
      ...baseConfig,
      rules: [{ name: 'order', match: 'src/views/order/**' }],
    });
    expect(r.resolve('src\\views\\order\\list.vue', 'k', 'v')).toBe('order');
  });
});
