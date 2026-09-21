import fs from 'fs/promises';
import path from 'path';
import type { ApiPackage } from './api-model';
import { renderApiBody, renderApiSection, renderTypesBody } from './api-markdown';
import { DEFAULT_EXEMPTIONS, docPageOptional, type Exemptions } from './exemptions';
import {
  API_HEADING_RE,
  TYPES_HEADING_RE,
  extractSection,
  replaceSection,
  stripHeading,
} from './markdown-sections';
import {
  checkIconCategoryCounts,
  checkPageLayout,
  checkReadmeLayout,
  collectPageLayoutInputs,
  collectReadmeLayoutInputs,
} from './page-layout';
import { collectPackageApis } from './pipeline';
import { checkSiteRegistry } from './site-registry';

/**
 * 组件文档生成：解析各包入口导出的组件源码，把 `## API` 段同时写进包 README
 * 与 `docs/components/<pkg>.md`；两处已有 `## 类型定义` 段的，也由 `src/types.ts` 的导出重写。
 * 解析结果只存在内存里，不落中间文件。
 *
 * 没有组件源码的包（如 icons），文档页的 API 段退回抽取 README 里的手写表格。
 * 最后校验文档页、sidebar、组件总览三处登记一致。
 */

export interface GenerateOptions {
  /** 仓库根，默认当前工作目录 */
  root?: string;
  exemptions?: Exemptions;
  /** 进度输出，默认不输出 */
  log?: (line: string) => void;
}

export interface GenerateReport {
  readmeCount: number;
  docCount: number;
  skipCount: number;
  failures: string[];
  /** 不阻断生成的源码 JSDoc 提示 */
  warnings: string[];
}

/**
 * 说明文字里「默认 X」且 X 是一个完整字面量（后面紧跟标点或结尾）的写法；
 * `默认 3000ms 阈值` 这类带单位的量词不算
 */
