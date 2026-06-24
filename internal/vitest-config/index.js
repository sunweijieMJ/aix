import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** 共享 setup：fetch / localStorage mock、console.warn 过滤、console.error 静音 */
const sharedSetup = path.join(dirname, 'setup.ts');

/** 各环境通用的测试基座（项目名缺省取 package.json 的 name，全仓 name 唯一） */
const baseTest = {
  globals: true,
  passWithNoTests: true,
  include: ['__test__/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
  exclude: ['**/node_modules/**', '**/dist/**', '**/es/**', '**/lib/**', '**/coverage/**'],
};

/**
 * Vue 组件包基座：jsdom + @vitejs/plugin-vue + 共享 setup
 * @param {import('vitest/config').ViteUserConfig} [overrides] test 字段浅合并覆盖基座；plugins 提供时整体替换（如 ai-chat 用 unplugin-vue）
 */
export function createVueConfig(overrides = {}) {
  const { test = {}, plugins, ...rest } = overrides;
  return {
    plugins: plugins ?? [vue()],
    ...rest,
    test: {
      ...baseTest,
      environment: 'jsdom',
      setupFiles: [sharedSetup],
      ...test,
    },
  };
}

/**
 * 纯 Node 包基座：node 环境，无 DOM / 网络 mock
 * @param {import('vitest/config').ViteUserConfig} [overrides] test 字段浅合并覆盖基座
 */
export function createNodeConfig(overrides = {}) {
  const { test = {}, plugins, ...rest } = overrides;
  return {
    ...(plugins ? { plugins } : {}),
    ...rest,
    test: {
      ...baseTest,
      environment: 'node',
      ...test,
    },
  };
}
