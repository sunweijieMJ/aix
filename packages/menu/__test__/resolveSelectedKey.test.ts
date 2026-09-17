import { describe, expect, it } from 'vitest';
import { resolveSelectedKey, type MenuItemData } from '../src';

interface RouteMeta extends Record<string, unknown> {
  path?: string;
}

const items: MenuItemData<RouteMeta>[] = [
  { key: 'home', label: '首页', meta: { path: '/' } },
  { key: 'divider', type: 'divider' },
  {
    key: 'course',
    type: 'group',
    label: '课程',
    meta: { path: '/course' },
    children: [
      { key: 'course-list', label: '课程列表', meta: { path: '/course' } },
      { key: 'course-detail', label: '课程详情', meta: { path: '/course/detail' } },
    ],
  },
  {
    key: 'settings',
    label: '设置',
    meta: { path: '/settings' },
    children: [{ key: 'settings-profile', label: '资料', meta: { path: '/settings/profile' } }],
  },
];

function byRoute(routePath: string) {
  return (item: MenuItemData<RouteMeta>) => {
    const path = item.meta?.path;
    if (!path) return false;
    if (routePath === path) return path.length + 1;
    return routePath.startsWith(`${path}/`) ? path.length : false;
  };
}

describe('resolveSelectedKey', () => {
  it('返回 true 的叶子被选中，分组与子菜单节点不参与匹配', () => {
    expect(resolveSelectedKey(items, (item) => item.meta?.path === '/course')).toBe('course-list');
    expect(resolveSelectedKey(items, (item) => item.meta?.path === '/settings')).toBeUndefined();
  });

  it('多个叶子命中时分值最高者胜出', () => {
    expect(resolveSelectedKey(items, byRoute('/course/detail/1'))).toBe('course-detail');
    expect(resolveSelectedKey(items, byRoute('/course/other'))).toBe('course-list');
    expect(resolveSelectedKey(items, byRoute('/settings/profile'))).toBe('settings-profile');
  });

  it('同分取先出现的叶子', () => {
    expect(resolveSelectedKey(items, () => true)).toBe('home');
    expect(resolveSelectedKey(items, () => 5)).toBe('home');
  });

  it('false、undefined、0 与负数视为不匹配，无命中时返回 undefined', () => {
    expect(resolveSelectedKey(items, () => false)).toBeUndefined();
    expect(resolveSelectedKey(items, () => undefined)).toBeUndefined();
    expect(resolveSelectedKey(items, () => 0)).toBeUndefined();
    expect(resolveSelectedKey(items, () => -1)).toBeUndefined();
    expect(resolveSelectedKey(undefined, () => true)).toBeUndefined();
  });

  it('匹配函数收到从最外层祖先到自身的 keyPath', () => {
    const paths: string[][] = [];
    resolveSelectedKey(items, (_item, keyPath) => {
      paths.push(keyPath);
      return false;
    });
    expect(paths).toEqual([
      ['home'],
      ['course', 'course-list'],
      ['course', 'course-detail'],
      ['settings', 'settings-profile'],
    ]);
  });
});
