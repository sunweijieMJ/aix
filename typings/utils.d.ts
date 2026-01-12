/**
 * 为 TypeScript 编译器提供工具函数相关的类型定义
 */
declare global {
  /**
   * 对象值的类型
   */
  export type ValueOf<T> = T[keyof T];

  /**
   * 常量转值
   */
  export type ConstApiToValueRange<T extends () => any> = ValueOf<
    ReturnType<T>
  >;

  /**
   * 类型所有项可选
   */
  type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
  };

  /**
   * 创建一个新类型，要求对象必须有且仅有 T 类型中的一个属性
   */
  export type RequireOnlyOne<T> = {
    [K in keyof T]: Required<Pick<T, K>> &
      Partial<Record<Exclude<keyof T, K>, never>>;
  }[keyof T];

  /**
   * 互斥类型
   */
  export type Mutex<IRequired, IPickOnlyOne> = IRequired &
    RequireOnlyOne<IPickOnlyOne>;

  /**
   * 判断对象是否为空
   */
  export type IsObjectEmpty<T extends object> = [keyof T] extends [never]
    ? true
    : false;

  /**
   * 字典类型
   */
  export type Dictionary<T> = {
    [key: string]: T;
  };

  /**
   * 获取一个组件的参数类型，defaultProps推导为可选
   */
  export type InferPropsWithOptionalDefault<T> =
    T extends React.ComponentType<infer K>
      ? keyof T['defaultProps'] extends keyof K
        ? Omit<K, keyof T['defaultProps']> &
            Partial<Pick<K, keyof T['defaultProps']>>
        : never
      : never;
}
