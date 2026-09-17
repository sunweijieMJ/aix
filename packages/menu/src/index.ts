import type { App } from 'vue';
import MenuGroup from './components/MenuGroup.vue';
import MenuItem from './components/MenuItem.vue';
import SubMenu from './components/SubMenu.vue';
import Menu from './Menu.vue';

// flyout 与溢出 Tooltip 依赖 @aix/popper 的定位 / 过渡 / 气泡样式
import '@aix/popper/style';
import './styles/index.scss';

export type {
  MenuTheme,
  MenuPopupPlacement,
  MenuPopupTeleportTo,
  MenuIconSource,
  MenuItemType,
  MenuItemMeta,
  MenuItemData,
  MenuSelectPayload,
  MenuItemSlotProps,
  MenuKeyMatcher,
  MenuProps,
  MenuEmits,
  MenuItemProps,
  MenuGroupProps,
  SubMenuProps,
} from './types';

export { Menu, MenuItem, MenuGroup, SubMenu };

export { resolveSelectedKey } from './utils/resolve-selected-key';

export { locale as menuLocale, zhCN as menuZhCN, enUS as menuEnUS } from './locale';
export type { MenuLocale } from './locale';

export default {
  install(app: App) {
    app.component('AixMenu', Menu);
    app.component('AixMenuItem', MenuItem);
    app.component('AixMenuGroup', MenuGroup);
    app.component('AixSubMenu', SubMenu);
  },
};
