import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { glob } from 'glob';

const API_INJECT_MARKER = '<!-- @api-inject -->';

/**
 * 匹配 README 里的 API 段标题。
 *
 * 不写死 `^## API$`：@aix/icons 用的是「## API 参考」，此前被判为「无 API 段」
 * 而静默跳过。放宽到「以 API 开头的二级标题」即可覆盖两种写法。
 */
const API_HEADING_RE = /^## API\b.*$/m;

/**
 * 已知没有 docs/components/<name>.md 的包，跳过它们不算失败。
 *
 * 分两类：
 * - hooks / theme 不是组件，本就不该有组件文档页；
 * - ai-chat / audio / flow-graph 是组件但文档尚未撰写，属待办。
 *
 * 不在此列的包一旦缺文档就会让本命令失败。这是有意的：此前所有跳过都只打印一行
 * 黄字、退出码仍为 0，新增组件忘了写文档不会有任何人知道。要新增豁免必须显式改这里。
 */
const PACKAGES_WITHOUT_COMPONENT_DOC = new Set([
  'hooks',
  'theme',
  'ai-chat',
  'audio',
  'flow-graph',
]);

/**
 * Extract API section from README and inject to VitePress docs/components directory
 */
async function syncDocs() {
  console.log(chalk.cyan('🔄 Syncing API docs to VitePress...\n'));

  // Find all package README.md files
  const readmeFiles = await glob('packages/*/README.md');

  if (readmeFiles.length === 0) {
    console.log(
      chalk.yellow('⚠️  No README.md found in packages. Please run pnpm gen:docs first.'),
    );
    return;
  }

  let successCount = 0;
  let skipCount = 0;
  /** 需要让本命令以非零码退出的问题，逐条记录后统一报告 */
  const failures: string[] = [];

  for (const readmePath of readmeFiles) {
    try {
      const packageName = path.basename(path.dirname(readmePath));
      const componentDocPath = path.resolve(`docs/components/${packageName}.md`);

      // Check if component doc exists
      const docExists = await fs
        .access(componentDocPath)
        .then(() => true)
        .catch(() => false);

      if (!docExists) {
        if (PACKAGES_WITHOUT_COMPONENT_DOC.has(packageName)) {
          console.log(chalk.dim(`—  ${packageName}：已登记为暂无组件文档，跳过`));
          skipCount++;
          continue;
        }
        failures.push(
          `${packageName}：缺 docs/components/${packageName}.md。` +
            `请补写该文档，或把包名加进 sync-docs.ts 的 PACKAGES_WITHOUT_COMPONENT_DOC`,
        );
        continue;
      }

      // Read README and component doc content
      const readmeContent = await fs.readFile(readmePath, 'utf-8');
      const componentDoc = await fs.readFile(componentDocPath, 'utf-8');

      // Extract API section from README
      const apiContent = extractApiSection(readmeContent);

      if (!apiContent) {
        failures.push(
          `${packageName}：README.md 里找不到 API 段（需要一个以 "## API" 开头的二级标题）。` +
            `组件文档已存在却注入不了内容，多半是标题写法变了`,
        );
        continue;
      }

      // Inject API into component doc
      let updatedDoc = injectApiContent(componentDoc, apiContent);

      // Clean up excessive blank lines (3+ consecutive newlines -> 2)
      updatedDoc = updatedDoc.replace(/\n{3,}/g, '\n\n');

      // Write back to component doc
      await fs.writeFile(componentDocPath, updatedDoc, 'utf-8');
      console.log(chalk.green(`✅ ${packageName}.md API section injected to docs/components/`));
      successCount++;
    } catch (error: any) {
      failures.push(`${path.basename(path.dirname(readmePath))}：${error.message}`);
    }
  }

  console.log(chalk.cyan('\n' + '='.repeat(50)));
  console.log(chalk.green(`✨ Sync complete! ${successCount} injected, ${skipCount} skipped.`));

  if (failures.length > 0) {
    console.log(chalk.red(`\n✗ ${failures.length} 个包同步失败：`));
    for (const failure of failures) console.log(chalk.red(`  · ${failure}`));
    console.log(chalk.cyan('='.repeat(50) + '\n'));
    process.exitCode = 1;
    return;
  }

  console.log(chalk.cyan('='.repeat(50) + '\n'));
}

/**
 * Extract API section from README content
 */
