---
'@aix/popper': patch
---

Tooltip 新增 `popperClass`，向浮层根节点追加自定义 class，与 Popper / Popover / Dropdown / ContextMenu 的同名属性一致。此前 Tooltip 是这几个组件里唯一没有该属性的，浮层被 Teleport 到 body 后无法从外部定向设置样式。
