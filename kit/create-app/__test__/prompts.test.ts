import { describe, expect, it } from 'vitest';
import {
  buildSummary,
  collectFeatureSelection,
  collectTemplateParams,
  parseParamArgs,
  validateFeatureIds,
} from '../src/prompts/index';
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

describe('parseParamArgs', () => {
  it('解析可重复的 key=value，同 key 后者覆盖前者', () => {
    expect(parseParamArgs(['a=1', 'b=x=y', 'a=2'])).toEqual({ a: '2', b: 'x=y' });
  });

  it('未传返回空对象', () => {
    expect(parseParamArgs(undefined)).toEqual({});
    expect(parseParamArgs([])).toEqual({});
  });

  it('值两端空白被 trim', () => {
    expect(parseParamArgs(['title=  Vue Admin  '])).toEqual({ title: 'Vue Admin' });
  });

  it('key 两端空白同样被 trim（尾随空格在终端里肉眼看不出来）', () => {
    expect(parseParamArgs(['title =x'])).toEqual({ title: 'x' });
    expect(parseParamArgs([' title=x'])).toEqual({ title: 'x' });
  });

  it('缺 = 或空 key / 空白 value 抛 E_INVALID_PARAM', () => {
    for (const bad of ['novalue', '=x', '  =x', 'key=', 'key=   ']) {
      expect(() => parseParamArgs([bad])).toThrowError(
        expect.objectContaining({ code: 'E_INVALID_PARAM' }) as unknown as Error,
      );
    }
  });

  it('值含引号/尖括号/反斜杠抛 E_INVALID_PARAM（会原文注入 TS/HTML，静默产出语法错误）', () => {
    for (const bad of [
      "title=Tom's Admin",
      'title=say "hi"',
      'title=`tpl`',
      'title=a\\b',
      'title=<script>',
    ]) {
      expect(() => parseParamArgs([bad]), `应拒绝 "${bad}"`).toThrowError(
        expect.objectContaining({ code: 'E_INVALID_PARAM' }) as unknown as Error,
      );
    }
    // 正常文案不受限：中文、空格、& 都放行
    expect(parseParamArgs(['title=运营 & 管理平台'])).toEqual({ title: '运营 & 管理平台' });
  });
});

// 测试进程 stdin 非 TTY，collectTemplateParams 恰好走的就是要重点回归的非交互分支
describe('collectTemplateParams（非 TTY 分支）', () => {
  const withParams: TemplateConfig = {
    ...manifest,
    params: {
      'project-title': { label: '项目标题', default: 'Vue Admin' },
      'api-prefix': { label: 'API 前缀' },
    },
  };

  it('--param 优先，未传的有默认值参数用 default 兜底', async () => {
    const result = await collectTemplateParams(withParams, { 'api-prefix': '/api' });
    expect(result).toEqual({ 'project-title': 'Vue Admin', 'api-prefix': '/api' });
  });

  it('无 default 且未传 --param 时抛 E_NON_INTERACTIVE 并点名参数', async () => {
    await expect(collectTemplateParams(withParams, {})).rejects.toMatchObject({
      code: 'E_NON_INTERACTIVE',
      message: expect.stringContaining('--param api-prefix=') as unknown as string,
    });
  });

  it('未知参数名抛 E_INVALID_PARAM 并列出可用参数', async () => {
    await expect(collectTemplateParams(withParams, { nope: '1' })).rejects.toMatchObject({
      code: 'E_INVALID_PARAM',
      suggestion: expect.stringContaining('project-title') as unknown as string,
    });
  });

  it('模板未声明 params 时返回空对象；此时传 --param 报错', async () => {
    await expect(collectTemplateParams(manifest, {})).resolves.toEqual({});
    await expect(collectTemplateParams(manifest, { a: '1' })).rejects.toMatchObject({
      code: 'E_INVALID_PARAM',
    });
  });
});
