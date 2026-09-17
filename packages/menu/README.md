# @aix/menu

竖向侧边栏菜单。支持 `items` 数据驱动与 `Menu / MenuGroup / SubMenu / MenuItem` 复合组件两种写法，内联可折叠分组、右侧级联 flyout 子菜单、四套内置主题、右边缘拖拽调宽与完整键盘导航。

## 特性

- **两种写法**：`items` 数据驱动，或用 `MenuGroup` / `SubMenu` / `MenuItem` 手写结构，二者可混用
- **内联分组**：一级分组标题 38px 带分割线，二级子分组标题 32px / 12px；支持折叠与手风琴模式
- **内置搜索**：`searchable` 显示搜索框，按 label 过滤 `items`，支持 `filterMethod` 自定义匹配、`v-model:searchValue` 受控
- **flyout 子菜单**：悬停从右侧级联弹出，可多级；单层超过 `popupMaxVisible`（默认 9）项后弹层内部滚动
- **四套主题**：`gray`（默认）/ `white` / `glass-light` / `glass-dark`；传任意字符串即可接入业务自定义主题
- **拖拽宽度**：`resizable` 时右边缘 hover 出现指示线，可在 `minWidth` ~ `maxWidth` 间拖拽，`v-model:width` 同步
- **受控 / 非受控**：`v-model:selectedKey`、`v-model:openKeys`、`defaultOpenKeys`
- **无障碍**：↑↓ Home End 移动焦点，→ 打开 flyout，← / Esc 关闭；选中项 `aria-current="page"`，分组 `aria-expanded`
- **细滚动条**：侧栏列表与 flyout 弹层统一 4px 圆角滑块，颜色随主题
- **长文案**：单行省略，被截断时悬停显示 Tooltip
- **TypeScript**：完整类型定义

## 安装

```bash
pnpm add @aix/menu
# 或
npm install @aix/menu
# 或
yarn add @aix/menu
```

样式随组件入口一起加载，不需要单独引入。长文案溢出时的 Tooltip 来自 `@aix/popper`，其配色使用 `@aix/theme` 的 CSS 变量，请在应用入口引入一次主题变量：

```ts
import '@aix/theme/vars';
```

## 使用

### 数据驱动

`type: 'group'` 是内联可折叠分组，`type: 'divider'` 是分割线，普通节点带 `children` 时自动成为 flyout 子菜单。

```vue
<template>
  <Menu :items="items" v-model:selectedKey="selectedKey" @select="onSelect" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Menu, type MenuItemData, type MenuSelectPayload } from '@aix/menu';
import { HomeIcon, BookIcon, SettingsIcon } from './icons';

const selectedKey = ref('home');

const items: MenuItemData[] = [
  { key: 'home', label: '首页', icon: HomeIcon },
  {
    key: 'course',
    type: 'group',
    label: '课程管理',
    children: [
      { key: 'course-list', label: '课程列表', icon: BookIcon },
      { key: 'course-create', label: '新建课程' },
      {
        key: 'course-resource',
        type: 'group',
        label: '课程资源',
        children: [
          { key: 'res-video', label: '视频资源' },
          { key: 'res-doc', label: '文档资源' },
        ],
      },
    ],
  },
  { key: 'divider-1', type: 'divider' },
  {
    key: 'settings',
    label: '系统设置',
    icon: SettingsIcon,
    children: [
      { key: 'settings-profile', label: '个人资料' },
      { key: 'settings-notify', label: '通知设置', disabled: true },
    ],
  },
];

function onSelect(payload: MenuSelectPayload) {
  // payload.key      被选中项 key
  // payload.keyPath  从最外层祖先到自身的 key 链，如 ['course', 'course-list']
  // payload.data     原始节点，meta 字段原样透出
  router.push(payload.data?.meta?.path as string);
}
</script>
```

### 复合组件

