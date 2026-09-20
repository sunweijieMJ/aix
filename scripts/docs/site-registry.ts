import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import ts from 'typescript';

/** 文档站里一个组件页要登记的三处 */
const DOC_PAGES_DIR = 'docs/components';
const SIDEBAR_CONFIG = 'docs/.vitepress/config.ts';
const OVERVIEW_PAGE = 'docs/components/index.md';

const COMPONENT_LINK_RE = /^\/components\/([^/#?]+)$/;

/**
 * 校验组件文档页、VitePress sidebar、组件总览三处登记两两一致，返回失败信息。
 * sidebar 取 config.ts 里所有 `/components/<slug>` 形式的字符串字面量，总览取 Markdown 链接。
 */
export async function checkSiteRegistry(root: string): Promise<string[]> {
  const pages = new Set(
    (await glob('*.md', { cwd: path.join(root, DOC_PAGES_DIR) }))
      .map((file) => path.basename(file, '.md'))
      .filter((slug) => slug !== 'index'),
  );
  const sidebar = await sidebarSlugs(path.join(root, SIDEBAR_CONFIG));
  const overview = await overviewSlugs(path.join(root, OVERVIEW_PAGE));

  const failures: string[] = [];
  for (const slug of [...pages].sort()) {
    if (!sidebar.has(slug)) {
      failures.push(`站点登记：${DOC_PAGES_DIR}/${slug}.md 未挂进 ${SIDEBAR_CONFIG} 的 sidebar`);
    }
    if (!overview.has(slug)) {
      failures.push(`站点登记：${DOC_PAGES_DIR}/${slug}.md 未列进 ${OVERVIEW_PAGE}`);
    }
  }
  for (const slug of [...sidebar].sort()) {
    if (!pages.has(slug)) {
      failures.push(
        `站点登记：${SIDEBAR_CONFIG} 的 sidebar 链接 /components/${slug} 没有对应文档页`,
      );
    }
  }
  for (const slug of [...overview].sort()) {
    if (!pages.has(slug)) {
      failures.push(`站点登记：${OVERVIEW_PAGE} 的链接 /components/${slug} 没有对应文档页`);
    }
  }
  return failures;
}

async function sidebarSlugs(configPath: string): Promise<Set<string>> {
  const source = await fs.readFile(configPath, 'utf-8');
  const sourceFile = ts.createSourceFile(configPath, source, ts.ScriptTarget.Latest, true);
  const slugs = new Set<string>();

  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node)) {
      const slug = COMPONENT_LINK_RE.exec(node.text)?.[1];
      if (slug) slugs.add(slug);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return slugs;
}

async function overviewSlugs(pagePath: string): Promise<Set<string>> {
  const source = await fs.readFile(pagePath, 'utf-8');
  return new Set(
    [...source.matchAll(/\]\((\/components\/[^)]+)\)/g)]
      .map((match) => COMPONENT_LINK_RE.exec(match[1]!)?.[1])
      .filter((slug): slug is string => Boolean(slug)),
  );
}
