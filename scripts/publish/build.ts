/**
 * 构建模块
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { BUILD_OUTPUTS, run } from './shared.js';
import { getPublishablePackages, getPackageDir } from './workspace.js';

// 根据 package.json 的 exports/main/module 字段推断需要的构建产物
const getRequiredOutputs = (pkgJsonPath: string): string[] => {
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
  const outputs = new Set<string>();

  // 检查 main 字段 (通常指向 lib/cjs)
  if (pkgJson.main) {
    if (pkgJson.main.includes('/lib/')) outputs.add('lib');
    if (pkgJson.main.includes('/dist/')) outputs.add('dist');
  }

  // 检查 module 字段 (通常指向 es/esm)
  if (pkgJson.module) {
    if (pkgJson.module.includes('/es/')) outputs.add('es');
    if (pkgJson.module.includes('/dist/')) outputs.add('dist');
  }

  // 检查 exports 字段
  if (pkgJson.exports) {
    const exportsStr = JSON.stringify(pkgJson.exports);
    if (exportsStr.includes('/es/')) outputs.add('es');
    if (exportsStr.includes('/lib/')) outputs.add('lib');
    if (exportsStr.includes('/dist/')) outputs.add('dist');
  }

  // 如果没有检测到任何配置，回退到检查任意一个产物目录存在即可
  return outputs.size > 0 ? Array.from(outputs) : [];
};

// 检查包是否需要构建（有 build 脚本）
const needsBuild = (pkgJsonPath: string): boolean => {
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
  // 只有在 package.json 中明确定义了 build 脚本时，才需要校验构建产物
  return !!pkgJson.scripts?.build;
};

// 校验构建产物是否存在
export const validateBuildOutputs = (
  projectRoot: string,
  packages: Set<string>,
) => {
  console.log(chalk.blue('校验构建产物...'));
  const errors: string[] = [];

  // 过滤掉 private 包，只校验可发布的包
  const publishablePackagesMap = new Map(
    getPublishablePackages(projectRoot).map((pkg) => [pkg.name, pkg]),
  );

  for (const pkgName of packages) {
    // 跳过 private 包
    if (!publishablePackagesMap.has(pkgName)) {
      continue;
    }

    const pkgDir = getPackageDir(projectRoot, pkgName);
    if (!pkgDir) {
      errors.push(`找不到包目录: ${pkgName}`);
      continue;
    }

    const pkgJsonPath = path.join(pkgDir, 'package.json');

    // 跳过没有 build 脚本的包（不需要构建产物）
    if (!needsBuild(pkgJsonPath)) {
      continue;
    }

    const requiredOutputs = getRequiredOutputs(pkgJsonPath);

    if (requiredOutputs.length > 0) {
      // 根据 package.json 配置精确校验
      const missingOutputs = requiredOutputs.filter(
        (output) => !fs.existsSync(path.join(pkgDir, output)),
      );

      if (missingOutputs.length > 0) {
        errors.push(`${pkgName}: 缺少构建产物 (${missingOutputs.join(', ')})`);
      }
    } else {
      // 回退逻辑：至少存在一个构建产物目录
      const hasAnyOutput = BUILD_OUTPUTS.some((output) =>
        fs.existsSync(path.join(pkgDir, output)),
      );

      if (!hasAnyOutput) {
        errors.push(`${pkgName}: 缺少构建产物 (${BUILD_OUTPUTS.join('/')})`);
      }
    }
  }

  if (errors.length) {
    throw new Error(
      `构建产物校验失败:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
  }

  console.log(chalk.green('✅ 构建产物校验通过'));
};

// 构建指定的包
export const buildPackages = async (
  projectRoot: string,
  packages: Set<string>,
) => {
  console.log(chalk.green('需要构建的包:'));
  packages.forEach((pkg) => console.log(`  ${pkg}`));

  console.log(chalk.blue('开始构建...'));
  const filterArgs = Array.from(packages)
    .map((pkg) => `--filter=${pkg}`)
    .join(' ');

  run(
    `npx turbo run build ${filterArgs} --output-logs=errors-only`,
    projectRoot,
  );

  // 校验构建产物
  validateBuildOutputs(projectRoot, packages);
};
