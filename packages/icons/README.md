# Icons 图标组件使用文档

基于 SVG 的可复用 Vue 图标组件库，提供丰富的图标资源和灵活的使用方式。

## 特性

- 📦 丰富的图标库，包含 580+ 个精美图标
- 🎨 支持自定义颜色、大小和样式
- 🔧 Vue 3 Composition API 支持
- 📱 响应式设计，支持任意尺寸缩放
- 🎯 TypeScript 支持，完整的类型定义
- ⚡ 基于 SVG 实现，性能优异
- 🎛️ 支持所有标准 SVG 属性
- 📂 图标按类别分组，便于查找和使用
- 🌳 Tree-shaking 友好，按需导入

## 快速开始

### 安装

```bash
pnpm add @aix/icons
```

### 基础用法

```vue
<template>
  <div style="display: flex; gap: 16px; font-size: 24px;">
    <Camera />
    <Search color="blue" />
    <Home color="green" :width="32" :height="32" />
  </div>
</template>

<script setup lang="ts">
import { Camera, Search, Home } from '@aix/icons';
</script>
```

### 自定义样式

```vue
<template>
  <div style="display: flex; gap: 16px; align-items: center;">
    <!-- 使用 props 控制样式 -->
    <Camera :width="24" :height="24" color="red" />

    <!-- 使用 style 属性 -->
    <Search :style="{ fontSize: '24px', color: 'blue' }" />

    <!-- 响应点击事件 -->
    <Home
      :style="{ fontSize: '24px', color: 'orange', cursor: 'pointer' }"
      @click="handleClick"
    />
  </div>
</template>

<script setup lang="ts">
import { Camera, Search, Home } from '@aix/icons';

const handleClick = () => {
  console.log('图标被点击');
};
</script>
```

## 图标分类

### 应用类图标 (Apps)

用于表示各种应用功能和模型：

```vue
<template>
  <div :style="{ display: 'flex', gap: '16px', fontSize: '32px' }">
    <BaoKongRenYuanJianKong title="保控人员监控" />
    <CarFakeLicensed title="车辆假牌" />
    <Default title="默认应用" />
    <HuoDongGuiJi title="活动轨迹" />
    <StatisticAll title="统计全部" />
  </div>
</template>

<script setup lang="ts">
import {
  BaoKongRenYuanJianKong,
  CarFakeLicensed,
  Default,
  HuoDongGuiJi,
  StatisticAll
} from '@aix/icons';
</script>
```

### 设备类图标 (Device)

表示各种设备和硬件：

```vue
<template>
  <div :style="{ display: 'flex', gap: '16px', fontSize: '32px', color: '#1890ff' }">
    <Camera title="摄像头" />
    <Computer title="计算机" />
    <JingWuTongFilled title="警务通" />
    <ZhiAnZhuaPaiJiFilled title="智安抓拍机" />
    <SheXiangTouFilled title="摄像头" />
  </div>
</template>

<script setup lang="ts">
import {
  Camera,
  Computer,
  JingWuTongFilled,
  ZhiAnZhuaPaiJiFilled,
  SheXiangTouFilled
} from '@aix/icons';
</script>
```

### 编辑类图标 (Editor)

用于编辑操作和文档管理：

```vue
<template>
  <div :style="{ display: 'flex', gap: '16px', fontSize: '24px' }">
    <Edit :style="{ color: '#52c41a' }" title="编辑" />
    <Delete :style="{ color: '#ff4d4f' }" title="删除" />
    <Copy :style="{ color: '#1890ff' }" title="复制" />
    <Cut :style="{ color: '#fa8c16' }" title="剪切" />
    <Send :style="{ color: '#722ed1' }" title="发送" />
    <Dashboard :style="{ color: '#13c2c2' }" title="仪表板" />
  </div>
</template>

<script setup lang="ts">
import {
  Edit,
  Delete,
  Copy,
  Cut,
  Send,
  Dashboard
} from '@aix/icons';
</script>
```

### 文件类图标 (File)

文件和文档相关图标：

```vue
<template>
  <div :style="{ display: 'flex', gap: '16px', fontSize: '28px', color: '#faad14' }">
    <Folder title="文件夹" />
    <FolderOpen title="打开文件夹" />
    <File title="文件" />
    <Description title="文档" />
    <PictureAsPdf title="PDF文件" />
    <Assignment title="任务" />
  </div>
</template>

<script setup lang="ts">
import {
  Folder,
  FolderOpen,
  File,
  Description,
  PictureAsPdf,
  Assignment
} from '@aix/icons';
</script>
```

### 通用类图标 (General)

常用的通用功能图标：

