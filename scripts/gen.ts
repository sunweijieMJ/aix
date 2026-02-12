import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';

// ============ 类型定义 ============

interface ComponentConfig {
  // 基本信息
  name: string;
  description: string;

  // 功能特性
  features: {
    i18n: boolean; // 多语言支持
  };

  // 工具链
  tools: {
    eslint: boolean;
    stylelint: boolean;
  };

  // 文件生成
  files: {
    readme: boolean;
    stories: boolean;
    tests: boolean;
    globalTypes: boolean;
  };

  // 依赖包
  dependencies: string[]; // @aix/theme, @aix/hooks 等
}

// ============ 常量定义 ============

const ROOT_DIR = path.resolve(process.cwd(), 'packages');

// ============ 工具函数 ============

function toPascalCase(str: string): string {
  return str
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

// ============ 交互式问答 ============

async function collectConfig(): Promise<ComponentConfig> {
  console.log(chalk.cyan.bold('\n✨ AIX 组件库生成器\n'));

  // 1. 基本信息
  const { componentName, description } = await inquirer.prompt([
    {
      type: 'input',
      name: 'componentName',
      message: '📝 请输入组件名称 (kebab-case):',
      default: 'my-component',
      validate: (input: string) => {
        if (!input.trim()) {
          return '组件名称不能为空';
        }
        if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(input)) {
          return '组件名称必须是 kebab-case 格式 (如: my-component)';
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'description',
      message: '📄 请输入组件描述:',
      default: (answers: any) =>
        `A Vue 3 ${toPascalCase(answers.componentName)} component`,
    },
  ]);

  // 2. 依赖包选择（多选）
  const { selectedDependencies } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedDependencies',
      message: '📦 请选择依赖包 (多选):',
      choices: [
        { name: '@aix/theme (主题系统)', value: '@aix/theme', checked: true },
        {
          name: '@aix/hooks (公共 Composables)',
          value: '@aix/hooks',
          checked: true,
        },
        { name: '@aix/icons (图标组件)', value: '@aix/icons' },
      ],
    },
  ]);

  // 3. 工具链选择（多选）
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

  // 4. 功能选择
  const { needI18n, needGlobalTypes } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'needI18n',
      message: '🌍 是否需要多语言支持 (会生成 src/locale/ 目录)?',
      default: false,
    },
    {
      type: 'confirm',
      name: 'needGlobalTypes',
      message: '📝 是否生成全局类型声明 (typings/ 目录)?',
      default: false,
    },
  ]);

  // 5. 构建配置
  const config: ComponentConfig = {
    name: componentName,
    description,
    features: {
      i18n: needI18n,
    },
    tools: {
      eslint: selectedTools.includes('eslint'),
      stylelint: selectedTools.includes('stylelint'),
    },
    files: {
      readme: true,
      stories: true,
      tests: true,
      globalTypes: needGlobalTypes,
    },
    dependencies: selectedDependencies,
  };

  // 6. 预览配置
  console.log(chalk.cyan('\n📋 配置预览:'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk.white(`组件名称: ${chalk.green(config.name)}`));
  console.log(chalk.white(`组件描述: ${chalk.green(config.description)}`));
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
      `依赖包: ${config.dependencies.length > 0 ? chalk.green(config.dependencies.join(', ')) : chalk.gray('无')}`,
    ),
  );
  console.log(chalk.gray('─'.repeat(50)));

  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: '✅ 确认生成组件?',
      default: true,
    },
  ]);

  if (!confirmed) {
    console.log(chalk.yellow('\n❌ 已取消生成'));
    process.exit(0);
  }

  return config;
}

// ============ 文件生成器 ============

