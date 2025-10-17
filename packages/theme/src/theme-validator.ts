/**
 * 主题验证器
 * 验证主题配置的有效性
 */

import type { PartialThemeTokens, ThemeConfig } from './theme-types';

/**
 * 验证结果
 */
export interface ValidationResult {
  /** 是否通过验证 */
  valid: boolean;
  /** 错误信息列表 */
  errors: ValidationError[];
  /** 警告信息列表 */
  warnings: ValidationWarning[];
}

/**
 * 验证错误
 */
export interface ValidationError {
  /** 错误字段 */
  field: string;
  /** 错误消息 */
  message: string;
  /** 当前值 */
  value: any;
}

/**
 * 验证警告
 */
export interface ValidationWarning {
  /** 警告字段 */
  field: string;
  /** 警告消息 */
  message: string;
  /** 当前值 */
  value: any;
}

/**
 * RGB 颜色格式正则
 * 支持：rgb(0 0 0) 和 rgb(0 0 0 / 0.5)
 */
const RGB_REGEX = /^rgb\(\s*\d+\s+\d+\s+\d+(\s*\/\s*(0?\.\d+|1|0))?\s*\)$/;

/**
 * 数值单位正则
 * 支持：12px, 1.5, 16px 等
 */
const SIZE_REGEX = /^(\d+(\.\d+)?)(px|rem|em|%)?$/;

/**
 * 颜色相关的 Token 字段
 */
const COLOR_TOKEN_PATTERNS = [
  /^color/i,
  /^token(Cyan|Blue|Green|Red|Orange|Gold)/i,
];

/**
 * 尺寸相关的 Token 字段
 */
const SIZE_TOKEN_PATTERNS = [
  /^(size|padding|margin|fontSize|borderRadius|controlHeight|tokenSpacing|tokenFontSize|tokenBorderRadius|tokenControlHeight)/i,
];

/**
 * 数值类型的 Token 字段（无单位）
 */
const NUMBER_TOKEN_PATTERNS = [/^(lineHeight|tokenLineHeight)/i];

/**
 * 验证颜色格式
 */
