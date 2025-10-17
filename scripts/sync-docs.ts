import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { glob } from 'glob';

/**
 * Extract API section from README and sync to VitePress docs/api directory
 */
async function syncDocs() {
  console.log(chalk.cyan('🔄 Syncing API docs to VitePress...\n'));

  const targetDir = path.resolve('docs/api');
  await fs.mkdir(targetDir, { recursive: true });

  // Find all package README.md files
  const readmeFiles = await glob('packages/*/README.md');

  if (readmeFiles.length === 0) {
    console.log(
      chalk.yellow(
        '⚠️  No README.md found in packages. Please run pnpm gen:docs first.',
      ),
    );
    return;
  }

  let successCount = 0;

  for (const readmePath of readmeFiles) {
    try {
      const packageName = path.basename(path.dirname(readmePath));
      const targetPath = path.join(targetDir, `${packageName}.md`);

      // Read README content
      const content = await fs.readFile(readmePath, 'utf-8');

      // Extract API section
      const apiContent = extractApiSection(content);

      if (apiContent) {
        // Write only API section to docs/api/
        await fs.writeFile(targetPath, apiContent, 'utf-8');
        console.log(chalk.green(`✅ ${packageName}.md API section synced`));
        successCount++;
      } else {
        console.log(
          chalk.yellow(`⚠️  No API section found in ${packageName} README`),
        );
      }
    } catch (error: any) {
      console.error(chalk.red(`❌ Sync failed: ${error.message}`));
    }
  }

  console.log(chalk.cyan('\n' + '='.repeat(50)));
  console.log(chalk.green(`✨ Sync complete! ${successCount} files synced.`));
  console.log(chalk.cyan('='.repeat(50) + '\n'));
}

/**
 * Extract API section from README content
 */
function extractApiSection(content: string): string | null {
  // Find API section using regex
  const apiStartRegex = /^## 📖 API$/m;
  const nextSectionRegex = /^## /m;

  const apiStartMatch = content.match(apiStartRegex);

  if (!apiStartMatch) {
    return null;
  }

  // Find where API section starts
  const apiStartIndex = apiStartMatch.index!;

  // Find the next section after API
  const afterApiContent = content.slice(
    apiStartIndex + apiStartMatch[0].length,
  );
  const nextSectionMatch = afterApiContent.match(nextSectionRegex);

  if (nextSectionMatch) {
    // Extract content between API and next section
    const nextSectionIndex =
      apiStartIndex + apiStartMatch[0].length + nextSectionMatch.index!;
    return content.slice(apiStartIndex, nextSectionIndex).trim();
  }
  // API is the last section
  return content.slice(apiStartIndex).trim();
}

syncDocs().catch(console.error);
