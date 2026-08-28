import { escapeRegExp } from './string-escape';

/**
 * 文本级 import 手术 + 词法级注释剥除。
 *
 * 职责边界：这里全部是**按行/按正则改写源码文本**的操作，刻意不走 AST——
 * import 的增删要保留用户原有的换行、缩进、分号风格，AST 打印会整文件重排。
 * 代价是必须自己处理字符串/注释/正则字面量的词法状态，故 stripComments 这个
 * 手写词法器也留在本模块（多处静态扫描先剥注释再跑正则，与 import 手术同源同风险）。
 */

/**
 * 启发式剥除 JS/TS/Vue 源码中的注释（行注释、块注释、HTML 注释），保留字符串字面量。
 *
 * Why: 工具的多处静态扫描（doctor 的 t() 引用收集、IdReuseResolver 的 existingIds
 * 收集等）只需要识别"真实代码里调用的 t('xxx')"。若不剥注释，被注释掉的示例代码
 * 中的 t('xxx') 会被误统计，产生 false-positive（如 doctor 的 missing-key 误报）。
 *
 * 与 VueComponentInjector.stripCommentsAndStrings 区别：
 *  - 那里需要的是"判断真实代码中是否存在 t() 调用"，连字符串也一并吞掉
 *  - 这里需要保留字符串内容供正则提取 t('key') 的 key 字面量
 *
 * 实现：单遍扫描 + 引号/反引号状态机，正确跳过字符串/模板字面量内部的注释起始序列
 * （行注释、块注释、HTML 注释开头都按字符串内文本处理，不进入注释状态）。
 * Why 不用单纯正则：JSX 里 href 含 URL（双斜杠）+ 同行 t 调用时，单纯
 * 「匹配整行直至换行的双斜杠正则」会把 URL 后半段（含同行的 t 调用）一并替换为空格，
 * 导致 doctor 漏报 used-key（误报 orphan / missing）。
 */
