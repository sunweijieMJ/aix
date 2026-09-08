/**
 * 彩色输出。
 *
 * 手写 ANSI 而不是引 chalk：只有 6 个颜色，不值得再多一个依赖，
 * 而这个包会被业务仓库直接安装，依赖越少越好。
 */

const ANSI = { bold: 1, red: 31, green: 32, yellow: 33, cyan: 36, gray: 90 } as const;

const colorEnabled = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

const paint =
  (name: keyof typeof ANSI) =>
  (text: string): string =>
    colorEnabled ? `\x1b[${ANSI[name]}m${text}\x1b[0m` : `${text}`;

export const c = {
  bold: paint('bold'),
  err: paint('red'),
  ok: paint('green'),
  warn: paint('yellow'),
  info: paint('cyan'),
  dim: paint('gray'),
};

export const logStep = (message: string): void => console.log(c.info(`\n▶ ${message}`));
export const logOk = (message: string): void => console.log(c.ok(`✅ ${message}`));
export const logWarn = (message: string): void => console.log(c.warn(`⚠️  ${message}`));
export const logInfo = (message: string): void => console.log(c.dim(`   ${message}`));