```vue
<template>
  <div :style="{ display: 'flex', gap: '16px', fontSize: '24px' }">
    <Search :style="{ color: '#1890ff' }" />
    <Add :style="{ color: '#52c41a' }" />
    <Close :style="{ color: '#ff4d4f' }" />
    <Check :style="{ color: '#52c41a' }" />
    <ArrowLeft :style="{ color: '#722ed1' }" />
    <ArrowRight :style="{ color: '#722ed1' }" />
    <Setting :style="{ color: '#8c8c8c' }" />
    <Home :style="{ color: '#fa8c16' }" />
  </div>
</template>

<script setup lang="ts">
import {
  Search,
  Add,
  Close,
  Check,
  ArrowLeft,
  ArrowRight,
  Setting,
  Home
} from '@aix/icons';
</script>
```

### 图像类图标 (Image)

图像处理和编辑相关：

```vue
<template>
  <div :style="{ display: 'flex', gap: '16px', fontSize: '26px', color: '#eb2f96' }">
    <Photo title="照片" />
    <Eye title="查看" />
    <Crop title="裁剪" />
    <Filter title="滤镜" />
    <Brightness title="亮度" />
    <FrameFace title="人脸框选" />
  </div>
</template>

<script setup lang="ts">
import {
  Photo,
  Eye,
  Crop,
  Filter,
  Brightness,
  FrameFace
} from '@aix/icons';
</script>
```

### 地图类图标 (Map)

地理位置和地图相关：

```vue
<template>
  <div :style="{ display: 'flex', gap: '16px', fontSize: '26px', color: '#13c2c2' }">
    <LocationOn title="位置" />
    <Map title="地图" />
    <Navigation title="导航" />
    <Car title="汽车" />
    <Building title="建筑" />
    <Police title="警察" />
  </div>
</template>

<script setup lang="ts">
import {
  LocationOn,
  Map,
  Navigation,
  Car,
  Building,
  Police
} from '@aix/icons';
</script>
```

### 通知类图标 (Notification)

通知、提醒和状态相关：

```vue
<template>
  <div :style="{ display: 'flex', gap: '16px', fontSize: '24px' }">
    <Notifications :style="{ color: '#1890ff' }" title="通知" />
    <Warning :style="{ color: '#fa8c16' }" title="警告" />
    <Error :style="{ color: '#ff4d4f' }" title="错误" />
    <InfoOutline :style="{ color: '#52c41a' }" title="信息" />
    <Schedule :style="{ color: '#722ed1' }" title="计划" />
    <Event :style="{ color: '#13c2c2' }" title="事件" />
  </div>
</template>

<script setup lang="ts">
import {
  Notifications,
  Warning,
  Error,
  InfoOutline,
  Schedule,
  Event
} from '@aix/icons';
</script>
```

### 视频类图标 (Video)

视频播放和控制相关：

```vue
<template>
  <div :style="{ display: 'flex', gap: '16px', fontSize: '28px', color: '#f759ab' }">
    <Play title="播放" />
    <Pause title="暂停" />
    <Videocam title="摄像机" />
    <VolumeUp title="音量" />
    <Fullscreen title="全屏" />
    <SlowMotionVideo title="慢动作" />
  </div>
</template>

<script setup lang="ts">
import {
  Play,
  Pause,
  Videocam,
  VolumeUp,
  Fullscreen,
  SlowMotionVideo
} from '@aix/icons';
</script>
```

## 自定义样式

### 尺寸设置

```vue
<template>
  <div :style="{ display: 'flex', gap: '16px', alignItems: 'center' }">
    <!-- 使用 fontSize 控制大小 -->
    <Camera :style="{ fontSize: '16px' }" />
    <Camera :style="{ fontSize: '24px' }" />
    <Camera :style="{ fontSize: '32px' }" />
    <Camera :style="{ fontSize: '48px' }" />

    <!-- 使用 width 和 height -->
    <Camera :style="{ width: '64px', height: '64px' }" />
  </div>
</template>

<script setup lang="ts">
import { Camera } from '@aix/icons';
</script>
```

### 颜色设置

```vue
<template>
  <div :style="{ display: 'flex', gap: '16px', fontSize: '32px' }">
    <!-- 单色图标 -->
    <Search :style="{ color: '#1890ff' }" />
    <Search :style="{ color: '#52c41a' }" />
    <Search :style="{ color: '#ff4d4f' }" />

    <!-- 渐变色 -->
    <Search
      :style="{
        background: 'linear-gradient(45deg, #1890ff, #722ed1)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent'
      }"
    />
  </div>
</template>

<script setup lang="ts">
import { Search } from '@aix/icons';
</script>
```

### 动画效果

```vue
<template>
  <div :style="{ fontSize: '32px' }">
    <!-- 旋转动画 -->
    <Loading
      :style="{
        color: '#1890ff',
        animation: 'spin 1s linear infinite'
      }"
    />

    <!-- 悬停效果 -->
    <Refresh
      class="refresh-icon"
      :style="{
        color: '#52c41a',
        cursor: 'pointer'
      }"
    />
  </div>
</template>

<script setup lang="ts">
import { Loading, Refresh } from '@aix/icons';
</script>

<style scoped>
.refresh-icon {
  transition: transform 0.3s;
}

.refresh-icon:hover {
  transform: rotate(180deg);
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
```

