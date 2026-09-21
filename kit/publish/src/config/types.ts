/**
 * publish.config.ts 的类型定义。
 *
 * 配置文件放在业务仓库根目录（它所在的目录即 projectRoot），defineConfig 提供类型。
 */

/** 构建配置 */
export interface BuildConfig {
  /**
   * 构建命令，数组形式、不经 shell，cwd 为仓库根。
   *
   * 例：['node', '--max-old-space-size=8192', './node_modules/vite/bin/vite.js', 'build']
   */
  command: string[];
}

/** dist-tag 配置 */
export interface TagsConfig {
  /** 没有任何声明时的默认标签，默认 'latest' */
  default?: string;
  /**
   * 分支名 → dist-tag。支持 `*` 通配，多个模式命中时更长的模式优先。
   *
   * 推荐用它而不是 default：它以分支名为键，这份配置被合并到别的分支上也不会生效。
   */
  byBranch?: Record<string, string>;
  /**
   * 主线标签：latest 的「预发布转正」只认这些序列，默认 ['beta', 'dev', 'rc']。
   *
   * 业务仓库若有几十条定制序列，任一个领先都会把正式版拽到它的基线上，所以要限定范围。
   */
  mainline?: string[];
}

/** 发布成功后打 git tag 的配置 */
export interface GitConfig {
  /**
   * tag 名模板，占位 `{version}`（本次版本号）与 `{name}`（去掉 scope 的包名）；`false` 关闭。
   * 默认 `'v{version}'`。
   *
   * 模板必须含 `{version}`：常量 tag 名第二次发布必然撞名。
   */
  tag?: false | string;
  /** 是否推送 tag。交互模式下作为确认框的默认值；非交互 / `-y` 直接取它。默认 true */
  push?: boolean;
  /** 推送目标 remote，默认 'origin' */
  remote?: string;
}

/** manifest.exports 为函数时拿到的上下文 */
export interface ManifestExportsContext {
  projectRoot: string;
  distPath: string;
  version: string;
  /** dist 一级目录中含 index.js 的目录名（升序） */
  entries: string[];
}

/** 发布清单（dist/package.json）的生成方式 */
export interface ManifestConfig {
  /**
   * 指定时 `dist/<rootEntry>/index.js` 成为 `"."` 入口，且该文件必须存在（不存在直接抛错）。
   *
   * 不指定时不强求 `"."`：dist 根有 index.js 就指向它，没有就只生成各目录入口。
   */
  rootEntry?: string;
  /**
   * 由宿主提供、不随包安装的依赖**名单**（名单是个决定，必须与构建的 external 对齐）。
   * 版本范围从根 package.json 取（先 peerDependencies 再 dependencies），取不到直接报错。
   */
  peerDependencies?: string[];
  /** 传函数则整体覆盖按目录派生出的 exports */
  exports?: (ctx: ManifestExportsContext) => Record<string, unknown>;
  /** 合并进清单的额外字段（main / module / types 等），在 name/version/type/exports 之后合并 */
  extra?: Record<string, unknown>;
  /** 构建后从仓库根复制进 dist 的文件，默认 ['README.md'] */
  copy?: string[];
}

/** hooks.afterBuild 拿到的上下文 */
export interface AfterBuildContext {
  projectRoot: string;
  distPath: string;
  version: string;
}

/** selfCheck 断言函数：condition 为假即记一条失败 */
export type CheckFn = (name: string, condition: boolean, detail?: string) => void;

export interface HooksConfig {
  /**
   * 构建命令结束、写溯源之前调用。抛错即构建失败，`.build-meta.json` 不会写，
   * 复用 dist 的门禁据此拒绝半成品。
   */
  afterBuild?: (ctx: AfterBuildContext) => void | Promise<void>;
  /** `-a check` 时在通用断言之后调用，拿到同一个 check(name, condition, detail) */
  selfCheck?: (check: CheckFn) => void | Promise<void>;
}

/** 业务仓库写在 publish.config.ts 里的配置 */
export interface PublishConfig {
  /**
   * 发布目标。覆盖优先级：`--registry` > 环境变量 NPM_REGISTRY > 本字段 > 内置默认。
   *
   * 不读 .npmrc：发布目标不该取决于各人机器上的配置。
   */
  registry?: string;
  /** 构建产物目录，也是发布目录，相对仓库根，默认 'dist' */
  distDir?: string;
  build: BuildConfig;
  tags?: TagsConfig;
  git?: GitConfig;
  manifest?: ManifestConfig;
  hooks?: HooksConfig;
}

/** 填完默认值、并记下配置文件位置之后的配置 */
export interface ResolvedConfig {
  /** 配置文件绝对路径 */
  configPath: string;
  /** 配置文件所在目录，即仓库根 */
  projectRoot: string;
  /** 配置文件名，用于报错与日志里的「标签取自 …」 */
  configFile: string;
  registry: string;
  distDir: string;
  build: { command: string[] };
  tags: {
    default: string;
    /**
     * tags.default 是不是配置里显式写的。
     *
     * 「没人声明过、落到内置默认 latest」与「有人明确声明了 latest」在无人值守时不是一回事：
     * 前者值得告警（把包发进默认通道是个该被看见的决定），后者是显式选择。
     */
    defaultDeclared: boolean;
    byBranch: Record<string, string>;
    mainline: string[];
  };
  git: {
    /** tag 名模板，false 表示不打 */
    tag: string | false;
    push: boolean;
    remote: string;
  };
  manifest: {
    rootEntry?: string;
    peerDependencies: string[];
    exports?: (ctx: ManifestExportsContext) => Record<string, unknown>;
    extra: Record<string, unknown>;
    copy: string[];
  };
  hooks: HooksConfig;
}

/** 各操作共用的运行时上下文 */
export interface PublishContext {
  /** 仓库根（配置文件所在目录） */
  projectRoot: string;
  /** 产物目录绝对路径 */
  distPath: string;
  /** 包名，取自根 package.json */
  name: string;
  /** 本次实际使用的 registry */
  registry: string;
  config: ResolvedConfig;
}

/**
 * 配置文件的类型标注入口。只是恒等函数，存在的意义是让编辑器能补全字段。
 */
export const defineConfig = (config: PublishConfig): PublishConfig => config;
