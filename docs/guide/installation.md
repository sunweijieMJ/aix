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

```typescript
// 引入主题样式
import '@aix/theme/dist/index.css';

// 或者按需引入
import '@aix/theme/dist/vars/index.css'; // CSS 变量
```

## 版本管理

我们使用 [Changeset](https://github.com/changesets/changesets) 进行版本管理和发布。

查看[更新日志](/changelog)了解各版本的变更。

## 下一步

安装完成后，继续阅读：

- [快速开始](/guide/getting-started) - 了解如何使用组件
- [主题定制](/guide/theme) - 定制你的主题
