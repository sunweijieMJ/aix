# @kit/vitest-config

monorepo 共享 vitest 测试配置基座。各包的 `vitest.config.ts` 从这里继承，根配置经 `projects` 直接引用各包配置文件，保证「turbo 包级口径」与「根口径（test:unit / coverage）」跑的是同一份配置。

## 用法

Vue 组件包（jsdom + `@vitejs/plugin-vue` + 共享 setup）：

```ts
import { defineConfig } from 'vitest/config';
import { createVueConfig } from '@kit/vitest-config';

export default defineConfig(createVueConfig());
```

纯 Node 包（node 环境，无 DOM / 网络 mock）：

```ts
export default defineConfig(createNodeConfig());
```

需要 DOM 但不需要 SFC 编译的浏览器 SDK（如 tracker/sdk）：

```ts
export default defineConfig(createVueConfig({ plugins: [] }));
```

`overrides` 支持 `test` 字段浅合并与 `plugins` 整体替换，详见 `index.js` 注释。

## 共享 setup（setup.ts）

`createVueConfig` 默认注入：`global.fetch` mock、`localStorage` mock、console.warn 过滤、console.error 静音。包可通过 `test.setupFiles` 覆盖为自己的 setup。