export function stripComments(code: string): string {
  const out: string[] = [];
  const len = code.length;
  let i = 0;

  // 「后接表达式」的关键字：其后的 `/` 是正则字面量起点而非除号。
  // 不列入则 `return /"/.test(url)` 的 `/` 被当除号 → `"` 进入字符串态、URL 里的 `//`
  // 被误当行注释 → 同行 t('key') 整段被剥除 → source-key-scanner 漏采 → prune 误删在用 key。
  const REGEX_PRECEDING_KEYWORDS = new Set([
    'return',
    'case',
    'typeof',
    'instanceof',
    'in',
    'of',
    'do',
    'else',
    'void',
    'delete',
    'throw',
    'yield',
    'await',
    'new',
  ]);

  // 状态栈：栈顶为当前所处的语法上下文，支持模板字符串 ${...} 内嵌套字符串/模板/注释。
  // - none      : 代码区
  // - dq/sq     : 双/单引号字符串
  // - tpl       : 模板字符串外层（反引号内、非 ${} 段）
  // - tpl_expr  : 模板字符串内 ${...} 表达式区（属于代码上下文，需追踪 { 嵌套深度）
  // - line/block/html : 三类注释
  type FrameKind = 'none' | 'dq' | 'sq' | 'tpl' | 'tpl_expr' | 'line' | 'block' | 'html' | 'regex';
  interface Frame {
    kind: FrameKind;
    braceDepth?: number;
    // regex frame：是否处于字符类 [...] 内（内部的 / 不闭合正则）。
    inCharClass?: boolean;
    // 块注释内容起点（`/*` 之后第一个字符的下标）。用于判定 `*/` 闭合时，
    // 排除开头 `/*` 自身的 `*`，避免把 `/*/` 误判为完整闭合注释。
    blockContentStart?: number;
  }
  const stack: Frame[] = [{ kind: 'none' }];
  const top = (): Frame => stack[stack.length - 1]!;

  while (i < len) {
    const frame = top();
    const ch = code[i]!;
    const next = code[i + 1];

    // 代码上下文（含模板表达式内）：识别字符串/注释起始，tpl_expr 还需匹配 ${} 的闭合
    if (frame.kind === 'none' || frame.kind === 'tpl_expr') {
      if (ch === '"') {
        stack.push({ kind: 'dq' });
        out.push(ch);
        i++;
        continue;
      }
      if (ch === "'") {
        stack.push({ kind: 'sq' });
        out.push(ch);
        i++;
        continue;
      }
      if (ch === '`') {
        stack.push({ kind: 'tpl' });
        out.push(ch);
        i++;
        continue;
      }
      if (ch === '/' && next === '*') {
        // 记录内容起点（跳过 `/*` 后的下标），闭合判定据此排除开头的 `*`。
        stack.push({ kind: 'block', blockContentStart: i + 2 });
        out.push(' ');
        i += 2;
        continue;
      }
      if (ch === '/' && next === '/') {
        stack.push({ kind: 'line' });
        out.push(' ');
        i += 2;
        continue;
      }
      // 正则字面量 vs 除号：到此 `/` 既非 /* 也非 //。正则内部可能含引号或双斜杠
      // （如 /'/、/['"]/、/a\/\//），若误当除号会让后续引号进入字符串态、注释失配 →
      // 注释里的 t('key') 被误计入 used-key。按前一个有效 token 区分：表达式结束字符
      // （标识符/数字/) ] } /引号）之后是除号，其余位置（行首/运算符/括号开）是正则起始。
      if (ch === '/') {
        let prev = '';
        let prevIdx = -1;
        for (let j = out.length - 1; j >= 0; j--) {
          const c = out[j]!;
          if (c !== ' ' && c !== '\t' && c !== '\r' && c !== '\n') {
            prev = c;
            prevIdx = j;
            break;
          }
        }
        let isRegexStart = prev === '' || !/[A-Za-z0-9_$)\]}'"`]/.test(prev);
        // 关键字回看：前一有效字符是标识符字符时，仅凭「是标识符 → 除号」不足——
        // `return /re/`、`typeof /re/` 里的 `/` 其实是正则起点。向前扫出完整标识符，
        // 若属于 REGEX_PRECEDING_KEYWORDS 则改判为正则。前置 `.` 视为属性访问（如
        // `obj.in / 2`）不回看，避免把 `.in`/`.of` 等属性名误当关键字。
        if (!isRegexStart && /[A-Za-z0-9_$]/.test(prev)) {
          let k = prevIdx;
          while (k >= 0 && /[A-Za-z0-9_$]/.test(out[k]!)) k--;
          const word = out.slice(k + 1, prevIdx + 1).join('');
          if (out[k] !== '.' && REGEX_PRECEDING_KEYWORDS.has(word)) {
            isRegexStart = true;
          }
        }
        if (isRegexStart) {
          stack.push({ kind: 'regex', inCharClass: false });
          out.push(ch);
          i++;
          continue;
        }
        // 否则是除号：落到下方普通字符处理
      }
      if (ch === '<' && code.startsWith('!--', i + 1)) {
        stack.push({ kind: 'html' });
        out.push(' ');
        i += 4;
        continue;
      }
      // tpl_expr 中追踪 { / } 嵌套；遇到深度为 0 的 } 表示 ${...} 闭合，弹栈回到外层 tpl
      if (frame.kind === 'tpl_expr') {
        if (ch === '{') {
          frame.braceDepth = (frame.braceDepth ?? 0) + 1;
          out.push(ch);
          i++;
          continue;
        }
        if (ch === '}') {
          if ((frame.braceDepth ?? 0) === 0) {
            stack.pop();
            out.push(ch);
            i++;
            continue;
          }
          frame.braceDepth = (frame.braceDepth ?? 0) - 1;
          out.push(ch);
          i++;
          continue;
        }
      }
      out.push(ch);
      i++;
      continue;
    }

    // 普通字符串：处理转义与闭合
    if (frame.kind === 'dq' || frame.kind === 'sq') {
      if (ch === '\\') {
        out.push(ch);
        if (i + 1 < len) out.push(code[i + 1]!);
        i += 2;
        continue;
      }
      const quote = frame.kind === 'dq' ? '"' : "'";
      if (ch === quote) {
        stack.pop();
      }
      out.push(ch);
      i++;
      continue;
    }

    // 模板字符串：识别 ${ 嵌入表达式与反引号闭合
    if (frame.kind === 'tpl') {
      if (ch === '\\') {
        out.push(ch);
        if (i + 1 < len) out.push(code[i + 1]!);
        i += 2;
        continue;
      }
      if (ch === '$' && next === '{') {
        stack.push({ kind: 'tpl_expr', braceDepth: 0 });
        out.push('$');
        out.push('{');
        i += 2;
        continue;
      }
      if (ch === '`') {
        stack.pop();
      }
      out.push(ch);
      i++;
      continue;
    }

    // 正则字面量：处理转义、字符类 [...]（内部 / 不闭合）、未转义 / 闭合；不跨行。
    if (frame.kind === 'regex') {
      if (ch === '\\') {
        out.push(ch);
        if (i + 1 < len) out.push(code[i + 1]!);
        i += 2;
        continue;
      }
      if (frame.inCharClass) {
        if (ch === ']') frame.inCharClass = false;
        out.push(ch);
        i++;
        continue;
      }
      if (ch === '[') {
        frame.inCharClass = true;
        out.push(ch);
        i++;
        continue;
      }
      if (ch === '/') {
        stack.pop();
        out.push(ch);
        i++;
        continue;
      }
      if (ch === '\n') {
        // 正则不跨行：遇换行说明前面把除号误判为正则，回退结束该 frame，避免吞掉后续行。
        stack.pop();
        out.push('\n');
        i++;
        continue;
      }
      out.push(ch);
      i++;
      continue;
    }

    // 块注释：吃到 */，整段替空格（保留行结构以便行号不漂移）
    if (frame.kind === 'block') {
      // 闭合要求 `*` 的下标 ≥ 内容起点，否则 `/*/` 会把开头 `/*` 的 `*` 误当 `*/`。
      if (ch === '/' && code[i - 1] === '*' && i - 1 >= (frame.blockContentStart ?? 1)) {
        stack.pop();
      }
      out.push(ch === '\n' ? '\n' : ' ');
      i++;
      continue;
    }

    // 行注释：吃到行尾
    if (frame.kind === 'line') {
      if (ch === '\n') {
        stack.pop();
        out.push('\n');
      } else {
        out.push(' ');
      }
      i++;
      continue;
    }

    // HTML 注释：吃到 -->
    if (frame.kind === 'html') {
      if (ch === '>' && code[i - 1] === '-' && code[i - 2] === '-') {
        stack.pop();
      }
      out.push(ch === '\n' ? '\n' : ' ');
      i++;
      continue;
    }
  }

  return out.join('');
}