```vue
<template>
  <Menu v-model:selectedKey="selectedKey">
    <MenuItem item-key="home" label="首页" :icon="HomeIcon" />
    <MenuGroup group-key="course" title="课程管理">
      <MenuItem item-key="course-list" label="课程列表" />
      <MenuGroup group-key="course-resource" title="课程资源">
        <MenuItem item-key="res-video" label="视频资源" />
      </MenuGroup>
    </MenuGroup>
    <SubMenu item-key="settings" label="系统设置" :icon="SettingsIcon" popup-with-icon>
      <MenuItem item-key="settings-profile" label="个人资料" :icon="UserIcon" />
      <MenuItem item-key="settings-notify" label="通知设置" :icon="BellIcon" />
    </SubMenu>
  </Menu>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Menu, MenuGroup, MenuItem, SubMenu } from '@aix/menu';

const selectedKey = ref('home');
</script>
```

默认插槽内容渲染在 `items` 之后，两种写法可以混用。复合组件写法下 `select` 事件的 `data` 为 `undefined`。

### 选中与展开状态

- `v-model:selectedKey`：只有叶子项可选中；选中项的祖先 SubMenu 会高亮，所在分组自动展开。两种写法都成立：复合组件写法下 SubMenu 挂载时从插槽收集后代 key，flyout 未展开也能高亮
- 既禁用又被选中的项显示为禁用态
- `v-model:openKeys`：只管理内联分组；flyout 的悬停展开是组件内部状态
- `defaultOpenKeys`：非受控模式下的初始展开分组。既不传 `openKeys` 也不传 `defaultOpenKeys` 时，所有分组默认展开；`accordion` 开启时不自动展开，默认全部折叠
- `accordion`：同一层级的分组只允许展开一个

```vue
<template>
  <Menu
    :items="items"
    accordion
    :default-open-keys="['course']"
    v-model:selectedKey="selectedKey"
    @open-change="(keys) => console.log(keys)"
  />
</template>
```

### 内置搜索

`searchable` 开启后，搜索框渲染在 `header` 插槽之下、列表之上。关键字非空时：

- 按 label 过滤 `items`：自身匹配的节点连同整棵子树保留，否则只在有匹配后代时保留并收窄 `children`；分割线不参与
- 分组按命中位置展开：后代里有命中的展开，只有标题命中的收起（点标题仍可展开）
- 无结果时显示「暂无匹配结果」
- 复合组件写法（默认插槽）不过滤，只透出 `search` 事件
- 搜索框内按 Esc 清空关键字并阻止事件冒泡，放在 Modal / Drawer 里不会连带关闭外层

```vue
<template>
  <Menu
    :items="items"
    searchable
    search-placeholder="搜索菜单"
    :filter-method="filterMethod"
    v-model:searchValue="keyword"
    @search="onSearch"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Menu, type MenuItemData } from '@aix/menu';

const keyword = ref('');

// 默认规则是对 label 做不区分大小写的包含匹配；这里额外匹配 meta.keywords
function filterMethod(item: MenuItemData, keyword: string) {
  const lower = keyword.toLowerCase();
  const keywords = (item.meta?.keywords as string[] | undefined) ?? [];
  return (
    (item.label ?? '').toLowerCase().includes(lower) || keywords.some((w) => w.includes(lower))
  );
}

function onSearch(keyword: string) {
  // 已 trim 的关键字
}
</script>
```

### flyout 子菜单

- 悬停触发，100ms 后弹出、离开 150ms 后关闭；点击触发项只打开
- 关闭通道：指针离开弹层、点击弹层链之外的任意位置、← / Esc、选中叶子；触屏设备点击触发项打开后，点击外部即可关闭
- 单层最多显示 `popupMaxVisible`（默认 9）项，超出后弹层内部滚动
- 子项带图标时弹层宽 182px，否则 158px（数据驱动下自动判断；复合组件写法用 `popupWithIcon` 指定）
- `popupPlacement` 控制弹出方向，`popupClass` 追加到所有弹层根节点

```vue
<template>
  <Menu :items="items" :popup-max-visible="6" popup-placement="right" popup-class="my-popup" />
</template>
```

### 拖拽宽度

```vue
<template>
  <Menu :items="items" resizable :min-width="160" :max-width="320" v-model:width="width" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Menu } from '@aix/menu';

const width = ref(200);
</script>
```

