import type { TrackerDataType } from '../types.js';

/** 属性值：静态值或动态函数 */
type PropertyValue = TrackerDataType | (() => TrackerDataType);

/** update 方法接受的数据类型 */
type PropertyInput = Record<string, PropertyValue | null | undefined>;

/**
 * 公共属性管理
 * 支持静态值、动态函数（每次 resolve 时执行）、null 删除
 */
export class CommonPropertiesManager {
  private store = new Map<string, PropertyValue>();

  constructor(initial?: PropertyInput) {
    if (initial) {
      this.update(initial);
    }
  }

  /** 注册/更新属性，传 null 删除对应属性，undefined 跳过 */
  update(data: PropertyInput): void {
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      if (value === null) {
        this.store.delete(key);
      } else {
        this.store.set(key, value);
      }
    }
  }

  /** 解析所有属性（执行动态函数），返回纯值对象 */
  resolve(): Record<string, TrackerDataType> {
    const result: Record<string, TrackerDataType> = {};
    for (const [key, value] of this.store) {
      result[key] = typeof value === 'function' ? value() : value;
    }
    return result;
  }

  /** 合并公共属性和事件属性，事件属性优先级更高 */
  merge(eventProps: Record<string, unknown>): Record<string, unknown> {
    return { ...this.resolve(), ...eventProps };
  }
}
