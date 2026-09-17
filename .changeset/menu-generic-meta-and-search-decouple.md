---
'@aix/menu': minor
---

`@aix/menu` 打通 meta 泛型、解耦搜索过滤，并修正宽度持久化与空态的边界行为。

- **泛型**：`Menu` 改为泛型组件，`meta` 类型由 `items` 推导，`select` 等事件载荷随之带上业务类型；`MenuItemMeta` 放宽为 `Record<string, any>`，`interface` 声明的 meta 同样满足约束
- **搜索**：过滤只看 `searchValue`，不再要求开启 `searchable`，外部输入框可经 `v-model:searchValue` 驱动过滤；`items` 与默认插槽混用时，`items` 无命中不再显示空态
- **数据节点**：`MenuItemData` 新增 `collapsible`（分组）与 `popupClass`（子菜单）
- **宽度持久化**：读回的宽度在非 `resizable` 下同样作为内联宽度生效；非正数存值忽略；换到没有存值的 key 后移除内联宽度
- **键盘**：弹层已展开时在触发器上按 Enter / Space 把焦点交给弹层第一项
