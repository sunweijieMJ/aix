/** 可定制的模块 ID */
export type ModuleId =
  | 'api'
  | 'components'
  | 'constants'
  | 'directives'
  | 'layout'
  | 'locale'
  | 'router'
  | 'store'
  | 'views';

/** 必选模块（始终生成） */
export const REQUIRED_MODULES: ModuleId[] = ['constants', 'router', 'views'];

/** 全部可选模块 */
export const ALL_MODULES: ModuleId[] = [
  'constants',
  'router',
  'views',
  'api',
  'components',
  'directives',
  'layout',
  'locale',
  'store',
];

/** 模块描述（用于交互式选择） */
export const MODULE_DESCRIPTIONS: Record<ModuleId, string> = {
  constants: '常量覆盖（角色、菜单、API 码等）',
  router: '路由覆盖（替换、新增、禁用）',
  views: '自定义页面组件目录',
  api: 'API 配置覆盖（实例注册/替换）',
  components: '组件覆盖（预埋组件替换）',
  directives: '指令覆盖（新增/替换全局指令）',
  layout: '布局覆盖（整体/区域替换）',
  locale: '国际化覆盖（文案覆盖/新增）',
  store: '状态覆盖（Pinia action 包装）',
};

/** 模块所属维度 */
export const MODULE_DIMENSION: Record<ModuleId, '静态' | '运行时' | '—'> = {
  constants: '静态',
  router: '静态',
  views: '—',
  api: '运行时',
  components: '运行时',
  directives: '运行时',
  layout: '运行时',
  locale: '运行时',
  store: '运行时',
};

/** 生成选项 */
export interface GenerateOptions {
  /** 项目代码（目录名，如 sysu） */
  project: string;
  /** 语言 */
  lang: 'ts' | 'js';
  /** 选中的模块列表 */
  modules: ModuleId[];
  /** 输出根目录（默认 src/overrides） */
  output: string;
  /** 跳过确认提示 */
  yes: boolean;
  /** 仅预览，不写入文件 */
  dryRun: boolean;
  /** 强制覆盖已有文件 */
  force: boolean;
}

/** 生成的文件信息 */
export interface GeneratedFile {
  /** 相对于输出目录的路径 */
  path: string;
  /** 文件内容 */
  content: string;
}

/** Eta 模板上下文 */
export interface TemplateContext {
  /** 项目代码 (如 'sysu') */
  project: string;
  /** 选中的模块列表 */
  modules: ModuleId[];
  /** 语言 */
  lang: 'ts' | 'js';
  /** 文件扩展名 ('ts' 或 'js') */
  ext: string;
}
