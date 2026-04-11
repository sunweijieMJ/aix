import { describe, it, expect } from 'vitest';
import { generateFiles, generateOverrideUtils } from '../src/generator';
import type { GenerateOptions } from '../src/types';

const baseOptions: GenerateOptions = {
  project: 'test',
  lang: 'ts',
  modules: ['constants', 'router', 'views'],
  output: 'src/overrides',
  yes: true,
  dryRun: false,
  force: false,
};

describe('generateFiles', () => {
  it('应生成基础设施文件（始终生成）', () => {
    const files = generateFiles(baseOptions);
    const paths = files.map((f) => f.path);

    expect(paths).toContain('types.ts');
    expect(paths).toContain('deployment.ts');
    expect(paths).toContain('index.ts');
    expect(paths).toContain('registry.ts');
  });

  it('应生成项目聚合入口', () => {
    const files = generateFiles(baseOptions);
    const paths = files.map((f) => f.path);

    expect(paths).toContain('test/index.ts');
  });

  it('应按选择生成模块文件', () => {
    const files = generateFiles(baseOptions);
    const paths = files.map((f) => f.path);

    expect(paths).toContain('test/constants/index.ts');
    expect(paths).toContain('test/router/index.ts');
    expect(paths).toContain('test/views/.gitkeep');

    // 未选择的模块不应生成
    expect(paths).not.toContain('test/api/index.ts');
    expect(paths).not.toContain('test/components/index.ts');
  });

  it('locale 模块应生成 index 文件（不生成 JSON 文件）', () => {
    const files = generateFiles({
      ...baseOptions,
      modules: ['constants', 'router', 'views', 'locale'],
    });
    const paths = files.map((f) => f.path);

    expect(paths).toContain('test/locale/index.ts');
    expect(paths).not.toContain('test/locale/zh-CN.json');
    expect(paths).not.toContain('test/locale/en-US.json');
  });

  it('JS 模式应生成 .js 文件', () => {
    const files = generateFiles({ ...baseOptions, lang: 'js' });
    const paths = files.map((f) => f.path);

    expect(paths).not.toContain('types.js');
    expect(paths).toContain('index.js');
    expect(paths).toContain('registry.js');
    expect(paths).toContain('test/index.js');
    expect(paths).toContain('test/constants/index.js');
  });

  it('聚合入口应只导入选中的模块', () => {
    const files = generateFiles(baseOptions);
    const projectIndex = files.find((f) => f.path === 'test/index.ts');

    expect(projectIndex).toBeDefined();
    expect(projectIndex!.content).toContain('getCustomRoutes');
    expect(projectIndex!.content).toContain('getCustomConstants');
    expect(projectIndex!.content).not.toContain('getCustomApiConfig');
    expect(projectIndex!.content).not.toContain('getCustomStoreModules');
  });

  it('模板中应包含项目代码', () => {
    const files = generateFiles({ ...baseOptions, project: 'myschool' });
    const router = files.find((f) => f.path === 'myschool/router/index.ts');

    expect(router).toBeDefined();
    expect(router!.content).toContain('myschool');
  });

  it('全模块选择应生成所有文件', () => {
    const allModules = generateFiles({
      ...baseOptions,
      modules: [
        'constants',
        'router',
        'views',
        'api',
        'components',
        'directives',
        'layout',
        'locale',
        'store',
      ],
    });
    const paths = allModules.map((f) => f.path);

    expect(paths).toContain('test/api/index.ts');
    expect(paths).toContain('test/components/index.ts');
    expect(paths).toContain('test/constants/index.ts');
    expect(paths).toContain('test/directives/index.ts');
    expect(paths).toContain('test/layout/index.ts');
    expect(paths).toContain('test/locale/index.ts');
    expect(paths).toContain('test/router/index.ts');
    expect(paths).toContain('test/store/index.ts');
    expect(paths).toContain('test/views/.gitkeep');
  });

  it('生成的文件内容不应有连续 3 行空行', () => {
    const files = generateFiles({
      ...baseOptions,
      modules: [
        'constants',
        'router',
        'views',
        'api',
        'components',
        'directives',
        'layout',
        'locale',
        'store',
      ],
    });

    for (const file of files) {
      if (file.content && file.content.length > 0) {
        expect(file.content, `文件 ${file.path} 有连续空行`).not.toMatch(/\n{3,}/);
      }
    }
  });

  it('registry.ts 应包含 import.meta.glob', () => {
    const files = generateFiles(baseOptions);
    const registry = files.find((f) => f.path === 'registry.ts');
    expect(registry!.content).toContain('import.meta.glob');
  });

  it('types.ts 应包含 OverrideConfig 接口定义', () => {
    const files = generateFiles(baseOptions);
    const types = files.find((f) => f.path === 'types.ts');
    expect(types!.content).toContain('OverrideConfig');
    expect(types!.content).toContain('RuntimeOverrideConfig');
  });

  it('index.ts 应包含 loadSchoolConfig 调用', () => {
    const files = generateFiles(baseOptions);
    const index = files.find((f) => f.path === 'index.ts');
    expect(index!.content).toContain('loadSchoolConfig');
    expect(index!.content).toContain('customRoutes');
    expect(index!.content).toContain('customConstants');
  });
});

describe('generateOverrideUtils', () => {
  it('TS 模式应返回所有工具文件', () => {
    const files = generateOverrideUtils('ts');
    const paths = files.map((f) => f.path);

    expect(paths).toContain('index.ts');
    expect(paths).toContain('override-router.ts');
    expect(paths).toContain('override-component.ts');
    expect(paths).toContain('override-constants.ts');
    expect(paths).toContain('override-store.ts');
    expect(paths).toContain('override-api.ts');
    expect(paths).toContain('override-directives.ts');
    expect(paths).toContain('override-layout.ts');
    expect(files).toHaveLength(8);
  });

  it('JS 模式应返回 .js 扩展名的工具文件', () => {
    const files = generateOverrideUtils('js');
    const paths = files.map((f) => f.path);

    expect(paths).toContain('index.js');
    expect(paths).toContain('override-router.js');
    expect(paths).toContain('override-constants.js');
    expect(files).toHaveLength(8);
  });

  it('index.ts 应导出 initOverrides 及各管理器', () => {
    const files = generateOverrideUtils('ts');
    const index = files.find((f) => f.path === 'index.ts');

    expect(index!.content).toContain('initOverrides');
    expect(index!.content).toContain('routerManager');
    expect(index!.content).toContain('componentManager');
    expect(index!.content).toContain('mergeConstants');
  });

  it('override-router.ts 应导出 routerManager 和 CustomRouteConfig', () => {
    const files = generateOverrideUtils('ts');
    const router = files.find((f) => f.path === 'override-router.ts');

    expect(router!.content).toContain('routerManager');
    expect(router!.content).toContain('CustomRouteConfig');
    expect(router!.content).toContain('applyOverrides');
    expect(router!.content).toContain('addCustomRoutes');
  });

  it('override-constants.ts 应导出 mergeConstants 函数', () => {
    const files = generateOverrideUtils('ts');
    const constants = files.find((f) => f.path === 'override-constants.ts');

    expect(constants!.content).toContain('mergeConstants');
  });

  it('生成的工具文件内容不应有连续 3 行空行', () => {
    const files = generateOverrideUtils('ts');

    for (const file of files) {
      if (file.content && file.content.length > 0) {
        expect(file.content, `文件 ${file.path} 有连续空行`).not.toMatch(/\n{3,}/);
      }
    }
  });
});
