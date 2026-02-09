---
name: figma-to-component
description: 【有Figma设计稿时使用】从设计稿提取设计数据、下载切图、映射CSS变量，然后调用 component-generator 生成组件
license: MIT
compatibility: Requires Vue 3, TypeScript
metadata:
  author: aix
  version: "1.0.0"
  category: development
---

# Figma 组件生成器 Skill

## 功能概述

从 Figma 设计稿自动提取设计数据，然后**调用 `/component-generator`** 生成符合组件库规范的 Vue 组件代码。

**职责分工**:
- **本 Skill**: Figma 数据提取、颜色映射、切图下载、流程编排
- **figma-extraction-guide**: Figma MCP 详细操作指南
- **component-generator**: 组件代码生成、类型定义、样式生成

**核心能力**:
- ✅ **设计数据提取** - 从 Figma 提取布局、颜色、文本信息
- ✅ **自动颜色映射** - Figma 颜色 → CSS 变量
- ✅ **切图下载** - 自动下载并优化图片资源
- ✅ **调用组件生成器** - 传递设计数据给 `/component-generator`

> **Figma MCP 详细操作**: 数据提取、异常处理等详见 [figma-extraction-guide.md](../agents/figma-extraction-guide.md)

---

## 执行流程

### 步骤 1: 获取 Figma 设计数据

```
🎨 连接 Figma...

   ⏳ 获取设计稿数据...

   ✓ Figma 文件信息:
   - 文件名: AIX Design System
   - 节点名: Button Component
   - 尺寸: 120x40 px
   - 图层数量: 8 个

   📊 设计数据:
   - 文本图层: 1 个
   - 图片图层: 1 个
   - 矩形/形状: 6 个
   - 颜色数量: 4 个
```

> **详细操作**: 见 [figma-extraction-guide.md#step-2-获取设计数据](../agents/figma-extraction-guide.md#-step-2-获取设计数据)

### 步骤 2: 分析设计结构 & 颜色映射

```
🔍 分析设计结构...

   📐 布局分析:
   - 布局类型: Flex (水平)
   - 间距: 8px
   - 内边距: 12px 24px
   - 圆角: 4px

   🎨 颜色映射:
   - #1890FF → var(--aix-color-primary)
   - #FFFFFF → var(--aix-color-white)
   - #D9D9D9 → var(--aix-color-border)
```

### 步骤 3: 下载切图

```
📥 下载切图资源...

   ✓ 已下载 1 个资源:
   packages/button/assets/images/
   └── icon.svg (16x16 px, 1 KB)
```

> **详细操作**: 见 [figma-extraction-guide.md#step-4-下载图片资源](../agents/figma-extraction-guide.md#️-step-4-下载图片资源)

### 步骤 4: 调用组件生成器

```
🎨 调用 /component-generator 生成组件...

   传递 Figma 设计数据:
   - 布局: Flex (水平), gap: 8px
   - 颜色映射: 4 个 CSS 变量
   - 尺寸: padding 12px 24px, border-radius 4px
   - 切图: icon.svg (16x16)

   → 调用 /component-generator Button --package=button --with-story

   ✓ 组件生成完成

   📂 生成的文件:
   packages/button/
   ├── src/
   │   ├── Button.vue (主组件)
   │   └── index.ts (导出文件)
   └── stories/
       └── Button.stories.ts (Storybook story)
```

> **组件代码模板**: 详见 [component-generator.md](./component-generator.md)

### 步骤 5: 生成完成报告

```
✅ 组件生成完成!
─────────────────────────────────────────

📄 生成报告 (2026-01-12)

1️⃣ Figma 设计
   - 文件: AIX Design System
   - 节点: Button Component
   - 链接: https://www.figma.com/file/xxx?node-id=123:456

2️⃣ 生成的文件
   packages/button/
   ├── src/
   │   ├── Button.vue
   │   └── index.ts
   └── stories/
       └── Button.stories.ts

3️⃣ 颜色映射
   #1890FF → var(--aix-color-primary)
   #FFFFFF → var(--aix-color-white)

─────────────────────────────────────────

💡 下一步:
   1. 运行 Storybook: pnpm storybook:dev
   2. 添加单元测试
   3. 构建组件包: pnpm build --filter @aix/button
```

---

## 与其他 Skills 配合

### 完整工作流

```bash
# 步骤 1: 从 Figma 生成组件
/figma-to-component https://www.figma.com/file/xxx --package button --with-story

# 步骤 2: 添加单元测试
/test-generator packages/button

# 步骤 3: 运行 Storybook 查看效果
pnpm storybook:dev

# 步骤 4: 构建和检查
pnpm build --filter @aix/button
pnpm type-check && pnpm lint

# 步骤 5: 提交代码
git add packages/button/
git commit -m "feat(button): add Button component from Figma"
```

---

## 常见问题

### Q1: 生成的组件能直接使用吗？

**A:** 基本可以，建议检查:
- Props/Emits 是否符合需求
- CSS 变量映射是否正确
- 在 Storybook 中查看效果

### Q2: 如何处理 Figma 变体（Variants）？

**A:** Figma 变体自动转换为 Props:
```typescript
// Figma: Type = Primary | Default
// 生成: type?: 'primary' | 'default'
```

### Q3: 颜色映射不准确怎么办？

**A:** 使用自定义映射文件或生成后手动调整。

---
