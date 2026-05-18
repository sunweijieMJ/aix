import picomatch from 'picomatch';

// =============================================================================
// 路径匹配器：把声明式 match（glob/RegExp/函数/glob 数组）编译成统一 `(path) => boolean`。
//
// 供两处共享：
//  - bucket-resolver：按文件路径归桶
//  - rules prefix strategy：按文件路径分派到子策略
// =============================================================================

/**
 * 可接受的路径匹配输入形态。
 *
 * - string：picomatch glob
 * - string[]：多 glob，任一命中即真
 * - RegExp：直接 test
 * - 函数：完全自定义，参数即调用方传入的 filePath
 */
export type PathMatchInput = string | string[] | RegExp | ((filePath: string) => boolean);

/**
 * 编译为统一签名的 matcher。
 *
 * 注意：调用方在传入前应已规范化路径（POSIX 风格、相对 root），matcher 不再做归一化。
 *
 * picomatch 启用 `dot:true`：与 file-utils 中扫描行为对齐，
 * 否则 `.storybook/...` 这类目录在扫描阶段被识别但在归桶/前缀阶段失配。
 */
export function compileMatcher(match: PathMatchInput): (filePath: string) => boolean {
  if (typeof match === 'function') {
    return match;
  }
  if (match instanceof RegExp) {
    return (fp) => match.test(fp);
  }
  if (typeof match === 'string' || Array.isArray(match)) {
    const isMatch = picomatch(match, { dot: true });
    return (fp) => isMatch(fp);
  }
  throw new Error(
    `compileMatcher: 不支持的 match 类型 ${typeof match}（期望 string | string[] | RegExp | function）`,
  );
}

/**
 * 路径规范化：windows 反斜杠 → POSIX 正斜杠。
 *
 * 匹配前统一调用一次，避免 picomatch 在 Windows 输入下行为偏差。
 */
export function normalizePosix(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}
