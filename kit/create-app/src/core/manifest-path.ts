import path from 'node:path';
import { z } from 'zod';

/**
 * 清单里的路径（features.dirs/files、exclude、substitutions[].files）的规范形态
 *
 * 三条禁令对应三种「写了等于没写」的笔误：
 * - 以 `/` 开头：绝对路径永远匹配不上模板根相对的 relPath
 * - `.` / `..` 段（含 `./src/x`、`src/./x`、`src/../x`）：composer 是纯字符串前缀比对，
 *   `./src/x` 对 `src/x/...` 恒不命中；而 manifest-lint 历史上走 path.join（会把 `./` 归一掉）
 *   判存在——两边口径一劈叉，体检放行、裁剪静默失效，作者拿不到任何信号
 * - `\` 分隔：产物路径一律 POSIX，反斜杠形态在任何平台都不命中
 *
 * 尾部 `/`（`src/locale/`）是允许的，语义无歧义，由 normalizeManifestPath 归一。
 */
const MANIFEST_PATH_PATTERN = /^(?!(?:.*\/)?\.\.?(?:\/|$))[^/\\][^\\]*$/;

/** 供 schema 复用的单条路径校验：报错文案要直接给出正确写法，否则作者只知道错不知道怎么改 */
export const ManifestPathSchema = z
  .string()
  .regex(
    MANIFEST_PATH_PATTERN,
    '路径必须写成模板根相对的 POSIX 路径（如 src/locale）：' +
      '不能以 / 开头、不能含 ./ 或 ../ 段、不能用 \\ 分隔',
  );

/**
 * 把清单声明的路径归一到与产物 relPath 同一形态（POSIX 分隔、无 `.`/`..` 段、无尾斜杠）
 *
 * schema 已经把这些形态挡在门外了，这里是纵深防御：Composer / lintManifest 都是本包的
 * 公共导出，绕过 readConfig 直接调用时清单没经过 Zod。归一化必须两边共用同一份实现——
 * 「只归一其中一处」正是这个缺陷的成因。
 */
export function normalizeManifestPath(rel: string): string {
  // path.posix.normalize 不认反斜杠（会当成普通字符留在段名里），先折成 `/`
  return path.posix.normalize(rel.replace(/\\/g, '/')).replace(/\/+$/, '');
}
