/** 目录名里不允许出现的字符：`\` 与 Windows 非法字符（`/` 另行按路径段判定） */
const ILLEGAL_DIR_CHARS = /[\\:*?"<>|]/;

/** 控制字符（写进文件名会直接写盘失败）；用 codePoint 判定而不是正则，避免源码里出现字面控制字符 */
function hasControlChar(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** Override 定制目录名的合法形态：小写字母开头，其后小写字母 / 数字 / 连字符 */
const OVERRIDE_CODE_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * 校验项目名称（= 生成目录名），合法返回 undefined，否则返回错误文案
 *
 * 这里刻意**不用** npm 包名规范：目录名与包名是两件事，用 validate-npm-package-name
 * 会把 `MyApp`、`my.app` 这类完全正常的目录名判非法（实测报「name can no longer
 * contain capital letters」），而用户要的只是一个目录。包名由 toValidPackageName
 * 从这个名字派生（对齐 create-vue 的分工）。
 *
 * 仍要挡住的是真正会出事的形态：空名、`.` / `..` 路径段（写到目标目录之外）、
 * 路径分隔符与控制字符（写盘直接失败）。
 */
export function validateProjectName(name: string | undefined): string | undefined {
  if (!name || name.trim() === '') return '项目名称不能为空';
  if (name !== name.trim()) return '项目名称首尾不能有空格';
  if (hasControlChar(name)) return '项目名称不能包含控制字符';
  if (ILLEGAL_DIR_CHARS.test(name)) return '项目名称不能包含 \\ : * ? " < > | 这些字符';
  // `/` 放行（`@scope/name`、`nested/app` 都合法），但逐段检查：
  // - 空段 / `.` / `..`：会写到目标目录之外
  // - 以 `.` 开头：既不像是有意要建隐藏目录，更重要的是 `create-app .git` 会命中
  //   「目录已存在 → 清空后写入」这条路，把当前仓库的 .git 整个清掉（已实测）
  const segments = name.split('/');
  if (segments.some((seg) => seg === '' || seg === '.' || seg === '..')) {
    return '项目名称不能包含空的、`.` 或 `..` 路径段';
  }
  if (segments.some((seg) => seg.startsWith('.'))) {
    return '项目名称（及其路径段）不能以 `.` 开头';
  }
  if (segments.includes('node_modules')) return '项目名称不能是 node_modules';
  if (name.length > 214) return '项目名称过长（最多 214 个字符）';
  return undefined;
}

/**
 * 把项目名派生成合法的 npm 包名（写进产物 package.json 的 `name`）
 *
 * 目录名允许大写与点号，包名不允许——不转换的话产物 package.json 会带一个
 * npm / pnpm 拒收的 name，`pnpm install` 当场失败。`@scope/name` 保留 scope 结构。
 */
export function toValidPackageName(name: string): string {
  const clean = (part: string): string =>
    part
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/^[._]+/, '')
      .replace(/[^a-z\d\-~]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const parts = name.split('/');
  if (parts.length === 2 && parts[0]!.startsWith('@')) {
    const scope = clean(parts[0]!.slice(1));
    const pkg = clean(parts[1]!);
    if (scope && pkg) return `@${scope}/${pkg}`;
  }

  const flat = clean(parts.join('-'));
  return flat.length > 0 ? flat : 'my-project';
}

/**
 * 模板参数值里会静默产出坏产物的字符
 *
 * 参数值经 applyVariables 原文注入 TS 字符串字面量（site-config.ts 的
 * `defaultValue: '{{project-title}}'`）与 HTML（index.html 的 `<title>`）等文本上下文，
 * 通用文本替换无法按目标语法逐处转义——值里带 `'` 会把产物 TS 改成语法错误，
 * 而生成照样报成功（已实测）。在入口把静默炸变成响亮报错。
 */
const ILLEGAL_PARAM_VALUE_CHARS = /['"`\\<>]/;

/**
 * 校验模板参数（--param / 问答）的取值，合法返回 undefined，否则返回错误文案
 *
 * 只挡会破坏注入上下文语法的字符，不限制正常文案（中文 / 空格 / `&` 都放行）。
 * `--param` 与 TTY 问答两条入口共用这一份；manifest 里的 default 由模板作者自控，不在此校验。
 */
export function validateParamValue(value: string): string | undefined {
  if (hasControlChar(value)) return '参数值不能包含控制字符（含换行）';
  if (ILLEGAL_PARAM_VALUE_CHARS.test(value)) {
    return '参数值不能包含 \' " ` \\ < > 这些字符（会被原文注入 TS / HTML，产物会带语法错误）';
  }
  return undefined;
}

/**
 * 校验 Override 定制目录名（`override add <code>`），合法返回 undefined
 *
 * 命令行位置参数与问答两条入口共用这一份：历史上只有问答分支校验，
 * 命令行传 `../../PWNED` 会把覆盖层写到 output 目录之外（且 registry 的
 * `import.meta.glob` 永远扫不到它，产出一个静默不生效的覆盖层）。
 */
export function validateOverrideCode(code: string | undefined): string | undefined {
  if (!code || code.trim() === '') return '定制目录名不能为空';
  if (!OVERRIDE_CODE_PATTERN.test(code)) {
    return `定制目录名 "${code}" 不合法：只能包含小写字母、数字和连字符，且以字母开头`;
  }
  return undefined;
}