/**
 * 计算单行内净 `{` - `}` 数，跳过字符串字面量与注释内部的括号。
 *
 * Why: 字符串内 `{`/`}`（如 `from '@/i18n{mock}'` 这种含特殊字符的别名路径、
 * 或字符串 payload 内含括号）若被计入大括号深度，会让 import 边界追踪错位，
 * 导致 `const { t } = useI18n()` 之类的注入落到错误行。
 *
 * 同理注释内的 `}` 也必须跳过：多行 import 续行的行注释（`Foo, // a } comment`）
 * 或块注释（`/* } *\/`）里的 `}` 若被计入，会让 pendingDepth 在真正闭合前提前归零，
 * 边界锚定到注释行，新 import 被插进原 import 花括号内部 → 语法错误。
 *
 * 不处理转义字符（`\\'`），对当前用途够用——import 行内出现 `\\'` 极罕见，
 * 即便出错也只是行号偏差，不会破坏语义。块注释只在单行内追踪（import 续行内跨行
 * 块注释极罕见），跨行未闭合块注释按「本行剩余为注释」保守跳过。
 */
function countBraceDelta(line: string): number {
  let delta = 0;
  let quote: '"' | "'" | '`' | null = null;
  let inBlockComment = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inBlockComment) {
      if (ch === '*' && line[i + 1] === '/') {
        inBlockComment = false;
        i++; // 跳过 '/'
      }
      continue;
    }
    if (quote !== null) {
      if (ch === '\\') {
        i++; // 跳过下一字符（处理 \" \' \` 等转义）
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    // 注释起始（import 行内 `/` 只可能来自注释，不会是正则/除号）：
    // 行注释 → 本行剩余全部忽略；块注释 → 进入跳过态。
    if (ch === '/' && line[i + 1] === '/') break;
    if (ch === '/' && line[i + 1] === '*') {
      inBlockComment = true;
      i++; // 跳过 '*'
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
    } else if (ch === '{') {
      delta++;
    } else if (ch === '}') {
      delta--;
    }
  }
  return delta;
}

/**
 * 在文本行数组中查找最后一条 import 语句的行号；没有则返回 -1。
 *
 * Why: React 与 Vue 的 ImportManager 都需要这个能力来确定"插入新 import 的锚点"，共用本方法
 * 避免两端各自实现而维护漂移。
 */
