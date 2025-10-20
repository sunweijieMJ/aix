# AIX Vue 组件库

> 使用 `Vue 3`, `Turborepo`, `Rollup`, `Vitest` 等主流技术搭建的 Vue3 组件库工程。

## 快速开始

### 创建新组件

1. 在 `packages/` 下创建新的组件目录
2. 添加 `package.json` 和 `tsconfig.json`
3. 创建 `rollup.config.js` 并引用根配置:

   ```javascript
   import { createRollupConfig } from '../../rollup.config.js';

   export default createRollupConfig(import.meta.dirname);
   ```

4. 在 `src/index.ts` 导出组件:

   ```typescript
   import type { App } from 'vue';
   import YourComponent from './YourComponent.vue';

   export { YourComponent };

   export default {
     install(app: App) {
       app.component('AixYourComponent', YourComponent);
     },
   };
   ```

详细的构建配置说明请查看 [rollup.config.md](./rollup.config.md)

## 文档系统

本项目提供两套独立的文档系统：

- **📚 VitePress 文档**: 官方使用文档、API 参考、教程
  - 开发: `pnpm docs:dev`
  - 构建: `pnpm docs:build`
  - 输出: `dist/docs/`

- **📖 Storybook**: 组件开发文档、交互式演示
  - 开发: `pnpm storybook:dev`
  - 构建: `pnpm storybook:build`
  - 输出: `dist/storybook/`

## 使用文档

- [功能清单](#功能清单)
- [目录结构](#目录结构)
- [开发环境](#开发环境)
- [常用脚本](#常用脚本)
- [打包发布](#打包发布)

## 功能清单

- [x] `button` 按钮组件 (Vue 3 示例组件)
- [ ] 待添加更多组件...

## 目录结构

```md
├── .changeset
├── .husky
├── .vscode
|
├── packages
|   ├── button          # Vue 3 按钮组件
|   ├── ...             # 待添加更多组件
|
├── scripts
|
├── typings
|
├── .browserslistrc
├── .cspell.json
├── .editorconfig
├── .gitignore
├── .gitlab-ci.yml
├── .markdownlint.json
├── .nvmrc
├── .prettierignore
├── .stylelintignore
├── commitlint.config.ts
├── eslint.config.ts
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── prettier.config.js
├── README.md
├── rollup.config.js
├── stylelint.config.js
├── tsconfig.json
├── turbo.json
├── vitest.config.ts
├── vitest.setup.ts
```

## 开发环境

<p align="left">
    <a href="https://npmjs.com/package/node"><img src="https://img.shields.io/badge/node-%3E%3D22.13.1-green" alt="node"></a>
    <a href="https://npmjs.com/package/npm"><img src="https://img.shields.io/badge/pnpm-%3E%3D9.15.4-blue" alt="pnpm"></a>
</p>

> `pnpm`安装依赖，`typescript` 编写代码。

- 全局安装 `pnpm`

  ```bash
  npm i pnpm -g
  ```

- 使用 `eslint`， `stylelint` 校验代码，`prettier` 格式化代码。需要安装相关的 `vscode` 插件

  - `eslint`: [https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint&ssr=false#review-details]
  - `stylelint`: [https://marketplace.visualstudio.com/items?itemName=stylelint.vscode-stylelint&ssr=false#review-details]
  - `prettier`: [https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode&ssr=false#review-details]
  - `i18n-ally`: [https://marketplace.visualstudio.com/items?itemName=lokalise.i18n-ally&ssr=false#review-details]
  - `css-modules`: [https://marketplace.visualstudio.com/items?itemName=clinyong.vscode-css-modules&ssr=false#review-details]
  - `css-variables`: [https://marketplace.visualstudio.com/items?itemName=vunguyentuan.vscode-css-variables&ssr=false#review-details]
  - `markdownlint`: [https://marketplace.visualstudio.com/items?itemName=DavidAnson.vscode-markdownlint&ssr=false#review-details]
  - `nvm`: [https://marketplace.visualstudio.com/items?itemName=henrynguyen5-vsc.vsc-nvm&ssr=false#review-details]

## 常用脚本

- 安装依赖

  ```bash
  pnpm i
  ```

- 开发编译

  ```bash
  pnpm dev
  ```

- 测试

  ```bash
  pnpm test
  ```

- cspell 校验

  ```bash
  pnpm cspell
  ```

- 校验代码

  ```bash
  pnpm lint
  ```

- ts 检查

  ```bash
  pnpm type-check
  ```

- 格式化代码

  ```bash
  pnpm format
  ```

- 生成 changelog

  ```bash
  pnpm changelog
  ```

- `commit` 代码

  ```bash
  pnpm commit
  ```

## 打包发布

- 生成 `dist` 包

  ```bash
  cd packages/xxx
  pnpm build
  ```

- 发布 `npm` 包

  ```bash
  pnpm publish
  ```

## CI/CD 自动化

项目配置了完整的 GitLab CI/CD 流程：

### Pipeline 阶段

2. **文档构建**: Storybook 和 VitePress 文档
3. **自动部署**: 部署到 GitLab Pages 或独立服务器
