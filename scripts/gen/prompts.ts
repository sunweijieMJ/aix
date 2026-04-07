/**
 * 交互式问答收集配置
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import type { ComponentConfig, CliOptions } from './types.js';
import { AVAILABLE_DEPENDENCIES } from './types.js';
import { toPascalCase } from './utils.js';
import {
  validateComponentName,
  validateComponentNameWithExistence,
  validateDescription,
  getExistingPackagesHint,
} from './validators.js';

/**
 * 收集组件配置
 */
export async function collectConfig(cliOptions: CliOptions = {}): Promise<ComponentConfig> {
  console.log(chalk.cyan.bold('\n✨ AIX 组件库生成器\n'));

  // 显示已存在的组件包
  const existingHint = await getExistingPackagesHint();
  console.log(chalk.gray(existingHint + '\n'));

  // 快速模式: -y 标志跳过所有交互，使用默认值
  if (cliOptions.yes && cliOptions.name) {
    return buildQuickConfig(cliOptions);
  }

  // 1. 基本信息
  const basicInfo = await collectBasicInfo(cliOptions);

  // 2. 依赖包选择
  const dependencies = await collectDependencies(cliOptions);

  // 4. 功能选择
  const features = await collectFeatures(cliOptions);

  // 5. 工具链选择
  const tools = await collectTools(cliOptions);

  // 6. 文件选项
  const files = await collectFileOptions(cliOptions);

  // 构建配置
  const config: ComponentConfig = {
    name: basicInfo.componentName,
    description: basicInfo.description,
    features,
    tools,
    files,
    dependencies,
  };

  // 7. 预览配置
  previewConfig(config);

  // 8. 确认生成
  if (!cliOptions.yes) {
    const confirmed = await confirmGeneration();
    if (!confirmed) {
      console.log(chalk.yellow('\n❌ 已取消生成'));
      process.exit(0);
    }
  }

  return config;
}

/**
 * 快速模式: 使用默认值构建配置
 */
async function buildQuickConfig(cliOptions: CliOptions): Promise<ComponentConfig> {
  const name = cliOptions.name!;

  // 验证组件名
  const validationResult = await validateComponentNameWithExistence(name);
  if (validationResult !== true) {
    console.log(chalk.red(`\n❌ ${validationResult}`));
    process.exit(1);
  }

  const config: ComponentConfig = {
    name,
    description:
      cliOptions.description || `A Vue 3 ${toPascalCase(name)} component for AIX component library`,
    features: {
      scss: cliOptions.scss ?? true,
      composables: cliOptions.composables ?? true,
      i18n: cliOptions.i18n ?? false,
    },
    tools: {
      eslint: true,
      stylelint: true,
    },
    files: {
      readme: true,
      stories: true,
      tests: true,
      globalTypes: false,
    },
    dependencies: cliOptions.deps || ['@aix/theme', '@aix/hooks'],
  };

  console.log(chalk.yellow('⚡ 快速模式: 使用默认配置\n'));
  previewConfig(config);

  return config;
}

/**
 * 收集基本信息
 */
async function collectBasicInfo(
  cliOptions: CliOptions,
): Promise<{ componentName: string; description: string }> {
  // 如果 CLI 提供了名称，直接验证
  if (cliOptions.name) {
    const validationResult = await validateComponentNameWithExistence(cliOptions.name);
    if (validationResult !== true) {
      console.log(chalk.red(`\n❌ ${validationResult}`));
      process.exit(1);
    }
    return {
      componentName: cliOptions.name,
      description:
        cliOptions.description ||
        `A Vue 3 ${toPascalCase(cliOptions.name)} component for AIX component library`,
    };
  }

  const { componentName, description } = await inquirer.prompt([
    {
      type: 'input',
      name: 'componentName',
      message: '📝 请输入组件名称 (kebab-case):',
      default: 'my-component',
      validate: async (input: string) => {
        const formatResult = validateComponentName(input);
        if (formatResult !== true) return formatResult;
        return validateComponentNameWithExistence(input);
      },
    },
    {
      type: 'input',
      name: 'description',
      message: '📄 请输入组件描述:',
      default: (answers: { componentName: string }) =>
        `A Vue 3 ${toPascalCase(answers.componentName)} component for AIX component library`,
      validate: validateDescription,
    },
  ]);

  return { componentName, description };
}

