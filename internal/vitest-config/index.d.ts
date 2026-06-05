/**
 * @kit/vitest-config 类型声明
 *
 * 经 package.json exports "." 的 "types" 条件接入。
 */
import type { ViteUserConfig } from 'vitest/config';

/** Vue 组件包基座：jsdom + @vitejs/plugin-vue + 共享 setup（fetch/localStorage mock、console 过滤） */
export declare function createVueConfig(overrides?: ViteUserConfig): ViteUserConfig;

/** 纯 Node 包基座：node 环境，无 DOM / 网络 mock */
export declare function createNodeConfig(overrides?: ViteUserConfig): ViteUserConfig;
