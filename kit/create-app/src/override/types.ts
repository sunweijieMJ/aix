/** 模块所属维度；`—` 表示既不参与静态合并也不参与运行时装配（views 只是个目录） */
export type ModuleDimension = '静态' | '运行时' | '—';

/** 单个可定制模块的元数据 */
export interface ModuleDef {
  /** 交互式选择时展示的说明 */
  description: string;
  /** 所属维度 */
  dimension: ModuleDimension;
  /** 必选模块：用户没选也会被补进生成列表 */
  required?: boolean;
  /** 有独立的 eta 模板目录（`templates-override/overrides/<id>/index.ts.eta`） */
  hasDir?: boolean;
}

/**
 * 可定制模块注册表 —— 模块元数据的唯一真源
 *
 * **新增一个模块 = 这里加一行 + `templates-override/overrides/<id>/index.ts.eta` 一个目录。**
 * 这些信息曾按模块平行摊在五张常量表里（ALL_MODULES / REQUIRED_MODULES /
 * MODULE_DESCRIPTIONS / MODULE_DIMENSION，外加 generator.ts 的 MODULE_WITH_DIR），
 * 加个模块要同时摸五处、漏一处就是静默的错行为——下面所有常量现在一律由本表派生。
 *
 * 声明顺序即交互式多选的展示顺序（必选模块在前），改动前先看一眼 prompts.ts。
 */
const MODULES = {
  constants: {
    description: '常量覆盖（角色、菜单、API 码等）',
    dimension: '静态',
    required: true,
    hasDir: true,
  },
  router: {
    description: '路由覆盖（替换、新增、禁用）',
    dimension: '静态',
    required: true,
    hasDir: true,
  },
  // views 没有 eta 模板：生成的是一个空目录（.gitkeep），由 generator.ts 单独处理
  views: { description: '自定义页面组件目录', dimension: '—', required: true },
  api: { description: 'API 配置覆盖（实例注册/替换）', dimension: '运行时', hasDir: true },
  components: { description: '组件覆盖（预埋组件替换）', dimension: '运行时', hasDir: true },
  directives: { description: '指令覆盖（新增/替换全局指令）', dimension: '运行时', hasDir: true },
  layout: { description: '布局覆盖（整体/区域替换）', dimension: '运行时', hasDir: true },
  locale: { description: '国际化覆盖（文案覆盖/新增）', dimension: '运行时', hasDir: true },
  store: { description: '状态覆盖（Pinia action 包装）', dimension: '运行时', hasDir: true },
} satisfies Record<string, ModuleDef>;

/** 可定制的模块 ID（由注册表的键派生，不再手写第二份联合类型） */
export type ModuleId = keyof typeof MODULES;

/**
 * 按 ModuleId 索引的注册表视图
 *
 * `satisfies` 会为每个键各自保留字面量类型，遍历时退化成联合类型——在缺 `required` 的
 * 条目上取 `.required` 会直接报错，所以对外统一暴露宽类型。
 */
export const MODULE_REGISTRY: Record<ModuleId, ModuleDef> = MODULES;

/** 全部可选模块 */
export const ALL_MODULES: ModuleId[] = Object.keys(MODULE_REGISTRY) as ModuleId[];

/** 必选模块（始终生成） */
export const REQUIRED_MODULES: ModuleId[] = ALL_MODULES.filter(
  (id) => MODULE_REGISTRY[id].required,
);

/** 从注册表派生一张按 ModuleId 索引的表 */
function deriveMap<V>(pick: (def: ModuleDef) => V): Record<ModuleId, V> {
  return Object.fromEntries(ALL_MODULES.map((id) => [id, pick(MODULE_REGISTRY[id])])) as Record<
    ModuleId,
    V
  >;
}

/** 模块描述（用于交互式选择） */
export const MODULE_DESCRIPTIONS: Record<ModuleId, string> = deriveMap((def) => def.description);

/** 模块所属维度 */
export const MODULE_DIMENSION: Record<ModuleId, ModuleDimension> = deriveMap(
  (def) => def.dimension,
);

/** 生成选项 */
export interface GenerateOptions {
  /** 项目代码（目录名，如 sysu） */
  project: string;
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

/** Eta 模板上下文（js 模板变体已移除，只发 TypeScript） */
export interface TemplateContext {
  /** 项目代码 (如 'sysu') */
  project: string;
  /** 选中的模块列表 */
  modules: ModuleId[];
}