- `resizable` 时右边缘 6px 宽的把手 hover 显示指示线，光标 `col-resize`
- 把手可聚焦（`role="separator"`），← / → 每次调整 10px
- 拖拽时把手捕获指针，拖到浏览器窗口外释放也会正常结束；拖拽中组件卸载会还原 body 上的光标与禁选样式
- 未传 `width` 且非 `resizable` 时不设置内联宽度，由外层布局决定

### 插槽

| 插槽          | 作用域                                  | 说明                                                    |
| ------------- | --------------------------------------- | ------------------------------------------------------- |
| `header`      | -                                       | 列表上方固定区域，设计稿放 logo；内置搜索框渲染在它之下 |
| `footer`      | -                                       | 列表下方固定区域，常放用户行 / 设置入口                 |
| `default`     | -                                       | 复合组件写法的菜单内容，渲染在 `items` 之后             |
| `item`        | `{ item, groupLevel, inPopup, active }` | 自定义数据驱动叶子项的内容                              |
| `icon`        | `{ item }`                              | 自定义数据驱动节点的图标                                |
| `group-title` | `{ item }`                              | 自定义数据驱动分组的标题                                |

```vue
<template>
  <Menu :items="items" searchable v-model:selectedKey="selectedKey">
    <template #header>
      <Logo />
    </template>

    <template #item="{ item, active }">
      <span class="my-item">
        {{ item.label }}
        <Badge v-if="item.meta?.badge" :count="item.meta.badge" :highlight="active" />
      </span>
    </template>

    <template #group-title="{ item }">{{ item.label }}（{{ item.children?.length }}）</template>

    <template #footer>
      <UserBar />
    </template>
  </Menu>
</template>
```

`MenuItem` / `SubMenu` 自身也提供 `icon` 插槽，`MenuGroup` 提供 `title` 插槽，用于复合组件写法。

### 主题

```vue
<template>
  <Menu :items="items" theme="white" />
  <Menu :items="items" theme="glass-dark" />
</template>
```

| 主题          | 说明                                                             |
| ------------- | ---------------------------------------------------------------- |
| `gray`        | 默认，浅灰底                                                     |
| `white`       | 纯白底                                                           |
| `glass-light` | 半透明白 + `backdrop-filter: blur(15px)`，需要放在有背景的容器上 |
| `glass-dark`  | 半透明黑 + `backdrop-filter: blur(15px)`，需要放在有背景的容器上 |

flyout 弹层四套主题共用一套白底配色。

### 自定义主题变量

`theme` 传任意字符串时，组件只追加 `aix-menu--<name>`（侧栏）与 `aix-menu-popup--<name>`（弹层，Teleport 到 body）两个修饰类，在这两个选择器下声明变量即可：

```vue
<template>
  <Menu :items="items" theme="brand" />
</template>

<style>
.aix-menu--brand,
.aix-menu-popup--brand {
  --aix-menu-bg: #0f172a;
  --aix-menu-item-color: #cbd5e1;
  --aix-menu-item-bg-hover: rgb(255 255 255 / 0.08);
  --aix-menu-item-bg-active: #2563eb;
  --aix-menu-item-color-active: #fff;
  --aix-menu-group-title-color: #64748b;
  --aix-menu-popup-bg: #1e293b;
  --aix-menu-popup-item-color: #cbd5e1;
}
</style>
```

也可以在 `.aix-menu--gray` 等内置主题选择器下覆盖个别变量微调内置主题。

#### 颜色变量

