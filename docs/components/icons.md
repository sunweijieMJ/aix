---
title: Icons 图标
outline: deep
---

语义化的矢量图标库，包含 580+ 个 SVG 图标组件。

## 何时使用

- 需要在界面中使用图标
- 需要按需导入减小打包体积
- 需要自定义图标颜色和大小

## 安装

```bash
pnpm add @aix/icons
```

## 代码演示

### 基础用法

直接导入需要的图标组件使用。

```vue
<template>
  <div class="icons-demo">
    <Home />
    <Setting />
    <Search />
    <Add />
    <Delete />
  </div>
</template>

<script setup lang="ts">
import { Home, Setting, Add, Delete } from '@aix/icons';
import { IconSearch as Search } from '@aix/icons';
</script>

<style scoped>
.icons-demo {
  display: flex;
  gap: 16px;
  font-size: 24px;
}
</style>
```

### 自定义大小

通过 CSS `font-size` 或 `width`/`height` 控制图标大小。

```vue
<template>
  <div class="icons-size">
    <Home style="font-size: 16px" />
    <Home style="font-size: 24px" />
    <Home style="font-size: 32px" />
    <Home style="font-size: 48px" />
  </div>
</template>

<script setup lang="ts">
import { Home } from '@aix/icons';
</script>
```

### 自定义颜色

通过 CSS `color` 属性控制图标颜色。

```vue
<template>
  <div class="icons-color">
    <Home style="color: #1890ff" />
    <Home style="color: #52c41a" />
    <Home style="color: #faad14" />
    <Home style="color: #f5222d" />
  </div>
</template>

<script setup lang="ts">
import { Home } from '@aix/icons';
</script>

<style scoped>
.icons-color {
  display: flex;
  gap: 16px;
  font-size: 24px;
}
</style>
```

### 配合主题使用

使用主题系统的 CSS 变量。

```vue
<template>
  <div class="icons-theme">
    <Home :style="{ color: cssVar.colorPrimary }" />
    <CheckCircle :style="{ color: cssVar.colorSuccess }" />
    <Warning :style="{ color: cssVar.colorWarning }" />
    <Error :style="{ color: cssVar.colorError }" />
  </div>
</template>

<script setup lang="ts">
import { Home, CheckCircle, Warning, Error } from '@aix/icons';
import { useTheme } from '@aix/theme';

const { cssVar } = useTheme();
</script>
```

### 在按钮中使用

```vue
<template>
  <div class="buttons">
    <Button type="primary">
      <Add style="margin-right: 4px" />
      新增
    </Button>
    <Button>
      <Edit style="margin-right: 4px" />
      编辑
    </Button>
    <Button type="text">
      <Delete style="margin-right: 4px" />
      删除
    </Button>
  </div>
</template>

<script setup lang="ts">
import { Button } from '@aix/button';
import { Add, Edit, Delete } from '@aix/icons';
</script>
```

## 图标分类

图标按功能分为以下类别：

| 分类 | 说明 | 数量 |
|------|------|------|
| **General** | 通用图标（箭头、操作、状态等） | 150+ |
| **Editor** | 编辑器图标（编辑、格式、视图等） | 40+ |
| **File** | 文件图标（文件、文件夹、附件等） | 50+ |
| **Device** | 设备图标（相机、电脑、存储等） | 30+ |
| **Image** | 图片图标（滤镜、裁剪、调整等） | 50+ |
| **Map** | 地图图标（定位、导航、地点等） | 70+ |
| **Notification** | 通知图标（提醒、事件、状态等） | 40+ |
| **Video** | 视频图标（播放、控制、媒体等） | 50+ |
| **Apps** | 应用图标（业务场景相关） | 100+ |

## 常用图标速查

### 通用操作

```vue
<script setup lang="ts">
import {
  Add,           // 添加
  Delete,        // 删除
  Edit,          // 编辑
  Save,          // 保存
  Close,         // 关闭
  Check,         // 确认
  Refresh,       // 刷新
  Download,      // 下载
  Upload,        // 上传
  Copy,          // 复制
} from '@aix/icons';
</script>
```

### 方向箭头

```vue
<script setup lang="ts">
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
</script>
```

### 状态图标

```vue
<script setup lang="ts">
import {
  CheckCircle,    // 成功
  Error,          // 错误
  Warning,        // 警告
  InfoOutline,    // 信息
  QuestionCircle, // 帮助
  Loading,        // 加载中
} from '@aix/icons';
</script>
```

### 媒体控制

```vue
<script setup lang="ts">
import {
  Play,           // 播放
  Pause,          // 暂停
  SkipNext,       // 下一个
  SkipPrevious,   // 上一个
  VolumeUp,       // 音量大
  VolumeOff,      // 静音
  Fullscreen,     // 全屏
  FullscreenExit, // 退出全屏
} from '@aix/icons';
</script>
```

### 文件类型

```vue
<script setup lang="ts">
import {
  Folder,         // 文件夹
  File,           // 文件
  PictureAsPdf,   // PDF
  Photo,          // 图片
  Movie,          // 视频
  Attachment,     // 附件
} from '@aix/icons';
</script>
```

### 用户相关

```vue
<script setup lang="ts">
import {
  Person,         // 用户
  People,         // 多用户
  Group,          // 群组
  AccountCircle,  // 头像
  PersonAdd,      // 添加用户
  Face,           // 人脸
} from '@aix/icons';
</script>
```

## API

### Props

所有图标组件支持以下属性：

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `class` | `string` | - | CSS 类名 |
| `style` | `CSSProperties` | - | 内联样式 |

### CSS 属性

图标大小和颜色通过 CSS 控制：

| CSS 属性 | 说明 | 示例 |
|----------|------|------|
| `font-size` | 图标大小 | `font-size: 24px` |
| `width` / `height` | 图标尺寸 | `width: 24px; height: 24px` |
| `color` | 图标颜色 | `color: #1890ff` |

## 按需导入

`@aix/icons` 支持 Tree Shaking，只导入使用的图标：

```typescript
// 推荐：按需导入
import { Home, Setting, Add } from '@aix/icons';

// 不推荐：全量导入
import * as Icons from '@aix/icons';
```

## 注意事项

### 命名冲突

部分图标名称可能与 HTML 元素或其他组件冲突，使用别名导入：

```typescript
// Search 可能与其他组件冲突
import { IconSearch as Search } from '@aix/icons';

// Input 与 HTML input 元素冲突
import { IconInput as InputIcon } from '@aix/icons';

// Menu 与其他组件冲突
import { IconMenu as MenuIcon } from '@aix/icons';

// Link 与路由组件冲突
import { IconLink as LinkIcon } from '@aix/icons';

// Filter 与数组方法冲突
import { IconFilter as FilterIcon } from '@aix/icons';
```

### 图标对齐

图标默认使用 `vertical-align: -0.125em` 对齐文字，可通过样式调整：

```vue
<template>
  <span>
    <Home style="vertical-align: middle" />
    首页
  </span>
</template>
```

::: tip 提示
完整图标列表请查看 Storybook 中的 Icons 展示页面。
:::
