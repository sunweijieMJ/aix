/**
 * 服务注册选项
 */
interface IServiceOptions {
  /** 是否为工厂函数 */
  isFactory?: boolean;
  /** 是否为单例 */
  singleton?: boolean;
}

/**
 * 服务注册信息
 */
interface IServiceRegistry<T> {
  service: T | (() => T);
  options: IServiceOptions;
  instance?: T;
}

/**
 * 简单的依赖注入容器
 */
export class Container {
  private static instance: Container;
  private services: Map<string, IServiceRegistry<any>> = new Map();

  /**
   * 获取容器单例
   */
  public static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }
    return Container.instance;
  }

  /**
   * 注册服务
   * @param name 服务名称
   * @param service 服务实例或工厂函数
   * @param options 注册选项
   */
  public register<T>(name: string, service: T | (() => T), options?: IServiceOptions): void {
    const finalOptions: IServiceOptions = {
      isFactory: false,
      singleton: true,
      ...options,
    };

    this.services.set(name, {
      service,
      options: finalOptions,
    });
  }

  /**
   * 注册工厂函数
   * @param name 服务名称
   * @param factory 工厂函数
   * @param singleton 是否单例，默认true
   */
  public registerFactory<T>(name: string, factory: () => T, singleton = true): void {
    this.register(name, factory, { isFactory: true, singleton });
  }

  /**
   * 获取服务
   * @param name 服务名称
   * @returns 服务实例
   */
  public get<T>(name: string): T {
    const registry = this.services.get(name);

    if (!registry) {
      throw new Error(`Service '${name}' not found in container`);
    }

    const { service, options, instance } = registry;

    // 如果是工厂函数
    if (options.isFactory) {
      const factory = service as () => T;

      // 如果是单例且已经创建过实例，直接返回
      if (options.singleton && instance) {
        return instance;
      }

      // 调用工厂函数创建实例
      const newInstance = factory();

      // 如果是单例，缓存实例
      if (options.singleton) {
        registry.instance = newInstance;
      }

      return newInstance;
    }

    // 直接返回服务实例
    return service as T;
  }

  /**
   * 检查服务是否已注册
   * @param name 服务名称
   * @returns 是否已注册
   */
  public has(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * 移除服务
   * @param name 服务名称
   */
  public remove(name: string): void {
    this.services.delete(name);
  }

  /**
   * 清空容器
   */
  public clear(): void {
    this.services.clear();
  }
}

// 导出容器单例
export const container = Container.getInstance();