async function generateComponent(config: ComponentConfig) {
  const componentName = config.name;
  const pascalName = toPascalCase(componentName);
  const componentDir = path.join(ROOT_DIR, componentName);

  try {
    // 创建组件主目录
    await fs.mkdir(componentDir, { recursive: true });
    console.log(chalk.green(`✓ 创建目录: ${componentDir}`));

    // 创建子目录
    const directories = ['src'];
    if (config.files.tests) directories.push('__test__');
    if (config.files.stories) directories.push('stories');
    if (config.files.globalTypes) directories.push('typings');
    if (config.features.i18n) directories.push('src/locale');

    for (const dir of directories) {
      await fs.mkdir(path.join(componentDir, dir), { recursive: true });
      console.log(chalk.green(`✓ 创建目录: ${componentDir}/${dir}`));
    }

    // 生成配置文件
    await generateConfigFiles(componentDir, config);

    // 生成源码文件
    await generateSourceFiles(componentDir, componentName, pascalName, config);

    // 生成测试文件
    if (config.files.tests) {
      await generateTestFile(componentDir, componentName, pascalName, config);
    }

    // 生成 Story 文件
    if (config.files.stories) {
      await generateStoryFile(componentDir, componentName, pascalName, config);
    }

    // 生成 README
    if (config.files.readme) {
      await generateReadme(componentDir, componentName, pascalName, config);
    }

    console.log(chalk.green.bold(`\n✅ 组件 ${componentName} 创建成功!`));
    console.log(chalk.cyan('\n📝 下一步:'));
    console.log(chalk.white(`  1. cd packages/${componentName}`));
    console.log(chalk.white(`  2. 完善组件实现`));
    console.log(chalk.white(`  3. pnpm test # 运行测试`));
    console.log(chalk.white(`  4. pnpm storybook:dev # 查看组件文档`));
  } catch (error: any) {
    console.error(chalk.red(`❌ 创建失败: ${error.message}`));
    process.exit(1);
  }
}

// ============ 配置文件生成器 ============

async function generateConfigFiles(
  componentDir: string,
  config: ComponentConfig,
) {
  // eslint.config.ts
  if (config.tools.eslint) {
    await fs.writeFile(
      path.join(componentDir, 'eslint.config.ts'),
      `import { config } from '@kit/eslint-config/vue-app';
import type { Linter } from 'eslint';

export default config as Linter.Config[];
`,
    );
    console.log(chalk.green(`✓ 创建文件: eslint.config.ts`));
  }

  // stylelint.config.ts
  if (config.tools.stylelint) {
    await fs.writeFile(
      path.join(componentDir, 'stylelint.config.ts'),
      `export default {
  extends: ['@kit/stylelint-config/vue-app.js'],
};
`,
    );
    console.log(chalk.green(`✓ 创建文件: stylelint.config.ts`));
  }

  // package.json
  const dependencies: Record<string, string> = {};
  config.dependencies.forEach((dep) => {
    dependencies[dep] = 'workspace:*';
  });

  // 构建 scripts
  const scripts: Record<string, string> = {
    dev: 'rollup -c -w',
    test: 'vitest --run --passWithNoTests',
    build: 'pnpm run clean && pnpm run build:js && pnpm run build:types',
    'build:js': 'rollup -c',
    'build:types': 'vue-tsc --declaration --emitDeclarationOnly --outDir es',
    clean: 'rimraf dist lib es tsconfig.tsbuildinfo',
  };

  // 添加工具链命令
  const lintCommands: string[] = [];
  if (config.tools.eslint) {
    scripts['lint:script'] = 'eslint . --max-warnings 0';
    lintCommands.push('pnpm run lint:script');
  }
  if (config.tools.stylelint) {
    scripts['lint:style'] = "stylelint 'src/**/*.{css,scss}' --max-warnings 0";
    lintCommands.push('pnpm run lint:style');
  }
  if (lintCommands.length > 0) {
    scripts['link'] = lintCommands.join(' && ');
  }

  const packageJson = {
    name: `@aix/${config.name}`,
    version: '0.0.0',
    description: config.description,
    license: 'MIT',
    type: 'module',
    main: './lib/index.js',
    module: './es/index.js',
    types: './es/index.d.ts',
    style: './es/index.css',
    sideEffects: ['*.css', '*.scss', '*.sass'],
    exports: {
      '.': {
        types: './es/index.d.ts',
        import: './es/index.js',
        require: './lib/index.js',
      },
      './dist': {
        types: './es/index.d.ts',
        import: './dist/index.js',
        require: './dist/index.js',
      },
      './es/*': './es/*',
      './lib/*': './lib/*',
      './dist/*': './dist/*',
      './style': './es/index.css',
      './package.json': './package.json',
    },
    files: ['dist', 'lib', 'es'],
    scripts,
    dependencies,
    peerDependencies: {
      vue: '^3.5.28',
    },
    devDependencies: {
      '@kit/eslint-config': 'workspace:*',
      rimraf: '*',
      tsx: '*',
      typescript: '*',
    },
  };

  await fs.writeFile(
    path.join(componentDir, 'package.json'),
    JSON.stringify(packageJson, null, 2) + '\n',
  );
  console.log(chalk.green(`✓ 创建文件: package.json`));

  // rollup.config.js
  await fs.writeFile(
    path.join(componentDir, 'rollup.config.js'),
    `import { createRollupConfig } from '../../rollup.config.js';

export default createRollupConfig(import.meta.dirname, ['esm', 'cjs']);
`,
  );
  console.log(chalk.green(`✓ 创建文件: rollup.config.js`));

  // tsconfig.json
  const exclude = ['node_modules', 'dist', 'es', 'lib', '__test__', 'stories'];

  await fs.writeFile(
    path.join(componentDir, 'tsconfig.json'),
    `{
  "extends": "@kit/typescript-config/base-library.json",
  "compilerOptions": {
    "declarationDir": "es",
    "rootDir": "src",
    "outDir": "es"
  },
  "include": ["src/**/*"],
  "exclude": ${JSON.stringify(exclude)}
}
`,
  );
  console.log(chalk.green(`✓ 创建文件: tsconfig.json`));
}

