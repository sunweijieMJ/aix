import { describe, expect, it } from 'vitest';
import { TEMPLATE_REGISTRY, findTemplateById } from '../src/config/defaults';
import { resolveTemplateArg } from '../src/prompts/index';

describe('TEMPLATE_REGISTRY', () => {
  it('注册 admin 模板（h5 随 R2 的 overlay 机制恢复）', () => {
    const ids = TEMPLATE_REGISTRY.map((entry) => entry.id);
    expect(ids).toContain('admin');
  });

  it('admin 直接指向模板真源仓库（CLI 不保存模板拷贝）', () => {
    expect(findTemplateById('admin')?.source).toBe(
      'git+ssh://git@git.zhihuishu.com/weijie/vue-admin-template.git#master',
    );
  });

  it('id 唯一', () => {
    const ids = TEMPLATE_REGISTRY.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每个条目具备 label / platform / source', () => {
    for (const entry of TEMPLATE_REGISTRY) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(['web', 'mobile']).toContain(entry.platform);
      expect(entry.source.length).toBeGreaterThan(0);
    }
  });
});

describe('findTemplateById', () => {
  it('命中已注册 id', () => {
    expect(findTemplateById('admin')?.platform).toBe('web');
  });

  it('h5 本轮不在注册表内，按裸模板源处理', () => {
    expect(findTemplateById('h5')).toBeUndefined();
  });

  it('未命中返回 undefined', () => {
    expect(findTemplateById('/tmp/some-local-template')).toBeUndefined();
  });
});

describe('resolveTemplateArg', () => {
  it('注册表 id 解析为条目的 source 与 label', () => {
    const resolved = resolveTemplateArg('admin');
    expect(resolved.templateId).toBe('admin');
    expect(resolved.templateSource).toBe(findTemplateById('admin')?.source);
    expect(resolved.templateLabel).toBe('后台管理系统');
  });

  it('非注册表值按裸模板源处理，templateId 为 undefined', () => {
    const resolved = resolveTemplateArg('/Users/me/app-templates/packages/template-admin');
    expect(resolved.templateId).toBeUndefined();
    expect(resolved.templateSource).toBe('/Users/me/app-templates/packages/template-admin');
    expect(resolved.templateLabel).toBe('/Users/me/app-templates/packages/template-admin');
  });

  it('giget 源同样按裸模板源处理', () => {
    const resolved = resolveTemplateArg('github:org/repo/packages/tpl');
    expect(resolved.templateId).toBeUndefined();
    expect(resolved.templateSource).toBe('github:org/repo/packages/tpl');
  });
});
