import { describe, expect, it } from 'vitest';
import {
  checkPageLayout,
  checkReadmeLayout,
  type PageLayoutInput,
  type ReadmeLayoutInput,
} from '../docs/page-layout';

const PAGE = `---
title: Demo 演示
outline: deep
---

# Demo 演示

一句话说明这是什么。

## 何时使用

- 场景一

## 安装

\`\`\`bash
pnpm add @aix/demo
\`\`\`

\`\`\`ts
import '@aix/demo/style';
\`\`\`

## 代码演示

### 基础用法

<div class="demo-block">
  <Demo />
</div>

### 进阶用法

说明。

### 再来一个

说明。

## API

表格。
`;

function input(overrides: Partial<PageLayoutInput> = {}): PageLayoutInput {
  return {
    dirName: 'demo',
    content: PAGE,
    hasStyleExport: true,
    needsThemeStyle: false,
    customizableVars: [],
    localeEntryCount: 0,
    hasRenderableTypes: false,
    ...overrides,
  };
}

/** 把页面里某段标题换个名字，用来构造缺段 / 乱序的场景 */
function rename(content: string, from: string, to: string): string {
  return content.replace(`## ${from}`, `## ${to}`);
}

describe('checkPageLayout', () => {
  it('合规页面零问题', () => {
    expect(checkPageLayout(input())).toEqual([]);
  });

  it('frontmatter 缺 title 或 outline 都会报', () => {
    const issues = checkPageLayout(input({ content: PAGE.replace('title: Demo 演示\n', '') }));
    expect(issues.some((i) => i.includes('缺 title'))).toBe(true);

    const noOutline = checkPageLayout(input({ content: PAGE.replace('outline: deep\n', '') }));
    expect(noOutline.some((i) => i.includes('outline: deep'))).toBe(true);
  });

  it('缺 H1、H1 与 title 不一致、H1 下没有定位句都会报', () => {
    expect(checkPageLayout(input({ content: PAGE.replace('# Demo 演示\n\n', '') }))).toContainEqual(
      expect.stringContaining('缺 H1 标题'),
    );

    const mismatched = checkPageLayout(input({ content: PAGE.replace('# Demo 演示', '# Demo') }));
    expect(mismatched.some((i) => i.includes('不一致'))).toBe(true);

    const noLead = checkPageLayout(
      input({ content: PAGE.replace('一句话说明这是什么。\n\n', '') }),
    );
    expect(noLead.some((i) => i.includes('缺一句定位说明'))).toBe(true);
  });

  it('用 ## 特性 代替 ## 何时使用会同时报两条', () => {
    const issues = checkPageLayout(input({ content: rename(PAGE, '何时使用', '特性') }));
    expect(issues.some((i) => i.includes('用了 ## 特性'))).toBe(true);
    expect(issues.some((i) => i.includes('缺 ## 何时使用'))).toBe(true);
  });

  it('代码演示不足三节或没有活演示会报', () => {
    const twoSections = PAGE.replace('### 再来一个\n\n说明。\n\n', '');
    expect(checkPageLayout(input({ content: twoSections }))).toContainEqual(
      expect.stringContaining('只有 2 个小节'),
    );

    const noDemo = PAGE.replace('<div class="demo-block">\n  <Demo />\n</div>', '说明。');
    expect(checkPageLayout(input({ content: noDemo }))).toContainEqual(
      expect.stringContaining('一个活演示都没有'),
    );
  });

  it('带包级修饰类的 demo-block 算活演示', () => {
    const content = PAGE.replace('class="demo-block"', 'class="demo-block demo-menu"');
    expect(checkPageLayout(input({ content }))).toEqual([]);
  });

  it('安装段的样式引入要与包的真实依赖一致', () => {
    const noStyleExport = checkPageLayout(input({ hasStyleExport: false }));
    expect(noStyleExport).toContainEqual(expect.stringContaining('包没有 ./style 导出'));

    const needsTheme = checkPageLayout(input({ needsThemeStyle: true }));
    expect(needsTheme).toContainEqual(expect.stringContaining("没写 import '@aix/theme/style'"));

    const extraTheme = PAGE.replace(
      "import '@aix/demo/style';",
      "import '@aix/demo/style';\nimport '@aix/theme/style';",
    );
    expect(checkPageLayout(input({ content: extraTheme }))).toContainEqual(
      expect.stringContaining('都不消费主题 token'),
    );
  });

  it('有可覆盖变量就必须有主题变量段，且表要列全', () => {
    const missingSection = checkPageLayout(input({ customizableVars: ['--aix-demo-bg'] }));
    expect(missingSection).toContainEqual(expect.stringContaining('缺 ## 主题变量定制'));

    const withSection = PAGE.replace(
      '## API',
      '## 主题变量定制\n\n| 变量 | 说明 |\n|------|------|\n| `--aix-demo-bg` | 背景 |\n\n## API',
    );
    expect(
      checkPageLayout(input({ content: withSection, customizableVars: ['--aix-demo-bg'] })),
    ).toEqual([]);
    expect(
      checkPageLayout(
        input({ content: withSection, customizableVars: ['--aix-demo-bg', '--aix-demo-fg'] }),
      ),
    ).toContainEqual(expect.stringContaining('漏了 1/2 个'));
  });

  it('文案多于两条才要求单开多语言段', () => {
    expect(checkPageLayout(input({ localeEntryCount: 2 }))).toEqual([]);
    expect(checkPageLayout(input({ localeEntryCount: 3 }))).toContainEqual(
      expect.stringContaining('缺 ## 多语言'),
    );
  });

  it('有可渲染类型就必须有类型定义段', () => {
    expect(checkPageLayout(input({ hasRenderableTypes: true }))).toContainEqual(
      expect.stringContaining('缺 ## 类型定义'),
    );
  });

  it('段序颠倒会被抓出来', () => {
    const swapped = PAGE.replace(
      '## API\n\n表格。\n',
      '## 类型定义\n\n类型。\n\n## API\n\n表格。\n',
    );
    expect(checkPageLayout(input({ content: swapped, hasRenderableTypes: true }))).toContainEqual(
      expect.stringContaining('段序错'),
    );
  });

  it('补充段排在 API 之前会被抓出来', () => {
    const early = PAGE.replace('## API', '## 支持的格式\n\n表。\n\n## API');
    expect(checkPageLayout(input({ content: early }))).toContainEqual(
      expect.stringContaining('补充段要排在 API / 类型定义 之后'),
    );
  });

  it('围栏代码块里的 ## 行不算标题', () => {
    const fenced = PAGE.replace('表格。', '```md\n## 类型定义\n```');
    expect(checkPageLayout(input({ content: fenced }))).toEqual([]);
  });
});

