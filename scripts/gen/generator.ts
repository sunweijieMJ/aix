/**
 * 文件生成器
 */

import path from 'node:path';
import chalk from 'chalk';
import type { ComponentConfig } from './types.js';
import { toPascalCase, getComponentDir, getRepoRoot, ensureDir, writeFile } from './utils.js';
import { renderTemplates, type TemplateContext, type GeneratedFileInfo } from './renderer.js';

/**
 * 生成组件
 */
export async function generateComponent(
  config: ComponentConfig,
  options: { dryRun?: boolean } = {},
): Promise<void> {
  const componentDir = getComponentDir(config.name);
  const context = buildTemplateContext(config);

  console.log(chalk.cyan(`\n📁 目标目录: ${componentDir}\n`));

  // 收集所有要生成的文件
  const files = renderTemplates(context, {
    eslint: config.tools.eslint,
    stylelint: config.tools.stylelint,
    readme: config.files.readme,
    stories: config.files.stories,
    tests: config.files.tests,
    globalTypes: config.files.globalTypes,
  });

  if (options.dryRun) {
    // Dry-run 模式: 只显示将要生成的文件
    console.log(chalk.yellow('🔍 Dry-run 模式 - 以下文件将被创建:\n'));
    for (const file of files) {
      console.log(chalk.gray(`  ${file.type.padEnd(8)} ${displayPath(componentDir, file)}`));
    }
    console.log(chalk.yellow(`\n总计 ${files.length} 个文件`));
    return;
  }

  try {
    // 创建目录结构
    await createDirectories(componentDir, config, files);

    // 写入文件
    for (const file of files) {
      const fullPath = path.join(outputRoot(componentDir, file), file.path);
      await writeFile(fullPath, file.content);
      console.log(chalk.green(`✓ 创建文件: ${displayPath(componentDir, file)}`));
    }

    // 显示成功信息
    printSuccessMessage(config.name);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\n❌ 创建失败: ${message}`));
    process.exit(1);
  }
}

/**
 * 构建模板上下文
 */
function buildTemplateContext(config: ComponentConfig): TemplateContext {
  return {
    componentName: config.name,
    pascalName: toPascalCase(config.name),
    description: config.description,
    features: config.features,
    tools: config.tools,
    dependencies: config.dependencies,
  };
}

/**
 * 创建目录结构
 */
async function createDirectories(
  componentDir: string,
  _config: ComponentConfig,
  files: GeneratedFileInfo[],
): Promise<void> {
  // 从文件列表中提取需要创建的目录
  const directories = new Set<string>();

  for (const file of files) {
    const dir = path.dirname(file.path);
    if (dir !== '.') {
      directories.add(path.join(outputRoot(componentDir, file), dir));
    }
  }

  // 确保目录存在
  for (const dir of directories) {
    await ensureDir(dir);
  }
}

function outputRoot(componentDir: string, file: GeneratedFileInfo): string {
  return file.root === 'repo' ? getRepoRoot() : componentDir;
}

/** 日志里的路径：包内文件相对包目录，仓库级文件相对仓库根 */
function displayPath(componentDir: string, file: GeneratedFileInfo): string {
  return file.root === 'repo'
    ? file.path
    : path.join(path.relative(getRepoRoot(), componentDir), file.path);
}

/**
 * 打印成功信息
 */
function printSuccessMessage(componentName: string): void {
  console.log(chalk.green.bold(`\n✅ 组件 ${componentName} 创建成功!`));
  console.log(chalk.cyan('\n📝 下一步:'));
  console.log(chalk.white(`  1. cd packages/${componentName}`));
  console.log(chalk.white(`  2. 完善组件实现`));
  console.log(chalk.white(`  3. pnpm install       # 安装依赖`));
  console.log(chalk.white(`  4. pnpm test          # 运行测试`));
  console.log(chalk.white(`  5. pnpm storybook:dev # 查看组件文档`));
  console.log(
    chalk.white(
      `  6. pnpm docs:gen      # 生成 README 与 docs/components/${componentName}.md 的 API 段`,
    ),
  );
  console.log(
    chalk.white(
      `  7. 把 docs/components/${componentName}.md 挂进 docs/.vitepress/config.ts 的 sidebar`,
    ),
  );
}
