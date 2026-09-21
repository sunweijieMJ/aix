---
title: Icons 图标
outline: deep
---

<script setup>
import { Home, Setting, Add, Delete, Edit, IconSearch, CheckCircle, Warning, Error, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Play, Pause, VolumeUp, VolumeOff, Fullscreen, Folder, File, Person, People } from '@aix/icons'
import { Button } from '@aix/button'
</script>

# Icons 图标

语义化的矢量图标库，580 个 SVG 图标组件，每个图标是一个独立的 Vue 组件，按 `width` / `height` / `color` 三个属性控制外观。

## 何时使用

- 界面里需要图标，且希望图标跟随文字大小与颜色（默认 `1em` + `currentColor`）
- 需要按需导入、只把用到的图标打进产物
- 需要把图标传给其他 UI 框架的 `icon` 插槽（Element Plus、Ant Design Vue 等）

图标的尺寸与颜色由使用方决定，本库不提供按钮态、悬浮态等交互样式；需要可点击的图标按钮请用
[Button 按钮](/components/button) 包一层。业务自有图标不要往这里加，直接在业务侧维护 SVG 组件即可。

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

颜色指向 `@aix/theme` 的语义 token，图标就会跟随亮暗模式切换。

<div class="demo-block" style="display: flex; gap: 16px; font-size: 24px;">
  <Home style="color: var(--aix-colorPrimary)" />
  <CheckCircle style="color: var(--aix-colorSuccess)" />
  <Warning style="color: var(--aix-colorWarning)" />
  <Error style="color: var(--aix-colorError)" />
</div>

```vue
<template>
  <Home style="color: var(--aix-colorPrimary)" />
  <CheckCircle style="color: var(--aix-colorSuccess)" />
  <Warning style="color: var(--aix-colorWarning)" />
  <Error style="color: var(--aix-colorError)" />
</template>

<script setup lang="ts">
import { Home, CheckCircle, Warning, Error } from '@aix/icons';
</script>
```

变量名想要类型提示时用 `useTheme()` 的 `cssVar`，它返回的就是 `var(--aix-*)` 字符串：

```vue
<script setup lang="ts">
import { useTheme } from '@aix/theme';

const { cssVar } = useTheme();
// cssVar.colorPrimary => "var(--aix-colorPrimary)"
</script>
```

### 在按钮中使用

<div class="demo-block" style="display: flex; gap: 12px; align-items: center;">
  <Button type="primary"><Add style="margin-right: 4px" />新增</Button>
  <Button><Edit style="margin-right: 4px" />编辑</Button>
  <Button type="text"><Delete style="margin-right: 4px" />删除</Button>
</div>

```vue
<template>
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
</template>

<script setup lang="ts">
import { Button } from '@aix/button';
import { Add, Edit, Delete } from '@aix/icons';
</script>
```

## API

::: tip API 来源
以下内容同步自 `packages/icons/README.md` 的 API 段。该包没有可解析的组件源码，API 表由人工维护；修改请改 README，再运行 `pnpm docs:gen`。
:::

### 图标组件属性

所有图标组件都支持以下属性，并通过 `v-bind="$attrs"` 透传所有其他 HTML/SVG 属性：

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `width` | `string \| number` | `'1em'` | - | 图标宽度 |
| `height` | `string \| number` | `'1em'` | - | 图标高度 |
| `color` | `string` | `'currentColor'` | - | 图标颜色 |

> `class` / `style` 不是声明的 prop，走 `$attrs` 落到根 `<svg>` 上，用法与普通元素一致。
>
> 没有 `title` 属性。透传上去只会变成 `<svg title="…">`，SVG 不认这个属性、不会有提示气泡；
> 需要无障碍名称请用 `aria-label`，需要悬浮提示请在外层包一个带 `title` 的元素。

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
      <IconSearch :style="{ fontSize: '16px' }" />
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
import { Camera, IconSearch, Setting } from '@aix/icons';
</script>
```

## 图标分类

图标按功能分为以下类别：

| 分类 | 说明 | 数量 |
|------|------|------|
| **General** | 通用图标（箭头、操作、状态等） | 162 |
| **Apps** | 应用图标（业务场景相关） | 89 |
| **Map** | 地图图标（定位、导航、地点等） | 79 |
| **Image** | 图片图标（滤镜、裁剪、调整等） | 60 |
| **Video** | 视频图标（播放、控制、媒体等） | 50 |
| **File** | 文件图标（文件、文件夹、附件等） | 40 |
| **Editor** | 编辑器图标（编辑、格式、视图等） | 35 |
| **Notification** | 通知图标（提醒、事件、状态等） | 35 |
| **Device** | 设备图标（相机、电脑、存储等） | 30 |

分类对应 `packages/icons/src/` 下的同名目录，合计 580 个。

## 常用图标速查

### 通用操作

<div class="demo-block" style="display: flex; gap: 16px; font-size: 24px; flex-wrap: wrap;">
  <Add aria-label="添加" />
  <Delete aria-label="删除" />
  <Edit aria-label="编辑" />
  <IconSearch aria-label="搜索" />
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
  <ArrowUp aria-label="向上" />
  <ArrowDown aria-label="向下" />
  <ArrowLeft aria-label="向左" />
  <ArrowRight aria-label="向右" />
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
  <CheckCircle style="color: #52c41a" aria-label="成功" />
  <Error style="color: #f5222d" aria-label="错误" />
  <Warning style="color: #faad14" aria-label="警告" />
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
  <Play aria-label="播放" />
  <Pause aria-label="暂停" />
  <VolumeUp aria-label="音量" />
  <VolumeOff aria-label="静音" />
  <Fullscreen aria-label="全屏" />
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
  <Folder aria-label="文件夹" />
  <File aria-label="文件" />
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
  <Person aria-label="用户" />
  <People aria-label="多用户" />
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