const README = `# @aix/demo

一句话说明这个包是什么。

## 特性

- 甲

## 安装

\`\`\`bash
pnpm add @aix/demo
\`\`\`

## 快速开始

例子。

## 进阶用法

补充说明。

## API

表格。

## 类型定义

类型。
`;

function readme(overrides: Partial<ReadmeLayoutInput> = {}): ReadmeLayoutInput {
  return {
    dirName: 'demo',
    content: README,
    packageName: '@aix/demo',
    requireApi: true,
    ...overrides,
  };
}

describe('checkReadmeLayout', () => {
  it('合规 README 零问题', () => {
    expect(checkReadmeLayout(readme())).toEqual([]);
  });

  it('H1 要和包名一致，且下面要有定位句', () => {
    expect(checkReadmeLayout(readme({ packageName: '@aix/other' }))).toContainEqual(
      expect.stringContaining('与包名'),
    );
    const noLead = README.replace('一句话说明这个包是什么。\n\n', '');
    expect(checkReadmeLayout(readme({ content: noLead }))).toContainEqual(
      expect.stringContaining('缺一句定位说明'),
    );
  });

  it('开头三段缺失或乱序都会报', () => {
    const noFeature = README.replace('## 特性\n\n- 甲\n\n', '');
    expect(checkReadmeLayout(readme({ content: noFeature }))).toContainEqual(
      expect.stringContaining('缺 ## 特性'),
    );

    const renamed = README.replace('## 快速开始', '## 使用');
    expect(checkReadmeLayout(readme({ content: renamed }))).toContainEqual(
      expect.stringContaining('缺 ## 快速开始'),
    );

    const swapped = README.replace('## 特性\n\n- 甲\n\n## 安装', '## 安装\n\n装。\n\n## 特性');
    expect(checkReadmeLayout(readme({ content: swapped })).join()).toContain('开头三段要按');
  });

  it('补充段排在 API 之前是允许的', () => {
    expect(checkReadmeLayout(readme())).toEqual([]);
  });

  it('类型定义必须紧跟 API', () => {
    const detached = README.replace(
      '## API\n\n表格。\n\n## 类型定义',
      '## API\n\n表格。\n\n## 工具函数\n\n函数。\n\n## 类型定义',
    );
    expect(checkReadmeLayout(readme({ content: detached }))).toContainEqual(
      expect.stringContaining('紧跟在 ## API 之后'),
    );
  });

  it('不产出组件 API 的包不要求 API 段', () => {
    const noApi = README.replace('## API\n\n表格。\n\n## 类型定义\n\n类型。\n', '');
    expect(checkReadmeLayout(readme({ content: noApi }))).toContainEqual(
      expect.stringContaining('缺 ## API'),
    );
    expect(checkReadmeLayout(readme({ content: noApi, requireApi: false }))).toEqual([]);
  });

  it('`## API 参考` 这种带后缀的标题也算 API 段', () => {
    const suffixed = README.replace('## API\n', '## API 参考\n');
    expect(checkReadmeLayout(readme({ content: suffixed }))).toEqual([]);
  });
});
