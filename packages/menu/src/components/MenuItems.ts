import { defineComponent, h, type PropType, type VNodeChild } from 'vue';
import { useMenuContext, useMenuLevel } from '../composables/useMenuContext';
import type { MenuItemData } from '../types';
import MenuGroup from './MenuGroup.vue';
import MenuItem from './MenuItem.vue';
import SubMenu from './SubMenu.vue';

/**
 * 把 items 数据递归渲染成 MenuGroup / SubMenu / MenuItem，
 * 并把根组件的 item / icon / group-title 插槽透传到对应节点。
 */
const MenuItems = defineComponent({
  name: 'AixMenuItems',
  props: {
    /** 本层要渲染的数据节点 */
    items: {
      type: Array as PropType<MenuItemData[]>,
      required: true,
    },
  },
  setup(props) {
    const ctx = useMenuContext();
    const level = useMenuLevel();

    /** 根组件的 icon 插槽只接管带 icon 的节点，没有图标的节点不渲染图标容器 */
    function iconSlot(node: MenuItemData) {
      const icon = ctx.slots.icon;
      return icon && node.icon ? { icon: () => icon({ item: node }) } : {};
    }

    function renderNode(node: MenuItemData): VNodeChild {
      if (node.type === 'divider') {
        return h('li', { key: node.key, role: 'separator', class: ctx.ns.e('divider') });
      }

      if (node.type === 'group') {
        const groupTitle = ctx.slots['group-title'];
        return h(
          MenuGroup,
          {
            key: node.key,
            groupKey: node.key,
            title: node.label,
            icon: node.icon,
            collapsible: node.collapsible,
          },
          {
            default: () => h(MenuItems, { items: node.children ?? [] }),
            ...iconSlot(node),
            ...(groupTitle ? { title: () => groupTitle({ item: node }) } : {}),
          },
        );
      }

      const children = node.children;
      if (children?.length) {
        return h(
          SubMenu,
          {
            key: node.key,
            itemKey: node.key,
            label: node.label,
            icon: node.icon,
            disabled: node.disabled,
            data: node,
            popupClass: node.popupClass,
            popupWithIcon: children.some((child) => !!child.icon),
          },
          {
            default: () => h(MenuItems, { items: children }),
            ...iconSlot(node),
          },
        );
      }

      const itemSlot = ctx.slots.item;
      return h(
        MenuItem,
        {
          key: node.key,
          itemKey: node.key,
          label: node.label,
          icon: node.icon,
          disabled: node.disabled,
          data: node,
        },
        {
          ...iconSlot(node),
          ...(itemSlot
            ? {
                default: () =>
                  itemSlot({
                    item: node,
                    groupLevel: level.groupLevel,
                    inPopup: level.inPopup,
                    active: ctx.selectedKey.value === node.key,
                  }),
              }
            : {}),
        },
      );
    }

    return () => props.items.map(renderNode);
  },
});

export default MenuItems;