/**
 * 收集依赖包
 */
async function collectDependencies(cliOptions: CliOptions): Promise<string[]> {
  if (cliOptions.deps) {
    return cliOptions.deps;
  }

  const { selectedDependencies } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedDependencies',
      message: '📦 请选择依赖包 (多选):',
      choices: AVAILABLE_DEPENDENCIES.map((dep) => ({
        name: dep.name,
        value: dep.value,
        checked: dep.checked,
      })),
    },
  ]);

  return selectedDependencies;
}

/**
 * 收集功能特性
 */
async function collectFeatures(cliOptions: CliOptions): Promise<ComponentConfig['features']> {
  const { needScss, needComposables, needI18n } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'needScss',
      message: '🎨 是否生成独立 SCSS 样式文件 (推荐)?',
      default: cliOptions.scss ?? true,
    },
    {
      type: 'confirm',
      name: 'needComposables',
      message: '🔧 是否生成 Composable 钩子 (useXxx)?',
      default: cliOptions.composables ?? true,
    },
    {
      type: 'confirm',
      name: 'needI18n',
      message: '🌍 是否需要多语言支持 (生成 src/locale/ 目录)?',
      default: cliOptions.i18n ?? false,
    },
  ]);

  return {
    scss: needScss,
    composables: needComposables,
    i18n: needI18n,
  };
}

/**
 * 收集工具链选择
 */
async function collectTools(_cliOptions: CliOptions): Promise<ComponentConfig['tools']> {
  const { selectedTools } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedTools',
      message: '🛠️  请选择工具链 (多选):',
      choices: [
        { name: 'ESLint (代码检查)', value: 'eslint', checked: true },
        { name: 'Stylelint (样式检查)', value: 'stylelint', checked: true },
      ],
    },
  ]);

  return {
    eslint: selectedTools.includes('eslint'),
    stylelint: selectedTools.includes('stylelint'),
  };
}

/**
 * 收集文件选项
 */
async function collectFileOptions(_cliOptions: CliOptions): Promise<ComponentConfig['files']> {
  const { needGlobalTypes } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'needGlobalTypes',
      message: '📝 是否生成全局类型声明 (typings/ 目录)?',
      default: false,
    },
  ]);

  return {
    readme: true,
    stories: true,
    tests: true,
    globalTypes: needGlobalTypes,
  };
}

/**
 * 预览配置
 */
function previewConfig(config: ComponentConfig): void {
  console.log(chalk.cyan('\n📋 配置预览:'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk.white(`组件名称: ${chalk.green(config.name)}`));
  console.log(chalk.white(`组件描述: ${chalk.green(config.description)}`));
  console.log(
    chalk.white(`独立 SCSS: ${config.features.scss ? chalk.green('是') : chalk.gray('否')}`),
  );
  console.log(
    chalk.white(
      `Composable: ${config.features.composables ? chalk.green('是 (useXxx)') : chalk.gray('否')}`,
    ),
  );
  console.log(
    chalk.white(
      `多语言支持: ${config.features.i18n ? chalk.green('是 (src/locale/)') : chalk.gray('否')}`,
    ),
  );
  console.log(
    chalk.white(
      `全局类型: ${config.files.globalTypes ? chalk.green('是 (typings/)') : chalk.gray('否')}`,
    ),
  );
  console.log(
    chalk.white(
      `工具链: ${
        [config.tools.eslint && 'ESLint', config.tools.stylelint && 'Stylelint']
          .filter(Boolean)
          .join(', ') || chalk.gray('无')
      }`,
    ),
  );
  console.log(
    chalk.white(
      `依赖包: ${
        config.dependencies.length > 0
          ? chalk.green(config.dependencies.join(', '))
          : chalk.gray('无')
      }`,
    ),
  );
  console.log(chalk.gray('─'.repeat(50)));
}

/**
 * 确认生成
 */
async function confirmGeneration(): Promise<boolean> {
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: '✅ 确认生成组件?',
      default: true,
    },
  ]);

  return confirmed;
}