function validateColor(value: any, field: string): ValidationError | null {
  if (typeof value !== 'string') {
    return {
      field,
      message: `颜色值必须是字符串类型`,
      value,
    };
  }

  if (!RGB_REGEX.test(value)) {
    return {
      field,
      message: `颜色格式不正确，应为 rgb(r g b) 或 rgb(r g b / alpha) 格式`,
      value,
    };
  }

  // 验证 RGB 值范围 (0-255)
  const match = value.match(/rgb\((\d+)\s+(\d+)\s+(\d+)/);
  if (match) {
    const [, r, g, b] = match;
    const rNum = parseInt(r!, 10);
    const gNum = parseInt(g!, 10);
    const bNum = parseInt(b!, 10);

    if (rNum > 255 || gNum > 255 || bNum > 255) {
      return {
        field,
        message: `RGB 值必须在 0-255 范围内`,
        value,
      };
    }
  }

  // 验证 alpha 值范围 (0-1)
  const alphaMatch = value.match(/\/\s*([\d.]+)/);
  if (alphaMatch) {
    const alpha = parseFloat(alphaMatch[1]!);
    if (alpha < 0 || alpha > 1) {
      return {
        field,
        message: `alpha 值必须在 0-1 范围内`,
        value,
      };
    }
  }

  return null;
}

/**
 * 验证尺寸格式
 */
function validateSize(value: any, field: string): ValidationError | null {
  if (typeof value !== 'string') {
    return {
      field,
      message: `尺寸值必须是字符串类型`,
      value,
    };
  }

  if (!SIZE_REGEX.test(value)) {
    return {
      field,
      message: `尺寸格式不正确，应为数值+单位（如 12px, 1.5rem）`,
      value,
    };
  }

  // 提取数值部分检查是否为负数
  const numMatch = value.match(/^([\d.]+)/);
  if (numMatch) {
    const num = parseFloat(numMatch[1]!);
    if (num < 0) {
      return {
        field,
        message: `尺寸值不能为负数`,
        value,
      };
    }
  }

  return null;
}

/**
 * 验证数值类型
 */
function validateNumber(value: any, field: string): ValidationError | null {
  if (typeof value !== 'number') {
    return {
      field,
      message: `${field} 必须是数值类型`,
      value,
    };
  }

  if (isNaN(value) || !isFinite(value)) {
    return {
      field,
      message: `${field} 必须是有效的数值`,
      value,
    };
  }

  // 行高通常在 1.0 - 3.0 之间
  if (field.includes('lineHeight') || field.includes('LineHeight')) {
    if (value < 0.5 || value > 5) {
      return {
        field,
        message: `行高值应在 0.5-5 范围内`,
        value,
      };
    }
  }

  return null;
}

/**
 * 判断字段是否为颜色类型
 */
function isColorField(field: string): boolean {
  return COLOR_TOKEN_PATTERNS.some((pattern) => pattern.test(field));
}

/**
 * 判断字段是否为尺寸类型
 */
function isSizeField(field: string): boolean {
  return SIZE_TOKEN_PATTERNS.some((pattern) => pattern.test(field));
}

/**
 * 判断字段是否为数值类型
 */
function isNumberField(field: string): boolean {
  return NUMBER_TOKEN_PATTERNS.some((pattern) => pattern.test(field));
}

/**
 * 验证单个 Token
 */
function validateToken(field: string, value: any): ValidationError | null {
  if (value === undefined || value === null) {
    return null; // 允许未定义
  }

  // 颜色字段验证
  if (isColorField(field)) {
    return validateColor(value, field);
  }

  // 尺寸字段验证
  if (isSizeField(field)) {
    return validateSize(value, field);
  }

  // 数值字段验证
  if (isNumberField(field)) {
    return validateNumber(value, field);
  }

  return null;
}

/**
 * 验证 Token 配置
 */
export function validateTokens(tokens: PartialThemeTokens): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  for (const [field, value] of Object.entries(tokens)) {
    const error = validateToken(field, value);
    if (error) {
      errors.push(error);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 验证过渡配置
 */
function validateTransition(config: ThemeConfig): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!config.transition) {
    return errors;
  }

  const { duration, easing, enabled } = config.transition;

  if (duration !== undefined) {
    if (typeof duration !== 'number' || duration < 0) {
      errors.push({
        field: 'transition.duration',
        message: '过渡时长必须是非负数',
        value: duration,
      });
    }

    if (duration > 5000) {
      errors.push({
        field: 'transition.duration',
        message: '过渡时长不应超过 5000ms',
        value: duration,
      });
    }
  }

  if (easing !== undefined && typeof easing !== 'string') {
    errors.push({
      field: 'transition.easing',
      message: '缓动函数必须是字符串类型',
      value: easing,
    });
  }

  if (enabled !== undefined && typeof enabled !== 'boolean') {
    errors.push({
      field: 'transition.enabled',
      message: 'enabled 必须是布尔类型',
      value: enabled,
    });
  }

  return errors;
}

/**
 * 验证算法配置
 */
function validateAlgorithm(config: ThemeConfig): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!config.algorithm) {
    return errors;
  }

  const validAlgorithms = ['default', 'dark', 'compact'];
  if (!validAlgorithms.includes(config.algorithm)) {
    errors.push({
      field: 'algorithm',
      message: `算法必须是 ${validAlgorithms.join(', ')} 之一`,
      value: config.algorithm,
    });
  }

  return errors;
}

/**
 * 验证主题配置
 *
 * @param config 主题配置
 * @returns 验证结果
 *
 * @example
 * ```typescript
 * const result = validateThemeConfig({
 *   token: { colorPrimary: 'rgb(255 0 0)' },
 *   algorithm: 'dark'
 * });
 *
 * if (!result.valid) {
 *   console.error('验证失败:', result.errors);
 * }
 * ```
 */
export function validateThemeConfig(config: ThemeConfig): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // 验证 Token
  if (config.token) {
    const tokenResult = validateTokens(config.token);
    errors.push(...tokenResult.errors);
    warnings.push(...tokenResult.warnings);
  }

  // 验证过渡配置
  errors.push(...validateTransition(config));

  // 验证算法
  errors.push(...validateAlgorithm(config));

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 验证并抛出错误
 * 如果验证失败，会抛出包含所有错误信息的异常
 */
export function validateThemeConfigOrThrow(config: ThemeConfig): void {
  const result = validateThemeConfig(config);

  if (!result.valid) {
    const errorMessages = result.errors
      .map((err) => `${err.field}: ${err.message}`)
      .join('\n');

    throw new Error(`主题配置验证失败:\n${errorMessages}`);
  }
}

/**
 * 创建安全的主题配置
 * 自动过滤掉无效的 Token
 */
export function sanitizeThemeConfig(config: ThemeConfig): ThemeConfig {
  if (!config.token) {
    return config;
  }

  const sanitizedTokens: PartialThemeTokens = {};

  for (const [field, value] of Object.entries(config.token)) {
    const error = validateToken(field, value);
    if (!error) {
      (sanitizedTokens as Record<string, any>)[field] = value;
    }
  }

  return {
    ...config,
    token: sanitizedTokens,
  };
}
