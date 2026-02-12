#!/usr/bin/env node
/**
 * AIX 组件库生成器
 *
 * 用法:
 *   pnpm gen                           # 交互式创建组件
 *   pnpm gen button                    # 指定组件名创建
 *   pnpm gen button --dry-run          # 预览模式
 *   pnpm gen button -y                 # 跳过确认
 *   pnpm gen --help                    # 显示帮助
 */

import chalk from 'chalk';
import type { CliOptions } from './types.js';
import { collectConfig } from './prompts.js';
import { generateComponent } from './generator.js';

/**
 * 显示帮助信息
 */
function showHelp(): void {
  console.log(`
${chalk.cyan.bold('AIX 组件库生成器')}

${chalk.yellow('用法:')}
  pnpm gen [组件名] [选项]

${chalk.yellow('选项:')}
  -d, --description <desc>   组件描述
  --deps <packages>          依赖包，逗号分隔 (如: @aix/theme,@aix/hooks)
  --i18n                     启用多语言支持
  --no-scss                  不生成独立 SCSS 文件
  --no-composables           不生成 Composable 钩子
  --dry-run                  预览模式，不实际创建文件
  -y, --yes                  跳过确认直接创建
  -h, --help                 显示帮助信息

${chalk.yellow('示例:')}
  ${chalk.gray('# 交互式创建')}
  pnpm gen

  ${chalk.gray('# 快速创建按钮组件')}
  pnpm gen button

  ${chalk.gray('# 指定描述')}
  pnpm gen button -d "按钮组件"

  ${chalk.gray('# 预览将要生成的文件')}
  pnpm gen button --dry-run

  ${chalk.gray('# 跳过所有确认')}
  pnpm gen button -y
`);
}

/**
 * 解析命令行参数
 */
function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {};

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      showHelp();
      process.exit(0);
    }

    if (arg === '-d' || arg === '--description') {
      options.description = args[++i];
    } else if (arg === '--deps') {
      options.deps = args[++i]?.split(',').map((s) => s.trim());
    } else if (arg === '--i18n') {
      options.i18n = true;
    } else if (arg === '--no-scss') {
      options.scss = false;
    } else if (arg === '--no-composables') {
      options.composables = false;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '-y' || arg === '--yes') {
      options.yes = true;
    } else if (!arg?.startsWith('-') && !options.name) {
      // 第一个非选项参数作为组件名
      options.name = arg;
    }

    i++;
  }

  return options;
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  try {
    // 解析命令行参数
    const args = process.argv.slice(2);
    const cliOptions = parseArgs(args);

    // 收集配置
    const config = await collectConfig(cliOptions);

    // 生成组件
    await generateComponent(config, { dryRun: cliOptions.dryRun });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('User force closed')) {
      console.log(chalk.yellow('\n\n👋 已取消'));
      process.exit(0);
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\n❌ 发生错误: ${message}`));
    process.exit(1);
  }
}

main();
