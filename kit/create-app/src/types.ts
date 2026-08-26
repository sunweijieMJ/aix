export type Platform = 'web' | 'mobile';

/** CLI 的唯一数据源，由问答编排器产出 */
export interface ProjectConfig {
  name: string;
  description: string;
  /** 从模板 config.ts 读取，不再由问答产生 */
  platform: Platform;
  /** 选中的注册表条目 id；`--template` 直传源（本地路径 / giget 格式）时为 undefined */
  templateId?: string;
  /** 选中的特性 id 列表，取值域由模板 config.ts 的 features 决定 */
  features: string[];
  /** 模板参数的最终取值（key 即占位符名），由 --param / 问答 / 声明的 default 解出 */
  params: Record<string, string>;
  outputDir: string;
  packageManager: 'pnpm' | 'npm' | 'yarn';
  initGit: boolean;
  installDeps: boolean;
}

/** 文件条目（支持二进制和可执行权限） */
export interface FileEntry {
  /** 相对项目根的路径 */
  path: string;
  /** 文本或二进制内容 */
  content: string | Buffer;
  /** 文件权限（如 0o755 用于 shell 脚本） */
  mode?: number;
}

export type FileList = FileEntry[];

/** 模板特性定义（来自 .template/config.ts） */
export interface TemplateFeatureDef {
  /** multiselect 显示名 */
  label: string;
  /** multiselect hint（如 'recommended'） */
  hint?: string;
  /** 是否默认勾选（缺省 false） */
  default?: boolean;
  /** 未选此特性时整目录排除（相对模板根，POSIX 风格） */
  dirs?: string[];
  /** 未选此特性时排除的单文件 */
  files?: string[];
  /** 未选此特性时从 dependencies 移除的包名 */
  deps?: string[];
  /** 未选此特性时从 devDependencies 移除的包名 */
  devDeps?: string[];
  /** 未选此特性时从 package.json scripts 移除的脚本名 */
  scripts?: string[];
}

/** 模板参数定义（来自 .template/config.ts 的 params，key 即占位符名） */
export interface TemplateParamDef {
  /** 问答显示文案 */
  label: string;
  /** 默认值：TTY 下作为问答初始值；非 TTY 且未传 --param 时直接采用（缺省则必须传 --param） */
  default?: string;
}

/** 模板配置（.template/config.ts 的 export default，经 Zod 验证后的结构） */
export interface TemplateConfig {
  id: string;
  platform: Platform;
  /** semver range，用于校验 CLI 与模板的兼容性 */
  compatibleCliVersions: string;
  /** 简单字符串替换，应用于所有文本文件（`{{project-name}}` 由 CLI 自动注入） */
  variables: Record<string, string>;
  /**
   * 参数声明区：需要「按项目定值」的占位符（区别于 variables 的固定值）
   *
   * key 即占位符名（`project-title` → `{{project-title}}`），小写 kebab；
   * `project-name` 保留给 CLI 注入，且不得与 variables 里的同名占位符冲突。
   * 取值来源优先级：`--param key=value` > TTY 问答（default 为初始值）> default。
   */
  params?: Record<string, TemplateParamDef>;
  /**
   * 真名 → 占位符替换，用于把模板真源里的硬编码标识（包名、标题等）换成占位符
   *
   * 与 variables 的分工：variables 是「占位符 → 值」，作用于全部文本文件；
   * substitutions 是「真名 → 占位符」，只作用于 files 白名单，且先于条件块执行。
   * 之所以不直接在真源里写占位符，是因为真源本身要能独立跑起来。
   * 白名单内零命中会抛 E_SUBSTITUTION_MISS，防真源改名后静默失配。
   */
  substitutions?: Array<{
    /** 待替换的精确字符串（字面量，非正则） */
    from: string;
    /** 替换结果，通常是 `{{xxx}}` 占位符 */
    to: string;
    /** 生效文件白名单，相对模板根的精确路径 */
    files: string[];
  }>;
  /**
   * 不进入产物的路径（相对模板根，前缀匹配，语义同 features 的 dirs/files）
   *
   * 模板真源是一个能独立跑起来的真实仓库，工作区里混着构建产物（`dist/`）、
   * 生成文件（`components.d.ts`）、锁文件、本地缓存等——这些不该带进新项目。
   * `.template` / `.git` / `node_modules` 由 composer 无条件跳过，不必在此重复声明。
   */
  exclude?: string[];
  /**
   * 无条件从产物 package.json 移除的 scripts（features 的 `scripts` 是按特性裁剪，这个与特性无关）
   *
   * 用于只服务模板真源自身的脚本（如 `check:template`）——它依赖的文件已被 exclude 挡掉，
   * 脚本项留着就是一条必定失败的命令。
   */
  removeScripts?: string[];
  /**
   * 特性定义表，key 即特性 id
   *
   * 特性有两种裁剪手段：整目录/整文件级的 dirs/files/deps/devDeps/scripts（本表声明），
   * 以及文件内部的条件块——后者写在模板源文件里，不在清单中声明。条件块支持三种注释风格，
   * 由 core/conditional.ts 统一解析，不按扩展名区分：
   * `// #if <id>`（js/ts/scss 等）、`<!-- #if <id> -->`（html/vue template/markdown）、
   * `# #if <id>`（dotenv/shell/yaml 等 `#` 注释系文件），各配 `#else` / `#endif`。
   */
  features: Record<string, TemplateFeatureDef>;
}
