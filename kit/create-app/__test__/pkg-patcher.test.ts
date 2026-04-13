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
      deps: ['vue-i18n'],
    },
    override: {
      label: 'Override',
    },
  },
  entryFiles: {},
};

const basePkg = {
  name: '{{project-name}}',
  version: '0.0.0',
  dependencies: {
    vue: '^3.5.0',
    'vue-i18n': '^9.0.0',
  },
  devDependencies: {
    vite: '^5.0.0',
  },
};

function makeConfig(features: string[] = []): ProjectConfig {
  return {
    name: 'my-app',
    description: 'test',
    platform: 'web',
    qiankunMode: 'none',
    features: features as ProjectConfig['features'],
    deps: { ui: 'none', css: 'scss', http: 'axios', icons: 'none' },
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

  it('不修改原始 package.json', () => {
    const config = makeConfig([]);
    patchPackageJson(basePkg, baseManifest, config);
    expect(basePkg.name).toBe('{{project-name}}');
    expect(basePkg.dependencies['vue-i18n']).toBe('^9.0.0');
  });
});
