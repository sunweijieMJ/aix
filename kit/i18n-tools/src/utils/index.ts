// =============================================================================
// utils 的入口 barrel —— 只服务 src/cli.ts 的入口 import。
//
// 这里刻意只列 CLI 顶层实际消费的符号：barrel 每多一个名字，就多一条「模块外看似
// 有人用」的假通道，让死代码检测与重构半径失真。内部模块（core / strategies /
// utils 相互之间）一律直接 import 具体文件，不经过本 barrel；对外的程序化 API
// 由 src/index.ts 单独把关，同样不走这里。
//
// 新增导出前先确认：真的是 cli.ts 要用的吗？不是就别加。
// =============================================================================

export { isModeExplicitlySet } from './command-utils';
export { MODE_DESCRIPTIONS, MODE_ICONS, MODE_LIST } from './constants';
export { loadEnv } from './env';
export { FileUtils } from './file-utils';
export { InteractiveUtils } from './interactive-utils';
export { LoggerUtils } from './logger';
export { getToolVersion } from './tool-version';
export { ModeName } from './types';