| 变量                                   | 说明                                                            |
|----------------------------------------|-----------------------------------------------------------------|
| `--aix-menu-bg`                        | 侧栏背景                                                        |
| `--aix-menu-item-color`                | 菜单项文字                                                      |
| `--aix-menu-item-bg-hover`             | 菜单项 / 分组标题 hover 背景                                    |
| `--aix-menu-item-bg-active`            | 选中项背景                                                      |
| `--aix-menu-item-bg-highlight`         | 搜索命中藏在弹层里时的子菜单触发项背景                          |
| `--aix-menu-item-color-highlight`      | 搜索命中的文字                                                  |
| `--aix-menu-item-color-active`         | 选中项文字                                                      |
| `--aix-menu-item-color-disabled`       | 禁用项文字（禁用项被选中时同样按此显示）                        |
| `--aix-menu-group-title-color`         | 一级分组标题文字                                                |
| `--aix-menu-divider-color`             | 分割线                                                          |
| `--aix-menu-focus-ring-color`          | 侧栏键盘焦点环                                                  |
| `--aix-menu-resize-indicator-color`    | 拖拽把手指示线                                                  |
| `--aix-menu-scrollbar-color`           | 侧栏列表滚动条滑块                                              |
| `--aix-menu-search-bg`                 | 搜索框背景                                                      |
| `--aix-menu-search-bg-hover`           | 搜索框 hover / 有关键字时的背景                                 |
| `--aix-menu-search-bg-focus`           | 搜索框聚焦背景                                                  |
| `--aix-menu-search-border-color-focus` | 搜索框聚焦描边                                                  |
| `--aix-menu-search-color`              | 搜索框输入文字                                                  |
| `--aix-menu-search-icon-color`         | 搜索框图标                                                      |
| `--aix-menu-search-placeholder-color`  | 搜索框占位文字                                                  |
| `--aix-menu-popup-bg`                  | flyout 弹层背景                                                 |
| `--aix-menu-popup-shadow`              | flyout 弹层阴影                                                 |
| `--aix-menu-popup-item-color`          | 弹层内菜单项文字                                                |
| `--aix-menu-popup-item-bg-hover`       | 弹层内菜单项 hover 背景                                         |
| `--aix-menu-popup-item-bg-active`      | 弹层内选中项背景                                                |
| `--aix-menu-popup-item-color-active`   | 弹层内选中项文字                                                |
| `--aix-menu-popup-scrollbar-color`     | 弹层滚动条                                                      |
| `--aix-menu-popup-focus-ring-color`    | 弹层键盘焦点环，定义在 `.aix-menu-popup` 基础块，默认 `#00c261` |

#### 尺寸变量

侧栏（`.aix-menu`）与弹层（`.aix-menu-popup`）各自独立挂载，共用变量在两处都有声明，覆盖时两个选择器都要写。

