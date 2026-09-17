# @aix/menu

## 0.1.0

### Minor Changes

- 3a9da7b: `@aix/menu` 补齐业务接入时缺失的能力。
  
  - **图标**：`icon` 接受字符串，含 `/` 或以 `data:` 开头的按图片地址渲染为 `<img>`，其余按字体图标类名渲染为 `<i>`；分组节点的 `icon` 渲染在标题前，`MenuGroup` 同步增加 `icon` prop 与 `icon` 插槽
  - **icon 插槽**：根组件的 `icon` 作用域插槽只接管带 `icon` 的节点，无图标节点不再渲染空的图标容器
  - **路由联动**：新增 `resolveSelectedKey(items, matcher)` 工具，按叶子匹配分值挑出 `selectedKey`
  - **弹层挂载**：新增 `popupTeleportTo` prop，`false` 时 flyout 就地渲染并按 fixed 定位
  - **展开状态**：`defaultOpenKeys` 在用户手动操作分组之前的变化会重新应用，菜单数据异步到达后再传入也生效
  - **宽度持久化**：新增 `widthStorageKey` prop，宽度写入 localStorage 并在挂载时读回
  - **类型**：`MenuItemData` / `MenuSelectPayload` / `MenuItemSlotProps` / `MenuProps` / `MenuEmits` 增加 `meta` 泛型参数

## 0.0.1

### Patch Changes

- 018e4a2: 新增 `@aix/menu` 侧边栏菜单组件。
  
  - **两种写法**：`items` 数据驱动与 `Menu` / `MenuGroup` / `SubMenu` / `MenuItem` 复合组件，可混用
  - **结构**：内联可折叠分组、右侧级联 flyout 子菜单（可多级，弹层内超过 `popupMaxVisible` 项后内部滚动）
  - **主题**：内置 gray / white / glass-light / glass-dark 四套，全部由 `--aix-menu-*` 变量驱动，可自定义主题名扩展
  - **搜索**：`searchable` 开启内置搜索框，按 label 过滤并支持 `filterMethod` 自定义匹配；命中的文字标色，命中落在 flyout 弹层里时触发项整行标底；分组按命中位置决定展开；带清除按钮
  - **宽度**：`resizable` 开启右边缘拖拽调宽，`v-model:width` 同步，默认范围 150–300px
  - **其他**：文字溢出自动挂 Tooltip、完整键盘导航（↑↓ / Home / End / ← → / Esc）、中英文语言包
- Updated dependencies [018e4a2]
  - @aix/popper@0.0.10
