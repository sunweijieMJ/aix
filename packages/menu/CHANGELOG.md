# @aix/menu

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