// ============ 源码文件生成器 ============

async function generateSourceFiles(
  componentDir: string,
  componentName: string,
  pascalName: string,
  config: ComponentConfig,
) {
  // types.ts
  await fs.writeFile(
    path.join(componentDir, 'src', 'types.ts'),
    `export interface ${pascalName}Props {
  /** 在这里定义组件的 props */
  // 示例:
  // type?: 'primary' | 'default';
  // size?: 'small' | 'medium' | 'large';
  // disabled?: boolean;
}

export interface ${pascalName}Emits {
  /** 在这里定义组件的 emits */
  // 示例:
  // (e: 'change', value: string): void;
  // (e: 'click', event: MouseEvent): void;
}
`,
  );
  console.log(chalk.green(`✓ 创建文件: src/types.ts`));

  // 组件主文件
  const componentTemplate = `<template>
  <div :class="['aix-${componentName}']">
    <slot />
  </div>
</template>

<script setup lang="ts">
import type { ${pascalName}Props, ${pascalName}Emits } from './types';

const props = withDefaults(defineProps<${pascalName}Props>(), {
  // 在这里设置默认值
});

const emit = defineEmits<${pascalName}Emits>();
</script>

<style scoped lang="scss">
.aix-${componentName} {
  // 在这里添加组件样式
  // 使用主题变量示例:
  // color: var(--aix-colorText);
  // background-color: var(--aix-colorBgContainer);
  // border: 1px solid var(--aix-colorBorder);
  // border-radius: var(--aix-borderRadius);
  // padding: var(--aix-padding);
}
</style>
`;

  await fs.writeFile(
    path.join(componentDir, 'src', `${pascalName}.vue`),
    componentTemplate,
  );
  console.log(chalk.green(`✓ 创建文件: src/${pascalName}.vue`));

  // index.ts
  const indexTemplate = `import type { App } from 'vue';
import ${pascalName} from './${pascalName}.vue';

export type { ${pascalName}Props, ${pascalName}Emits } from './types';

// 支持单独导入
export { ${pascalName} };

// 支持插件方式安装
export default {
  install(app: App) {
    app.component('Aix${pascalName}', ${pascalName});
  },
};
`;

  await fs.writeFile(path.join(componentDir, 'src', 'index.ts'), indexTemplate);
  console.log(chalk.green(`✓ 创建文件: src/index.ts`));

  // typings/global.d.ts
  if (config.files.globalTypes) {
    await fs.writeFile(
      path.join(componentDir, 'typings', 'global.d.ts'),
      `import type { DefineComponent } from 'vue';
import type { ${pascalName}Props } from '../src/types';

// 全局类型增强 - 让 IDE 自动识别组件
declare module '@vue/runtime-core' {
  export interface GlobalComponents {
    Aix${pascalName}: DefineComponent<${pascalName}Props>;
  }
}

export {};
`,
    );
    console.log(chalk.green(`✓ 创建文件: typings/global.d.ts`));
  }

  // src/locale/
  if (config.features.i18n) {
    // src/locale/zh-CN.ts
    await fs.writeFile(
      path.join(componentDir, 'src', 'locale', 'zh-CN.ts'),
      `import type { ${pascalName}Locale } from './types';

const zhCN: ${pascalName}Locale = {
  // 在这里定义中文文案
  // 示例:
  // placeholder: '请输入',
  // confirm: '确认',
  // cancel: '取消',
};

export default zhCN;
`,
    );
    console.log(chalk.green(`✓ 创建文件: src/locale/zh-CN.ts`));

    // src/locale/en-US.ts
    await fs.writeFile(
      path.join(componentDir, 'src', 'locale', 'en-US.ts'),
      `import type { ${pascalName}Locale } from './types';

const enUS: ${pascalName}Locale = {
  // Define English texts here
  // Example:
  // placeholder: 'Please input',
  // confirm: 'Confirm',
  // cancel: 'Cancel',
};

export default enUS;
`,
    );
    console.log(chalk.green(`✓ 创建文件: src/locale/en-US.ts`));

    // src/locale/types.ts
    await fs.writeFile(
      path.join(componentDir, 'src', 'locale', 'types.ts'),
      `export interface ${pascalName}Locale {
  // 在这里定义多语言文案类型
  // 示例:
  // placeholder: string;
  // confirm: string;
  // cancel: string;
}
`,
    );
    console.log(chalk.green(`✓ 创建文件: src/locale/types.ts`));

    // src/locale/index.ts
    await fs.writeFile(
      path.join(componentDir, 'src', 'locale', 'index.ts'),
      `import zhCN from './zh-CN';
import enUS from './en-US';

export { zhCN, enUS };
export type { ${pascalName}Locale } from './types';

export const ${componentName}Locale = {
  'zh-CN': zhCN,
  'en-US': enUS,
};
`,
    );
    console.log(chalk.green(`✓ 创建文件: src/locale/index.ts`));
  }
}

