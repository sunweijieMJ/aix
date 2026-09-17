---
'@aix/menu': minor
---

`@aix/menu` 补齐业务接入时缺失的能力。

- **图标**：`icon` 接受字符串，含 `/` 或以 `data:` 开头的按图片地址渲染为 `<img>`，其余按字体图标类名渲染为 `<i>`；分组节点的 `icon` 渲染在标题前，`MenuGroup` 同步增加 `icon` prop 与 `icon` 插槽
- **icon 插槽**：根组件的 `icon` 作用域插槽只接管带 `icon` 的节点，无图标节点不再渲染空的图标容器
- **路由联动**：新增 `resolveSelectedKey(items, matcher)` 工具，按叶子匹配分值挑出 `selectedKey`
- **弹层挂载**：新增 `popupTeleportTo` prop，`false` 时 flyout 就地渲染并按 fixed 定位
- **展开状态**：`defaultOpenKeys` 在用户手动操作分组之前的变化会重新应用，菜单数据异步到达后再传入也生效
- **宽度持久化**：新增 `widthStorageKey` prop，宽度写入 localStorage 并在挂载时读回
- **类型**：`MenuItemData` / `MenuSelectPayload` / `MenuItemSlotProps` / `MenuProps` / `MenuEmits` 增加 `meta` 泛型参数
