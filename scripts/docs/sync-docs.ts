import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { glob } from 'glob';

const API_INJECT_MARKER = '<!-- @api-inject -->';

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
        console.log(chalk.yellow(`⚠️  No component doc found for ${packageName}, skipping...`));
        skipCount++;
        continue;
      }

      // Read README and component doc content
      const readmeContent = await fs.readFile(readmePath, 'utf-8');
      const componentDoc = await fs.readFile(componentDocPath, 'utf-8');

      // Extract API section from README
      const apiContent = extractApiSection(readmeContent);

      if (!apiContent) {
        console.log(chalk.yellow(`⚠️  No API section found in ${packageName} README`));
        skipCount++;
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
      console.error(
        chalk.red(
          `❌ Sync failed for ${path.basename(path.dirname(readmePath))}: ${error.message}`,
        ),
      );
    }
  }

  console.log(chalk.cyan('\n' + '='.repeat(50)));
  console.log(chalk.green(`✨ Sync complete! ${successCount} injected, ${skipCount} skipped.`));
  console.log(chalk.cyan('='.repeat(50) + '\n'));
}

/**
 * Extract API section from README content
 */
function extractApiSection(content: string): string | null {
  // Find API section using regex
  const apiStartRegex = /^## API$/m;
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
    .replace(/^## API\s*\n*/m, '')
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

syncDocs().catch(console.error);
