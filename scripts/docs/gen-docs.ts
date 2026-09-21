import chalk from 'chalk';
import { generateDocs } from './generate';

/** `pnpm docs:gen` 的命令行入口，生成逻辑见 generate.ts */
async function main() {
  console.log(chalk.cyan('🚀 Generating component API documentation...\n'));

  const report = await generateDocs({ log: (line) => console.log(chalk.blue(line)) });

  console.log(chalk.cyan('\n' + '='.repeat(50)));
  console.log(
    chalk.green(
      `✨ 完成：README ${report.readmeCount} 个，文档页 ${report.docCount} 个，` +
        `跳过 ${report.skipCount} 个，失败 ${report.failures.length} 个`,
    ),
  );
  if (report.warnings.length > 0) {
    console.log(chalk.yellow(`\n⚠ JSDoc 提示 ${report.warnings.length} 条：`));
    for (const warning of report.warnings) console.log(chalk.yellow(`  · ${warning}`));
  }
  if (report.failures.length > 0) {
    console.log(chalk.red('\n✗ 失败明细：'));
    for (const failure of report.failures) console.log(chalk.red(`  · ${failure}`));
    process.exitCode = 1;
  }
  console.log(chalk.cyan('='.repeat(50) + '\n'));
}

// 未捕获异常同样要让退出码非零，否则 CI 的 docs:check 会带着半成品继续比对
main().catch((error: unknown) => {
  console.error(chalk.red('生成执行异常：'), error);
  process.exitCode = 1;
});
