import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Composer } from '../src/core/composer';
import type { ProjectConfig, TemplateConfig } from '../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'template-pc');

const manifest: TemplateConfig = {
  id: 'template-pc',
  platform: 'web',
  compatibleCliVersions: '>=0.1.0',
  variables: {
    '{{project-name}}': '',
    '{{project-description}}': '',
  },
  features: {
    i18n: {
      label: '国际化',
      dirs: ['src/locale'],
      files: ['src/plugins/locale.ts'],
      deps: ['vue-i18n'],
    },
    override: {
      label: 'Override 定制层',
      dirs: ['src/plugins/override'],
    },
  },
  entryFiles: {
    'src/main.ts': 'buildMainTs',
  },
};

function makeConfig(features: string[] = []): ProjectConfig {
  return {
    name: 'my-app',
    description: 'my description',
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

describe('Composer', () => {
  const composer = new Composer();

  it('基础组合：_gitignore 重命名为 .gitignore', async () => {
    const files = await composer.compose(FIXTURE_DIR, manifest, makeConfig([]));
    const paths = files.map((f) => f.path);
    expect(paths).toContain('.gitignore');
    expect(paths).not.toContain('_gitignore');
  });

  it('不包含 .template/ 目录内的文件', async () => {
    const files = await composer.compose(FIXTURE_DIR, manifest, makeConfig([]));
    const hasDotTemplate = files.some((f) => f.path.startsWith('.template/'));
    expect(hasDotTemplate).toBe(false);
  });

  it('未选 i18n 时排除 src/locale 目录', async () => {
    const files = await composer.compose(FIXTURE_DIR, manifest, makeConfig([]));
    const hasMissing = files.some((f) => f.path.startsWith('src/locale/'));
    expect(hasMissing).toBe(false);
  });

  it('选了 i18n 时包含 src/locale 目录', async () => {
    const files = await composer.compose(FIXTURE_DIR, manifest, makeConfig(['i18n']));
    const hasLocale = files.some((f) => f.path.startsWith('src/locale/'));
    expect(hasLocale).toBe(true);
  });

  it('未选 i18n 时排除 src/plugins/locale.ts', async () => {
    const files = await composer.compose(FIXTURE_DIR, manifest, makeConfig([]));
    const paths = files.map((f) => f.path);
    expect(paths).not.toContain('src/plugins/locale.ts');
  });

  it('package.json 中 {{project-name}} 被替换', async () => {
    const files = await composer.compose(FIXTURE_DIR, manifest, makeConfig([]));
    const pkg = files.find((f) => f.path === 'package.json')!;
    expect(pkg).toBeDefined();
    const content = JSON.parse(pkg.content as string);
    expect(content.name).toBe('my-app');
  });

  it('package.json 未选 i18n 时 vue-i18n 被移除', async () => {
    const files = await composer.compose(FIXTURE_DIR, manifest, makeConfig([]));
    const pkg = files.find((f) => f.path === 'package.json')!;
    const content = JSON.parse(pkg.content as string);
    expect(content.dependencies?.['vue-i18n']).toBeUndefined();
  });

  it('entryFiles 文件由 builder 生成替换（选了 i18n）', async () => {
    const files = await composer.compose(FIXTURE_DIR, manifest, makeConfig(['i18n']));
    const mainTs = files.find((f) => f.path === 'src/main.ts')!;
    expect(mainTs).toBeDefined();
    // builder 生成结果应包含 setupLocale（因为选了 i18n）
    expect(mainTs.content as string).toContain('setupLocale');
  });

  it('entryFiles 文件在未选特性时跳过相关导入', async () => {
    const files = await composer.compose(FIXTURE_DIR, manifest, makeConfig([]));
    const mainTs = files.find((f) => f.path === 'src/main.ts')!;
    expect(mainTs).toBeDefined();
    // 未选 i18n，builder 生成结果不应包含 setupLocale
    expect(mainTs.content as string).not.toContain('setupLocale');
  });
});