## API 参考

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

## 图标搜索和管理

### 图标列表

当前图标库包含以下分类：

- **Apps (89个)**: 应用功能图标
- **Device (21个)**: 设备硬件图标  
- **Editor (36个)**: 编辑操作图标
- **File (40个)**: 文件管理图标
- **General (162个)**: 通用功能图标
- **Image (58个)**: 图像处理图标
- **Map (77个)**: 地图位置图标
- **Notification (32个)**: 通知状态图标
- **Video (50个)**: 视频控制图标

### 图标命名规则

图标组件采用 PascalCase 命名规则：

```vue
<script setup lang="ts">
// ✅ 正确的导入方式
import {
  BaoKongRenYuanJianKong,  // 保控人员监控
  ZhiAnZhuaPaiJiFilled,    // 智安抓拍机
  MotorVehicleCompanion    // 机动车伴随
} from '@aix/icons';

// ❌ 错误的导入方式
// import { baoKongRenYuanJianKong } from '@aix/icons';
</script>
```

## 性能优化

### 按需导入

```vue
<script setup lang="ts">
// ✅ 推荐：按需导入
import { Camera, Search } from '@aix/icons';

// ❌ 不推荐：全量导入
// import * as Icons from '@aix/icons';
</script>
```

### 图标缓存

图标组件基于 SVG 实现，浏览器会自动缓存相同的图标：

```vue
<template>
  <div>
    <!-- 多个相同图标会被浏览器缓存优化 -->
    <Camera :style="{ fontSize: '16px' }" />
    <Camera :style="{ fontSize: '24px', color: 'blue' }" />
    <Camera :style="{ fontSize: '32px', color: 'red' }" />
  </div>
</template>

<script setup lang="ts">
import { Camera } from '@aix/icons';
</script>
```

## 最佳实践

1. **语义化使用**: 选择符合功能语义的图标
2. **一致的尺寸**: 在同一界面中保持图标尺寸一致
3. **合适的颜色**: 使用符合视觉层次的颜色
4. **无障碍支持**: 为图标添加有意义的 title 属性
5. **性能考虑**: 优先使用按需导入
6. **样式统一**: 建立项目统一的图标使用规范

## 常见问题

### Q: 如何自定义图标颜色？

A: 使用 `style` 对象中的 `color` 属性或 `color` prop 设置颜色：

```vue
<template>
  <!-- 方式1：使用 style -->
  <Search :style="{ color: '#1890ff' }" />

  <!-- 方式2：使用 color prop -->
  <Search color="#1890ff" />
</template>

<script setup lang="ts">
import { Search } from '@aix/icons';
</script>
```

### Q: 图标大小如何控制？

A: 推荐使用 `fontSize` 样式属性，也可以使用 `width` 和 `height` props：

```vue
<template>
  <div>
    <!-- 方式1：使用 fontSize (推荐) -->
    <Camera :style="{ fontSize: '24px' }" />

    <!-- 方式2：使用 width 和 height props -->
    <Camera :width="32" :height="32" />

    <!-- 方式3：使用 style 中的 width 和 height -->
    <Camera :style="{ width: '32px', height: '32px' }" />
  </div>
</template>

<script setup lang="ts">
import { Camera } from '@aix/icons';
</script>
```

### Q: 如何添加点击事件？

A: 直接使用 Vue 的 `@click` 事件：

```vue
<template>
  <Setting
    :style="{ fontSize: '24px', cursor: 'pointer' }"
    @click="handleSettingClick"
  />
</template>

<script setup lang="ts">
import { Setting } from '@aix/icons';

const handleSettingClick = () => {
  console.log('设置被点击');
};
</script>
```

### Q: 支持自定义图标吗？

A: 当前版本使用预定义图标集，如需自定义图标，建议：

- 使用相同的 SVG 组件结构
- 遵循现有的属性接口
- 考虑通过 Icon 组件包装自定义 SVG

### Q: 如何在 TypeScript 项目中获得完整的类型支持？

A: 直接导入使用即可，所有图标都有完整的 TypeScript 类型定义：

```vue
<template>
  <Camera :width="size" :height="size" :color="iconColor" />
</template>

<script setup lang="ts">
import { Camera } from '@aix/icons';
import { ref } from 'vue';

// 类型会自动推断
const size = ref<number | string>(24);
const iconColor = ref<string>('#1890ff');
</script>
```

### Q: 图标在不同浏览器中显示不一致？

A: 图标基于标准 SVG 实现，兼容性良好。如遇问题请检查：

- CSS 重置样式是否影响 SVG 显示
- 是否使用了浏览器不支持的 CSS 属性
- SVG 的 viewBox 和尺寸设置是否正确
