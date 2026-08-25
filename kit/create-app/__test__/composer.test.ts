import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Composer } from '../src/core/composer';
import { TemplateResolver } from '../src/core/resolver';
import type { FileList, ProjectConfig, TemplateConfig } from '../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'template-pc');
const MINI_DIR = path.join(__dirname, 'fixtures', 'template-mini');
const BROKEN_DIR = path.join(__dirname, 'fixtures', 'template-broken');

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
};

function makeConfig(features: string[] = [], templateId?: string): ProjectConfig {
  return {
    name: 'my-app',
    description: 'my description',
    platform: 'web',
    templateId,
    features,
    outputDir: './my-app',
    packageManager: 'pnpm',
    initGit: false,
    installDeps: false,
  };
}

/** 取文本文件内容（断言用） */
function text(files: FileList, filePath: string): string {
  const entry = files.find((f) => f.path === filePath);
  expect(entry, `未生成文件 ${filePath}`).toBeDefined();
  return entry!.content as string;
}

describe('Composer', () => {
  const composer = new Composer();

  it('点文件原样保留（模板直连拉取，无 _ → . 改名约定）', async () => {
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
    const content = JSON.parse(text(files, 'package.json')) as { name: string };
    expect(content.name).toBe('my-app');
  });

  it('package.json 未选 i18n 时 vue-i18n 被移除', async () => {
    const files = await composer.compose(FIXTURE_DIR, manifest, makeConfig([]));
    const content = JSON.parse(text(files, 'package.json')) as {
      dependencies?: Record<string, string>;
    };
    expect(content.dependencies?.['vue-i18n']).toBeUndefined();
  });

  it('入口文件原样进产物（entry-builders 机制已删除，入口不再被程序化重写）', async () => {
    const files = await composer.compose(FIXTURE_DIR, manifest, makeConfig(['i18n']));
    const onDisk = fs.readFileSync(path.join(FIXTURE_DIR, 'src/main.ts'), 'utf-8');
    expect(text(files, 'src/main.ts')).toBe(onDisk);
  });
});

