---
title: Menu 菜单
outline: deep
---

<script setup>
import { ref, reactive } from 'vue'
import { Menu, MenuGroup, MenuItem, SubMenu } from '@aix/menu'
import { Home, Dashboard, Book, Add, Folder, Videocam, Assignment, People, Setting, Person, Notifications, File } from '@aix/icons'

const items = [
  { key: 'home', label: '首页', icon: Home },
  { key: 'workbench', label: '工作台', icon: Dashboard },
  {
    key: 'course', type: 'group', label: '课程管理',
    children: [
      { key: 'course-list', label: '课程列表', icon: Book },
      { key: 'course-create', label: '新建课程', icon: Add },
      {
        key: 'course-resource', type: 'group', label: '课程资源',
        children: [
          { key: 'res-video', label: '视频资源' },
          { key: 'res-doc', label: '文档资源' },
          { key: 'res-archived', label: '已归档资源', disabled: true },
        ],
      },
    ],
  },
  {
    key: 'teaching', type: 'group', label: '教学中心',
    children: [
      { key: 'live', label: '直播课堂', icon: Videocam },
      {
        key: 'homework', label: '作业', icon: Assignment,
        children: [
          { key: 'hw-list', label: '作业列表' },
          { key: 'hw-review', label: '批改作业' },
        ],
      },
      { key: 'students', label: '学生管理', icon: People },
    ],
  },
  { key: 'divider-1', type: 'divider' },
  {
    key: 'settings', label: '系统设置', icon: Setting,
    children: [
      { key: 'settings-profile', label: '个人资料', icon: Person },
      { key: 'settings-notify', label: '通知设置', icon: Notifications },
    ],
  },
  { key: 'legacy', label: '已停用模块', icon: Folder, disabled: true },
]

const flyoutItems = [
  { key: 'home', label: '首页', icon: Home },
  {
    key: 'course', label: '课程管理', icon: Book,
    children: [
      { key: 'course-list', label: '课程列表', icon: File },
      { key: 'course-create', label: '新建课程', icon: Add },
      {
        key: 'course-resource', label: '课程资源', icon: Folder,
        children: [
          {
            key: 'res-video', label: '视频',
            children: [
              { key: 'res-video-live', label: '直播回放' },
              { key: 'res-video-record', label: '录播课程' },
            ],
          },
          { key: 'res-doc', label: '文档' },
        ],
      },
    ],
  },
  {
    key: 'report', label: '数据报表', icon: Dashboard,
    children: Array.from({ length: 14 }, (_, i) => ({ key: `report-${i + 1}`, label: `第 ${i + 1} 周报表` })),
  },
]

const badgeItems = [
  { key: 'home', label: '首页', icon: Home },
  {
    key: 'course', type: 'group', label: '课程管理',
    children: [
      { key: 'course-list', label: '课程列表', icon: Book, meta: { badge: 12 } },
      { key: 'course-create', label: '新建课程', icon: Add },
    ],
  },
  { key: 'notice', label: '通知', icon: Notifications, meta: { badge: 99 } },
]

const withKeywords = (nodes) =>
  nodes.map((node) => ({
    ...node,
    meta: { keywords: [node.key] },
    children: node.children ? withKeywords(node.children) : undefined,
  }))
const searchItems = withKeywords(items)

const basicSelected = ref('course-list')
const searchSelected = ref('course-list')
const searchValue = ref('')
function filterMethod(item, keyword) {
  const lower = keyword.toLowerCase()
  const keywords = item.meta?.keywords ?? []
  return (item.label ?? '').toLowerCase().includes(lower) || keywords.some((w) => w.includes(lower))
}
const compoundSelected = ref('course-list')
const flyoutSelected = ref('home')
const accordionSelected = ref('course-list')
const slotSelected = ref('course-list')
const brandSelected = ref('course-list')
const width = ref(200)
const themeSelected = reactive({
  gray: 'course-list',
  white: 'course-list',
  'glass-light': 'course-list',
  'glass-dark': 'course-list',
})
</script>

