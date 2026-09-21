import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import ts from 'typescript';

/** 参与 API 生成的一个组件 */
export interface DiscoveredComponent {
  /** 对外导出名，也是 API 表里的组件名 */
  name: string;
  /** 相对包根的源文件路径 */
  file: string;
}

/**
 * 从包入口 `src/index.ts` 找出对外导出的 .vue 组件。
 *
 * 识别两种写法：
 * - `import X from './X.vue'` 配合 `export { X }`（或 `export { X as Y }`）
 * - `export { default as X } from './X.vue'`
 *
 * 入口没有导出任何 .vue 时退回包根 `src/*.vue`，组件名取文件名。
 */
export async function discoverComponents(packageDir: string): Promise<DiscoveredComponent[]> {
  const fromEntry = await discoverFromEntry(packageDir);
  if (fromEntry.length > 0) return fromEntry;

  const files = (await glob('src/*.vue', { cwd: packageDir })).sort();
  return files.map((file) => ({ name: componentNameFromFile(packageDir, file), file }));
}

async function discoverFromEntry(packageDir: string): Promise<DiscoveredComponent[]> {
  const entryPath = path.join(packageDir, 'src/index.ts');
  let source: string;
  try {
    source = await fs.readFile(entryPath, 'utf-8');
  } catch {
    return [];
  }

  const sourceFile = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
  const vueImports = new Map<string, string>();
  const components: DiscoveredComponent[] = [];

  const toFile = (specifier: string) => path.normalize(path.join('src', specifier));

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      const local = statement.importClause?.name;
      if (local && specifier.endsWith('.vue')) vueImports.set(local.text, toFile(specifier));
      continue;
    }

    if (!ts.isExportDeclaration(statement)) continue;

    const specifier =
      statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : null;

    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
      if (specifier?.endsWith('.vue')) {
        throw new Error(
          `src/index.ts 用 export * 导出了 .vue（${specifier}），组件名无法确定，请改为具名导出`,
        );
      }
      continue;
    }

    for (const element of statement.exportClause.elements) {
      const exported = element.name.text;
      const local = element.propertyName?.text ?? exported;

      if (specifier) {
        if (specifier.endsWith('.vue') && local === 'default') {
          if (exported === 'default') {
            throw new Error(
              `src/index.ts 把 ${specifier} 作为默认导出，组件名无法确定，请改为具名导出`,
            );
          }
          components.push({ name: exported, file: toFile(specifier) });
        }
        continue;
      }

      const file = vueImports.get(local);
      if (file) components.push({ name: exported, file });
    }
  }

  // 同一源文件多次导出（含 `export { X as Y }` 别名）只保留第一次出现的名字
  const seen = new Set<string>();
  const unique = components.filter((c) => !seen.has(c.file) && seen.add(c.file));

  for (const component of unique) {
    try {
      await fs.access(path.join(packageDir, component.file));
    } catch {
      throw new Error(`src/index.ts 导出的组件文件不存在：${component.file}`);
    }
  }

  return unique;
}

export async function readPackageName(packageDir: string): Promise<string> {
  const pkg = JSON.parse(await fs.readFile(path.join(packageDir, 'package.json'), 'utf-8'));
  return pkg.name as string;
}

/**
 * 没有入口导出信息时的组件名：取文件名；`index.vue` 改用包目录名的 PascalCase
 */
export function componentNameFromFile(packageDir: string, file: string): string {
  const base = path.basename(file, path.extname(file));
  if (base.toLowerCase() !== 'index') return base;
  return toPascalCase(path.basename(packageDir));
}

export function toPascalCase(kebab: string): string {
  return kebab
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