describe('Composer 集成 - 协议 v0.2 最小模板（template-mini）', () => {
  const composer = new Composer();
  const resolver = new TemplateResolver();

  /** 走完整链路：本地路径 fetch → readConfig → compose */
  async function composeMini(features: string[]): Promise<FileList> {
    const dir = await resolver.fetch(MINI_DIR);
    const miniManifest = await resolver.readConfig(dir);
    return composer.compose(dir, miniManifest, makeConfig(features));
  }

  it('全选：保留全部特性目录与文件', async () => {
    const files = await composeMini(['i18n', 'qiankun', 'demoPages']);
    const paths = files.map((f) => f.path);
    expect(paths).toContain('src/locale/en.json');
    expect(paths).toContain('i18n.config.ts');
    expect(paths).toContain('src/micro/register.ts');
    expect(paths).toContain('docs/qiankun.md');
    expect(paths).toContain('src/views/demo/Index.vue');
  });

  it('全不选：排除全部特性目录与文件，但保留公共文件', async () => {
    const files = await composeMini([]);
    const paths = files.map((f) => f.path);
    expect(paths).not.toContain('src/locale/en.json');
    expect(paths).not.toContain('i18n.config.ts');
    expect(paths).not.toContain('src/micro/register.ts');
    expect(paths).not.toContain('docs/qiankun.md');
    expect(paths).not.toContain('src/views/demo/Index.vue');
    expect(paths).toContain('src/main.ts');
    expect(paths).toContain('.gitignore');
    expect(paths).toContain('README.md');
  });

  it('仅 i18n：只保留 i18n 的目录与文件', async () => {
    const files = await composeMini(['i18n']);
    const paths = files.map((f) => f.path);
    expect(paths).toContain('src/locale/en.json');
    expect(paths).toContain('i18n.config.ts');
    expect(paths).not.toContain('src/micro/register.ts');
    expect(paths).not.toContain('src/views/demo/Index.vue');
  });

  it('条件注释块：选中特性保留 if 段，标记行不残留', async () => {
    const files = await composeMini(['i18n']);
    const main = text(files, 'src/main.ts');
    expect(main).toContain('setupLocale(app);');
    expect(main).toContain("import { setupLocale } from './plugins/locale';");
    expect(main).not.toContain('#if');
    expect(main).not.toContain('#endif');
    expect(main).not.toContain('#else');
  });

  it('条件注释块：未选特性走 else 段', async () => {
    const files = await composeMini([]);
    const main = text(files, 'src/main.ts');
    expect(main).toContain("app.mount('#app');");
    expect(main).not.toContain('bootstrapApp');
    expect(main).not.toContain('setupLocale');
  });

  it('条件注释块：选中 qiankun 时走 if 段', async () => {
    const files = await composeMini(['qiankun']);
    const main = text(files, 'src/main.ts');
    expect(main).toContain('bootstrapApp');
    expect(main).not.toContain("app.mount('#app');");
  });

  it('条件注释块：HTML 风格与取反表达式在 .vue 中生效', async () => {
    const withI18n = text(await composeMini(['i18n']), 'src/app/App.vue');
    expect(withI18n).toContain('<LanguageSwitcher />');
    expect(withI18n).toContain('const standalone = true;');

    const withQiankun = text(await composeMini(['qiankun']), 'src/app/App.vue');
    expect(withQiankun).not.toContain('<LanguageSwitcher />');
    expect(withQiankun).not.toContain('const standalone = true;');
  });

  it('变量替换：{{project-name}} 与模板自定义变量都被替换', async () => {
    const files = await composeMini([]);
    const readme = text(files, 'README.md');
    expect(readme).toContain('my-app');
    expect(readme).toContain('Mini App');
    expect(readme).not.toContain('{{project-');
  });

  it('package.json：未选特性的 deps / devDeps / scripts 均被裁剪', async () => {
    const files = await composeMini(['i18n']);
    const pkg = JSON.parse(text(files, 'package.json')) as {
      name: string;
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.name).toBe('my-app');
    expect(pkg.dependencies['vue-i18n']).toBeDefined();
    expect(pkg.devDependencies['@kit/i18n-tools']).toBeDefined();
    expect(pkg.scripts['i18n']).toBeDefined();
    expect(pkg.dependencies['qiankun']).toBeUndefined();
    expect(pkg.devDependencies['vite-plugin-qiankun']).toBeUndefined();
    expect(pkg.scripts['build:micro']).toBeUndefined();
    expect(pkg.scripts['dev']).toBe('vite');
  });

  it('模板条件块语法错误时抛 E_TEMPLATE_SYNTAX，且带模板内相对路径与行号', async () => {
    const dir = await resolver.fetch(BROKEN_DIR);
    const brokenManifest = await resolver.readConfig(dir);
    try {
      await composer.compose(dir, brokenManifest, makeConfig(['i18n']));
      expect.unreachable('应当抛出 E_TEMPLATE_SYNTAX');
    } catch (err) {
      expect((err as { code: string }).code).toBe('E_TEMPLATE_SYNTAX');
      expect((err as Error).message).toContain('src/broken.ts:2');
    }
  });

  it('任何组合下产物中都不残留条件标记', async () => {
    for (const features of [[], ['i18n'], ['qiankun'], ['i18n', 'qiankun', 'demoPages']]) {
      const files = await composeMini(features);
      for (const file of files) {
        if (typeof file.content !== 'string') continue;
        expect(file.content, `${file.path} 残留条件标记`).not.toMatch(/#(if|else|endif)\b/);
      }
    }
  });

  describe('模板级 exclude（真源仓库的构建产物 / 生成文件）', () => {
    it('声明的路径不进产物，且与特性选择无关', async () => {
      const dir = await resolver.fetch(MINI_DIR);
      const mini = await resolver.readConfig(dir);
      const patched: TemplateConfig = { ...mini, exclude: ['README.md', 'docs'] };
      for (const features of [[], ['i18n', 'qiankun', 'demoPages']]) {
        const paths = (await composer.compose(dir, patched, makeConfig(features))).map(
          (f) => f.path,
        );
        expect(paths).not.toContain('README.md');
        expect(paths.some((p) => p.startsWith('docs/'))).toBe(false);
      }
    });

    it('前缀匹配按路径边界，不会误伤同名前缀', async () => {
      const dir = await resolver.fetch(MINI_DIR);
      const mini = await resolver.readConfig(dir);
      // 'src/loc' 不是 'src/locale' 的路径边界前缀，不应命中
      const patched: TemplateConfig = { ...mini, exclude: ['src/loc'] };
      const paths = (await composer.compose(dir, patched, makeConfig(['i18n']))).map((f) => f.path);
      expect(paths).toContain('src/locale/en.json');
    });

    it('未声明 exclude 时行为不变（字段可选）', async () => {
      const withField = await composeMini(['i18n']);
      const dir = await resolver.fetch(MINI_DIR);
      const mini = await resolver.readConfig(dir);
      const stripped: TemplateConfig = { ...mini, exclude: undefined };
      const without = await composer.compose(dir, stripped, makeConfig(['i18n']));
      expect(without.map((f) => f.path).sort()).toEqual(withField.map((f) => f.path).sort());
    });
  });

  describe('substitutions（真名 → 占位符）', () => {
    it('白名单内的真名被换成占位符，再由 variables 解析成最终值', async () => {
      const files = await composeMini([]);
      // mini fixture 里 package.json / README.md 写的是真名 mini-real-name
      expect(JSON.parse(text(files, 'package.json')).name).toBe('my-app');
      expect(text(files, 'README.md')).toContain('my-app');
    });

    it('产物中不残留模板真名', async () => {
      for (const features of [[], ['i18n'], ['i18n', 'qiankun', 'demoPages']]) {
        const files = await composeMini(features);
        for (const file of files) {
          if (typeof file.content !== 'string') continue;
          expect(file.content, `${file.path} 残留真名`).not.toContain('mini-real-name');
        }
      }
    });

    it('package.json 的替换发生在 JSON.parse 之前（否则真名会连同结构一起被解析）', async () => {
      const files = await composeMini(['i18n']);
      const pkg = JSON.parse(text(files, 'package.json')) as { name: string };
      expect(pkg.name).toBe('my-app');
    });

    it('非白名单文件不受影响', async () => {
      const dir = await resolver.fetch(MINI_DIR);
      const mini = await resolver.readConfig(dir);
      // 同一个真名同时出现在 README.md 与 package.json，但只把 README.md 列进白名单
      const patched: TemplateConfig = {
        ...mini,
        substitutions: [{ from: 'mini-real-name', to: 'REPLACED', files: ['README.md'] }],
      };
      const files = await composer.compose(dir, patched, makeConfig(['i18n']));
      expect(text(files, 'README.md')).toContain('REPLACED');
      expect(text(files, 'package.json')).toContain('mini-real-name');
    });

    it('白名单内零命中时抛 E_SUBSTITUTION_MISS', async () => {
      const dir = await resolver.fetch(MINI_DIR);
      const mini = await resolver.readConfig(dir);
      const patched: TemplateConfig = {
        ...mini,
        substitutions: [
          { from: '早就改掉的旧名', to: '{{project-name}}', files: ['package.json'] },
        ],
      };
      await expect(composer.compose(dir, patched, makeConfig([]))).rejects.toMatchObject({
        code: 'E_SUBSTITUTION_MISS',
      });
    });

    it('files 指向模板中不存在的路径时同样报错（失效路径）', async () => {
      const dir = await resolver.fetch(MINI_DIR);
      const mini = await resolver.readConfig(dir);
      const patched: TemplateConfig = {
        ...mini,
        substitutions: [{ from: 'x', to: 'y', files: ['no/such/file.ts'] }],
      };
      await expect(composer.compose(dir, patched, makeConfig([]))).rejects.toMatchObject({
        code: 'E_SUBSTITUTION_MISS',
      });
    });

    it('file 被未选特性整体裁掉时，零命中是合法的，不报错', async () => {
      const dir = await resolver.fetch(MINI_DIR);
      const mini = await resolver.readConfig(dir);
      const patched: TemplateConfig = {
        ...mini,
        substitutions: [
          ...(mini.substitutions ?? []),
          // i18n.config.ts 属于 i18n 特性，未选 i18n 时会被整体排除
          { from: 'i18n-tools', to: '{{project-name}}', files: ['i18n.config.ts'] },
        ],
      };
      await expect(composer.compose(dir, patched, makeConfig([]))).resolves.toBeDefined();
    });

    it('模板未声明 substitutions 时行为不变（字段可选）', async () => {
      const files = await composer.compose(FIXTURE_DIR, manifest, makeConfig([]));
      expect(files.length).toBeGreaterThan(0);
    });

    it('多文件白名单里只要有一个文件失配就报错（命中统计必须逐文件）', async () => {
      const dir = await resolver.fetch(MINI_DIR);
      const mini = await resolver.readConfig(dir);
      const patched: TemplateConfig = {
        ...mini,
        substitutions: [
          // package.json 里有 mini-real-name（命中），src/main.ts 里没有（失配）
          {
            from: 'mini-real-name',
            to: '{{project-name}}',
            files: ['package.json', 'src/main.ts'],
          },
        ],
      };
      await expect(composer.compose(dir, patched, makeConfig(['i18n']))).rejects.toMatchObject({
        code: 'E_SUBSTITUTION_MISS',
      });
    });

    it('报错信息点名具体失配的文件与 from 串（只报总数没法定位）', async () => {
      const dir = await resolver.fetch(MINI_DIR);
      const mini = await resolver.readConfig(dir);
      const patched: TemplateConfig = {
        ...mini,
        substitutions: [
          { from: 'mini-real-name', to: '{{project-name}}', files: ['package.json', 'README.md'] },
          { from: 'Mini App', to: '{{project-title}}', files: ['README.md', 'src/main.ts'] },
        ],
      };
      const err = await composer
        .compose(dir, patched, makeConfig(['i18n']))
        .then(() => null)
        .catch((e: unknown) => e as Error);
      expect(err).not.toBeNull();
      expect(err!.message).toContain('Mini App');
      expect(err!.message).toContain('src/main.ts');
      // 命中的那一条不该被点名
      expect(err!.message).not.toContain('mini-real-name');
    });
  });
});
