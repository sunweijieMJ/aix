// ============ 预设层级 ============

/** 预设层级 */
export type PresetLayer = 'base' | 'framework' | 'domain';

/** 框架层预设 */
export type FrameworkPreset = 'vue3' | 'react' | 'node';

/** 领域层预设 */
export type DomainPreset =
  | 'component-lib'
  | 'admin'
  | 'mobile'
  | 'api-service'
  | 'monorepo'
  | 'team'
  | 'design';

/** 所有预设名称 */
export type PresetName = 'base' | FrameworkPreset | DomainPreset;

// ============ AI 平台 ============

/** 支持的 AI 平台标识 */
export type AIPlatform =
  | 'claude'
  | 'cursor'
  | 'copilot'
  | 'codex'
  | 'windsurf'
  | 'trae'
  | 'tongyi'
  | 'qoder'
  | 'gemini';

// ============ 资源类型 ============

/** 资源类型：规则合并到主文件，agent/command/skill 生成独立文件 */
export type ResourceType = 'rules' | 'agent' | 'command' | 'skill';

// ============ 规则源文件 ============

/** Skill 特有的元数据 */
export interface SkillMeta {
  /** 许可证 */
  license?: string;
  /** 兼容性要求 */
  compatibility?: string;
  /** 作者 */
  author?: string;
  /** 分类 */
  category?: string;
}

/** 规则源文件的 frontmatter 元数据 */
export interface RuleSourceMeta {
  /** 规则唯一标识，如 "base/coding-standards" */
  id: string;
  /** 规则标题 */
  title: string;
  /** 规则描述 */
  description: string;
  /** 所属预设层级 */
  layer: PresetLayer;
  /** 优先级（影响排序和合并顺序） */
  priority: number;
  /** 适用的 AI 平台，空数组表示全平台 */
  platforms: AIPlatform[];
  /** 分类标签 */
  tags: string[];
  /** 规则版本号 */
  version: string;
  /** Handlebars 变量声明 */
  variables?: Record<string, VariableDeclaration>;
  /** 资源类型，默认 'rules' */
  resourceType?: ResourceType;
  /** Skill 特有元数据 */
  skillMeta?: SkillMeta;
}

/** 解析后的规则源文件 */
export interface RuleSource {
  /** frontmatter 元数据 */
  meta: RuleSourceMeta;
  /** Markdown 正文（可含 Handlebars 占位符） */
  content: string;
  /** 源文件绝对路径 */
  filePath: string;
}

/** 变量声明 */
export interface VariableDeclaration {
  /** 默认值 */
  default: string;
  /** 变量描述 */
  description: string;
  /** 是否必填 */
  required?: boolean;
}

// ============ 平台适配器 ============

/** 平台适配器输出的单个文件描述 */
export interface PlatformOutputFile {
  /** 相对于项目根的输出路径 */
  relativePath: string;
  /** 渲染后的完整内容 */
  content: string;
  /** 文件描述（日志用） */
  description: string;
  /** 生成该文件的来源规则 ID 列表 */
  sourceRuleIds?: string[];
}

/** 传给适配器的上下文 */
export interface AdapterContext {
  /** 项目根目录绝对路径 */
  projectRoot: string;
  /** 项目名称 */
  projectName: string;
  /** 模板变量 */
  variables: Record<string, string>;
  /** 选择的框架 */
  framework?: FrameworkPreset;
  /** 选择的领域模块 */
  domains: DomainPreset[];
}

/** 平台适配器接口 */
export interface PlatformAdapter {
  /** 平台标识 */
  readonly platform: AIPlatform;
  /** 平台显示名称 */
  readonly displayName: string;
  /** 该平台支持的资源类型，默认为空（rules 由用户自行维护） */
  readonly supportedResourceTypes?: ResourceType[];

  /**
   * 将合并后的规则内容转化为平台特定文件列表
   */
  generateFiles(
    rules: RuleSource[],
    context: AdapterContext,
  ): PlatformOutputFile[];

  /**
   * 检测项目是否已配置该平台
   */
  detect(projectRoot: string): boolean;
}

// ============ 合并结果 ============

/** 合并后的规则 section */
export interface MergedSection {
  /** section 标题 */
  heading: string;
  /** Markdown 标题级别（2 = ##, 3 = ###） */
  level: number;
  /** 合并后的正文内容 */
  content: string;
  /** 来源规则 ID 列表 */
  sourceRules: string[];
  /** 携带的标签 */
  tags: string[];
}

