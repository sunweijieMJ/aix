import { createLogger } from './logger';

const logger = createLogger('DATA_TRANSFORMER');

/**
 * 数据转换工具类
 * 提供通用的数据转换方法，减少服务类中的冗余代码
 */
export class DataTransformer {
  /**
   * 解析JSON字符串为对象
   * @param value JSON字符串或对象
   * @param defaultValue 解析失败时的默认值
   * @returns 解析后的对象
   */
  static parseJsonField<T>(value: string | T, defaultValue: T = {} as T): T {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T;
      } catch (error) {
        logger.warn('Failed to parse JSON string:', error);
        return defaultValue;
      }
    }
    return value;
  }

  /**
   * 将对象序列化为JSON字符串
   * @param value 对象或JSON字符串
   * @param defaultValue 序列化失败时的默认值
   * @returns 序列化后的JSON字符串
   */
  static stringifyJsonField<T>(value: T | string, defaultValue: string = '{}'): string {
    if (typeof value !== 'string') {
      try {
        return JSON.stringify(value);
      } catch (error) {
        logger.warn('Failed to stringify object:', error);
        return defaultValue;
      }
    }
    return value;
  }

  /**
   * 添加字段到对象
   * @param obj 原对象
   * @param fieldName 字段名
   * @param defaultValue 默认值
   * @returns 添加字段后的对象
   */
  static addField<T, K extends string, V>(obj: T, fieldName: K, defaultValue: V): T & { [P in K]: V } {
    return {
      ...obj,
      [fieldName]: defaultValue,
    } as T & { [P in K]: V };
  }

  /**
   * 移除对象中的字段
   * @param obj 原对象
   * @param fieldNames 要移除的字段名数组
   * @returns 移除字段后的对象
   */
  static removeFields<T, K extends keyof T>(obj: T, fieldNames: K[]): Omit<T, K> {
    const result = { ...obj };
    for (const field of fieldNames) {
      delete result[field];
    }
    return result as Omit<T, K>;
  }

  /**
   * 重命名对象中的字段
   * @param obj 原对象
   * @param fieldMap 字段映射 { 旧字段名: 新字段名 }
   * @returns 重命名字段后的对象
   */
  static renameFields<T, M extends Record<string, string>>(obj: T, fieldMap: M): any {
    const result: any = { ...obj };

    for (const [oldField, newField] of Object.entries(fieldMap)) {
      if (oldField in result) {
        result[newField] = result[oldField];
        delete result[oldField];
      }
    }

    return result;
  }

  /**
   * 转换日期字段为ISO字符串
   * @param date 日期对象或字符串
   * @returns ISO日期字符串
   */
  static toISODateString(date: Date | string | number | undefined): string {
    if (!date) {
      return new Date().toISOString();
    }

    if (typeof date === 'string') {
      return date;
    }

    return new Date(date).toISOString();
  }

  /**
   * 确保值存在，如果不存在则使用默认值
   * @param value 原始值
   * @param defaultValue 默认值
   * @returns 确保存在的值
   */
  static ensureValue<T>(value: T | undefined | null, defaultValue: T): T {
    return value !== undefined && value !== null ? value : defaultValue;
  }

  /**
   * 转换数组中的每个元素
   * @param array 原始数组
   * @param transformer 转换函数
   * @returns 转换后的数组
   */
  static transformArray<T, R>(array: T[], transformer: (item: T) => R): R[] {
    return array.map(transformer);
  }
}
