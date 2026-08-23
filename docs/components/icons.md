---
title: Icons 图标
outline: deep
---

<script setup>
import { Home, Setting, Add, Delete, Edit, IconSearch, CheckCircle, Warning, Error, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Play, Pause, VolumeUp, VolumeOff, Fullscreen, Folder, File, Person, People } from '@aix/icons'
</script>

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

<div class="demo-block" style="display: flex; gap: 16px; font-size: 24px;">
  <Home />
  <Setting />
  <IconSearch />
  <Add />
  <Delete />
</div>

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

<div class="demo-block" style="display: flex; gap: 16px; align-items: center;">
  <Home style="font-size: 16px" />
  <Home style="font-size: 24px" />
  <Home style="font-size: 32px" />
  <Home style="font-size: 48px" />
</div>

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

<div class="demo-block" style="display: flex; gap: 16px; font-size: 24px;">
  <Home style="color: #1890ff" />
  <Home style="color: #52c41a" />
  <Home style="color: #faad14" />
  <Home style="color: #f5222d" />
</div>

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

<div class="demo-block" style="display: flex; gap: 16px; font-size: 24px; flex-wrap: wrap;">
  <Add title="添加" />
  <Delete title="删除" />
  <Edit title="编辑" />
  <IconSearch title="搜索" />
</div>

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

<div class="demo-block" style="display: flex; gap: 16px; font-size: 24px;">
  <ArrowUp title="向上" />
  <ArrowDown title="向下" />
  <ArrowLeft title="向左" />
  <ArrowRight title="向右" />
</div>

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

<div class="demo-block" style="display: flex; gap: 16px; font-size: 24px;">
  <CheckCircle style="color: #52c41a" title="成功" />
  <Error style="color: #f5222d" title="错误" />
  <Warning style="color: #faad14" title="警告" />
</div>

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

<div class="demo-block" style="display: flex; gap: 16px; font-size: 24px;">
  <Play title="播放" />
  <Pause title="暂停" />
  <VolumeUp title="音量" />
  <VolumeOff title="静音" />
  <Fullscreen title="全屏" />
</div>

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

<div class="demo-block" style="display: flex; gap: 16px; font-size: 24px;">
  <Folder title="文件夹" />
  <File title="文件" />
</div>

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

<div class="demo-block" style="display: flex; gap: 16px; font-size: 24px;">
  <Person title="用户" />
  <People title="多用户" />
</div>

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

::: warning 自动生成的 API 文档
以下 API 文档由 `pnpm docs:gen` 从组件源码自动生成。请勿手动编辑此部分。

如需更新 API 文档，请：
1. 修改组件源码中的 JSDoc 注释
2. 运行 `pnpm docs:gen` 生成到 README.md
3. 运行 `pnpm docs:sync` 同步到此文档
:::

### 图标组件属性

所有图标组件都支持以下属性，并通过 `v-bind="$attrs"` 透传所有其他 HTML/SVG 属性：

| 属性 | 类型 | 默认值 | 必填 | 描述 |
| --- | --- | --- | --- | --- |
| width | string \| number | '1em' | ❌ | 图标宽度 |
| height | string \| number | '1em' | ❌ | 图标高度 |
| color | string | 'currentColor' | ❌ | 图标颜色 |
| style | CSSProperties | - | ❌ | 自定义样式对象（支持所有 CSS 属性） |
| class | string | - | ❌ | CSS 类名 |

**事件支持**：通过 `v-bind="$attrs"` 支持所有原生 DOM 事件，包括：
- `@click` - 点击事件
- `@mouseenter` - 鼠标进入事件
- `@mouseleave` - 鼠标离开事件
- 以及其他所有标准 SVG/DOM 事件

**style 属性说明**：
- 支持传入 Vue 的 style 对象或字符串形式
- 可以控制颜色、大小、动画、变换等所有 CSS 属性
- style 中的样式会与组件内部样式合并
- 示例：
  ```vue
  <!-- 对象形式 (推荐) -->
  <Camera :style="{ fontSize: '24px', color: 'red', transform: 'rotate(45deg)' }" />

  <!-- 字符串形式 -->
  <Camera style="font-size: 24px; color: red; transform: rotate(45deg);" />
  ```

### 在第三方组件中使用

图标组件可以很方便地集成到各种 UI 框架中：

```vue
<template>
  <!-- 在 Element Plus 中使用 -->
  <el-button>
    <template #icon>
      <Camera :style="{ fontSize: '18px' }" />
    </template>
    拍照
  </el-button>

  <!-- 在 Ant Design Vue 中使用 -->
  <a-button>
    <template #icon>
      <Search :style="{ fontSize: '16px' }" />
    </template>
    搜索
  </a-button>

  <!-- 在自定义组件中使用 -->
  <CustomCard>
    <template #icon>
      <Setting :style="{ fontSize: '20px', color: '#1890ff' }" />
    </template>
  </CustomCard>
</template>

<script setup lang="ts">
import { Camera, Search, Setting } from '@aix/icons';
</script>
```

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
