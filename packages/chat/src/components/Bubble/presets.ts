/**
 * @fileoverview Bubble 角色预设配置
 * 提供开箱即用的角色样式配置
 */

import type { RolesConfig, BubbleProps } from './types';

/**
 * 默认角色配置
 * - user: 右侧，填充样式
 * - assistant: 左侧，描边样式
 * - system: 左侧，无边框样式
 */
export const defaultRoles: RolesConfig = {
  user: {
    placement: 'end',
    variant: 'filled',
  },
  assistant: {
    placement: 'start',
    variant: 'filled',
  },
  system: {
    placement: 'start',
    variant: 'borderless',
    avatar: false,
  },
};

/**
 * 简约风格角色配置
 * 无边框，简洁干净
 */
export const minimalRoles: RolesConfig = {
  user: {
    placement: 'end',
    variant: 'borderless',
  },
  assistant: {
    placement: 'start',
    variant: 'borderless',
  },
  system: {
    placement: 'start',
    variant: 'borderless',
    avatar: false,
  },
};

/**
 * 圆角风格角色配置
 * 使用 round 形状
 */
export const roundRoles: RolesConfig = {
  user: {
    placement: 'end',
    variant: 'filled',
    shape: 'round',
  },
  assistant: {
    placement: 'start',
    variant: 'outlined',
    shape: 'round',
  },
  system: {
    placement: 'start',
    variant: 'borderless',
    shape: 'round',
    avatar: false,
  },
};

/**
 * 对话风格角色配置
 * 使用 corner 形状，更有对话感
 */
export const chatRoles: RolesConfig = {
  user: {
    placement: 'end',
    variant: 'filled',
    shape: 'corner',
  },
  assistant: {
    placement: 'start',
    variant: 'filled',
    shape: 'corner',
  },
  system: {
    placement: 'start',
    variant: 'borderless',
    avatar: false,
  },
};

/**
 * 阴影风格角色配置
 * 使用 shadow 变体，更有层次感
 */
export const shadowRoles: RolesConfig = {
  user: {
    placement: 'end',
    variant: 'shadow',
  },
  assistant: {
    placement: 'start',
    variant: 'shadow',
  },
  system: {
    placement: 'start',
    variant: 'borderless',
    avatar: false,
  },
};

/**
 * 紧凑风格角色配置
 * 隐藏头像，适合空间受限的场景
 */
export const compactRoles: RolesConfig = {
  user: {
    placement: 'end',
    variant: 'filled',
    avatar: false,
  },
  assistant: {
    placement: 'start',
    variant: 'outlined',
    avatar: false,
  },
  system: {
    placement: 'start',
    variant: 'borderless',
    avatar: false,
  },
};

/**
 * 创建自定义角色配置
 * @param overrides 覆盖的配置
 * @param base 基础配置，默认使用 defaultRoles
 */
export function createRolesConfig(
  overrides: RolesConfig,
  base: RolesConfig = defaultRoles,
): RolesConfig {
  const result: RolesConfig = { ...base };

  for (const role of Object.keys(overrides) as Array<keyof RolesConfig>) {
    const override = overrides[role];
    const baseConfig = base[role];

    if (typeof override === 'function') {
      // 函数式配置直接覆盖
      result[role] = override;
    } else if (typeof baseConfig === 'function') {
      // 基础是函数，覆盖是对象，合并为新函数
      result[role] = (item) => ({
        ...baseConfig(item),
        ...override,
      });
    } else {
      // 都是对象，直接合并
      result[role] = {
        ...baseConfig,
        ...override,
      } as Partial<BubbleProps>;
    }
  }

  return result;
}
