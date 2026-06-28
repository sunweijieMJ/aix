import fs from 'fs';
import type { ResolvedConfig } from '../config';
import type { FrameworkAdapter } from '../adapters';
import { CommonASTUtils } from './common-ast-utils';
import { FileUtils } from './file-utils';

/**
 * 各 i18n 库引用 key 的全部静态形式（捕获组 1 = key）。库无关：vue 项目不会有
 * FormattedMessage、react 项目不会有 keypath，跨库同跑互不干扰。`id` 两条限定在
 * FormattedMessage 标签 / formatMessage 调用上下文内，避免误吃普通 HTML/对象 id。
 *
 * 仍按「尽力而为」不覆盖动态形式（t(prefix+x) / :keypath="expr" / v-t="{path:x}"），
 * 这些由 keys.dynamicKeyAllowlist 兜底——静态扫描本就无法解析。
 */
/**
 * 函数调用 `t(...)` / `$t(...)`：捕获第一个实参表达式（到顶层第一个 `,` 或 `)` 止）。
 * 随后从中提取所有字符串字面量，因此能覆盖：
 *   - `t('k')`             → 'k'
 *   - `t(cond ? 'a' : 'b')` → 'a' / 'b'（三元，两个 key 都算被引用）
 * 在第一个逗号处停止，避免误吃 `t('k', { name: 'John' })` 里的插值值 'John'。
 * 模板字符串 / 变量等动态形式自然不含字面量 → 不匹配（交给 dynamicKeyAllowlist）。
 */
const CALL_FIRST_ARG = /(?:\$t|(?<!\w)t)\s*\(\s*([^,)]*)/g;
/** 从一段表达式文本里提取所有 'xxx' / "xxx" 字面量。 */
const STRING_LITERAL = /['"]([^'"]+)['"]/g;

/** 组件 / 属性形式（库无关，跨库同跑互不干扰；id 两条限定上下文避免误吃普通 id）。 */
const ATTR_PATTERNS: RegExp[] = [
  // vue-i18n 组件：<i18n-t keypath="k">
  /\bkeypath\s*=\s*['"]([^'"]+)['"]/g,
  // vue-i18n 指令：v-t="'k'"
  /\bv-t\s*=\s*"'([^']+)'"/g,
  // react-i18next 组件：<Trans i18nKey="k">
  /\bi18nKey\s*=\s*['"]([^'"]+)['"]/g,
  // react-intl 组件：<FormattedMessage id="k">（限标签内的 id）
  /<FormattedMessage\b[^>]*?\bid\s*=\s*['"]([^'"]+)['"]/g,
  // react-intl 调用：formatMessage({ id: 'k' })（限调用对象内的 id）
  /\bformatMessage\s*\(\s*\{[^}]*?\bid\s*:\s*['"]([^'"]+)['"]/g,
];

/**
 * 从单段源码文本里抽出所有 i18n key 引用（库无关全量口径）：函数调用 `t()/$t()`
 * 首参里的字符串字面量（含三元两分支）、vue `<i18n-t keypath>`/`v-t`、react
 * `<Trans i18nKey>`/`<FormattedMessage id>`/`formatMessage({id})`。
 *
 * 不做 namespace 剥离、不去重，原样返回每个命中（按出现顺序）。调用方按需归一化/计数。
 * collectUsedKeys（doctor/prune 对账）与 IdReuseResolver（覆盖率分子 + ID 复用）共用，
 * 避免「t()/$t() only」窄正则与本全量口径漂移。传入文本应已剥离注释。
 */
export function scanKeyReferencesInContent(content: string): string[] {
  const refs: string[] = [];

  // 1. 函数调用：取首参表达式里的全部字符串字面量
  CALL_FIRST_ARG.lastIndex = 0;
  let call: RegExpExecArray | null;
  while ((call = CALL_FIRST_ARG.exec(content)) !== null) {
    const firstArg = call[1] ?? '';
    STRING_LITERAL.lastIndex = 0;
    let lit: RegExpExecArray | null;
    while ((lit = STRING_LITERAL.exec(firstArg)) !== null) {
      if (lit[1]) refs.push(lit[1]);
    }
  }

  // 2. 组件 / 属性形式
  for (const pattern of ATTR_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1]) refs.push(match[1]);
    }
  }

  return refs;
}

/**
 * 扫描源码目录，抽出所有 i18n key 引用：函数调用 `t()/$t()`（含三元等首参表达式）、
 * vue 组件/指令 `<i18n-t keypath>`/`v-t`、react 组件/调用 `<Trans i18nKey>`/
 * `<FormattedMessage id>`/`formatMessage({id})`。已剥离 namespace 前缀（'ns:key' →
 * 'key'）、剔除注释中的引用。doctor 对账与 prune 孤儿清理共用此口径。
 */
export function collectUsedKeys(config: ResolvedConfig, adapter: FrameworkAdapter): Set<string> {
  const used = new Set<string>();
  const nsPrefix = config.framework.namespace ? `${config.framework.namespace}:` : '';
  const files = FileUtils.getFrameworkFiles(
    config.io.sourceDir,
    adapter.getSupportedExtensions(),
    config.io.exclude,
    config.io.include,
    config.root,
  );
  const addKey = (raw: string): void => {
    used.add(nsPrefix && raw.startsWith(nsPrefix) ? raw.slice(nsPrefix.length) : raw);
  };
  for (const filePath of files) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const content = CommonASTUtils.stripComments(raw);
      for (const ref of scanKeyReferencesInContent(content)) {
        addKey(ref);
      }
    } catch {
      /* 读取失败的文件跳过，不影响其他文件 */
    }
  }
  return used;
}

/** key 是否命中动态 key 白名单（可能被 t(prefix+var) 动态引用，不应判为孤儿）。 */
export function matchesDynamicAllowlist(config: ResolvedConfig, key: string): boolean {
  const list = config.keys.dynamicKeyAllowlist;
  if (list.length === 0) return false;
  for (const pattern of list) {
    if (typeof pattern === 'string') {
      if (key.startsWith(pattern)) return true;
    } else {
      // 用户可能传入带 /g 或 /y 的 RegExp。这些正则的 test() 有状态（lastIndex 在调用间
      // 推进），而本函数会对成百上千个 key 复用同一正则对象，偏移非零时会对本应命中的
      // key 误判 false → 受保护键被当孤儿，从所有 locale 与字典中永久删除（破坏性路径）。
      // 每次匹配前归零，与本文件 ATTR_PATTERNS 的 lastIndex=0 写法一致。
      pattern.lastIndex = 0;
      if (pattern.test(key)) return true;
    }
  }
  return false;
}
