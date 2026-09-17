---
'@aix/menu': patch
---

`@aix/menu` 按设计稿更新搜索命中样式，并补齐分组标题的溢出提示。

- **搜索命中提示**：命中项藏在 flyout 弹层里时，子菜单触发项改为在箭头前显示 6px 圆点，不再整行铺底；移除 `--aix-menu-item-bg-highlight`，新增 `--aix-menu-highlight-dot-size` / `--aix-menu-highlight-dot-gap`
- **分组标题**：单行省略被截断时悬停显示完整标题，与叶子项一致
- **拖拽指示线**：四套主题的 `--aix-menu-resize-indicator-color` 改为 `#1546f2`
