/**
 * @fileoverview ID 生成工具
 * 优化：增强唯一性，支持高频调用场景
 */

/** 全局计数器 */
let counter = 0;

/** 上次生成时间戳 */
let lastTimestamp = 0;

/** 随机数缓存（批量生成以提高性能） */
let randomCache: string[] = [];
let randomCacheIndex = 0;

/**
 * 生成随机字符串
 */
function generateRandomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * 填充随机数缓存
 */
function fillRandomCache(): void {
  randomCache = [];
  for (let i = 0; i < 100; i++) {
    randomCache.push(generateRandomString(4));
  }
  randomCacheIndex = 0;
}

/**
 * 获取下一个随机字符串
 */
function getNextRandom(): string {
  if (randomCacheIndex >= randomCache.length) {
    fillRandomCache();
  }
  return randomCache[randomCacheIndex++] ?? generateRandomString(4);
}

// 初始化随机缓存
fillRandomCache();

/**
 * 生成唯一 ID
 *
 * 格式: {prefix}-{timestamp36}-{counter36}-{random4}
 *
 * 优化点:
 * 1. 使用计数器确保同一毫秒内的唯一性
 * 2. 添加随机后缀，防止多实例冲突
 * 3. 时间戳相同时增加计数器
 *
 * @param prefix 前缀，默认 'block'
 * @returns 唯一 ID
 */
export function generateId(prefix = 'block'): string {
  const now = Date.now();

  // 如果时间戳变化，重置计数器
  if (now !== lastTimestamp) {
    counter = 0;
    lastTimestamp = now;
  }

  counter++;

  // 组合: 时间戳(36进制) + 计数器(36进制) + 随机数
  const timestamp = now.toString(36);
  const count = counter.toString(36);
  const random = getNextRandom();

  return `${prefix}-${timestamp}-${count}-${random}`;
}

/**
 * 生成短 ID（适用于临时用途）
 */
export function generateShortId(): string {
  counter++;
  return `${Date.now().toString(36)}${counter.toString(36)}`;
}

/**
 * 生成 UUID v4 格式的 ID
 */
export function generateUUID(): string {
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return template.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 重置计数器（测试用）
 */
export function resetIdCounter(): void {
  counter = 0;
  lastTimestamp = 0;
  fillRandomCache();
}

/**
 * 验证 ID 格式是否有效
 */
export function isValidId(id: string, prefix = 'block'): boolean {
  if (!id || typeof id !== 'string') return false;

  // 新格式: prefix-timestamp-counter-random
  const newFormatRegex = new RegExp(
    `^${prefix}-[a-z0-9]+-[a-z0-9]+-[a-z0-9]{4}$`,
  );
  // 旧格式: prefix-timestamp-counter
  const oldFormatRegex = new RegExp(`^${prefix}-[a-z0-9]+-[a-z0-9]+$`);

  return newFormatRegex.test(id) || oldFormatRegex.test(id);
}