/** 合并后的预设结果 */
export interface MergedPresetResult {
  /** 按 section 分组的合并内容 */
  sections: MergedSection[];
  /** 参与合并的所有规则 ID */
  ruleIds: string[];
  /** 最终变量上下文 */
  variables: Record<string, string>;
}

// ============ Lock 文件 ============

/** 文件管理状态 */
export type FileStatus = 'managed' | 'modified' | 'ejected';

/** lock 文件中的单条文件记录 */
export interface LockFileEntry {
  /** 内容 SHA-256 hex */
  hash: string;
  /** 来源规则 ID 列表 */
  sourceRules: string[];
  /** 生成时间 */
  generatedAt: string;
  /** 文件状态 */
  status: FileStatus;
}

/** .ai-preset/lock.json 完整结构 */
export interface LockFile {
  /** lock 文件格式版本 */
  version: 1;
  /** 生成时间 */
  generatedAt: string;
  /** CLI 版本 */
  cliVersion: string;
  /** 初始化配置 */
  config: InitConfig;
  /** 文件追踪记录 */
  files: Record<string, LockFileEntry>;
}

// ============ 用户配置 ============

/** 初始化配置 */
export interface InitConfig {
  /** 目标 AI 平台 */
  platforms: AIPlatform[];
  /** 选择的框架 */
  framework?: FrameworkPreset;
  /** 选择的领域模块 */
  domains: DomainPreset[];
  /** 项目名称 */
  projectName: string;
  /** 模板变量 */
  variables: Record<string, string>;
}

/** 用户自定义配置 (.ai-preset/config.json) */
export interface UserConfig {
  /** 排除的规则 ID */
  exclude?: string[];
  /** 追加的自定义规则文件路径 */
  include?: string[];
  /** 变量覆盖 */
  variables?: Record<string, string>;
}

// ============ Doctor 诊断 ============

/** 诊断检查项状态 */
export type CheckStatus = 'pass' | 'warn' | 'fail';

/** 单项诊断结果 */
export interface DoctorCheck {
  /** 检查项名称 */
  name: string;
  /** 检查状态 */
  status: CheckStatus;
  /** 说明信息 */
  message: string;
}

/** 诊断结果 */
export interface DoctorResult {
  /** 是否全部通过 */
  ok: boolean;
  /** 各检查项结果 */
  checks: DoctorCheck[];
}

// ============ 常量 ============

/** ai-preset 管理区域开始标记 */
export const PRESET_MARKER_START = '<!-- ai-preset:start -->';

/** ai-preset 管理区域结束标记 */
export const PRESET_MARKER_END = '<!-- ai-preset:end -->';

/** 配置目录名 */
export const LOCK_DIR = '.ai-preset';

/** lock 文件名 */
export const LOCK_FILENAME = 'lock.json';

/** 用户配置文件名 */
export const CONFIG_FILENAME = 'config.json';

/** 所有支持的 AI 平台 */
export const ALL_PLATFORMS: AIPlatform[] = [
  'claude',
  'cursor',
  'copilot',
  'codex',
  'windsurf',
  'trae',
  'tongyi',
  'qoder',
  'gemini',
];

/** 所有框架预设 */
export const ALL_FRAMEWORKS: FrameworkPreset[] = ['vue3', 'react', 'node'];

/** 所有领域预设 */
export const ALL_DOMAINS: DomainPreset[] = [
  'component-lib',
  'admin',
  'mobile',
  'api-service',
  'monorepo',
  'team',
  'design',
];

/** 领域模块的推荐框架依赖（非强制，仅用于警告提示） */
export const DOMAIN_RECOMMENDED_FRAMEWORK: Partial<
  Record<DomainPreset, FrameworkPreset>
> = {
  'component-lib': 'vue3',
  admin: 'vue3',
  mobile: 'vue3',
  'api-service': 'node',
};

/** 预设名称到目录路径的映射 */
export const PRESET_DIR_MAP: Record<PresetName, string> = {
  base: 'base',
  vue3: 'frameworks/vue3',
  react: 'frameworks/react',
  node: 'frameworks/node',
  'component-lib': 'domains/component-lib',
  admin: 'domains/admin',
  mobile: 'domains/mobile',
  'api-service': 'domains/api-service',
  monorepo: 'domains/monorepo',
  team: 'domains/team',
  design: 'domains/design',
};
