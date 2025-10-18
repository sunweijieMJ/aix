# @aix/theme

AIX Design System - 强大的主题系统，基于 Token 架构和 TypeScript API

## ✨ 特性

- 🎨 **Token 系统**：两层架构（基础Token + 语义Token）
- 🌓 **暗色模式**：内置亮色/暗色主题，支持自动切换
- 🎯 **TypeScript**：完整的类型定义和类型安全
- 🚀 **运行时API**：ThemeController 运行时主题管理
- 🎭 **预设主题**：5个内置主题，支持自定义
- 🔧 **颜色算法**：自动生成派生颜色（hover/active/bg等）
- 📦 **按需加载**：支持按需引入CSS变量
- 💾 **持久化**：自动保存用户主题偏好

## 📦 安装

```bash
pnpm add @aix/theme
npm install @aix/theme
yarn add @aix/theme
```

## 🚀 快速开始

### 1. 引入样式

```typescript
// main.ts
import '@aix/theme/style'; // 完整主题

// 或按需引入
import '@aix/theme/vars/light'; // 仅亮色
import '@aix/theme/vars/dark';  // 仅暗色
import '@aix/theme/vars/base';  // 仅基础Token
```

### 2. 使用主题控制器

```typescript
import { themeController } from '@aix/theme';

// 切换暗色模式
themeController.setMode('dark');

// 应用预设主题
themeController.applyPreset('tech'); // 科技蓝
```

## 核心API

### defineTheme - 定义主题

```typescript
import { defineTheme } from '@aix/theme';

const myTheme = defineTheme({
  token: {
    colorPrimary: 'rgb(0 102 255)',
    fontSize: '16px',
  },
  algorithm: 'default', // 'default' | 'dark' | 'compact'
});
```

### ThemeController - 运行时管理

```typescript
import { themeController } from '@aix/theme';

// 设置模式
themeController.setMode('dark');
themeController.toggleMode(); // 切换

// 设置Token
themeController.setToken('colorPrimary', '#ff0000');
themeController.setTokens({
  colorPrimary: '#1890ff',
  fontSize: '16px',
});

// 应用预设
themeController.applyPreset('tech');

// 监听变化
themeController.onChange((event) => {
  console.log('Theme changed:', event.detail.mode);
});

// 跟随系统
themeController.watchSystemTheme();
```

### 颜色算法

```typescript
import {
  generateColorSeries,
  generateColorPalette,
  adjustLightness
} from '@aix/theme';

// 生成完整色系
const series = generateColorSeries('rgb(0 180 180)');
// { base, hover, active, bg, border, text, ... }

// 生成10级色盘
const palette = generateColorPalette('rgb(0 180 180)');

// 调整亮度
const lighter = adjustLightness('rgb(0 180 180)', 20);
```

## 🎭 预设主题

| 名称 | 主色 | 说明 |
|------|------|------|
| `default` | Cyan | 默认青色主题 |
| `tech` | Blue | 科技蓝主题 |
| `nature` | Green | 自然绿主题 |
| `sunset` | Orange | 日落橙主题 |
| `purple` | Purple | 优雅紫主题 |

```typescript
themeController.applyPreset('tech');
```

## 🏗️ 架构设计

### Token 层级

```
基础Token (原子级)
--tokenCyan6, --tokenSpacing4
    ↓ 映射
语义Token (业务级)
--colorPrimary, --padding
    ↓ 使用
组件样式
```

### CSS变量使用

```css
/* ✅ 推荐：使用语义Token */
.button {
  background: var(--colorPrimary);
  padding: var(--padding);
}

/* ❌ 避免：使用基础Token */
.button {
  background: var(--tokenCyan6);
  padding: 16px;
}
```

## 📝 Token 列表

### 颜色Token

- 品牌色：`--colorPrimary`, `--colorPrimaryHover`, `--colorPrimaryActive`
- 功能色：`--colorSuccess`, `--colorWarning`, `--colorError`
- 文本色：`--colorText`, `--colorTextSecondary`, `--colorTextTertiary`
- 背景色：`--colorBgBase`, `--colorBgContainer`, `--colorBgLayout`
- 边框色：`--colorBorder`, `--colorBorderSecondary`

### 尺寸Token

- 间距：`--sizeXXS` (4px) ~ `--sizeXXL` (48px)
- 字号：`--fontSizeXS` (12px) ~ `--fontSizeXXL` (20px)
- 圆角：`--borderRadiusXS` (2px) ~ `--borderRadiusLG` (8px)
- 控制高度：`--controlHeightXS` ~ `--controlHeightLG`

## 🔧 构建产物

```
dist/
├── index.js          # ESM 主入口
├── index.cjs         # CJS 入口
├── index.d.ts        # 类型定义
├── index.css         # 完整CSS（包含所有Token）
└── vars/
    ├── base-tokens.css      # 基础Token
    ├── light.css            # 亮色语义Token
    └── dark.css             # 暗色语义Token
```

## 📚 更多文档

查看完整文档：[主题定制指南](../../docs/guide/theme.md)

## 📄 License

MIT
