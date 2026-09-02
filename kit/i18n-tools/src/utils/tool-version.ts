import { createRequire } from 'module';

/** 本包名，用于校验读到的 package.json 确实是工具自身而非消费项目的。 */
const PACKAGE_NAME = '@kit/i18n-tools';

/**
 * 读取 @kit/i18n-tools 包自身的 version 字段。
 *
 * 全库唯一的版本来源：CLI 的 `--version` 与 plan 元数据的 toolVersion 都走这里，
 * 两处各自读 package.json 会在路径/校验口径上悄悄分叉。
 *
 * 必须真用 createRequire：本包 `"type": "module"`，裸 require 在源码直跑（tsx / vitest）
 * 下是 ReferenceError；而 `import pkg from '../package.json'` 在 strict ESM 下需要 import
 * assertion，跨 node 版本支持参差。
 *
 * 多候选相对路径：源码运行时本文件在 src/utils/（`../../` 到包根），构建产物在 dist/
 * （`../` 到包根）。按包名校验命中，避免误读消费项目的 package.json——包若改名需同步
 * PACKAGE_NAME，否则本方法静默退化为恒 undefined（有回归测试钉住）。
 *
 * 读失败返回 undefined 而非抛错：版本是辅助信息，不应阻断主流程（CLI 显示 'unknown'，
 * plan 元数据留空）。
 */
export function getToolVersion(): string | undefined {
  const requireFromHere = createRequire(import.meta.url);
  for (const rel of ['../../package.json', '../package.json']) {
    try {
      const pkg = requireFromHere(rel) as { name?: string; version?: string };
      if (pkg.name === PACKAGE_NAME && pkg.version) return pkg.version;
    } catch {
      // 尝试下一个候选路径
    }
  }
  return undefined;
}
