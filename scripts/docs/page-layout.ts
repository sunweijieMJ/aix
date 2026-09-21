/**
 * 文档页骨架校验：把 docs/guide/component-docs-standard.md 里可机检的条款固化下来。
 *
 * 只管人工撰写区的形态（段落齐全、顺序、条件必备段、安装说明与包的真实依赖是否对得上），
 * `## API` / `## 类型定义` 两段的内容由生成器负责，不在这里重复校验。
 */
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import type { ApiPackage } from './api-model';
import { renderTypesBody } from './api-markdown';
import { DEFAULT_EXEMPTIONS, type Exemptions } from './exemptions';

/** 骨架顺序，缺席的段落跳过，出现的必须保持相对次序 */
const SECTION_ORDER = [
  '何时使用',
  '安装',
  '代码演示',
  '主题变量定制',
  '多语言',
  'API',
  '类型定义',
] as const;

/**
 * CSS 变量名。名字末尾只能是字母或数字，尾部的 `-*` 单独捕获：
 * 注释里 `--aix-sender-*` 这类通配写法指代一族变量，不是某个真变量，要整条丢掉
 */
const CSS_VAR_RE = /--aix-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*(-\*)?/g;

/** 取出文本里出现的 CSS 变量名，跳过通配写法 */
function collectCssVars(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(CSS_VAR_RE)) {
    if (match[1]) continue;
    names.push(match[0]);
  }
  return names;
}

/** 代码演示至少要有这么多个 `###` 小节 */
const MIN_DEMO_SECTIONS = 3;

/** 文案少于等于这个条数的包，多语言并进安装段一句话即可，不单开段 */
const LOCALE_INLINE_MAX = 2;

/** 一个文档页的校验输入，全部由 collectPageLayoutInputs 从磁盘读出 */
export interface PageLayoutInput {
  /** packages/ 下的目录名，同时也是文档页文件名 */
  dirName: string;
  /** docs/components/<dirName>.md 的全文 */
  content: string;
  /** 包是否有 ./style 子路径导出 */
  hasStyleExport: boolean;
  /** 包自身或其 @aix/* 依赖是否消费 @aix/theme 的 token */
  needsThemeStyle: boolean;
  /** 组件对外暴露的、可被业务覆盖的 CSS 变量 */
  customizableVars: string[];
  /** src/locale/zh-CN.ts 里的文案条数，没有语言包时为 0 */
  localeEntryCount: number;
  /** src/types.ts 是否有可渲染进「类型定义」段的导出 */
  hasRenderableTypes: boolean;
}

/**
 * 校验单个文档页，返回问题列表（空数组表示通过）
 */
