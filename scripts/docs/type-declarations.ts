import fs from 'fs/promises';
import path from 'path';
import ts from 'typescript';
import type { ApiTypeDeclaration } from './api-model';
import { declarationText } from './jsdoc';

/** 承载包公开类型的文件，相对包根 */
const TYPES_FILE = 'src/types.ts';

/** 包入口，相对包根 */
const ENTRY_FILE = 'src/index.ts';

/**
 * 包的公开类型声明：`src/types.ts` 里导出、且经 `src/index.ts` 再导出的 type / interface / enum，按源码顺序。
 * `excluded` 是已作为组件 Props / Emits / Slots / Expose 渲染成表的类型名，不再重复列出。
 */
export async function collectTypeDeclarations(
  packageDir: string,
  excluded: ReadonlySet<string>,
): Promise<ApiTypeDeclaration[]> {
  let source: string;
  try {
    source = await fs.readFile(path.join(packageDir, TYPES_FILE), 'utf-8');
  } catch {
    return [];
  }

  const sourceFile = ts.createSourceFile(TYPES_FILE, source, ts.ScriptTarget.Latest, true);
  const reexported = await entryReexports(packageDir);
  const declarations: ApiTypeDeclaration[] = [];

  for (const statement of sourceFile.statements) {
    if (!isTypeStatement(statement) || !isExported(statement)) continue;
    const name = statement.name.text;
    if (excluded.has(name)) continue;
    if (reexported !== 'all' && !reexported.has(name)) continue;
    declarations.push({
      name,
      kind: declarationKind(statement),
      text: declarationText(statement).trim(),
    });
  }

  return declarations;
}

/**
 * 入口对 `./types` 的再导出：`export * from './types'` 记为 `'all'`，
 * 具名再导出取声明名（`export { A as B }` 记 A）。入口不存在时视为全部导出。
 */
async function entryReexports(packageDir: string): Promise<'all' | Set<string>> {
  let source: string;
  try {
    source = await fs.readFile(path.join(packageDir, ENTRY_FILE), 'utf-8');
  } catch {
    return 'all';
  }

  const sourceFile = ts.createSourceFile(ENTRY_FILE, source, ts.ScriptTarget.Latest, true);
  const names = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!/^\.\/types(?:\.ts|\/index(?:\.ts)?)?$/.test(statement.moduleSpecifier.text)) continue;

    if (!statement.exportClause) return 'all';
    if (!ts.isNamedExports(statement.exportClause)) continue;
    for (const element of statement.exportClause.elements) {
      names.add((element.propertyName ?? element.name).text);
    }
  }
  return names;
}

type TypeStatement = ts.TypeAliasDeclaration | ts.InterfaceDeclaration | ts.EnumDeclaration;

function isTypeStatement(statement: ts.Statement): statement is TypeStatement {
  return (
    ts.isTypeAliasDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isEnumDeclaration(statement)
  );
}

function declarationKind(statement: TypeStatement): ApiTypeDeclaration['kind'] {
  if (ts.isTypeAliasDeclaration(statement)) return 'type';
  if (ts.isInterfaceDeclaration(statement)) return 'interface';
  return 'enum';
}

function isExported(statement: TypeStatement): boolean {
  return ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}
