import type { DefineComponent } from 'vue';
import type { MenuGroupProps, MenuItemProps, MenuProps, SubMenuProps } from './types';

// 全局类型增强 - 让 IDE 自动识别组件
declare module '@vue/runtime-core' {
  export interface GlobalComponents {
    AixMenu: DefineComponent<MenuProps>;
    AixMenuItem: DefineComponent<MenuItemProps>;
    AixMenuGroup: DefineComponent<MenuGroupProps>;
    AixSubMenu: DefineComponent<SubMenuProps>;
  }
}

export {};
