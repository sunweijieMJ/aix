# 技术分享

本目录包含 AIX 组件库团队的技术分享文章。

## 目录结构

```
tech-sharing/
├── index.md          # 技术分享首页
├── agent-team.md     # Claude Code Agent Team 完整使用指南
└── README.md         # 本文件
```

## 如何添加新文章

1. **创建文章文件**

```bash
# 在 tech-sharing 目录创建新的 .md 文件
touch docs/tech-sharing/your-article-name.md
```

2. **编写文章内容**

在文件开头添加 frontmatter：

```markdown
---
title: 你的文章标题
description: 简短的文章描述
outline: deep
---

# 文章标题

文章内容...
```

3. **更新配置**

编辑 `docs/.vitepress/config.ts`，在 `/tech-sharing/` 侧边栏中添加链接：

```typescript
'/tech-sharing/': [
  {
    text: '技术分享',
    items: [{ text: '概述', link: '/tech-sharing/' }],
  },
  {
    text: '工具与工作流',
    items: [
      { text: 'Claude Code Agent Team', link: '/tech-sharing/agent-team' },
      { text: '你的文章标题', link: '/tech-sharing/your-article-name' }, // 新增
    ],
  },
],
```

4. **在首页添加链接**

编辑 `docs/tech-sharing/index.md`，在文章列表中添加：

```markdown
- [你的文章标题](./your-article-name) - 简短描述
```

## 文章分类建议

- **工具与工作流** - AI 辅助开发、CLI 工具、自动化脚本
- **组件库架构** - Monorepo、构建、包管理
- **工程实践** - 代码质量、测试、性能
- **Vue 3 技术** - 组件设计、响应式、最佳实践
- **开发规范** - TypeScript、样式、无障碍性

## 文章质量要求

- ✅ 包含实际代码示例
- ✅ 基于真实项目经验
- ✅ 提供可复现的操作步骤
- ✅ 涵盖常见问题和解决方案
- ✅ 保持内容更新

## 预览和发布

```bash
# 本地预览
pnpm docs:dev

# 构建文档
pnpm docs:build

# 预览构建结果
pnpm docs:preview
```

## 相关命令

```bash
# 自动生成组件 API 文档
pnpm docs:gen

# 同步文档
pnpm sync:docs
```

---

**维护者**: AIX 组件库团队
