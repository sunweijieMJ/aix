---
title: Icons API
outline: deep
---

# Icons API

## 概述

`@aix/icons` 提供 580+ 个语义化 SVG 图标组件，支持按需导入和 Tree Shaking。

## 安装

```bash
pnpm add @aix/icons
```

## 导入方式

```typescript
// 按需导入（推荐）
import { Home, Setting, Add } from '@aix/icons';

// 别名导入（解决命名冲突）
import { IconSearch as Search } from '@aix/icons';
```

## 通用 Props

所有图标组件继承 SVG 元素属性，支持以下常用属性：

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `class` | `string` | - | CSS 类名 |
| `style` | `CSSProperties` | - | 内联样式 |
| `title` | `string` | - | 图标标题，用于无障碍提示 |

## 样式控制

图标大小和颜色通过 CSS 控制，不使用 Props：

| CSS 属性 | 说明 | 示例 |
|----------|------|------|
| `font-size` | 图标大小 | `font-size: 24px` |
| `width` / `height` | 图标尺寸 | `width: 24px; height: 24px` |
| `color` | 图标颜色（继承父元素） | `color: var(--aix-color-primary)` |
| `vertical-align` | 垂直对齐 | `vertical-align: -0.125em`（默认值） |

## 图标分类

| 分类 | 目录 | 说明 | 数量 |
|------|------|------|------|
| General | `General/` | 通用图标（箭头、操作、状态等） | 150+ |
| Editor | `Editor/` | 编辑器图标（编辑、格式、视图等） | 40+ |
| File | `File/` | 文件图标（文件、文件夹、附件等） | 50+ |
| Device | `Device/` | 设备图标（相机、电脑、存储等） | 30+ |
| Image | `Image/` | 图片图标（滤镜、裁剪、调整等） | 50+ |
| Map | `Map/` | 地图图标（定位、导航、地点等） | 70+ |
| Notification | `Notification/` | 通知图标（提醒、事件、状态等） | 40+ |
| Video | `Video/` | 视频图标（播放、控制、媒体等） | 50+ |
| Apps | `Apps/` | 应用图标（业务场景相关） | 100+ |

## 常用图标索引

### 通用操作

```typescript
import {
  Add,           // 添加
  Delete,        // 删除
  Edit,          // 编辑
  Close,         // 关闭
  Check,         // 确认
  Refresh,       // 刷新
  Download,      // 下载
  Upload,        // 上传
  Copy,          // 复制
  IconSearch,    // 搜索（别名导出，避免冲突）
} from '@aix/icons';
```

### 方向箭头

```typescript
import {
  ArrowUp,        // 向上
  ArrowDown,      // 向下
  ArrowLeft,      // 向左
  ArrowRight,     // 向右
  ArrowBack,      // 返回
  ArrowForward,   // 前进
  ArrowDropDown,  // 下拉
  ArrowDropUp,    // 上拉
} from '@aix/icons';
```

### 状态提示

```typescript
import {
  CheckCircle,    // 成功
  Error,          // 错误
  Warning,        // 警告
  InfoOutline,    // 信息
  QuestionCircle, // 帮助
} from '@aix/icons';
```

### 媒体控制

```typescript
import {
  Play,           // 播放
  Pause,          // 暂停
  SkipNext,       // 下一个
  SkipPrevious,   // 上一个
  VolumeUp,       // 音量大
  VolumeOff,      // 静音
  Fullscreen,     // 全屏
} from '@aix/icons';
```

### 文件类型

```typescript
import {
  Folder,         // 文件夹
  File,           // 文件
  PictureAsPdf,   // PDF
  Photo,          // 图片
  Movie,          // 视频
  Attachment,     // 附件
} from '@aix/icons';
```

### 用户相关

```typescript
import {
  Person,         // 用户
  People,         // 多用户
  AccountCircle,  // 头像
  PersonAdd,      // 添加用户
} from '@aix/icons';
```

## 命名冲突处理

以下图标使用 `Icon` 前缀导出以避免命名冲突：

| 导出名 | 原始名 | 冲突原因 |
|--------|--------|----------|
| `IconSearch` | Search | 与其他组件冲突 |
| `IconInput` | Input | 与 HTML input 元素冲突 |
| `IconMenu` | Menu | 与其他组件冲突 |
| `IconLink` | Link | 与路由组件冲突 |
| `IconFilter` | Filter | 与数组方法冲突 |

## Tree Shaking

`@aix/icons` 提供 ESM 格式输出，打包工具会自动移除未使用的图标：

```typescript
// 只有 Home 和 Setting 会被打包
import { Home, Setting } from '@aix/icons';
```

::: tip
完整图标列表请查看 Storybook 中的 Icons 展示页面。
:::
