# 安装

## 环境要求

- Node.js >= 22
- Vue >= 3.5.0

## 使用包管理器安装

### pnpm（推荐）

```bash
pnpm add @aix/button @aix/theme
```

### npm

```bash
npm install @aix/button @aix/theme
```

### yarn

```bash
yarn add @aix/button @aix/theme
```

## CDN 引入

你也可以通过 CDN 的方式引入 Aix（暂未支持，将在后续版本提供）。

## 包说明

Aix 采用 Monorepo 架构，每个组件都是独立的 npm 包：

| 包名 | 说明 | 版本 |
|------|------|------|
| `@aix/theme` | 主题包（CSS 变量、样式） | v1.0.0 |
| `@aix/button` | 按钮组件 | v1.0.0 |

## 样式引入

使用组件前，需要引入样式文件：

`@aix/theme` 提供的是 CSS 变量（设计 Token），组件自身的样式由各组件包的 `./style` 导出提供。

```typescript
// 主题 CSS 变量（全量：基础 Token + 亮色 + 暗色）
import '@aix/theme/style';

// 组件样式（每个用到的组件包各引一次）
import '@aix/button/style';
```

若只需要单一模式，可按需引入以减小体积：

```typescript
import '@aix/theme/vars/base'; // 基础 Token（色阶、间距、字号）
import '@aix/theme/vars/light'; // 仅亮色语义变量
```

## 版本管理

我们使用 [Changeset](https://github.com/changesets/changesets) 进行版本管理和发布。

查看 [GitHub Releases](https://github.com/sunweijieMJ/aix/releases) 了解各版本的变更。

## 下一步

安装完成后，继续阅读：

- [快速开始](/guide/getting-started) - 了解如何使用组件
- [主题定制](/guide/theme) - 定制你的主题