// ============ 测试文件生成器 ============

async function generateTestFile(
  componentDir: string,
  componentName: string,
  pascalName: string,
  config: ComponentConfig,
) {
  const testTemplate = `import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ${pascalName} } from '../src';

describe('${pascalName} 组件', () => {
  describe('渲染测试', () => {
    it('应该正确渲染默认组件', () => {
      const wrapper = mount(${pascalName}, {
        slots: {
          default: '测试内容',
        },
      });

      expect(wrapper.text()).toBe('测试内容');
      expect(wrapper.classes()).toContain('aix-${componentName}');
    });

    it('应该正确渲染插槽内容', () => {
      const wrapper = mount(${pascalName}, {
        slots: {
          default: '<span class="custom-content">自定义内容</span>',
        },
      });

      expect(wrapper.find('.custom-content').exists()).toBe(true);
      expect(wrapper.find('.custom-content').text()).toBe('自定义内容');
    });
  });

  describe('Props 测试', () => {
    it('应该接受 props', () => {
      // TODO: 添加 Props 测试
    });
  });

  describe('Emits 测试', () => {
    it('应该触发事件', () => {
      // TODO: 添加 Emits 测试
    });
  });

  describe('边缘情况测试', () => {
    it('空内容时应该正常渲染', () => {
      const wrapper = mount(${pascalName});
      expect(wrapper.exists()).toBe(true);
    });
  });
});
`;

  await fs.writeFile(
    path.join(componentDir, '__test__', `${pascalName}.test.ts`),
    testTemplate,
  );
  console.log(chalk.green(`✓ 创建文件: __test__/${pascalName}.test.ts`));
}

// ============ Story 文件生成器 ============

