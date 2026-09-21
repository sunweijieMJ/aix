import { describe, expect, it } from 'vitest';
import { deepMerge, patchPackageJson, sortDependencies } from '../src/core/pkg-patcher';
import type { ProjectConfig, TemplateConfig } from '../src/types';

const baseManifest: TemplateConfig = {
  id: 'template-pc',
  platform: 'web',
  compatibleCliVersions: '>=0.1.0',
  variables: {},
  features: {
    i18n: {
      label: '国际化',
      default: true,
      deps: ['vue-i18n'],
      devDeps: ['@kit/i18n-tools'],
      scripts: ['i18n', 'i18n:dry'],
    },
    override: {
      label: 'Override',
    },
  },
};

const basePkg = {
  name: '{{project-name}}',
  version: '0.0.0',
  scripts: {
    dev: 'vite',
    i18n: 'i18n-tools scan',
    'i18n:dry': 'i18n-tools scan --dry',
  },
  dependencies: {
    vue: '^3.5.0',
    'vue-i18n': '^9.0.0',
  },
  devDependencies: {
    vite: '^5.0.0',
    '@kit/i18n-tools': '^1.0.0',
  },
};

function makeConfig(features: string[] = []): ProjectConfig {
  return {
    name: 'my-app',
    description: 'test',
    platform: 'web',
    features,
    params: {},
    outputDir: './my-app',
    packageManager: 'pnpm',
    initGit: false,
    installDeps: false,
  };
}

describe('deepMerge', () => {
  it('合并对象属性', () => {
    const result = deepMerge({ a: 1 }, { b: 2 });
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('标量后者覆盖前者', () => {
    const result = deepMerge({ a: 1 }, { a: 2 });
    expect(result.a).toBe(2);
  });

  it('数组去重合并', () => {
    const result = deepMerge({ arr: [1, 2] }, { arr: [2, 3] });
    expect(result.arr).toEqual([1, 2, 3]);
  });

  it('对象递归合并', () => {
    const result = deepMerge({ nested: { a: 1, b: 2 } }, { nested: { b: 3, c: 4 } });
    expect(result.nested).toEqual({ a: 1, b: 3, c: 4 });
  });
});

describe('sortDependencies', () => {
  it('对 dependencies 按字母排序', () => {
    const pkg = {
      dependencies: { z: '1', a: '2', m: '3' },
    };
    const result = sortDependencies(pkg);
    expect(Object.keys(result.dependencies)).toEqual(['a', 'm', 'z']);
  });
});

describe('patchPackageJson', () => {
  it('未选 i18n 时删除 vue-i18n 依赖', () => {
    const config = makeConfig([]); // 未选 i18n
    const result = patchPackageJson(basePkg, baseManifest, config);
    expect(result.dependencies['vue-i18n']).toBeUndefined();
    expect(result.dependencies['vue']).toBe('^3.5.0');
  });

  it('选了 i18n 时保留 vue-i18n 依赖', () => {
    const config = makeConfig(['i18n']);
    const result = patchPackageJson(basePkg, baseManifest, config);
    expect(result.dependencies['vue-i18n']).toBe('^9.0.0');
  });

  it('替换 {{project-name}} 占位符', () => {
    const config = makeConfig([]);
    const result = patchPackageJson(basePkg, baseManifest, config);
    expect(result.name).toBe('my-app');
  });

  it('未选 i18n 时删除 devDeps', () => {
    const result = patchPackageJson(basePkg, baseManifest, makeConfig([]));
    expect(result.devDependencies['@kit/i18n-tools']).toBeUndefined();
    expect(result.devDependencies['vite']).toBe('^5.0.0');
  });

  it('未选 i18n 时删除对应 scripts', () => {
    const result = patchPackageJson(basePkg, baseManifest, makeConfig([]));
    expect(result.scripts['i18n']).toBeUndefined();
    expect(result.scripts['i18n:dry']).toBeUndefined();
    expect(result.scripts['dev']).toBe('vite');
  });

  it('选了 i18n 时保留对应 scripts', () => {
    const result = patchPackageJson(basePkg, baseManifest, makeConfig(['i18n']));
    expect(result.scripts['i18n']).toBe('i18n-tools scan');
    expect(result.scripts['i18n:dry']).toBe('i18n-tools scan --dry');
  });

  it('scripts 字段缺失时裁剪不报错', () => {
    const pkgWithoutScripts = { name: 'x', dependencies: {} };
    expect(() => patchPackageJson(pkgWithoutScripts, baseManifest, makeConfig([]))).not.toThrow();
  });

  it('特性未声明 scripts 时不误删', () => {
    const result = patchPackageJson(basePkg, baseManifest, makeConfig(['i18n']));
    // override 特性未选中且未声明 scripts，不应影响任何脚本
    expect(Object.keys(result.scripts)).toEqual(['dev', 'i18n', 'i18n:dry']);
  });

  it('项目描述写进产物 description 字段', () => {
    const result = patchPackageJson(basePkg, baseManifest, makeConfig([]));
    expect(result.description).toBe('test');
  });

  it('描述为空时保留模板原值（模板可能有意自带一份）', () => {
    const pkgWithDesc = { ...basePkg, description: '模板自带描述' };
    const config = { ...makeConfig([]), description: '  ' };
    const result = patchPackageJson(pkgWithDesc, baseManifest, config);
    expect(result.description).toBe('模板自带描述');
  });

  it('removeScripts 无条件移除脚本（与选中特性无关）', () => {
    const pkg = { ...basePkg, scripts: { ...basePkg.scripts, 'check:template': 'tsx x.ts' } };
    const withRemove: TemplateConfig = { ...baseManifest, removeScripts: ['check:template'] };
    // 全选特性也照样移除
    const result = patchPackageJson(pkg, withRemove, makeConfig(['i18n', 'override']));
    expect(result.scripts['check:template']).toBeUndefined();
    expect(result.scripts['i18n']).toBe('i18n-tools scan');
  });

  it('removeScripts 指向不存在的脚本时不报错', () => {
    const withRemove: TemplateConfig = { ...baseManifest, removeScripts: ['nope'] };
    expect(() => patchPackageJson(basePkg, withRemove, makeConfig([]))).not.toThrow();
  });

  it('不修改原始 package.json', () => {
    const config = makeConfig([]);
    patchPackageJson(basePkg, baseManifest, config);
    expect(basePkg.name).toBe('{{project-name}}');
    expect(basePkg.dependencies['vue-i18n']).toBe('^9.0.0');
    expect(basePkg.scripts['i18n']).toBe('i18n-tools scan');
  });
});
