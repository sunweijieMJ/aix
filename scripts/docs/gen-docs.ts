import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { renderApiBody, renderApiSection } from './api-markdown';
import { API_HEADING_RE, extractSection, replaceSection, stripHeading } from './markdown-sections';
import { collectPackageApis } from './pipeline';

/**
 * 组件 API 文档生成：解析各包入口导出的组件源码，把 `## API` 段同时写进包 README
 * 与 `docs/components/<pkg>.md`。解析结果只存在内存里，不落中间文件。
 *
 * 没有组件源码的包（如 icons），文档页的 API 段退回抽取 README 里的手写表格。
 */

/**
 * 已知没有 docs/components/<name>.md 的包，跳过它们不算失败。
 *
 * 分两类：
 * - hooks / theme 不是组件，本就不该有组件文档页；
 * - ai-chat / audio / flow-graph 是组件但文档尚未撰写，属待办。
 *
 * 不在此列的包一旦缺文档就会让本命令失败。要新增豁免必须显式改这里。
 */
const PACKAGES_WITHOUT_COMPONENT_DOC = new Set([
  'hooks',
  'theme',
  'ai-chat',
  'audio',
  'flow-graph',
]);

/** API 段由源码生成时的横幅 */
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

async function generateDocs() {
  console.log(chalk.cyan('🚀 Generating component API documentation...\n'));

  const { packages, withoutComponents, failures: collectFailures } = await collectPackageApis();
  const failures = collectFailures.map((f) => `${f.dirName}：${f.message}`);
  let readmeCount = 0;
  let docCount = 0;
  let skipCount = 0;

  // 有组件源码的包：README 与文档页都由内存里的解析结果渲染
  for (const { dirName, packageDir, api } of packages) {
    try {
      console.log(
        chalk.blue(`📝 ${chalk.bold(dirName)}：${api.components.map((c) => c.name).join(', ')}`),
      );

      const readmePath = path.join(packageDir, 'README.md');
      if (!(await exists(readmePath))) {
        failures.push(`${dirName}：缺 README.md，API 段无处可写`);
        continue;
      }
      const readme = await fs.readFile(readmePath, 'utf-8');
      await fs.writeFile(readmePath, replaceSection(readme, API_HEADING_RE, renderApiSection(api)));
      readmeCount++;

      const docSection = `## API\n\n${GENERATED_BANNER}\n\n${renderApiBody(api)}`;
      const outcome = await injectComponentDoc(dirName, docSection);
      if (outcome === 'injected') docCount++;
      else if (outcome === 'skipped') skipCount++;
      else failures.push(outcome);
    } catch (error: any) {
      failures.push(`${dirName}：${error.message}`);
    }
  }

  // 没有组件源码的包：文档页 API 段同步 README 里的手写表格
  for (const dirName of withoutComponents) {
    try {
      const readmePath = path.join('packages', dirName, 'README.md');
      if (!(await exists(readmePath))) continue;
      const readmeSection = extractSection(await fs.readFile(readmePath, 'utf-8'), API_HEADING_RE);

      const docPath = componentDocPath(dirName);
      if (!(await exists(docPath))) {
        if (PACKAGES_WITHOUT_COMPONENT_DOC.has(dirName)) {
          skipCount++;
          continue;
        }
        failures.push(missingDocMessage(dirName));
        continue;
      }
      if (!readmeSection) {
        failures.push(
          `${dirName}：没有可解析的组件源码，README.md 里也找不到 API 段` +
            `（需要一个以 "## API" 开头的二级标题）`,
        );
        continue;
      }

      const docSection = `## API\n\n${syncedBanner(dirName)}\n\n${stripHeading(readmeSection)}\n`;
      const outcome = await injectComponentDoc(dirName, docSection);
      if (outcome === 'injected') docCount++;
      else if (outcome !== 'skipped') failures.push(outcome);
    } catch (error: any) {
      failures.push(`${dirName}：${error.message}`);
    }
  }

  console.log(chalk.cyan('\n' + '='.repeat(50)));
  console.log(
    chalk.green(
      `✨ 完成：README ${readmeCount} 个，文档页 ${docCount} 个，跳过 ${skipCount} 个，失败 ${failures.length} 个`,
    ),
  );
  if (failures.length > 0) {
    console.log(chalk.red('\n✗ 失败明细：'));
    for (const failure of failures) console.log(chalk.red(`  · ${failure}`));
    process.exitCode = 1;
  }
  console.log(chalk.cyan('='.repeat(50) + '\n'));
}

/**
 * 把 API 段注入 docs/components/<name>.md。
 * 返回 'injected' / 'skipped'（已登记豁免），或一条失败信息。
 */
async function injectComponentDoc(dirName: string, section: string): Promise<string> {
  const docPath = componentDocPath(dirName);
  if (!(await exists(docPath))) {
    return PACKAGES_WITHOUT_COMPONENT_DOC.has(dirName) ? 'skipped' : missingDocMessage(dirName);
  }

  const doc = await fs.readFile(docPath, 'utf-8');
  const updated = replaceSection(doc, API_HEADING_RE, section);
  await fs.writeFile(docPath, updated, 'utf-8');
  console.log(chalk.green(`✅ docs/components/${dirName}.md：API 段已注入`));
  return 'injected';
}

function componentDocPath(dirName: string): string {
  return path.resolve(`docs/components/${dirName}.md`);
}

function missingDocMessage(dirName: string): string {
  return (
    `${dirName}：缺 docs/components/${dirName}.md。` +
    `请补写该文档，或把包名加进 gen-docs.ts 的 PACKAGES_WITHOUT_COMPONENT_DOC`
  );
}

async function exists(filePath: string): Promise<boolean> {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

// 未捕获异常同样要让退出码非零，否则 CI 的 docs:check 会带着半成品继续比对
generateDocs().catch((error: unknown) => {
  console.error(chalk.red('生成执行异常：'), error);
  process.exitCode = 1;
});
