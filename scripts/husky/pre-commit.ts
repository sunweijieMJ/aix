import { execSync } from 'child_process';
import chalk from 'chalk';

const log = {
  info: (msg: string) => console.log(chalk.blue(msg)),
  success: (msg: string) => console.log(chalk.green(`✓ ${msg}`)),
  warn: (msg: string) => console.log(chalk.yellow(msg)),
  error: (msg: string) => console.error(chalk.red(msg)),
};

try {
  // 获取改动的文件
  log.info('正在获取改动的文件...');
  const changedFiles = execSync(
    'git diff --cached --name-only --diff-filter=ACMR',
  )
    .toString()
    .trim()
    .split('\n');

  if (!changedFiles.length || !changedFiles[0]) {
    log.warn('没有发现改动的文件，跳过检查');
    process.exit(0);
  }
  log.info(`发现 ${changedFiles.length} 个改动的文件`);

  // Lint-staged 检查
  log.info('正在执行 lint-staged...');
  execSync('npm exec lint-staged', { stdio: 'inherit' });
  log.success('Lint-staged 检查通过');

  // 按文件类型分组
  const filesByType = changedFiles.reduce(
    (acc, file) => {
      if (/\.(ts|tsx)$/.test(file)) acc.ts.push(file);
      if (/\.(js|jsx)$/.test(file)) acc.js.push(file);
      return acc;
    },
    { ts: [] as string[], js: [] as string[] },
  );

  // 执行 lint 和 TypeScript 类型检查
  if (filesByType.ts.length || filesByType.js.length) {
    // lint 检查
    log.info('正在进行 lint 校验...');
    for (const type of ['ts', 'js'] as const) {
      if (filesByType[type].length) {
        execSync(`npx eslint ${filesByType[type].join(' ')}`, {
          stdio: 'inherit',
        });
      }
    }
    log.success('lint 校验通过');

    // TypeScript 类型检查
    if (filesByType.ts.length) {
      log.info('正在进行 TypeScript 类型检查...');
      try {
        // 首先尝试检查所有文件以确保项目整体类型正确
        execSync('npx tsc --noEmit', {
          stdio: 'inherit',
        });
        log.success('TypeScript 类型检查通过');
      } catch (error) {
        // 如果整体检查失败，我们只输出改动文件相关的错误
        log.warn('正在重新检查改动的文件...');
        execSync(
          `npx tsc --noEmit ${filesByType.ts.join(' ')} | grep -f <(echo "${filesByType.ts.join('\n')}")`,
          {
            stdio: 'inherit',
          },
        );
        throw error; // 仍然抛出错误以中断提交
      }
    }
  }

  // 执行测试
  const relevantFiles = [...filesByType.ts, ...filesByType.js];
  if (relevantFiles.length) {
    log.info('正在进行单元测试...');
    const packagePaths = [
      ...new Set(
        relevantFiles
          .map((file) => file.match(/packages\/(?:@[^/]+\/)?[^/]+/)?.[0])
          .filter(Boolean)
          .map((path) => `./${path}`),
      ),
    ];

    if (packagePaths.length) {
      execSync(
        `npx turbo run test ${packagePaths.map((p) => `--filter=${p}`).join(' ')}`,
        {
          stdio: 'inherit',
        },
      );
      log.success('单元测试通过');
    } else {
      log.warn('未检测到包的改动，跳过单元测试');
    }
  } else {
    log.warn('没有发现相关文件的更改，跳过单元测试');
  }

  process.exit(0);
} catch (error) {
  log.error('× 检查失败');
  if (error instanceof Error) log.error(error.message);
  process.exit(1);
}
