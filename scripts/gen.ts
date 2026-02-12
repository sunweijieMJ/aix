import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';

interface ComponentAnswers {
  componentName: string;
}

const ROOT_DIR = path.resolve(process.cwd(), 'packages');

async function generateComponent() {
  const answers = await inquirer.prompt<ComponentAnswers>([
    {
      type: 'input',
      name: 'componentName',
      message: '请输入组件名称:',
      validate: (input: string) => {
        if (!input.trim()) {
          return '组件名称不能为空';
        }
        return true;
      },
    },
  ]);

  const componentName = answers.componentName;
  const componentDir = path.join(ROOT_DIR, componentName);

  try {
    // 创建组件主目录
    await fs.mkdir(componentDir, { recursive: true });
    console.log(chalk.green(`✓ 创建目录: ${componentDir}`));

    // 创建子目录
    const directories = ['__test__', 'src', 'stories'];
    for (const dir of directories) {
      await fs.mkdir(path.join(componentDir, dir), { recursive: true });
      console.log(chalk.green(`✓ 创建目录: ${componentDir}/${dir}`));
    }

    // 创建eslint.config.ts
    await fs.writeFile(
      path.join(componentDir, 'eslint.config.ts'),
      `import config from '../../eslint.config';

/** @type {import("eslint").Linter.Config} */
export default config;
`,
    );
    console.log(chalk.green(`✓ 创建文件: eslint.config.ts`));

    // 创建package.json
    await fs.writeFile(
      path.join(componentDir, 'package.json'),
      `{
  "name": "@aix/${componentName}",
  "version": "0.0.0",
  "description": "A Vue 3 ${toPascalCase(componentName)} component",
  "license": "MIT",
  "type": "module",
  "main": "./lib/index.js",
  "module": "./es/index.js",
  "types": "./es/index.d.ts",
  "style": "./es/index.css",
  "files": [
    "dist",
    "lib",
    "es"
  ],
  "scripts": {
    "dev": "rollup -c -w",
    "lint": "eslint . --max-warnings 0",
    "test": "vitest --run --passWithNoTests",
    "build": "pnpm run clean && pnpm run build:js && pnpm run build:types",
    "build:js": "rollup -c",
    "build:types": "vue-tsc --declaration --emitDeclarationOnly --outDir es",
    "clean": "rimraf dist lib es"
  },
  "dependencies": {
    "@aix/theme": "workspace:*"
  },
  "peerDependencies": {
    "vue": "^3.5.28"
  },
  "devDependencies": {
    "@kit/eslint-config": "workspace:*",
    "rimraf": "*",
    "tsx": "*",
    "typescript": "*"
  }
}
`,
    );
    console.log(chalk.green(`✓ 创建文件: package.json`));

    // 创建rollup.config.js
    await fs.writeFile(
      path.join(componentDir, 'rollup.config.js'),
      `import path from 'path';
import { createRollupConfig } from '../../rollup.config.js';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const dir = path.resolve(__dirname, '.');

export default createRollupConfig(dir);
`,
    );
    console.log(chalk.green(`✓ 创建文件: rollup.config.js`));

    // 创建tsconfig.json
    await fs.writeFile(
      path.join(componentDir, 'tsconfig.json'),
      `{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src", "typings", "../../typings"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.test.tsx"]
}
`,
    );
    console.log(chalk.green(`✓ 创建文件: tsconfig.json`));

    // 创建基础组件文件
    await fs.writeFile(
      path.join(componentDir, 'src', `${toPascalCase(componentName)}.vue`),
      `<template>
  <div :class="['aix-${componentName}']">
    <slot />
  </div>
</template>

<script setup lang="ts">
export interface ${toPascalCase(componentName)}Props {
  // 在这里定义组件的 props
}

export interface ${toPascalCase(componentName)}Emits {
  // 在这里定义组件的 emits
  // 例如: (e: 'change', value: string): void;
}

const props = withDefaults(defineProps<${toPascalCase(componentName)}Props>(), {
  // 在这里设置默认值
});

const emit = defineEmits<${toPascalCase(componentName)}Emits>();
</script>

<style scoped lang="scss">
.aix-${componentName} {
  // 在这里添加组件样式
}
</style>
`,
    );
    console.log(
      chalk.green(`✓ 创建文件: src/${toPascalCase(componentName)}.vue`),
    );

    // 创建入口文件
    await fs.writeFile(
      path.join(componentDir, 'src', 'index.ts'),
      `import type { App } from 'vue';
import ${toPascalCase(componentName)} from './${toPascalCase(componentName)}.vue';

export type { ${toPascalCase(componentName)}Props, ${toPascalCase(componentName)}Emits } from './${toPascalCase(componentName)}.vue';

// 支持单独导入
export { ${toPascalCase(componentName)} };

// 支持插件方式安装
export default {
  install(app: App) {
    app.component('Aix${toPascalCase(componentName)}', ${toPascalCase(componentName)});
  },
};
`,
    );
    console.log(chalk.green(`✓ 创建文件: src/index.ts`));

    // 创建测试文件
    await fs.writeFile(
      path.join(
        componentDir,
        '__test__',
        `${toPascalCase(componentName)}.test.ts`,
      ),
      `import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ${toPascalCase(componentName)} } from '../src';

describe('${toPascalCase(componentName)} 组件', () => {
  describe('渲染测试', () => {
    it('应该正确渲染默认组件', () => {
      const wrapper = mount(${toPascalCase(componentName)}, {
        slots: {
          default: '测试内容',
        },
      });

      expect(wrapper.text()).toBe('测试内容');
      expect(wrapper.classes()).toContain('aix-${componentName}');
    });

    it('应该正确渲染插槽内容', () => {
      const wrapper = mount(${toPascalCase(componentName)}, {
        slots: {
          default: '<span class="custom-content">自定义内容</span>',
        },
      });

      expect(wrapper.find('.custom-content').exists()).toBe(true);
      expect(wrapper.find('.custom-content').text()).toBe('自定义内容');
    });
  });

  // 在这里添加更多测试用例
});
`,
    );
    console.log(
      chalk.green(
        `✓ 创建文件: __test__/${toPascalCase(componentName)}.test.ts`,
      ),
    );

    // 创建story文件
    await fs.writeFile(
      path.join(
        componentDir,
        'stories',
        `${toPascalCase(componentName)}.stories.ts`,
      ),
      `import type { Meta, StoryObj } from '@storybook/vue3';
import ${toPascalCase(componentName)} from '../src/${toPascalCase(componentName)}.vue';

const meta = {
  title: 'Components/${toPascalCase(componentName)}',
  component: ${toPascalCase(componentName)},
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'AIX ${toPascalCase(componentName)} 组件',
      },
    },
  },
  argTypes: {
    // 在这里定义组件的 argTypes
    // 例如:
    // type: {
    //   control: 'select',
    //   options: ['primary', 'default'],
    //   description: '组件类型',
    // },
  },
  args: {
    default: '${toPascalCase(componentName)}',
  },
} satisfies Meta<typeof ${toPascalCase(componentName)}>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 基础示例
 */
export const Default: Story = {
  render: (args) => ({
    components: { ${toPascalCase(componentName)} },
    setup() {
      return { args };
    },
    template: '<${toPascalCase(componentName)} v-bind="args">${toPascalCase(componentName)} 示例</${toPascalCase(componentName)}>',
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
  render: (args) => ({
    components: { ${toPascalCase(componentName)} },
    setup() {
      return { args };
    },
    template: '<${toPascalCase(componentName)} v-bind="args">点击我试试</${toPascalCase(componentName)}>',
  }),
};
`,
    );
    console.log(
      chalk.green(
        `✓ 创建文件: stories/${toPascalCase(componentName)}.stories.ts`,
      ),
    );

    console.log(chalk.green.bold(`\n✅ 组件 ${componentName} 创建成功!`));
  } catch (error: any) {
    console.error(chalk.red(`❌ 创建失败: ${error.message}`));
    process.exit(1);
  }
}

function toPascalCase(str: string): string {
  return str
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

generateComponent();
