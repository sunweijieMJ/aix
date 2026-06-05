/**
 * @kit/eslint-config 共享类型声明
 *
 * 经 package.json exports 各子路径的 "types" 条件接入，
 * base / vue-app / react-app 三个入口导出形状一致，共用本声明。
 * 若未来某入口导出分化，请为其单独建同名 .d.ts 并更新对应 exports 条目。
 */
import type { Linter } from 'eslint';

export declare const config: Linter.Config[];