| 变量                                       | 默认值          | 作用范围    | 说明                                             |
| ------------------------------------------ | --------------- | ----------- | ------------------------------------------------ |
| `--aix-menu-radius`                        | `8px`           | 侧栏 + 弹层 | 菜单项、分组标题、弹层圆角                       |
| `--aix-menu-item-font-size`                | `14px`          | 侧栏 + 弹层 | 菜单项字号                                       |
| `--aix-menu-item-line-height`              | `20px`          | 侧栏 + 弹层 | 菜单项行高                                       |
| `--aix-menu-item-font-weight-active`       | `600`           | 侧栏 + 弹层 | 侧栏选中项字重                                   |
| `--aix-menu-icon-size`                     | `16px`          | 侧栏 + 弹层 | 图标尺寸                                         |
| `--aix-menu-icon-gap`                      | `8px`           | 侧栏 + 弹层 | 图标与文字间距                                   |
| `--aix-menu-item-height`                   | `38px`          | 侧栏 + 弹层 | 根级 / 一级分组内菜单项高度                      |
| `--aix-menu-item-padding`                  | `0 16px 0 24px` | 侧栏 + 弹层 | 根级 / 一级分组内菜单项内边距                    |
| `--aix-menu-popup-width`                   | `158px`         | 侧栏 + 弹层 | 弹层宽度（子项无图标）                           |
| `--aix-menu-popup-width-icon`              | `182px`         | 侧栏 + 弹层 | 弹层宽度（子项带图标）                           |
| `--aix-menu-popup-padding`                 | `4px`           | 侧栏 + 弹层 | 弹层内边距                                       |
| `--aix-menu-popup-offset`                  | `4px`           | 侧栏 + 弹层 | 弹层与所在容器边缘的间距                         |
| `--aix-menu-popup-item-height`             | `36px`          | 侧栏 + 弹层 | 弹层内菜单项高度                                 |
| `--aix-menu-popup-item-padding`            | `0 12px`        | 侧栏 + 弹层 | 弹层内菜单项内边距                               |
| `--aix-menu-popup-item-font-weight-active` | `500`           | 侧栏 + 弹层 | 弹层内选中项 / 侧栏激活 SubMenu 字重             |
| `--aix-menu-popup-max-visible`             | `9`             | 侧栏 + 弹层 | 弹层最大可见项数，由 `popupMaxVisible` prop 写入 |
| `--aix-menu-transition-duration`           | `0.2s`          | 侧栏 + 弹层 | 过渡时长                                         |
| `--aix-menu-padding`                       | `8px`           | 侧栏        | 侧栏内边距                                       |
| `--aix-menu-section-gap`                   | `20px`          | 侧栏        | header / 列表 / footer 之间的间距                |
| `--aix-menu-group-gap`                     | `16px`          | 侧栏        | 分组与相邻节点的间距                             |
| `--aix-menu-item-gap`                      | `8px`           | 侧栏        | 菜单项之间的间距                                 |
| `--aix-menu-group-title-height`            | `38px`          | 侧栏        | 一级分组标题高度                                 |
| `--aix-menu-group-title-padding`           | `0 8px`         | 侧栏        | 一级分组标题内边距                               |
| `--aix-menu-resize-handle-width`           | `6px`           | 侧栏        | 拖拽把手命中区宽度                               |
| `--aix-menu-search-height`                 | `38px`          | 侧栏        | 搜索框高度                                       |
| `--aix-menu-search-padding`                | `8px`           | 侧栏        | 搜索框内边距                                     |
| `--aix-menu-search-gap`                    | `10px`          | 侧栏        | 搜索图标与输入框间距                             |
| `--aix-menu-search-icon-size`              | `22px`          | 侧栏        | 搜索图标尺寸                                     |
| `--aix-menu-search-clear-size`             | `16px`          | 侧栏        | 搜索框清除按钮尺寸                               |
| `--aix-menu-search-font-size`              | `14px`          | 侧栏        | 搜索框字号                                       |
| `--aix-menu-search-line-height`            | `22px`          | 侧栏        | 搜索框行高                                       |
| `--aix-menu-tooltip-width`                 | `136px`         | 提示浮层    | 文字溢出提示的宽度                               |

### 键盘操作

| 按键                        | 作用                                                               |
| --------------------------- | ------------------------------------------------------------------ |
| `↑` / `↓`                   | 在当前列表内移动焦点，首尾循环                                     |
| `Home` / `End`              | 焦点移到列表首 / 尾                                                |
| `→`                         | 焦点在 SubMenu 上时打开 flyout 并聚焦第一项                        |
| `←` / `Esc`                 | 关闭当前 flyout，焦点回到触发项                                    |
| `Enter` / `Space`           | 选中叶子项、切换分组折叠、打开 flyout                              |
| `←` / `→`（拖拽把手聚焦时） | 宽度每次 -10px / +10px                                             |
| `Esc`（搜索框聚焦时）       | 清空关键字并阻止冒泡，输入框保持焦点，外层 Modal / Drawer 不受影响 |

### 多语言支持

菜单项文案由业务通过 `items` / 插槽提供，组件自己渲染的文案只有搜索框占位、无结果提示和拖拽把手的 `aria-label`。默认跟随 `@aix/hooks` 的全局语言，可在应用入口覆盖：

```ts
import { createLocale } from '@aix/hooks';

app.use(
  createLocale('zh-CN', {
    messages: {
      menu: { 'zh-CN': { searchPlaceholder: '搜索功能', noResults: '没有找到相关功能' } },
    },
  }),
);
```

| 文案 key            | zh-CN            | en-US                   | 用途                                                           |
| ------------------- | ---------------- | ----------------------- | -------------------------------------------------------------- |
| `searchPlaceholder` | 搜索             | Search                  | 搜索框占位文案与 `aria-label`（`searchPlaceholder` prop 优先） |
| `noResults`         | 暂无匹配结果     | No matching items       | 搜索无结果提示                                                 |
| `resizeHandle`      | 拖拽调整菜单宽度 | Drag to resize the menu | 拖拽把手的 `aria-label`                                        |