<style>
.menu-demo {
  display: flex;
  gap: 24px;
  height: 480px;
  padding: 0;
  overflow: hidden;
}

.menu-demo > * + * {
  margin-left: 0;
}

.menu-demo__frame {
  display: flex;
  flex: none;
  overflow: hidden;
  border-radius: 8px;
}

.menu-demo__aside {
  flex: 1;
  align-self: center;
  padding: 16px 24px;
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 1.8;
}

.menu-demo__glass {
  display: flex;
  flex: 1;
  gap: 24px;
  padding: 24px;
  border-radius: 12px;
  background:
    radial-gradient(circle at 18% 28%, rgb(255 255 255 / 0.95) 0 70px, transparent 71px),
    radial-gradient(circle at 72% 72%, rgb(255 214 102 / 0.95) 0 110px, transparent 111px),
    repeating-linear-gradient(135deg, rgb(255 255 255 / 0.18) 0 10px, transparent 10px 26px),
    linear-gradient(135deg, #1e3a8a, #7c3aed 45%, #0ea5e9);
}

.menu-demo__badge {
  flex: none;
  min-width: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #f53f3f;
  color: #fff;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}

.aix-menu--brand,
.aix-menu-popup--brand {
  --aix-menu-bg: #0f172a;
  --aix-menu-item-color: #cbd5e1;
  --aix-menu-item-bg-hover: rgb(255 255 255 / 0.08);
  --aix-menu-item-bg-active: #2563eb;
  --aix-menu-item-color-active: #fff;
  --aix-menu-item-color-disabled: rgb(203 213 225 / 0.35);
  --aix-menu-group-title-color: #64748b;
  --aix-menu-subgroup-title-color: #94a3b8;
  --aix-menu-divider-color: rgb(255 255 255 / 0.12);
  --aix-menu-focus-ring-color: #60a5fa;
  --aix-menu-popup-bg: #1e293b;
  --aix-menu-popup-item-color: #cbd5e1;
  --aix-menu-popup-item-bg-hover: rgb(255 255 255 / 0.08);
  --aix-menu-popup-item-bg-active: #2563eb;
  --aix-menu-popup-item-color-active: #fff;
  --aix-menu-scrollbar-color: rgb(255 255 255 / 0.2);
  --aix-menu-search-bg: rgb(255 255 255 / 0.06);
  --aix-menu-search-bg-active: rgb(255 255 255 / 0.12);
  --aix-menu-search-color: #f1f5f9;
  --aix-menu-search-icon-color: #94a3b8;
  --aix-menu-search-placeholder-color: #64748b;
}
</style>

# Menu 菜单

竖向侧边栏菜单。支持 `items` 数据驱动与 `Menu / MenuGroup / SubMenu / MenuItem` 复合组件两种写法，内联可折叠分组、右侧级联 flyout 子菜单、四套内置主题、右边缘拖拽调宽与完整键盘导航。

## 何时使用

- 后台系统、工作台的左侧导航栏
- 导航层级较深，需要把常用入口平铺在侧栏、次级入口收进 flyout 的场景
- 需要跟随页面背景做毛玻璃效果，或接入业务自有配色的侧栏

## 代码演示

### 基础用法

`items` 数据驱动。`type: 'group'` 是内联可折叠分组（可嵌套一层子分组），`type: 'divider'` 是分割线，普通节点带 `children` 时自动成为 flyout 子菜单。`header`（放 logo）/ `footer`（放用户行）插槽固定在列表上下方，`searchable` 在 header 之下显示内置搜索框。

<ClientOnly>
<div class="demo-block menu-demo">
  <div class="menu-demo__frame">
    <Menu :items="items" :width="200" searchable v-model:selectedKey="basicSelected">
      <template #header>
        <div style="display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 8px; font-weight: 600;">
          <span style="display: inline-flex; width: 24px; height: 24px; border-radius: 6px; background: #00c261;"></span>
          <span>AIX 教务</span>
        </div>
      </template>
      <template #footer>
        <div style="display: flex; align-items: center; gap: 8px; padding: 6px 8px;">
          <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: #00c261; color: #fff; font-size: 12px;">孙</span>
          <span style="flex: 1;">孙伟杰</span>
          <Setting style="font-size: 16px;" />
        </div>
      </template>
    </Menu>
  </div>
  <div class="menu-demo__aside">selectedKey：<code>{{ basicSelected }}</code></div>
</div>
</ClientOnly>

```vue
<template>
  <Menu :items="items" searchable v-model:selectedKey="selectedKey" @select="onSelect">
    <template #header>
      <Logo />
    </template>
    <template #footer>
      <UserBar />
    </template>
  </Menu>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Menu, type MenuItemData, type MenuSelectPayload } from '@aix/menu';
import { Home, Book, Add, Setting, Person } from '@aix/icons';

const selectedKey = ref('home');

const items: MenuItemData[] = [
  { key: 'home', label: '首页', icon: Home },
  {
    key: 'course',
    type: 'group',
    label: '课程管理',
    children: [
      { key: 'course-list', label: '课程列表', icon: Book },
      { key: 'course-create', label: '新建课程', icon: Add },
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
    icon: Setting,
    children: [{ key: 'settings-profile', label: '个人资料', icon: Person }],
  },
];

function onSelect(payload: MenuSelectPayload) {
  // payload.keyPath 如 ['course', 'course-list']；payload.data 是原始节点
}
</script>
```

### 内置搜索

`searchable` 开启后搜索框渲染在 `header` 之下、列表之上。关键字非空时按 label 过滤 `items`：自身匹配的节点连同整棵子树保留，否则只在有匹配后代时保留并收窄 `children`；分割线不参与；所有分组强制展开；无结果显示「暂无匹配结果」；Esc 清空关键字并阻止事件冒泡，放在 Modal / Drawer 里不会连带关闭外层。复合组件写法不过滤，只透出 `search` 事件。`filterMethod` 可自定义匹配规则，下例额外匹配 `meta.keywords`（试试输入 `home` 或 `live`）。

<ClientOnly>
<div class="demo-block menu-demo">
  <div class="menu-demo__frame">
    <Menu :items="searchItems" :width="200" searchable search-placeholder="搜索菜单" :filter-method="filterMethod" v-model:searchValue="searchValue" v-model:selectedKey="searchSelected" />
  </div>
  <div class="menu-demo__aside">
    searchValue：<code>{{ JSON.stringify(searchValue) }}</code><br />
    <button type="button" @click="searchValue = '课程'">搜「课程」</button>
    <button type="button" @click="searchValue = 'live'" style="margin-left: 8px;">搜「live」</button>
    <button type="button" @click="searchValue = ''" style="margin-left: 8px;">清空</button>
  </div>
</div>
</ClientOnly>

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

### 主题

四套内置主题：`gray`（默认）、`white`、`glass-light`、`glass-dark`。glass 两套依赖 `backdrop-filter`，要放在有背景的容器上才能看到毛玻璃效果。flyout 弹层四套主题共用白底配色。

<ClientOnly>
<div class="demo-block menu-demo">
  <div class="menu-demo__frame" style="border: 1px solid var(--vp-c-divider);">
    <Menu theme="gray" :items="items" :width="180" searchable v-model:selectedKey="themeSelected.gray" />
  </div>
  <div class="menu-demo__frame" style="border: 1px solid var(--vp-c-divider);">
    <Menu theme="white" :items="items" :width="180" searchable v-model:selectedKey="themeSelected.white" />
  </div>
  <div class="menu-demo__glass">
    <div class="menu-demo__frame">
      <Menu theme="glass-light" :items="items" :width="180" searchable v-model:selectedKey="themeSelected['glass-light']" />
    </div>
    <div class="menu-demo__frame">
      <Menu theme="glass-dark" :items="items" :width="180" searchable v-model:selectedKey="themeSelected['glass-dark']" />
    </div>
  </div>
</div>
</ClientOnly>

```vue
<template>
  <Menu :items="items" theme="gray" />
  <Menu :items="items" theme="white" />
  <Menu :items="items" theme="glass-light" />
  <Menu :items="items" theme="glass-dark" />
</template>
```

### 数据驱动与复合组件

除了 `items`，也可以用 `MenuGroup` / `SubMenu` / `MenuItem` 手写结构。默认插槽内容渲染在 `items` 之后，两种写法可以混用。`selectedKey` 指向 flyout 内的叶子时，两种写法下祖先 SubMenu 都会高亮，flyout 未展开也成立。

<ClientOnly>
<div class="demo-block menu-demo">
  <div class="menu-demo__frame">
    <Menu :width="200" v-model:selectedKey="compoundSelected">
      <MenuItem item-key="home" label="首页" :icon="Home" />
      <MenuGroup group-key="course" title="课程管理">
        <MenuItem item-key="course-list" label="课程列表" :icon="Book" />
        <MenuItem item-key="course-create" label="新建课程" :icon="Add" />
        <MenuGroup group-key="course-resource" title="课程资源">
          <MenuItem item-key="res-video" label="视频资源" />
          <MenuItem item-key="res-doc" label="文档资源" />
        </MenuGroup>
      </MenuGroup>
      <MenuGroup group-key="teaching" title="教学中心">
        <MenuItem item-key="live" label="直播课堂" :icon="Videocam" />
        <SubMenu item-key="homework" label="作业" :icon="Assignment">
          <MenuItem item-key="hw-list" label="作业列表" />
          <MenuItem item-key="hw-review" label="批改作业" />
        </SubMenu>
      </MenuGroup>
      <SubMenu item-key="settings" label="系统设置" :icon="Setting" popup-with-icon>
        <MenuItem item-key="settings-profile" label="个人资料" :icon="Person" />
        <MenuItem item-key="settings-notify" label="通知设置" :icon="Notifications" />
      </SubMenu>
      <MenuItem item-key="legacy" label="已停用模块" disabled />
    </Menu>
  </div>
  <div class="menu-demo__aside">selectedKey：<code>{{ compoundSelected }}</code></div>
</div>
</ClientOnly>

```vue
<template>
  <Menu v-model:selectedKey="selectedKey">
    <MenuItem item-key="home" label="首页" :icon="Home" />
    <MenuGroup group-key="course" title="课程管理">
      <MenuItem item-key="course-list" label="课程列表" :icon="Book" />
      <MenuGroup group-key="course-resource" title="课程资源">
        <MenuItem item-key="res-video" label="视频资源" />
      </MenuGroup>
    </MenuGroup>
    <SubMenu item-key="settings" label="系统设置" :icon="Setting" popup-with-icon>
      <MenuItem item-key="settings-profile" label="个人资料" :icon="Person" />
    </SubMenu>
  </Menu>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Menu, MenuGroup, MenuItem, SubMenu } from '@aix/menu';
import { Home, Book, Setting, Person } from '@aix/icons';

const selectedKey = ref('home');
</script>
```

|                      | 数据驱动 `items`                                 | 复合组件                                             |
| -------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| 结构来源             | 一份 `MenuItemData[]`，适合从路由 / 权限配置生成 | 模板里手写，适合结构固定、节点需要各自定制的场景     |
| 内置搜索             | 按 label / `filterMethod` 过滤                   | 不过滤，只透出 `search` 事件                         |
| flyout 宽度          | 根据子项是否带图标自动判断                       | 用 `popupWithIcon` 指定                              |
| `select` 事件 `data` | 原始节点（含 `meta`）                            | `undefined`                                          |
| 祖先 SubMenu 高亮    | 按 `items` 树查找                                | SubMenu 挂载时从插槽收集后代 key                     |
| 自定义内容           | 根组件 `item` / `icon` / `group-title` 插槽      | 每个 `MenuItem` / `SubMenu` / `MenuGroup` 自己的插槽 |

### flyout 子菜单

有 `children` 的普通节点自动成为 flyout：悬停从右侧级联弹出，可多级；点击触发项只打开。关闭通道有四条：指针离开弹层、点击弹层链之外的任意位置、← / Esc、选中叶子；触屏设备点击触发项打开后，点击外部即可关闭。单层最多显示 `popupMaxVisible`（默认 9）项，超出后弹层内部滚动。子项带图标时弹层宽 182px，否则 158px。

<ClientOnly>
<div class="demo-block menu-demo">
  <div class="menu-demo__frame">
    <Menu :items="flyoutItems" :width="200" v-model:selectedKey="flyoutSelected" />
  </div>
  <div class="menu-demo__aside">
    悬停「课程管理 → 课程资源 → 视频」查看三级级联；悬停「数据报表」查看超过 9 项后的内部滚动。<br />
    selectedKey：<code>{{ flyoutSelected }}</code>
  </div>
</div>
</ClientOnly>

```vue
<template>
  <Menu :items="items" :popup-max-visible="6" popup-placement="right" popup-class="my-popup" />
</template>
```

### 拖拽宽度

`resizable` 时右边缘 hover 出现指示线，光标变为 `col-resize`，可在 `minWidth`（默认 150）~ `maxWidth`（默认 300）之间拖拽，`v-model:width` 同步。把手可聚焦，← / → 每次调整 10px。拖拽时把手捕获指针，拖到浏览器窗口外释放也会正常结束；拖拽中组件卸载会还原 body 上的光标与禁选样式。

<ClientOnly>
<div class="demo-block menu-demo" style="overflow: visible;">
  <div class="menu-demo__frame">
    <Menu :items="items" resizable :min-width="160" :max-width="320" v-model:width="width" />
  </div>
  <div class="menu-demo__aside">当前宽度：<code>{{ width }}px</code></div>
</div>
</ClientOnly>

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

未传 `width` 且非 `resizable` 时组件不设置内联宽度，由外层布局决定。

### 手风琴

`accordion` 让同一层级的分组只保留一个展开；`defaultOpenKeys` 指定初始展开的分组。不传 `openKeys` 也不传 `defaultOpenKeys` 时所有分组默认展开，`accordion` 开启时例外，默认全部折叠。

<ClientOnly>
<div class="demo-block menu-demo">
  <div class="menu-demo__frame">
    <Menu :items="items" :width="200" accordion :default-open-keys="['course']" v-model:selectedKey="accordionSelected" />
  </div>
</div>
</ClientOnly>

```vue
<template>
  <Menu
    :items="items"
    accordion
    :default-open-keys="['course']"
    v-model:openKeys="openKeys"
    @open-change="onOpenChange"
  />
</template>
```

### 插槽

`item` 作用域插槽拿到 `{ item, groupLevel, inPopup, active }`，`icon` / `group-title` 拿到 `{ item }`。`item.meta` 是业务透传字段，组件不解读。

<ClientOnly>
<div class="demo-block menu-demo">
  <div class="menu-demo__frame">
    <Menu :items="badgeItems" :width="220" v-model:selectedKey="slotSelected">
      <template #group-title="{ item }">
        {{ item.label }}<span style="margin-left: 6px; opacity: 0.6;">{{ item.children?.length ?? 0 }}</span>
      </template>
      <template #item="{ item, active }">
        <span style="display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%;">
          <span style="overflow: hidden; text-overflow: ellipsis;">{{ item.label }}</span>
          <span v-if="item.meta?.badge" class="menu-demo__badge" :style="{ background: active ? '#00c261' : '#f53f3f' }">{{ item.meta.badge }}</span>
        </span>
      </template>
    </Menu>
  </div>
</div>
</ClientOnly>

```vue
<template>
  <Menu :items="items" v-model:selectedKey="selectedKey">
    <template #group-title="{ item }">{{ item.label }}（{{ item.children?.length }}）</template>
    <template #item="{ item, active }">
      <span class="my-item">
        {{ item.label }}
        <Badge v-if="item.meta?.badge" :count="item.meta.badge" :highlight="active" />
      </span>
    </template>
  </Menu>
</template>
```

| 插槽          | 作用域                                  | 说明                                                    |
| ------------- | --------------------------------------- | ------------------------------------------------------- |
| `header`      | -                                       | 列表上方固定区域，设计稿放 logo；内置搜索框渲染在它之下 |
| `footer`      | -                                       | 列表下方固定区域，设计稿放用户行与设置入口              |
| `default`     | -                                       | 复合组件写法的菜单内容，渲染在 `items` 之后             |
| `item`        | `{ item, groupLevel, inPopup, active }` | 自定义数据驱动叶子项的内容                              |
| `icon`        | `{ item }`                              | 自定义数据驱动节点的图标                                |
| `group-title` | `{ item }`                              | 自定义数据驱动分组的标题                                |

复合组件写法下，`MenuItem` / `SubMenu` 各自提供 `icon` 插槽，`MenuGroup` 提供 `title` 插槽。

### 长文案与键盘

菜单项单行省略，被截断时悬停显示完整 Tooltip；分组标题只做省略。Tooltip 来自 `@aix/popper`，配色依赖 `@aix/theme` 的 CSS 变量，应用入口需引入一次 `@aix/theme/vars`。

| 按键                        | 作用                                        |
| --------------------------- | ------------------------------------------- |
| `↑` / `↓`                   | 在当前列表内移动焦点，首尾循环              |
| `Home` / `End`              | 焦点移到列表首 / 尾                         |
| `→`                         | 焦点在 SubMenu 上时打开 flyout 并聚焦第一项 |
| `←` / `Esc`                 | 关闭当前 flyout，焦点回到触发项             |
| `Enter` / `Space`           | 选中叶子项、切换分组折叠、打开 flyout       |
| `←` / `→`（拖拽把手聚焦时） | 宽度每次 -10px / +10px                      |
| `Esc`（搜索框聚焦时）       | 清空关键字并阻止冒泡，输入框保持焦点，外层 Modal / Drawer 不受影响 |

## 主题变量定制

`theme` 传任意字符串时，组件只追加 `aix-menu--<name>`（侧栏）与 `aix-menu-popup--<name>`（flyout 弹层，Teleport 到 body）两个修饰类，在这两个选择器下声明 `--aix-menu-*` 变量即可接入业务配色。

<ClientOnly>
<div class="demo-block menu-demo">
  <div class="menu-demo__frame">
    <Menu :items="items" :width="200" theme="brand" searchable v-model:selectedKey="brandSelected" />
  </div>
  <div class="menu-demo__aside"><code>theme="brand"</code>，变量声明在 <code>.aix-menu--brand, .aix-menu-popup--brand</code> 下</div>
</div>
</ClientOnly>

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

### 颜色变量

| 变量                                  | 说明                         |
| ------------------------------------- | ---------------------------- |
| `--aix-menu-bg`                       | 侧栏背景                     |
| `--aix-menu-item-color`               | 菜单项文字                   |
| `--aix-menu-item-bg-hover`            | 菜单项 / 分组标题 hover 背景 |
| `--aix-menu-item-bg-active`           | 选中项背景                   |
| `--aix-menu-item-color-active`        | 选中项文字                   |
| `--aix-menu-item-color-disabled`      | 禁用项文字（禁用项被选中时同样按此显示）                             |
| `--aix-menu-group-title-color`        | 一级分组标题文字                                                     |
| `--aix-menu-subgroup-title-color`     | 二级子分组标题文字                                                   |
| `--aix-menu-divider-color`            | 分割线                                                               |
| `--aix-menu-focus-ring-color`         | 侧栏键盘焦点环                                                       |
| `--aix-menu-resize-indicator-color`   | 拖拽把手指示线                                                       |
| `--aix-menu-scrollbar-color`          | 侧栏列表滚动条滑块                                                   |
| `--aix-menu-search-bg`                | 搜索框背景                                                           |
| `--aix-menu-search-bg-active`         | 搜索框 hover / 聚焦背景                                              |
| `--aix-menu-search-color`             | 搜索框输入文字                                                       |
| `--aix-menu-search-icon-color`        | 搜索框图标                                                           |
| `--aix-menu-search-placeholder-color` | 搜索框占位文字                                                       |
| `--aix-menu-popup-bg`                 | flyout 弹层背景                                                      |
| `--aix-menu-popup-shadow`             | flyout 弹层阴影                                                      |
| `--aix-menu-popup-item-color`         | 弹层内菜单项文字                                                     |
| `--aix-menu-popup-item-bg-hover`      | 弹层内菜单项 hover 背景                                              |
| `--aix-menu-popup-item-bg-active`     | 弹层内选中项背景                                                     |
| `--aix-menu-popup-item-color-active`  | 弹层内选中项文字                                                     |
| `--aix-menu-popup-scrollbar-color`    | 弹层滚动条                                                           |
| `--aix-menu-popup-focus-ring-color`   | 弹层键盘焦点环，定义在 `.aix-menu-popup` 基础块，默认 `#00c261`      |

### 尺寸变量

侧栏（`.aix-menu`）与弹层（`.aix-menu-popup`）各自独立挂载，标注「侧栏 + 弹层」的变量在两处都有声明，覆盖时两个选择器都要写。

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
| `--aix-menu-subgroup-item-height`          | `40px`          | 侧栏 + 弹层 | 二级子分组内菜单项 / SubMenu 触发项高度          |
| `--aix-menu-subgroup-item-padding`         | `0 12px`        | 侧栏 + 弹层 | 二级子分组内菜单项 / SubMenu 触发项内边距        |
| `--aix-menu-popup-width`                   | `158px`         | 侧栏 + 弹层 | 弹层宽度（子项无图标）                           |
| `--aix-menu-popup-width-icon`              | `182px`         | 侧栏 + 弹层 | 弹层宽度（子项带图标）                           |
| `--aix-menu-popup-padding`                 | `4px`           | 侧栏 + 弹层 | 弹层内边距                                       |
| `--aix-menu-popup-item-height`             | `36px`          | 侧栏 + 弹层 | 弹层内菜单项高度                                 |
| `--aix-menu-popup-item-padding`            | `0 12px`        | 侧栏 + 弹层 | 弹层内菜单项内边距                               |
| `--aix-menu-popup-item-font-weight-active` | `500`           | 侧栏 + 弹层 | 弹层内选中项 / 侧栏激活 SubMenu 字重             |
| `--aix-menu-popup-max-visible`             | `9`             | 侧栏 + 弹层 | 弹层最大可见项数，由 `popupMaxVisible` prop 写入 |
| `--aix-menu-transition-duration`           | `0.2s`          | 侧栏 + 弹层 | 过渡时长                                         |
| `--aix-menu-padding`                       | `8px`           | 侧栏        | 侧栏内边距                                       |
| `--aix-menu-section-gap`                   | `16px`          | 侧栏        | header / 列表 / footer 之间的间距                |
| `--aix-menu-group-gap`                     | `16px`          | 侧栏        | 分组与相邻节点的间距                             |
| `--aix-menu-item-gap`                      | `8px`           | 侧栏        | 菜单项之间的间距                                 |
| `--aix-menu-group-title-height`            | `38px`          | 侧栏        | 一级分组标题高度                                 |
| `--aix-menu-group-title-padding`           | `0 8px`         | 侧栏        | 一级分组标题内边距                               |
| `--aix-menu-subgroup-title-height`         | `32px`          | 侧栏        | 二级子分组标题高度                               |
| `--aix-menu-subgroup-title-padding`        | `0 12px`        | 侧栏        | 二级子分组标题内边距                             |
| `--aix-menu-subgroup-title-font-size`      | `12px`          | 侧栏        | 二级子分组标题字号                               |
| `--aix-menu-resize-handle-width`           | `6px`           | 侧栏        | 拖拽把手命中区宽度                               |
| `--aix-menu-search-height`                 | `38px`          | 侧栏        | 搜索框高度                                       |
| `--aix-menu-search-padding`                | `8px`           | 侧栏        | 搜索框内边距                                     |
| `--aix-menu-search-gap`                    | `10px`          | 侧栏        | 搜索图标与输入框间距                             |
| `--aix-menu-search-icon-size`              | `22px`          | 侧栏        | 搜索图标尺寸                                     |
| `--aix-menu-search-font-size`              | `14px`          | 侧栏        | 搜索框字号                                       |
| `--aix-menu-search-line-height`            | `22px`          | 侧栏        | 搜索框行高                                       |

## 多语言

菜单项文案由业务提供，组件自己渲染的文案只有三处：搜索框占位 `searchPlaceholder`（搜索 / Search，`searchPlaceholder` prop 优先）、无结果提示 `noResults`（暂无匹配结果 / No matching items）、拖拽把手的 `aria-label` `resizeHandle`（拖拽调整菜单宽度 / Drag to resize the menu）。默认跟随 `@aix/hooks` 的全局语言，可通过 `createLocale(locale, { messages: { menu: … } })` 覆盖。语言包可单独导入：`menuLocale` / `menuZhCN` / `menuEnUS`。

## 子组件

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

### 数据类型

```typescript
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
  type?: 'item' | 'group' | 'divider';
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

export type MenuTheme = 'gray' | 'white' | 'glass-light' | 'glass-dark' | (string & {});
export type MenuPopupPlacement =
  'right-start' | 'right' | 'right-end' | 'left-start' | 'left' | 'left-end';
```

## API

::: warning 自动生成的 API 文档
以下 API 文档由 `pnpm docs:gen` 从组件源码自动生成。请勿手动编辑此部分。

如需更新 API 文档，请：
1. 修改组件源码中的 JSDoc 注释
2. 运行 `pnpm docs:gen`（= `gen:docs` 生成到 README.md + `sync:docs` 同步到此文档）
:::

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
| `searchValue` | `string` | - | - | 搜索关键字（v-model:searchValue）。非空时按 label 过滤 items 并展开全部分组；复合组件写法只透出事件不过滤 |
| `searchPlaceholder` | `string` | - | - | 搜索框占位文案，默认取语言包 |
| `filterMethod` | `any` | - | - | 自定义匹配规则；默认对 label 做不区分大小写的包含匹配 |
| `width` | `number` | - | - | 宽度（px，v-model:width）。未传且非 resizable 时不设置内联宽度，由外层布局决定 |
| `resizable` | `boolean` | `false` | - | 是否允许拖拽右边缘调整宽度 |
| `minWidth` | `number` | `150` | - | 可拖拽的最小宽度（px） |
| `maxWidth` | `number` | `300` | - | 可拖拽的最大宽度（px） |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:selectedKey` | `string` | - |
| `update:openKeys` | `string[]` | - |
| `update:width` | `number` | - |
| `update:searchValue` | `string` | - |
| `search` | `string` | 搜索关键字变化 |
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