export function findLastImportLineIndex(lines: string[]): number {
  // 多行 import（如 `import {\n  A,\n  B,\n} from 'x'`）只用 startsWith('import ')
  // 检测会让 lastImportIndex 停在第一行（`import {`），随后 `appendImportLine` 把
  // 新 import 插到第二行，落入花括号内部，产生语法错误。
  // 这里通过 brace 平衡跨行追踪 import 语句的真实结束行。
  let lastImportEndLine = -1;
  let pendingDepth = 0; // 当前 import 内尚未闭合的 { 深度

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (pendingDepth > 0) {
      pendingDepth += countBraceDelta(line);
      if (pendingDepth === 0) {
        // brace 闭合那一行就是该 import 的实际结束行
        lastImportEndLine = i;
      }
      continue;
    }

    if (trimmed.startsWith('import ') || trimmed.startsWith('import{')) {
      const depth = countBraceDelta(line);
      if (depth === 0) {
        lastImportEndLine = i;
      } else {
        pendingDepth = depth;
      }
    }
  }

  return lastImportEndLine;
}

/**
 * 把 importStatement 插入到代码字符串中"最后一条 import 之后"。
 * 已 trim，调用方不需要再处理换行。
 */
export function appendImportLine(code: string, importStatement: string): string {
  const lines = code.split('\n');
  const lastImportIndex = findLastImportLineIndex(lines);
  lines.splice(lastImportIndex + 1, 0, importStatement.trim());
  return lines.join('\n');
}

/**
 * 剥离命名导入花括号内的注释（块注释与 `// ...` 行注释），再交给调用方 split(',')。
 * Why：多行 import 常带行注释（`useI18n, // 组合式 API`），直接对花括号内容 split(',')
 * + trim 会把注释文本并进导入名；重写为单行时首个 `//` 会吞掉后续导入名与 from →
 * 产出语法损坏、无法编译的代码。取舍：重写为单行时注释自然丢弃——保语法正确优先于保注释。
 */