async function generateStoryFile(
  componentDir: string,
  componentName: string,
  pascalName: string,
  config: ComponentConfig,
) {
  const storyTemplate = `import type { Meta, StoryObj } from '@storybook/vue3';
import ${pascalName} from '../src/${pascalName}.vue';
import type { ${pascalName}Props } from '../src/types';

const meta: Meta<typeof ${pascalName}> = {
  title: '${pascalName}',
  component: ${pascalName},
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'AIX ${pascalName} 组件',
      },
    },
  },
  argTypes: {
    // 在这里定义组件的 argTypes
    // 示例:
    // type: {
    //   control: 'select',
    //   options: ['primary', 'default'],
    //   description: '组件类型',
    //   table: {
    //     type: { summary: 'string' },
    //     defaultValue: { summary: 'default' },
    //   },
    // },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 基础示例
 */
export const Default: Story = {
  render: (args: ${pascalName}Props) => ({
    components: { ${pascalName} },
    setup() {
      return { args };
    },
    template: '<${pascalName} v-bind="args">${pascalName} 示例</${pascalName}>',
  }),
};

/**
 * 交互式 Playground
 * 在 Controls 面板中调整参数查看效果
 */
export const Playground: Story = {
  args: {
    // 在这里设置默认参数
  },
  render: (args: ${pascalName}Props) => ({
    components: { ${pascalName} },
    setup() {
      return { args };
    },
    template: '<${pascalName} v-bind="args">点击我试试</${pascalName}>',
  }),
};
`;

  await fs.writeFile(
    path.join(componentDir, 'stories', `${pascalName}.stories.ts`),
    storyTemplate,
  );
  console.log(chalk.green(`✓ 创建文件: stories/${pascalName}.stories.ts`));
}

// ============ README 生成器 ============

async function generateReadme(
  componentDir: string,
  componentName: string,
  pascalName: string,
  config: ComponentConfig,
) {
  let i18nSection = '';
  if (config.features.i18n) {
    i18nSection = `

### 多语言支持

\`\`\`vue
<template>
  <${pascalName} />
</template>

<script setup>
import { ${pascalName}, ${componentName}Locale } from '@aix/${componentName}';
import { useLocale } from '@aix/hooks';

// 获取多语言文案
const { t } = useLocale(${componentName}Locale);

// 使用文案
console.log(t.value.placeholder);
</script>
\`\`\`

支持的语言：
- 简体中文 (zh-CN)
- 英文 (en-US)
`;
  }

  const readme = `# @aix/${componentName}

${config.description}

## ✨ 特性

- 🎯 **TypeScript**: 完整的类型定义，提供最佳开发体验
- 📦 **Tree-shaking**: 支持按需引入，优化包体积
- 🎨 **主题定制**: 基于 CSS Variables，易于定制${config.features.i18n ? '\n- 🌍 **多语言**: 内置国际化支持' : ''}

## 📦 安装

\`\`\`bash
pnpm add @aix/${componentName}
# 或
npm install @aix/${componentName}
# 或
yarn add @aix/${componentName}
\`\`\`

## 🔨 使用

### 基础用法

\`\`\`vue
<template>
  <${pascalName}>Hello</${pascalName}>
</template>

<script setup>
import { ${pascalName} } from '@aix/${componentName}';
</script>
\`\`\`

### 插件方式

\`\`\`typescript
import { createApp } from 'vue';
import ${pascalName}Plugin from '@aix/${componentName}';

const app = createApp(App);
app.use(${pascalName}Plugin);
\`\`\`
${i18nSection}
## API

### Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| - | - | - | - | 待完善 |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| - | - | 待完善 |

### Slots

| 插槽名 | 说明 |
|--------|------|
| \`default\` | 默认内容 |

## 🎨 样式定制

### CSS 类名

组件使用标准的 CSS 类名，您可以通过覆盖以下类来自定义样式：

\`\`\`css
/* 基础样式 */
.aix-${componentName} { }
\`\`\`

### CSS Variables

组件样式基于主题变量，您可以通过修改以下变量来定制主题：

\`\`\`css
:root {
  --aix-colorPrimary: #1890ff;
  --aix-colorBgContainer: #ffffff;
  --aix-colorBorder: #d9d9d9;
  /* 更多变量请查看 @aix/theme */
}
\`\`\`

## 📝 类型定义

\`\`\`typescript
export interface ${pascalName}Props {
  // 待完善
}

export interface ${pascalName}Emits {
  // 待完善
}
\`\`\`

## 📄 License

MIT
`;

  await fs.writeFile(path.join(componentDir, 'README.md'), readme);
  console.log(chalk.green(`✓ 创建文件: README.md`));
}

// ============ 主函数 ============

async function main() {
  try {
    const config = await collectConfig();
    await generateComponent(config);
  } catch (error: any) {
    console.error(chalk.red(`\n❌ 发生错误: ${error.message}`));
    process.exit(1);
  }
}

main();
