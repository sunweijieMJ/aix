import type { ValidatorConfig } from '../types.js';

/** 默认事件名正则 */
const DEFAULT_EVENT_PATTERN = /^(app|mp|web)_[a-z0-9]+(_[a-z0-9]+){1,5}$/;

/**
 * 事件校验器（仅开发环境使用）
 * 校验事件名格式和属性白名单
 */
export class TrackerValidator {
  private eventNamePattern: RegExp;
  private allowedProperties: Set<string> | null;
  private onViolation: 'warn' | 'block';

  constructor(config: ValidatorConfig | true) {
    const resolved = config === true ? {} : config;
    this.eventNamePattern = resolved.eventNamePattern ?? DEFAULT_EVENT_PATTERN;
    this.allowedProperties = resolved.allowedProperties
      ? new Set(resolved.allowedProperties)
      : null;
    this.onViolation = resolved.onViolation ?? 'warn';
  }

  /**
   * 校验事件名和属性
   * @returns true 通过校验，false 校验失败
   */
  validate(eventName: string, properties: Record<string, unknown>): boolean {
    // 预置事件（$ 开头）跳过校验
    if (eventName.startsWith('$')) return true;

    let valid = true;

    // 校验事件名格式
    if (!this.eventNamePattern.test(eventName)) {
      this.report(
        `事件名 "${eventName}" 不符合命名规范: ${this.eventNamePattern}`,
      );
      valid = false;
    }

    // 校验属性白名单
    if (this.allowedProperties) {
      for (const key of Object.keys(properties)) {
        // global_ 前缀的公共属性跳过白名单检查
        if (key.startsWith('global_')) continue;
        if (!this.allowedProperties.has(key)) {
          this.report(`属性 "${key}" 不在白名单中（事件: ${eventName}）`);
          valid = false;
        }
      }
    }

    return valid;
  }

  /** 校验失败时是否应阻止上报 */
  shouldBlock(): boolean {
    return this.onViolation === 'block';
  }

  private report(message: string): void {
    const prefix = '[aix-tracker 校验]';
    if (this.onViolation === 'block') {
      console.error(`${prefix} ${message}（已阻止上报）`);
    } else {
      console.warn(`${prefix} ${message}`);
    }
  }
}