function stripImportListComments(namedList: string): string {
  return namedList
    .replace(/\/\*[\s\S]*?\*\//g, '') // 块注释
    .replace(/\/\/[^\n]*/g, ''); // 行注释：吃到行尾
}

/**
 * 从代码中精准摘除指定包的命名导入项。仅删除 names 列表中的名字，
 * 不破坏同一条 import 内的其他名字。若摘除后命名列表为空，整条 import 行
 * 一并删除。
 *
 * Why 精准摘除：早先各 i18n library 暴露 getImportCleanupRegex 直接匹配整条
 * `import { … } from 'pkg'` 后 replace 成空串——用户若在同一行手写其他导出
 * （如 `import { useI18n, createI18n } from 'vue-i18n'`），restore 会把
 * createI18n 也删掉，下游编译报错。
 *
 * @param code            源代码
 * @param isTargetModule  判断某个 `from 'X'` 是否属于目标库（支持包名别名）
 * @param namesToRemove   要从命名列表中摘除的名字（精确匹配，trim 后比对）
 */
export function removeNamedImports(
  code: string,
  isTargetModule: (moduleName: string) => boolean,
  namesToRemove: string[],
): string {
  if (namesToRemove.length === 0) return code;
  // 行首锚定（gm + `^[ \t]*import`）：只匹配作为「语句」出现在行首（允许缩进）的真实
  // import，排除注释（`// import { t } from 'x'`）或字符串里的 import 字样——不锚定会
  // 把注释里的 import 当作匹配项删除，`\n?` 还会吞掉换行把下一行真实代码并入注释。
  // 与姊妹方法 mergeNamedImport 的锚定口径保持一致。尾部 `;?` `\n?` 避免删除后留空行。
  // 可选默认说明符 `import D, { … }`：捕获默认名 D 并在重写时保留，否则 default+named 形式
  // 的死 t 摘不掉（regex 不匹配 → 残留 no-unused-vars）。
  const importRegex =
    /^([ \t]*)import\s*(?:([A-Za-z0-9_$]+)\s*,\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?\n?/gm;
  return code.replace(
    importRegex,
    (
      match,
      indent: string,
      defaultName: string | undefined,
      namedList: string,
      moduleName: string,
    ) => {
      if (!isTargetModule(moduleName)) return match;
      const remaining = stripImportListComments(namedList)
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
        // `useI18n as foo` 这类重命名导入：取 ` as ` 之前的原始名作为比对锚点
        .filter((entry) => {
          const original = entry.split(/\s+as\s+/)[0]!.trim();
          return !namesToRemove.includes(original);
        });
      // 复用原始行尾分号/换行，保留风格一致
      const hasSemi = match.trimEnd().endsWith(';');
      const hasNewline = match.endsWith('\n');
      const tail = `${hasSemi ? ';' : ''}${hasNewline ? '\n' : ''}`;
      if (remaining.length === 0) {
        // 无剩余具名项：存在默认导入则保留 `import D from 'pkg'`，否则整条删除
        return defaultName ? `${indent}import ${defaultName} from '${moduleName}'${tail}` : '';
      }
      const prefix = defaultName ? `${defaultName}, ` : '';
      return `${indent}import ${prefix}{ ${remaining.join(', ')} } from '${moduleName}'${tail}`;
    },
  );
}

/**
 * 合并/插入命名导入：若代码中已存在 `import { ... } from packageName`，把新 names
 * 并入现有花括号；否则在最后一条 import 之后追加新 import 行。
 *
 * 返回更新后的代码；语义上等价于 React/Vue 端原本各自实现的 addLibraryImports。
 */
export function mergeNamedImport(code: string, packageName: string, names: string[]): string {
  if (names.length === 0) return code;
  const escapedPkg = escapeRegExp(packageName);
  // 行首锚定（gm + `^[ \t]*import`）：只匹配作为「语句」出现在行首（允许缩进）的真实
  // import，从而排除出现在注释（如 `// import { t } from 'x'`、块注释中的示例代码）
  // 或字符串字面量里的 import 字样——它们都是行内文本，不会顶到行首。
  // 不锚定会误把注释里的 import 当作重复项，再被下方删除逻辑误伤真实 import。
  // 可选默认说明符 `import D, { … }`：捕获默认名 D（组1），命名列表为组2。不识别会导致
  // 已有 `import D, { t } from pkg` 匹配失败 → 误判为「不存在」而追加重复 import（TS2300）。
  const importRegex = new RegExp(
    `^[ \\t]*import\\s*(?:([A-Za-z0-9_$]+)\\s*,\\s*)?\\{([^}]+)\\}\\s*from\\s*['"]${escapedPkg}['"][ \\t]*;?`,
    'gm',
  );
  const matches = [...code.matchAll(importRegex)];

  // 额外收集该包【所有】已存在的本地导入名，含 `import type { … }` 与内联 `{ type X }`
  // ——上面的 importRegex 只认值导入（有意，避免把值并进 type import 触发 TS1361）。
  // 用于把「已作为类型导入的同名标识符」从待新增集合中剔除，否则注入 HOC 命名导入
  // （如 withTranslation, WithTranslation）会与已有 `import type { WithTranslation }`
  // 产生 TS2300 重复标识符，整文件无法编译。
  const anyImportRegex = new RegExp(
    `^[ \\t]*import\\s+(?:type\\s+)?(?:[A-Za-z0-9_$]+\\s*,\\s*)?\\{([^}]+)\\}\\s*from\\s*['"]${escapedPkg}['"]`,
    'gm',
  );
  const existingNames = new Set<string>();
  for (const m of code.matchAll(anyImportRegex)) {
    for (const raw of stripImportListComments(m[1]!).split(',')) {
      const part = raw.trim().replace(/^type\s+/, ''); // 去掉内联 type 修饰
      if (!part) continue;
      const local = /\sas\s/.test(part) ? part.split(/\sas\s/)[1]!.trim() : part;
      if (local) existingNames.add(local);
    }
  }
  const namesToAdd = names.filter((n) => !existingNames.has(n));

  if (matches.length > 0) {
    // 收集所有已存在的命名导入并与新增合并去重
    const existing = matches.flatMap((m) =>
      stripImportListComments(m[2]!)
        .split(',')
        .map((imp) => imp.trim())
        .filter(Boolean),
    );
    const merged = [...new Set([...existing, ...namesToAdd])];
    // 保留已存在的默认导入说明符（如 `import locale, { t } from pkg` 的 locale），
    // 否则合并重写会丢掉默认导入。取首个出现的默认名。
    const defaultName = matches.map((m) => m[1]).find(Boolean);
    const prefix = defaultName ? `${defaultName}, ` : '';
    const replacement = `import ${prefix}{ ${merged.join(', ')} } from '${packageName}';`;

    // 用「位置切片」替换而非 String.replace(子串)：后者会从头重新搜索，当某条匹配文本
    // 是另一条的子串时会替换错位置。这里按 match.index 精确定位，
    // 从后往前处理以保证前面的索引不被位移影响：首处替换为合并语句，其余删除。
    let result = code;
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i]!;
      const start = m.index!;
      const end = start + m[0].length;
      result = result.slice(0, start) + (i === 0 ? replacement : '') + result.slice(end);
    }
    // 清理可能产生的连续空行
    return result.replace(/\n{3,}/g, '\n\n');
  }
  // 无可合并的值导入：若待新增名全部已作为 type-only 导入存在，则无需追加（避免 TS2300）。
  if (namesToAdd.length === 0) return code;
  const importStatement = `import { ${namesToAdd.join(', ')} } from '${packageName}';`;
  return appendImportLine(code, importStatement);
}