export function checkPageLayout(input: PageLayoutInput): string[] {
  const { dirName, content } = input;
  const issues: string[] = [];
  const at = (message: string) => `${dirName}.md：${message}`;
  const lines = content.split('\n');

  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(content)?.[1] ?? '';
  const title = /^title:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim();
  if (!title) issues.push(at('frontmatter 缺 title'));
  if (!/^outline:\s*deep\s*$/m.test(frontmatter)) issues.push(at('frontmatter 缺 outline: deep'));

  const h1Index = lines.findIndex((line) => /^# /.test(line));
  const h1 = h1Index >= 0 ? lines[h1Index]!.slice(2).trim() : null;
  if (!h1) {
    issues.push(at('缺 H1 标题'));
  } else {
    if (title && h1 !== title)
      issues.push(at(`H1「${h1}」与 frontmatter 的 title「${title}」不一致`));
    const lead = lines.slice(h1Index + 1).find((line) => line.trim() !== '');
    if (!lead || lead.startsWith('#')) issues.push(at('H1 下缺一句定位说明'));
  }

  const headings = topLevelHeadings(content);
  const has = (name: string) => headings.includes(name);

  if (has('特性')) {
    issues.push(at('用了 ## 特性：文档页写「何时使用」，特性清单归包 README'));
  }
  for (const required of ['何时使用', '安装', '代码演示', 'API'] as const) {
    if (!has(required)) issues.push(at(`缺 ## ${required}`));
  }

  issues.push(...checkDemos(content, at));
  issues.push(...checkInstall(content, input, at));

  if (input.customizableVars.length > 0 && !has('主题变量定制')) {
    const preview = input.customizableVars.slice(0, 4).join('、');
    issues.push(
      at(
        `缺 ## 主题变量定制：组件暴露了 ${input.customizableVars.length} 个可覆盖的 CSS 变量（${preview}…）`,
      ),
    );
  }
  if (input.customizableVars.length === 0 && has('主题变量定制')) {
    issues.push(at('有 ## 主题变量定制，但组件没有对外的 CSS 变量'));
  }
  if (has('主题变量定制')) {
    const documented = new Set(collectCssVars(sectionBody(content, '主题变量定制')));
    const missing = input.customizableVars.filter((name) => !documented.has(name));
    if (missing.length > 0) {
      issues.push(
        at(
          `主题变量表漏了 ${missing.length}/${input.customizableVars.length} 个：${missing.slice(0, 6).join('、')}`,
        ),
      );
    }
  }

  if (input.localeEntryCount > LOCALE_INLINE_MAX && !has('多语言')) {
    issues.push(at(`缺 ## 多语言：包有 ${input.localeEntryCount} 条文案`));
  }
  if (input.localeEntryCount === 0 && has('多语言')) {
    issues.push(at('有 ## 多语言，但包没有 src/locale/'));
  }

  if (input.hasRenderableTypes && !has('类型定义')) {
    issues.push(at('缺 ## 类型定义：src/types.ts 有可渲染的导出类型'));
  }

  issues.push(...checkOrder(headings, at));
  return issues;
}

/** 代码演示：小节数量与活演示 */
function checkDemos(content: string, at: (message: string) => string): string[] {
  const body = sectionBody(content, '代码演示');
  if (!body) return [];

  const subsections = body.split(/^### /m).slice(1);
  if (subsections.length < MIN_DEMO_SECTIONS) {
    return [at(`代码演示只有 ${subsections.length} 个小节，规范要求至少 ${MIN_DEMO_SECTIONS} 个`)];
  }
  if (!/class="[^"]*\bdemo-block\b/.test(body)) {
    return [at('代码演示里一个活演示都没有，至少要有一个 demo-block')];
  }
  return [];
}

/** 安装段的样式引入与包的真实依赖是否一致 */
function checkInstall(
  content: string,
  input: PageLayoutInput,
  at: (message: string) => string,
): string[] {
  const body = sectionBody(content, '安装');
  if (!body) return [];

  const issues: string[] = [];
  const writesOwnStyle = body.includes(`@aix/${input.dirName}/style`);
  const writesThemeStyle = body.includes('@aix/theme/style');

  if (input.hasStyleExport && !writesOwnStyle) {
    issues.push(at(`安装段没写 import '@aix/${input.dirName}/style'，但包有 ./style 导出`));
  }
  if (!input.hasStyleExport && writesOwnStyle) {
    issues.push(at('安装段写了组件样式引入，但包没有 ./style 导出'));
  }
  if (input.needsThemeStyle && !writesThemeStyle) {
    issues.push(at("安装段没写 import '@aix/theme/style'，但组件（或其依赖）用了主题 token"));
  }
  if (!input.needsThemeStyle && writesThemeStyle) {
    issues.push(at('安装段写了 @aix/theme/style，但组件与其依赖都不消费主题 token'));
  }
  return issues;
}

/** 骨架顺序，以及补充段必须排在 API / 类型定义之后 */
function checkOrder(headings: string[], at: (message: string) => string): string[] {
  const issues: string[] = [];
  const present = SECTION_ORDER.filter((name) => headings.includes(name));
  for (let i = 1; i < present.length; i++) {
    const prev = present[i - 1]!;
    const current = present[i]!;
    if (headings.indexOf(current) < headings.indexOf(prev)) {
      issues.push(at(`段序错：## ${current} 排在了 ## ${prev} 前面`));
    }
  }

  const tailStart = Math.max(headings.indexOf('API'), headings.indexOf('类型定义'));
  const early = headings.filter(
    (name, index) =>
      index < tailStart && !(SECTION_ORDER as readonly string[]).includes(name) && name !== '特性',
  );
  if (early.length > 0) {
    issues.push(at(`补充段要排在 API / 类型定义 之后：${early.join('、')}`));
  }
  return issues;
}

/** README 骨架：开头三段必须按此顺序，后面的补充段不限 */
const README_LEAD_SECTIONS = ['特性', '安装', '快速开始'] as const;

/** 一个包 README 的校验输入 */
export interface ReadmeLayoutInput {
  /** packages/ 下的目录名 */
  dirName: string;
  /** README.md 全文 */
  content: string;
  /** 包名，用于校验 H1 */
  packageName: string;
  /** 是否要求有 API 段：不产出组件 API 的包（hooks / theme）不要求 */
  requireApi: boolean;
}

/**
 * 校验包 README 的骨架。
 *
 * 比文档页宽松：README 是线性阅读材料，补充段可以排在 API 之前（如 ai-chat 的各能力章节），
 * 只约束开头三段的顺序、API 是否存在，以及「类型定义」必须紧跟 API——这两段都是机器所有区，
 * 分开写会让读者以为中间的手写内容也归生成器管。
 */
export function checkReadmeLayout(input: ReadmeLayoutInput): string[] {
  const { dirName, content } = input;
  const issues: string[] = [];
  const at = (message: string) => `${dirName}/README.md：${message}`;
  const lines = content.split('\n');

  const h1Index = lines.findIndex((line) => /^# /.test(line));
  const h1 = h1Index >= 0 ? lines[h1Index]!.slice(2).trim() : null;
  if (h1 === null) {
    issues.push(at('缺 H1 标题'));
  } else {
    if (h1 !== input.packageName)
      issues.push(at(`H1「${h1}」与包名「${input.packageName}」不一致`));
    const lead = lines.slice(h1Index + 1).find((line) => line.trim() !== '');
    if (!lead || lead.startsWith('#')) issues.push(at('H1 下缺一句定位说明'));
  }

  const headings = topLevelHeadings(content);
  const apiIndex = headings.findIndex((name) => /^API\b/.test(name));

  for (const required of README_LEAD_SECTIONS) {
    if (!headings.includes(required)) issues.push(at(`缺 ## ${required}`));
  }
  const leadPositions = README_LEAD_SECTIONS.filter((name) => headings.includes(name)).map((name) =>
    headings.indexOf(name),
  );
  if (leadPositions.some((position, index) => index > 0 && position < leadPositions[index - 1]!)) {
    issues.push(at(`开头三段要按「${README_LEAD_SECTIONS.join(' → ')}」排列`));
  }

  if (input.requireApi && apiIndex < 0) {
    issues.push(at('缺 ## API 段，生成器无处写入 API 表'));
  }

  const typesIndex = headings.indexOf('类型定义');
  if (typesIndex >= 0 && apiIndex >= 0 && typesIndex !== apiIndex + 1) {
    issues.push(at('## 类型定义 要紧跟在 ## API 之后，两段都是机器所有区'));
  }

  return issues;
}

/** 围栏代码块之外的二级标题文本，按出现顺序 */
function topLevelHeadings(content: string): string[] {
  const headings: string[] = [];
  let fence: string | null = null;
  for (const line of content.split('\n')) {
    const marker = /^(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      continue;
    }
    if (!fence && line.startsWith('## ')) headings.push(line.slice(3).trim());
  }
  return headings;
}

/** 取一段二级标题下的正文，段不存在时返回空串 */
function sectionBody(content: string, heading: string): string {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

/**
 * icons 的分类数量表是手写的，与 packages/icons/src/ 下的目录逐个核对
 */
export async function checkIconCategoryCounts(root: string): Promise<string[]> {
  const page = path.join(root, 'docs/components/icons.md');
  const content = await readFileOrNull(page);
  if (content === null) return [];

  const issues: string[] = [];
  const rows = content.matchAll(/^\|\s*\*\*(\w+)\*\*\s*\|[^|]*\|\s*(\d+)\s*\|/gm);
  let checked = 0;
  for (const [, category, declared] of rows) {
    const files = await glob(`packages/icons/src/${category}/*.vue`, { cwd: root });
    if (files.length === 0) {
      issues.push(`icons.md：分类表里的 ${category} 在 packages/icons/src/ 下不存在`);
      continue;
    }
    checked++;
    if (files.length !== Number(declared)) {
      issues.push(`icons.md：${category} 标的是 ${declared} 个，实际 ${files.length} 个`);
    }
  }
  if (checked === 0) issues.push('icons.md：找不到图标分类数量表，无法校验数量');
  return issues;
}

/**
 * 从磁盘收集各文档页的校验输入。没有文档页的包直接跳过——缺页由生成器报。
 */
export async function collectPageLayoutInputs(
  root: string,
  apis: Map<string, ApiPackage>,
  exemptions: Exemptions = DEFAULT_EXEMPTIONS,
): Promise<PageLayoutInput[]> {
  const themeVars = await readThemeVars(root);
  const packageDirs = (await glob('packages/*/package.json', { cwd: root })).map((p) =>
    path.basename(path.dirname(p)),
  );

  const inputs: PageLayoutInput[] = [];
  for (const dirName of packageDirs.sort()) {
    if (exemptions.nonComponentPackages.has(dirName)) continue;
    const content = await readFileOrNull(path.join(root, 'docs/components', `${dirName}.md`));
    if (content === null) continue;

    const packageDir = path.join(root, 'packages', dirName);
    const pkg = JSON.parse(await fs.readFile(path.join(packageDir, 'package.json'), 'utf-8'));
    const api = apis.get(dirName);

    inputs.push({
      dirName,
      content,
      hasStyleExport: Boolean(pkg.exports?.['./style']),
      needsThemeStyle: await consumesThemeTokens(root, dirName, themeVars, new Set()),
      customizableVars: await readCustomizableVars(
        packageDir,
        themeVars,
        exemptions.internalCssVars.get(dirName),
      ),
      localeEntryCount: await countLocaleEntries(packageDir),
      hasRenderableTypes: api ? renderTypesBody(api).length > 0 : false,
    });
  }
  return inputs;
}

/**
 * 收集各包 README 的校验输入
 */
export async function collectReadmeLayoutInputs(
  root: string,
  exemptions: Exemptions = DEFAULT_EXEMPTIONS,
): Promise<ReadmeLayoutInput[]> {
  const packageJsons = await glob('packages/*/package.json', { cwd: root });
  const inputs: ReadmeLayoutInput[] = [];

  for (const relative of packageJsons.sort()) {
    const packageDir = path.join(root, path.dirname(relative));
    const dirName = path.basename(packageDir);
    const content = await readFileOrNull(path.join(packageDir, 'README.md'));
    if (content === null) continue;

    const pkg = JSON.parse(await fs.readFile(path.join(packageDir, 'package.json'), 'utf-8'));
    inputs.push({
      dirName,
      content,
      packageName: pkg.name,
      requireApi: !exemptions.nonComponentPackages.has(dirName),
    });
  }
  return inputs;
}

/** @aix/theme 定义的全部 token 名 */
async function readThemeVars(root: string): Promise<Set<string>> {
  const files = await glob('packages/theme/src/vars/*.css', { cwd: root });
  const names = new Set<string>();
  for (const file of files) {
    const css = await fs.readFile(path.join(root, file), 'utf-8');
    for (const name of collectCssVars(css)) names.add(name);
  }
  return names;
}

/**
 * 组件对外暴露的 CSS 变量：源码里引用到的、不属于 theme token 的 `--aix-*`，
 * 再去掉登记为内部用途的那些
 */
async function readCustomizableVars(
  packageDir: string,
  themeVars: Set<string>,
  internal: ReadonlySet<string> | undefined,
): Promise<string[]> {
  const files = await glob('src/**/*.{vue,ts,scss,css}', { cwd: packageDir });
  const names = new Set<string>();
  for (const file of files) {
    const source = await fs.readFile(path.join(packageDir, file), 'utf-8');
    for (const name of collectCssVars(source)) {
      if (themeVars.has(name) || internal?.has(name)) continue;
      names.add(name);
    }
  }
  return [...names].sort();
}

/** 包自身或其 @aix/* 依赖是否引用了主题 token */
async function consumesThemeTokens(
  root: string,
  dirName: string,
  themeVars: Set<string>,
  seen: Set<string>,
): Promise<boolean> {
  if (seen.has(dirName)) return false;
  seen.add(dirName);

  const packageDir = path.join(root, 'packages', dirName);
  const files = await glob('src/**/*.{vue,ts,scss,css}', { cwd: packageDir });
  for (const file of files) {
    const source = await fs.readFile(path.join(packageDir, file), 'utf-8');
    if (collectCssVars(source).some((name) => themeVars.has(name))) {
      return true;
    }
  }

  const pkg = JSON.parse(await fs.readFile(path.join(packageDir, 'package.json'), 'utf-8'));
  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    if (dep === '@aix/theme') return true;
    const match = /^@aix\/(.+)$/.exec(dep);
    if (!match) continue;
    if (await consumesThemeTokens(root, match[1]!, themeVars, seen)) return true;
  }
  return false;
}

/** src/locale/zh-CN.ts 的文案条数 */
async function countLocaleEntries(packageDir: string): Promise<number> {
  const source = await readFileOrNull(path.join(packageDir, 'src/locale/zh-CN.ts'));
  if (source === null) return 0;
  return (source.match(/^\s{2}[A-Za-z][\w]*:/gm) ?? []).length;
}

async function readFileOrNull(filePath: string): Promise<string | null> {
  return fs.readFile(filePath, 'utf-8').catch(() => null);
}
