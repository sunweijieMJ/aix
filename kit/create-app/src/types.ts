export type Platform = 'web' | 'mobile';
export type WebScenario = 'standard' | 'admin';
export type QiankunMode = 'none' | 'main' | 'sub';

export type FeatureId =
  | 'i18n'
  | 'permission'
  | 'override'
  | 'qiankun-main'
  | 'qiankun-sub'
  | 'proxy-config'
  | 'lint-suite'
  | 'docker';

/** CLI 的唯一数据源，由问答编排器产出 */
export interface ProjectConfig {
  name: string;
  description: string;
  platform: Platform;
  webScenario?: WebScenario;
  qiankunMode: QiankunMode;
  qiankun?: {
    appName?: string;
    devPort?: number;
    routerMode: 'hash' | 'history';
    subApps?: Array<{ name: string; entry: string; activeRule: string; container: string }>;
  };
  features: FeatureId[];
  deps: {
    ui: 'element-plus' | 'ant-design-vue' | 'vant' | 'nutui' | 'none';
    css: 'scss' | 'unocss' | 'tailwind';
    http: 'axios' | 'ofetch' | 'fetch';
    icons: 'iconify' | 'none';
  };
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
  label: string;
  dirs?: string[];
  files?: string[];
  /** 未选此特性时从 dependencies 移除的包名 */
  deps?: string[];
  /** 未选此特性时从 devDependencies 移除的包名 */
  devDeps?: string[];
  incompatibleWith?: string[];
}

/** 模板配置（.template/config.ts 的 export default，经 Zod 验证后的结构） */
export interface TemplateConfig {
  id: string;
  platform: 'web' | 'mobile';
  /** semver range，用于校验 CLI 与模板的兼容性 */
  compatibleCliVersions: string;
  /** 简单字符串替换，应用于所有文本文件 */
  variables: Record<string, string>;
  features: Record<string, TemplateFeatureDef>;
  /**
   * 需要程序化生成的入口文件
   * key = 输出路径（相对项目根），value = entry-builders 中的 builder 函数名
   */
  entryFiles: Record<string, string>;
}
