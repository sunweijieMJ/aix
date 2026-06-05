/**
 * @kit/prettier-config 类型声明
 *
 * 经 package.json exports "." 的 "types" 条件接入。
 */
import type { Config } from 'prettier';

declare const config: Config;

export default config;
