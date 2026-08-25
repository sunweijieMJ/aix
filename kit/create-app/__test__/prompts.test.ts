import { describe, expect, it } from 'vitest';
import { buildSummary, collectFeatureSelection, validateFeatureIds } from '../src/prompts/index';
import type { TemplateConfig } from '../src/types';

const manifest: TemplateConfig = {
  id: 'template-mini',
  platform: 'web',
  compatibleCliVersions: '*',
  variables: {},
  features: {
    i18n: { label: '国际化 (vue-i18n)', hint: 'recommended', default: true },
    qiankun: { label: '微前端 qiankun' },
    demoPages: { label: '示例页面' },
  },
};

const emptyManifest: TemplateConfig = { ...manifest, features: {} };

describe('validateFeatureIds', () => {
  it('全部合法时原样返回', () => {
    expect(validateFeatureIds(['i18n', 'qiankun'], manifest)).toEqual(['i18n', 'qiankun']);
  });

  it('空列表合法', () => {
    expect(validateFeatureIds([], manifest)).toEqual([]);
  });

  it('未知特性抛 E_UNKNOWN_FEATURE 并列出可用特性', () => {
    try {
      validateFeatureIds(['i18n', 'nope'], manifest);
      expect.unreachable('应当抛出 E_UNKNOWN_FEATURE');
    } catch (err) {
      expect((err as { code: string }).code).toBe('E_UNKNOWN_FEATURE');
      expect((err as Error).message).toContain('nope');
      expect((err as { suggestion?: string }).suggestion).toContain('i18n');
      expect((err as { suggestion?: string }).suggestion).toContain('demoPages');
    }
  });

  it('模板未声明特性时给出针对性提示', () => {
    try {
      validateFeatureIds(['i18n'], emptyManifest);
      expect.unreachable('应当抛出 E_UNKNOWN_FEATURE');
    } catch (err) {
      expect((err as { suggestion?: string }).suggestion).toContain('--features');
    }
  });
});

describe('collectFeatureSelection', () => {
  it('传入 --features 时跳过问答并校验', async () => {
    await expect(collectFeatureSelection(manifest, ['i18n'])).resolves.toEqual(['i18n']);
  });

  it('传入 --features 含未知 id 时抛错', async () => {
    await expect(collectFeatureSelection(manifest, ['ghost'])).rejects.toMatchObject({
      code: 'E_UNKNOWN_FEATURE',
    });
  });

  it('模板无可选特性时直接返回空数组（不进入问答）', async () => {
    await expect(collectFeatureSelection(emptyManifest)).resolves.toEqual([]);
  });
});

describe('buildSummary', () => {
  it('展示模板 label 与所选特性 label', () => {
    const summary = buildSummary({
      name: 'my-app',
      templateLabel: '后台管理系统',
      platform: 'web',
      features: ['i18n', 'demoPages'],
      manifest,
    });
    expect(summary).toContain('my-app');
    expect(summary).toContain('后台管理系统');
    expect(summary).toContain('国际化 (vue-i18n)');
    expect(summary).toContain('示例页面');
    expect(summary).toContain('Web 应用');
  });

  it('未选特性时显示占位文案', () => {
    const summary = buildSummary({
      name: 'my-app',
      templateLabel: '/local/tpl',
      platform: 'mobile',
      features: [],
      manifest,
    });
    expect(summary).toContain('（未选择）');
    expect(summary).toContain('移动端 H5');
  });
});