function extractApiSection(content: string): string | null {
  // Find API section using regex
  const apiStartRegex = API_HEADING_RE;
  const nextSectionRegex = /^## /m;

  const apiStartMatch = content.match(apiStartRegex);

  if (!apiStartMatch) {
    return null;
  }

  // Find where API section starts
  const apiStartIndex = apiStartMatch.index!;

  // Find the next section after API
  const afterApiContent = content.slice(apiStartIndex + apiStartMatch[0].length);
  const nextSectionMatch = afterApiContent.match(nextSectionRegex);

  if (nextSectionMatch) {
    // Extract content between API and next section
    const nextSectionIndex = apiStartIndex + apiStartMatch[0].length + nextSectionMatch.index!;
    return content.slice(apiStartIndex, nextSectionIndex).trim();
  }
  // API is the last section
  return content.slice(apiStartIndex).trim();
}

/**
 * Inject API content into component doc at marker position
 */
function injectApiContent(componentDoc: string, apiContent: string): string {
  // Clean API content (remove "## API" header and excessive newlines)
  const cleanedApi = apiContent
    // 用共享的标题正则而非 /^## API\s*\n*/：后者遇到「## API 参考」只吃掉 "## API "，
    // 会把「参考」两个字留在正文开头
    .replace(API_HEADING_RE, '')
    .replace(/^\n+/, '')
    .replace(/\n{3,}/g, '\n\n') // Replace 3+ newlines with 2
    .trim() // Trim at the end to remove trailing newlines
    .replace(/\n$/, ''); // Ensure no trailing newline

  // Add auto-generation warning
  const apiWithWarning = `## API

::: warning 自动生成的 API 文档
以下 API 文档由 \`pnpm docs:gen\` 从组件源码自动生成。请勿手动编辑此部分。

如需更新 API 文档，请：
1. 修改组件源码中的 JSDoc 注释
2. 运行 \`pnpm docs:gen\` 生成到 README.md
3. 运行 \`pnpm docs:sync\` 同步到此文档
:::

${cleanedApi}`;

  // Check if marker exists
  if (componentDoc.includes(API_INJECT_MARKER)) {
    // Find marker position
    const markerIndex = componentDoc.indexOf(API_INJECT_MARKER);

    // Find next section after marker (starts with ##)
    const afterMarker = componentDoc.slice(markerIndex + API_INJECT_MARKER.length);
    const nextSectionMatch = afterMarker.match(/\n## /);

    if (nextSectionMatch) {
      // Replace content between marker and next section
      const nextSectionIndex = markerIndex + API_INJECT_MARKER.length + nextSectionMatch.index!;

      // Get the rest of the document (starts with \n##)
      const restOfDoc = componentDoc.slice(nextSectionIndex);

      // Ensure exactly one blank line between API and next section
      return (
        componentDoc.slice(0, markerIndex) +
        apiWithWarning +
        '\n' + // Add one newline to create a blank line
        restOfDoc // This starts with \n##, so total: \n\n##
      );
    } else {
      // Marker is at the end, append API
      return componentDoc.slice(0, markerIndex) + apiWithWarning + '\n';
    }
  } else {
    // No marker found, check if API section already exists
    const apiSectionMatch = componentDoc.match(/\n## API\b/);

    if (apiSectionMatch) {
      // Replace existing API section
      const apiStartIndex = apiSectionMatch.index! + 1; // +1 to skip leading \n

      // Find next section after API
      const afterApi = componentDoc.slice(apiStartIndex + '## API'.length);
      const nextSectionMatch = afterApi.match(/\n## /);

      if (nextSectionMatch) {
        const nextSectionIndex = apiStartIndex + '## API'.length + nextSectionMatch.index!;
        return (
          componentDoc.slice(0, apiStartIndex) +
          apiWithWarning +
          '\n\n' +
          componentDoc.slice(nextSectionIndex)
        );
      } else {
        // API is the last section
        return componentDoc.slice(0, apiStartIndex) + apiWithWarning + '\n';
      }
    } else {
      // No API section and no marker, append at the end
      return componentDoc.trim() + '\n\n' + apiWithWarning + '\n';
    }
  }
}

// 未捕获异常同样要让退出码非零，否则 docs:build 会带着半成品文档继续往下走
syncDocs().catch((error: unknown) => {
  console.error(chalk.red('同步执行异常：'), error);
  process.exitCode = 1;
});
