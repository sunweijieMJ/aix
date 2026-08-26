export interface CustomApiConfig {
  /** 替换已有实例或注册新实例（key 为实例名称） */
  instances?: Record<string, any>;
  /** PolymasApi 插件模块（为指定实例注册模块） */
  modules?: Record<string, Array<(this: any, options?: any) => any>>;
}

/**
 * 将 API 覆盖配置应用到 instances 对象
 * 支持替换/新增实例和注册模块
 */
export function applyApiOverrides(config: CustomApiConfig, instances: Record<string, any>): void {
  // 注册/替换实例
  if (config.instances) {
    Object.assign(instances, config.instances);
  }

  // 为实例注册模块
  if (config.modules) {
    for (const [name, modules] of Object.entries(config.modules)) {
      const instance = instances[name];
      if (!instance) {
        if (import.meta.env.DEV) {
          console.warn(
            `[Override] API module target "${name}" not found. Available: ${Object.keys(instances).join(', ')}`,
          );
        }
        continue;
      }

      if (typeof instance.use !== 'function') {
        if (import.meta.env.DEV) {
          console.warn(
            `[Override] API instance "${name}" does not have a .use() method, ${modules.length} module(s) skipped.`,
          );
        }
        continue;
      }

      modules.forEach(mod => {
        instance.use(mod);
      });
    }
  }
}