语言包也可单独导入：`menuLocale` / `menuZhCN` / `menuEnUS`，类型 `MenuLocale`。

## API

### Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `items` | `Array<MenuItemData>` | - | - | 数据驱动的菜单结构；与默认插槽可同时使用 |
| `selectedKey` | `string` | - | - | 当前选中项 key（v-model:selectedKey） |
| `openKeys` | `Array<string>` | - | - | 展开的分组 key 列表（v-model:openKeys）。只管理内联分组，flyout 的悬停展开为组件内部状态 |
| `defaultOpenKeys` | `Array<string>` | - | - | 非受控模式下的初始展开分组。未传 openKeys 也未传本项时，所有分组默认展开；accordion 开启时不适用，默认全部折叠 |
| `theme` | `MenuTheme` | `'gray'` | - | 配色主题 |
| `accordion` | `boolean` | `false` | - | 同一层级的分组只允许展开一个 |
| `popupMaxVisible` | `number` | `9` | - | flyout 单层最多可见项数，超出后弹层内部滚动 |
| `popupPlacement` | `MenuPopupPlacement` | `'right-start'` | - | flyout 弹层位置 |
| `popupClass` | `string` | - | - | 追加到所有 flyout 弹层根节点的 class |
| `searchable` | `boolean` | `false` | - | 是否显示内置搜索框（位于 header 插槽之下、列表之上） |
| `searchValue` | `string` | - | - | 搜索关键字（v-model:searchValue）。非空时按 label 过滤 items，并按命中位置决定分组展开；复合组件写法只透出事件不过滤 |
| `searchPlaceholder` | `string` | - | - | 搜索框占位文案，默认取语言包 |
| `searchClearable` | `boolean` | `true` | - | 搜索框有关键字时，右侧显示可点击的清除按钮 |
| `filterMethod` | `any` | - | - | 自定义匹配规则；默认对 label 做不区分大小写的包含匹配 |
| `searchHighlight` | `boolean` | `true` | - | 搜索时，命中项藏在 flyout 弹层里的子菜单触发项整行高亮。只对 items 数据驱动写法生效 |
| `width` | `number` | - | - | 宽度（px，v-model:width）。未传且非 resizable 时不设置内联宽度，由外层布局决定；resizable 但未传时从 200 起算 |
| `resizable` | `boolean` | `false` | - | 是否允许拖拽右边缘调整宽度 |
| `minWidth` | `number` | `150` | - | 可拖拽的最小宽度（px） |
| `maxWidth` | `number` | `300` | - | 可拖拽的最大宽度（px） |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:selectedKey` | `string` | 选中项变化（v-model:selectedKey） |
| `update:openKeys` | `string[]` | 展开的分组列表变化（v-model:openKeys） |
| `update:width` | `number` | 宽度变化（v-model:width），拖拽过程中持续触发 |
| `update:searchValue` | `string` | 搜索框文本变化（v-model:searchValue） |
| `search` | `string` | 搜索关键字变化，参数为去除首尾空格后的关键字 |
| `select` | `MenuSelectPayload` | 用户点击叶子项 |
| `open-change` | `string[]` | 分组展开状态变化 |

### Slots

| 插槽名 | 说明 |
|--------|------|
| `header` | 列表上方区域，设计稿放 logo；内置搜索框渲染在它之下 |
| `default` | 复合组件写法的菜单内容，可与 items 同时使用，渲染在 items 之后 |
| `footer` | 列表下方区域，设计稿放用户行与设置入口 |
| `item` | 自定义数据驱动叶子项的内容 |
| `icon` | 自定义数据驱动节点的图标 |
## 子组件 API

### MenuItem Props

| 属性名     | 类型           | 默认值  | 必填 | 说明                                         |
| ---------- | -------------- | ------- | :--: | -------------------------------------------- |
| `itemKey`  | `string`       | -       |  ✅  | 唯一标识                                     |
| `label`    | `string`       | -       |  -   | 显示文案；同时作为溢出时 Tooltip 的内容      |
| `icon`     | `Component`    | -       |  -   | 图标组件，16×16                              |
| `disabled` | `boolean`      | `false` |  -   | 是否禁用                                     |
| `data`     | `MenuItemData` | -       |  -   | 数据驱动模式下的原始节点，随 select 事件透出 |

### MenuItem Slots

| 插槽名    | 说明                         |
| --------- | ---------------------------- |
| `default` | 自定义内容，默认渲染 `label` |
| `icon`    | 自定义图标                   |

### MenuGroup Props

| 属性名        | 类型      | 默认值 | 必填 | 说明                                          |
| ------------- | --------- | ------ | :--: | --------------------------------------------- |
| `groupKey`    | `string`  | -      |  ✅  | 唯一标识，作为 openKeys 的取值                |
| `title`       | `string`  | -      |  -   | 分组标题                                      |
| `collapsible` | `boolean` | `true` |  -   | 是否可折叠。为 false 时始终展开，标题不可点击 |

### MenuGroup Slots

| 插槽名    | 说明                         |
| --------- | ---------------------------- |
| `default` | 分组内的菜单项               |
| `title`   | 自定义标题，默认渲染 `title` |

### SubMenu Props

| 属性名          | 类型           | 默认值  | 必填 | 说明                                              |
| --------------- | -------------- | ------- | :--: | ------------------------------------------------- |
| `itemKey`       | `string`       | -       |  ✅  | 唯一标识                                          |
| `label`         | `string`       | -       |  -   | 显示文案                                          |
| `icon`          | `Component`    | -       |  -   | 图标组件，16×16                                   |
| `disabled`      | `boolean`      | `false` |  -   | 是否禁用                                          |
| `popupWithIcon` | `boolean`      | `false` |  -   | 弹层内的子项是否带图标，决定弹层宽度（158 / 182） |
| `popupClass`    | `string`       | -       |  -   | 追加到本弹层根节点的 class                        |
| `data`          | `MenuItemData` | -       |  -   | 数据驱动模式下的原始节点                          |

### SubMenu Slots

| 插槽名    | 说明                               |
| --------- | ---------------------------------- |
| `default` | 弹层内的子项                       |
| `title`   | 自定义触发项文案，默认渲染 `label` |
| `icon`    | 自定义图标                         |

## 类型定义

```typescript
export type MenuTheme = 'gray' | 'white' | 'glass-light' | 'glass-dark' | (string & {});

