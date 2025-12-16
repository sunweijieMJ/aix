import type { Component } from 'vue';

/**
 * 为组件添加子组件
 */
export function withSubComponents<
  T extends Component,
  S extends Record<string, Component>,
>(component: T, subComponents: S): T & S {
  const result = component as T & S;
  Object.assign(result, subComponents);
  return result;
}
