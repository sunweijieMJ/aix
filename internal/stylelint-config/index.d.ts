/**
 * @kit/stylelint-config 共享类型声明
 *
 * 经 package.json exports 各子路径的 "types" 条件接入，
 * base / vue-app 两个入口导出形状一致（default 导出 Config），共用本声明。
 * 若未来某入口导出分化，请为其单独建同名 .d.ts 并更新对应 exports 条目。
 */
import type { Config } from 'stylelint';

declare const config: Config;

export default config;
