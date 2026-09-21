import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';
import type { Exemptions } from '../docs/exemptions';
import { generateDocs } from '../docs/generate';

const fixtureRepo = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/repo');
const created: string[] = [];

async function copyRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aix-docs-repo-'));
  created.push(dir);
  await fs.cp(fixtureRepo, dir, { recursive: true });
  return dir;
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

const exemptions: Exemptions = {
  nonComponentPackages: new Set(['plain']),
  handwrittenApiPackages: new Set(),
  componentDocPending: new Set(['external']),
  externalPropsComponents: new Map([
    ['external/src/ExternalNode.vue', 'Props 由上游注入，业务侧不直接传。'],
  ]),
  internalCssVars: new Map(),
};

const read = (root: string, file: string) => fs.readFile(path.join(root, file), 'utf-8');

describe('generateDocs', () => {
  it('README 与文档页的 API 段都由源码渲染，文档页带横幅', async () => {
    const root = await copyRepo();
    const report = await generateDocs({ root, exemptions });

    const readme = await read(root, 'packages/demo/README.md');
    expect(readme).toContain('## API\n\n**DemoCard** — 演示卡片');
    expect(readme).toContain("| `size` | `'sm' \\| 'lg'` | `'sm'` | - | 尺寸 |");
    expect(readme).toContain('| `select` | `item: DemoItem` | 选中条目 |');
    expect(readme).toContain('| `focus` | `() => void` | 聚焦标题 |');
    expect(readme).not.toContain('由 docs:gen 生成');

    const page = await read(root, 'docs/components/demo.md');
    expect(page).toContain('## API\n\n::: warning 自动生成的 API 文档');
    expect(page).toContain('### Props');
    expect(page).toContain('## 何时使用\n\n演示。');

    expect(report.readmeCount).toBe(2);
    expect(report.docCount).toBe(2);
  });

  it('已有 ## 类型定义 段的文件由 src/types.ts 的导出重写，位置不变', async () => {
    const root = await copyRepo();
    await generateDocs({ root, exemptions });

    const readme = await read(root, 'packages/demo/README.md');
    expect(readme).not.toContain('手写的旧内容');
    expect(readme).toContain(
      "## 类型定义\n\n```typescript\n/** 尺寸档位 */\nexport type DemoSize = 'sm' | 'lg';\n\n/** 卡片条目 */\nexport interface DemoItem {",
    );
    expect(readme).not.toContain('export interface DemoCardProps');
    expect(readme.indexOf('## API')).toBeLessThan(readme.indexOf('## 类型定义'));

    const page = await read(root, 'docs/components/demo.md');
    expect(page).toContain('## 类型定义\n\n::: warning 自动生成的 API 文档');
    expect(page.indexOf('## 类型定义')).toBeLessThan(page.indexOf('## API'));
  });

  it('没有 ## 类型定义 段的文件不会被追加该段', async () => {
    const root = await copyRepo();
    await generateDocs({ root, exemptions });
    expect(await read(root, 'packages/external/README.md')).not.toContain('## 类型定义');
  });

  it('有 ## 类型定义 段却没有可渲染类型时记失败', async () => {
    const root = await copyRepo();
    const readmePath = path.join(root, 'packages/external/README.md');
    await fs.appendFile(readmePath, '\n## 类型定义\n\n旧内容。\n');
    const report = await generateDocs({ root, exemptions });
    expect(report.failures).toContainEqual(
      expect.stringContaining('external/README.md 有 ## 类型定义 段'),
    );
  });

  it('无组件源码的包把 README 手写 API 表同步进文档页并标注来源', async () => {
    const root = await copyRepo();
    await generateDocs({ root, exemptions });
    const page = await read(root, 'docs/components/plain.md');
    expect(page).toContain('::: tip API 来源');
    expect(page).toContain('| `foo` | 手写表 |');
    expect(page).not.toContain('## 其他');
  });

  it('连跑两次结果一致', async () => {
    const root = await copyRepo();
    await generateDocs({ root, exemptions });
    const first = await Promise.all([
      read(root, 'packages/demo/README.md'),
      read(root, 'docs/components/demo.md'),
      read(root, 'docs/components/plain.md'),
    ]);
    await generateDocs({ root, exemptions });
    const second = await Promise.all([
      read(root, 'packages/demo/README.md'),
      read(root, 'docs/components/demo.md'),
      read(root, 'docs/components/plain.md'),
    ]);
    expect(second).toEqual(first);
  });

  it('登记为文档待写的包缺文档页算跳过，未登记的算失败', async () => {
    const root = await copyRepo();
    const pending = await generateDocs({ root, exemptions });
    expect(pending.skipCount).toBe(1);
    expect(pending.failures.some((f) => f.startsWith('external：缺'))).toBe(false);

    const strict = await generateDocs({
      root,
      exemptions: { ...exemptions, componentDocPending: new Set() },
    });
    expect(strict.failures).toContainEqual(
      expect.stringContaining('external：缺 docs/components/external.md'),
    );
  });

  it('登记为文档待写的包已有文档页时记失败', async () => {
    const root = await copyRepo();
    const report = await generateDocs({
      root,
      exemptions: { ...exemptions, componentDocPending: new Set(['demo']) },
    });
    expect(report.failures).toContainEqual(expect.stringContaining('COMPONENT_DOC_PENDING 移除'));
  });

  it('解析失败的包只进失败清单，README 不动', async () => {
    const root = await copyRepo();
    const before = await read(root, 'packages/orphan/README.md');
    const report = await generateDocs({ root, exemptions });
    expect(report.failures).toContainEqual(expect.stringContaining('orphan：'));
    expect(await read(root, 'packages/orphan/README.md')).toBe(before);
  });

  it('文档页、sidebar、组件总览三处登记不一致时记失败', async () => {
    const root = await copyRepo();
    const configPath = path.join(root, 'docs/.vitepress/config.ts');
    await fs.writeFile(
      configPath,
      (await fs.readFile(configPath, 'utf-8')).replace(
        "{ text: 'Plain', link: '/components/plain' },",
        '',
      ),
    );
    await fs.writeFile(path.join(root, 'docs/components/ghost.md'), '# Ghost\n');
    const indexPath = path.join(root, 'docs/components/index.md');
    await fs.appendFile(indexPath, '| [Gone](/components/gone) | 已删 |\n');

    const { failures } = await generateDocs({ root, exemptions });
    expect(failures).toContainEqual(expect.stringContaining('plain.md 未挂进'));
    expect(failures).toContainEqual(expect.stringContaining('ghost.md 未挂进'));
    expect(failures).toContainEqual(expect.stringContaining('ghost.md 未列进'));
    expect(failures).toContainEqual(expect.stringContaining('/components/gone 没有对应文档页'));
  });

  it('三处登记一致时没有站点登记失败', async () => {
    const root = await copyRepo();
    const { failures } = await generateDocs({ root, exemptions });
    expect(failures.filter((f) => f.startsWith('站点登记'))).toEqual([]);
  });

  it('说明里写了字面量默认值、默认值列却为空的 prop 进 warnings，不算失败', async () => {
    const root = await copyRepo();
    const report = await generateDocs({ root, exemptions });
    expect(report.warnings).toEqual([
      expect.stringContaining('demo/DemoCard.columns：说明里写了默认值'),
    ]);
    expect(report.failures.some((f) => f.includes('columns'))).toBe(false);
  });
});
