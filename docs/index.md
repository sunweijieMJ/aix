---
layout: home

hero:
  name: Aix
  text: Vue 3 企业级组件库
  tagline: 简洁、高效、可定制的组件库，助力企业快速构建高质量应用
  image:
    src: /logo.svg
    alt: Aix Logo
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 组件文档
      link: /components/
    - theme: alt
      text: GitHub
      link: https://github.com/sunweijieMJ/aix

features:
  - icon: 🎨
    title: 主题定制
    details: 基于 CSS 变量的完整主题系统，支持亮色/暗色主题切换，轻松定制品牌色
  - icon: 📦
    title: 开箱即用
    details: 提供丰富的企业级组件，完整的 TypeScript 类型定义，开箱即用
  - icon: ⚡
    title: 高性能
    details: 基于 Vue 3 Composition API，轻量级设计，优秀的性能表现
  - icon: 🔧
    title: 工程化
    details: Monorepo 架构，Turbo 构建，完整的测试和 CI/CD 流程
  - icon: 📚
    title: 文档完善
    details: 详细的 API 文档，丰富的示例代码，Storybook 交互式预览
  - icon: 🌍
    title: TypeScript
    details: 完整的 TypeScript 支持，提供类型推导和智能提示
---

## 安装

```bash
# 使用 pnpm
pnpm add @aix/button @aix/theme

# 使用 npm
npm install @aix/button @aix/theme

# 使用 yarn
yarn add @aix/button @aix/theme
```

## 快速上手

```vue
<script setup lang="ts">
import { Button } from '@aix/button';
import '@aix/theme/dist/index.css';
</script>

<template>
  <Button type="primary">主要按钮</Button>
  <Button>默认按钮</Button>
</template>
```

## 为什么选择 Aix？

- **现代化技术栈**：基于 Vue 3 + TypeScript + Vite 构建
- **企业级品质**：完整的测试覆盖，严格的代码规范
- **按需引入**：支持 Tree Shaking，减小打包体积
- **活跃维护**：持续更新，及时响应社区反馈
