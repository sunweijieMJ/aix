import { describe, it, expect } from 'vitest';
import { generateFiles } from '../src/generator';
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

  it('locale 模块应额外生成 JSON 文件', () => {
    const files = generateFiles({
      ...baseOptions,
      modules: ['constants', 'router', 'views', 'locale'],
    });
    const paths = files.map((f) => f.path);

    expect(paths).toContain('test/locale/index.ts');
    expect(paths).toContain('test/locale/zh-CN.json');
    expect(paths).toContain('test/locale/en-US.json');
  });

  it('JS 模式应生成 .js 文件', () => {
    const files = generateFiles({ ...baseOptions, lang: 'js' });
    const paths = files.map((f) => f.path);

    expect(paths).toContain('types.js');
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
});
