import fs from 'node:fs';
import path from 'node:path';

/**
 * 样式入口在 src 下的候选路径，按优先级排列。
 *
 * 多数组件把样式写在 SFC 的 `<style>` 里，没有独立入口；有独立入口的分两种形态：
 * 组件包用 `src/styles/index.scss`，@aix/theme 用 `src/vars/index.css`。
 */
const STYLE_ENTRY_CANDIDATES = ['styles/index.scss', 'vars/index.css'];

/**
 * 扫描 `packages/*` 生成 `@aix/<name>` → 包内 `src/` 的 Vite alias 表。
 *
 * Storybook 与 VitePress 都需要让组件解析到源码而非构建产物（否则改了 src 不热更、
 * 产物过期时看到旧代码）。此前两处各自手写一份白名单，已经漂移：Storybook 有 popper
 * 无 subtitle，VitePress 反之，且两边都缺 ai-chat / audio / code-editor / flow-graph /
 * rich-text-editor。改为从目录扫描生成，新增包无需再改这两个文件。
 *
 * 两条约束：
 *
 * 1. **必须指向 `src/` 目录而非 `src/index.ts`**。Vite 的对象式 alias 按前缀匹配，
 *    指向目录才能让 `@aix/theme/vars/index.css` 这类子路径正确改写为
 *    `packages/theme/src/vars/index.css`；指向文件会拼成 `src/index.tsvars/...`。
 *
 * 2. **`/style` 条目必须排在裸包名之前**。同样因为前缀匹配按插入顺序生效，
 *    `@aix/popper` 排在前面会让 `@aix/popper/style` 先命中它，改写成不存在的
 *    `packages/popper/src/style`。pdf-viewer 与 rich-text-editor 的源码确实
 *    `import '@aix/popper/style'`，漏了这条 Storybook 直接起不来。
 *
 * @param repoRoot - 仓库根目录的绝对路径
 * @returns Vite alias 对象，键的插入顺序即匹配优先级
 */
export function createWorkspaceAlias(repoRoot: string): Record<string, string> {
  const packagesDir = path.join(repoRoot, 'packages');
  const names = fs
    .readdirSync(packagesDir)
    .filter((name) => fs.existsSync(path.join(packagesDir, name, 'package.json')))
    .sort();

  const styleAliases: Record<string, string> = {};
  const packageAliases: Record<string, string> = {};

  for (const name of names) {
    const src = path.join(packagesDir, name, 'src');
    // @aix/icons 的 src 是构建期生成且被 gitignore 的，未构建时不存在；
    // 此时不产出 alias，让它回退到常规的 node_modules 解析
    if (!fs.existsSync(src)) continue;

    const styleEntry = STYLE_ENTRY_CANDIDATES.map((p) => path.join(src, p)).find((p) =>
      fs.existsSync(p),
    );
    if (styleEntry) styleAliases[`@aix/${name}/style`] = styleEntry;

    packageAliases[`@aix/${name}`] = src;
  }

  // 展开顺序即匹配顺序：/style 在前，裸包名在后
  return { ...styleAliases, ...packageAliases };
}