const DEFAULT_IN_PROSE_RE =
  /默认\s*[`'"]?(?:true|false|null|-?\d+(?:\.\d+)?|\[[^\]]*\]|'[^']*')[`'"]?\s*(?:$|[。；;，,、）)]|<br>)/;

/** 括号里的内容多是子选项的说明，不参与判断 */
const PARENTHESIZED_RE = /（[^（）]*）|\([^()]*\)/g;

/** 由源码生成的段落在文档页上的横幅 */
const GENERATED_BANNER = `::: warning 自动生成的 API 文档
以下内容由 \`pnpm docs:gen\` 从组件源码生成，请勿手动编辑。

需要修改时：改组件源码里的类型声明与 JSDoc，然后运行 \`pnpm docs:gen\`。
:::`;

/** API 段只能从 README 手写表格同步时的横幅 */
function syncedBanner(packageName: string): string {
  return `::: tip API 来源
以下内容同步自 \`packages/${packageName}/README.md\` 的 API 段。该包没有可解析的组件源码，API 表由人工维护；修改请改 README，再运行 \`pnpm docs:gen\`。
:::`;
}

export async function generateDocs(options: GenerateOptions = {}): Promise<GenerateReport> {
  const root = path.resolve(options.root ?? process.cwd());
  const exemptions = options.exemptions ?? DEFAULT_EXEMPTIONS;
  const log = options.log ?? (() => {});

  const collected = await collectPackageApis({ root, exemptions });
  const report: GenerateReport = {
    readmeCount: 0,
    docCount: 0,
    skipCount: 0,
    failures: collected.failures.map((f) => `${f.dirName}：${f.message}`),
    warnings: collected.packages.flatMap(({ dirName, api }) => jsDocWarnings(dirName, api)),
  };
  const docPath = (dirName: string) => path.join(root, 'docs/components', `${dirName}.md`);

  // 有组件源码的包：README 与文档页都由内存里的解析结果渲染
  for (const { dirName, packageDir, api } of collected.packages) {
    try {
      log(`📝 ${dirName}：${api.components.map((c) => c.name).join(', ')}`);

      const readmePath = path.join(packageDir, 'README.md');
      if (!(await exists(readmePath))) {
        report.failures.push(`${dirName}：缺 README.md，API 段无处可写`);
        continue;
      }
      const readme = replaceSection(
        await fs.readFile(readmePath, 'utf-8'),
        API_HEADING_RE,
        renderApiSection(api),
      );
      await fs.writeFile(readmePath, applyTypesSection(readme, api, `${dirName}/README.md`));
      report.readmeCount++;

      const pagePath = docPath(dirName);
      if (!(await exists(pagePath))) {
        if (docPageOptional(exemptions, dirName)) report.skipCount++;
        else report.failures.push(missingDocMessage(dirName));
        continue;
      }
      if (exemptions.componentDocPending.has(dirName)) {
        report.failures.push(pendingButPresentMessage(dirName));
      }
      const page = replaceSection(
        await fs.readFile(pagePath, 'utf-8'),
        API_HEADING_RE,
        `## API\n\n${GENERATED_BANNER}\n\n${renderApiBody(api)}`,
      );
      await fs.writeFile(
        pagePath,
        applyTypesSection(page, api, `docs/components/${dirName}.md`, GENERATED_BANNER),
      );
      report.docCount++;
      log(`✅ docs/components/${dirName}.md：API 段已注入`);
    } catch (error: any) {
      report.failures.push(`${dirName}：${error.message}`);
    }
  }

  // 没有组件源码的包：文档页 API 段同步 README 里的手写表格
  for (const dirName of collected.withoutComponents) {
    try {
      const readmePath = path.join(root, 'packages', dirName, 'README.md');
      if (!(await exists(readmePath))) {
        report.failures.push(`${dirName}：缺 README.md，无处读取手写的 API 段`);
        continue;
      }

      const pagePath = docPath(dirName);
      if (!(await exists(pagePath))) {
        if (docPageOptional(exemptions, dirName)) report.skipCount++;
        else report.failures.push(missingDocMessage(dirName));
        continue;
      }
      if (exemptions.componentDocPending.has(dirName)) {
        report.failures.push(pendingButPresentMessage(dirName));
      }
      const readmeSection = extractSection(await fs.readFile(readmePath, 'utf-8'), API_HEADING_RE);
      if (!readmeSection) {
        report.failures.push(
          `${dirName}：没有可解析的组件源码，README.md 里也找不到 API 段` +
            `（需要一个以 "## API" 开头的二级标题）`,
        );
        continue;
      }

      const section = `## API\n\n${syncedBanner(dirName)}\n\n${stripHeading(readmeSection)}\n`;
      const page = await fs.readFile(pagePath, 'utf-8');
      await fs.writeFile(pagePath, replaceSection(page, API_HEADING_RE, section));
      report.docCount++;
      log(`✅ docs/components/${dirName}.md：API 段已注入`);
    } catch (error: any) {
      report.failures.push(`${dirName}：${error.message}`);
    }
  }

  report.failures.push(...(await checkSiteRegistry(root)));
  report.failures.push(...(await checkPageLayouts(root, collected.packages, exemptions)));
  return report;
}

/**
 * 骨架校验：文档页（段落齐全与顺序、条件必备段、安装说明与包依赖是否一致）、
 * 包 README，以及 icons 那张手写的分类数量表
 */
async function checkPageLayouts(
  root: string,
  packages: Array<{ dirName: string; api: ApiPackage }>,
  exemptions: Exemptions,
): Promise<string[]> {
  const apis = new Map(packages.map(({ dirName, api }) => [dirName, api]));
  const inputs = await collectPageLayoutInputs(root, apis, exemptions);
  const issues = inputs.flatMap((input) => checkPageLayout(input));
  for (const readme of await collectReadmeLayoutInputs(root, exemptions)) {
    issues.push(...checkReadmeLayout(readme));
  }
  issues.push(...(await checkIconCategoryCounts(root)));
  return issues;
}

/**
 * 文件里已有 `## 类型定义` 段时，用 `src/types.ts` 的导出重写它；没有该段则原样返回。
 * 有段却没有可渲染的类型时抛错，不能留一段空壳。
 */
function applyTypesSection(
  content: string,
  api: ApiPackage,
  fileLabel: string,
  banner?: string,
): string {
  if (extractSection(content, TYPES_HEADING_RE) === null) return content;

  const body = renderTypesBody(api);
  if (!body) {
    throw new Error(
      `${fileLabel} 有 ## 类型定义 段，但 src/types.ts 没有可渲染的导出类型` +
        `（组件 Props / Emits / Slots / Expose 接口已在 API 表里）。请删掉该段，或把公开类型放进 src/types.ts`,
    );
  }
  const section = banner ? `## 类型定义\n\n${banner}\n\n${body}` : `## 类型定义\n\n${body}`;
  return replaceSection(content, TYPES_HEADING_RE, section);
}

/**
 * 说明里写了「默认 40」这类字面量、默认值列却是空的 prop：默认值多半落在子组件或 composable 的
 * `??` 兜底里，withDefaults 拿不到，需要在 JSDoc 补 `@default` 标签
 */
function jsDocWarnings(dirName: string, api: ApiPackage): string[] {
  const warnings: string[] = [];
  for (const component of api.components) {
    for (const prop of component.props) {
      if (prop.required || prop.defaultValue) continue;
      if (!DEFAULT_IN_PROSE_RE.test(prop.description.replace(PARENTHESIZED_RE, ''))) continue;
      warnings.push(
        `${dirName}/${component.name}.${prop.name}：说明里写了默认值，默认值列却为空，请补 @default 标签`,
      );
    }
  }
  return warnings;
}

function pendingButPresentMessage(dirName: string): string {
  return `${dirName}：docs/components/${dirName}.md 已存在，请从 exemptions.ts 的 COMPONENT_DOC_PENDING 移除`;
}

function missingDocMessage(dirName: string): string {
  return (
    `${dirName}：缺 docs/components/${dirName}.md。` +
    `请补写该文档，或把包名登记进 exemptions.ts 的 COMPONENT_DOC_PENDING`
  );
}

async function exists(filePath: string): Promise<boolean> {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}
