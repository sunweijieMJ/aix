import type { Component } from 'vue';

/**
 * 组件覆盖管理器（预留扩展入口）
 *
 * 维护「预埋组件名 → 自定义组件」注册表，让租户在不改核心代码的前提下替换指定预埋组件。
 *
 * 生效链路（注册 + 消费，缺一不可）：
 * 1. 注册：租户在 OverrideConfig.components 中配置 { 组件名: 自定义组件 }，
 *    由 initOverrides 在 mount 前调用 register() 写入注册表。
 * 2. 消费：在需要支持覆盖的预埋组件渲染处，用 componentManager.getComponent(name, fallback)
 *    解析组件并以 <component :is> 渲染——未注册覆盖时回退到 fallback 默认组件。
 *
 * 当前为预留入口：注册维度已就绪，待有实际需要被租户替换的预埋组件时，在其渲染处接入第 2 步即可。
 */
class ComponentManager {
  private components = new Map<string, Component>();

  /** 批量注册组件 */
  register(components: Record<string, Component>): void {
    Object.entries(components).forEach(([name, comp]) => {
      this.components.set(name, comp);
    });
  }

  /** 获取组件，未注册则返回 fallback */
  getComponent(name: string, fallback: Component): Component {
    return this.components.get(name) ?? fallback;
  }
}

export const componentManager = new ComponentManager();