export type MenuPopupPlacement =
  'right-start' | 'right' | 'right-end' | 'left-start' | 'left' | 'left-end';

export type MenuItemType = 'item' | 'group' | 'divider';

export interface MenuItemData {
  /** 唯一标识，作为 selectedKey / openKeys 的取值 */
  key: string;
  /** 显示文案；divider 不需要 */
  label?: string;
  /** 图标组件，16×16 */
  icon?: Component;
  /** 是否禁用 */
  disabled?: boolean;
  /** 节点类型，默认 'item'；有 children 时自动升级为 flyout 子菜单 */
  type?: MenuItemType;
  /** 子节点 */
  children?: MenuItemData[];
  /** 业务透传字段（路由、权限码等），组件不解读，随 select 事件原样返回 */
  meta?: Record<string, unknown>;
}

export interface MenuSelectPayload {
  /** 被选中项的 key */
  key: string;
  /** 从最外层祖先到自身的 key 链 */
  keyPath: string[];
  /** 数据驱动模式下的原始节点；复合组件写法下为 undefined */
  data?: MenuItemData;
}

/** 根组件 item 作用域插槽参数 */
export interface MenuItemSlotProps {
  item: MenuItemData;
  /** 所在分组层级：0 根、1 一级分组内、2 二级分组内 */
  groupLevel: number;
  /** 是否渲染在 flyout 弹层里 */
  inPopup: boolean;
  active: boolean;
}

export interface MenuEmits {
  (e: 'update:selectedKey', key: string): void;
  (e: 'update:openKeys', keys: string[]): void;
  (e: 'update:width', width: number): void;
  (e: 'update:searchValue', value: string): void;
  (e: 'search', keyword: string): void;
  (e: 'select', payload: MenuSelectPayload): void;
  (e: 'open-change', keys: string[]): void;
}
```
