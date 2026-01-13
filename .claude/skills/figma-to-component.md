---
name: figma-to-component
description: 【有Figma设计稿时使用】从设计稿提取设计数据、下载切图、映射CSS变量，然后调用 component-generator 生成组件
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

## 使用方式

### 基本用法

```bash
# 方式 1: 使用 Figma 文件 URL
/figma-to-component https://www.figma.com/file/xxx

# 方式 2: 使用 Figma 节点 URL (推荐)
/figma-to-component https://www.figma.com/file/xxx?node-id=123:456

# 方式 3: 交互式模式
/figma-to-component
```

### 高级用法

```bash
# 指定包名和组件名
/figma-to-component <figma-url> --package button --component Button

# 自动生成 Story
/figma-to-component <figma-url> --package button --with-story

# 自动生成测试
/figma-to-component <figma-url> --package button --with-test

# 自动下载切图到指定目录
/figma-to-component <figma-url> --package button --images-dir assets/images

# 使用自定义颜色映射
/figma-to-component <figma-url> --package button --color-mapping theme-mapping.json
```

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

## 颜色映射配置

### 动态映射（推荐）

颜色映射从 `@aix/theme` 包动态读取，确保与设计系统同步：

```bash
# 自动从 theme 包读取 CSS 变量
/figma-to-component <figma-url> --package button
```

**工作原理:**

1. 读取 `packages/theme/src/vars/semantic-tokens-light.css`
2. 解析 CSS 变量定义，提取颜色值
3. 构建 Figma 颜色 → CSS 变量映射表
4. 匹配 Figma 设计稿中的颜色

```
🎨 动态加载颜色映射...

   📂 读取 @aix/theme CSS 变量:
   - packages/theme/src/vars/semantic-tokens-light.css
   - packages/theme/src/vars/base-tokens.css

   ✓ 解析到 45 个颜色变量

   📊 主要映射:
   - rgb(19 194 194) → var(--colorPrimary)
   - rgb(0 0 0 / 0.88) → var(--colorText)
   - rgb(0 0 0 / 0.65) → var(--colorTextSecondary)
   - rgb(255 255 255) → var(--colorBgBase)
   - rgb(217 217 217) → var(--colorBorder)
   - rgb(245 34 45) → var(--colorError)
   - rgb(27 185 114) → var(--colorSuccess)
```

### 颜色匹配算法

当 Figma 颜色与 CSS 变量不完全匹配时，使用色差算法：

```typescript
// 使用 CIE Delta E 2000 算法计算颜色相似度
function findClosestVariable(figmaColor: RGB): string {
  const themeColors = parseThemeCSS();
  let bestMatch = { variable: '', distance: Infinity };

  for (const [variable, color] of themeColors) {
    const distance = deltaE2000(figmaColor, color);
    if (distance < bestMatch.distance) {
      bestMatch = { variable, distance };
    }
  }

  // 阈值: 距离 < 5 认为匹配
  return bestMatch.distance < 5 ? bestMatch.variable : null;
}
```

### 映射报告

```
🎨 颜色映射结果:

   ✅ 精确匹配 (4 个):
      rgb(19 194 194) → var(--colorPrimary)
      rgb(255 255 255) → var(--colorBgBase)
      rgb(217 217 217) → var(--colorBorder)
      rgb(0 0 0 / 0.88) → var(--colorText)

   ⚠️ 近似匹配 (2 个):
      rgb(20 195 193) → var(--colorPrimary) (距离: 1.2)
      rgb(216 216 216) → var(--colorBorder) (距离: 0.8)

   ❌ 未匹配 (1 个):
      rgb(255 100 50) → 无对应变量
      💡 建议: 添加到 theme 或使用 #FF6432
```

### 手动覆盖映射

如需覆盖自动映射，使用 `--color-override` 参数：

```bash
# 覆盖特定颜色映射
/figma-to-component <figma-url> --package button \
  --color-override "rgb(255 100 50)=var(--colorWarning)"

# 使用映射文件覆盖
/figma-to-component <figma-url> --package button \
  --color-mapping custom-mapping.json
```

### 自定义映射文件格式

```json
{
  "colorMapping": {
    "rgb(255 100 50)": "var(--colorWarning)",
    "#FF6432": "var(--colorCustom)"
  },
  "options": {
    "autoMatch": true,
    "threshold": 5,
    "fallbackToHex": true
  }
}
```

### 同步 Figma 与 Theme

当 Figma 设计稿中有新颜色时，可以同步到 theme 包：

```bash
# 分析 Figma 颜色并生成 theme 更新建议
/figma-to-component <figma-url> --analyze-colors

# 输出:
# 📊 Figma 颜色分析:
#    - 使用颜色: 12 个
#    - 已匹配: 10 个
#    - 未匹配: 2 个
#
# 💡 建议添加到 @aix/theme:
#    --colorAccent: rgb(255 100 50);
#    --colorHighlight: rgb(100 200 255);
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

## 错误处理

> **详细错误处理**: 见 [figma-extraction-guide.md#异常处理](../agents/figma-extraction-guide.md#️-异常处理)

### 快速参考

| 错误 | 解决方案 |
|------|----------|
| Figma 访问失败 | 检查文件权限、Access Token |
| 颜色映射失败 | 更新 theme-mapping.json |
| 图片下载失败 | 检查网络，使用 --retry-images |

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

## 相关文档

- [figma-extraction-guide.md](../agents/figma-extraction-guide.md) - **Figma MCP 详细操作指南**
- [component-generator.md](./component-generator.md) - 组件代码生成
- [component-design.md](../agents/component-design.md) - 组件设计规范
- [coding-standards.md](../agents/coding-standards.md) - 编码规范
