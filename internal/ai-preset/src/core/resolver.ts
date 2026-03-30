/**
 * 预设解析与合并引擎
 *
 * 负责加载规则源文件、解析 frontmatter、按层级排序、合并 section
 */

import matter from 'gray-matter';
import { glob } from 'glob';
import path from 'node:path';
import type {
  AIPlatform,
  InitConfig,
  MergedPresetResult,
  MergedSection,
  PresetLayer,
  PresetName,
  ResourceType,
  RuleSource,
  RuleSourceMeta,
  SkillMeta,
  UserConfig,
} from '../types.js';
import { PRESET_DIR_MAP } from '../types.js';
import { readFile } from '../utils/fs.js';

/** 层级优先级（用于排序） */
const LAYER_ORDER: Record<PresetLayer, number> = {
  base: 0,
  framework: 1,
  domain: 2,
};

/**
 * 根据 InitConfig 推导需要加载的预设列表（始终包含 base）
 */
export function resolvePresetNames(config: InitConfig): PresetName[] {
  const names: PresetName[] = ['base'];

  if (config.framework) {
    names.push(config.framework);
  }

  for (const domain of config.domains) {
    if (!names.includes(domain)) {
      names.push(domain);
    }
  }

  return names;
}

/**
 * 扫描并加载指定预设的所有规则源文件
 *
 * @param presetsRootDir - presets/ 根目录绝对路径
 * @param presetNames - 要加载的预设名称列表
 * @param options - 可选参数
 * @param options.include - 用户自定义规则文件路径列表（相对于项目根目录）
 * @param options.projectRoot - 项目根目录（用于解析 include 路径）
 * @param options.exclude - 排除的规则 ID 列表
 * @returns 按 layer + priority 升序排列的 RuleSource[]
 */
export async function loadRuleSources(
  presetsRootDir: string,
  presetNames: PresetName[],
  options?: {
    include?: string[];
    projectRoot?: string;
    exclude?: string[];
  },
): Promise<RuleSource[]> {
  const allSources: RuleSource[] = [];

  for (const name of presetNames) {
    const dir = PRESET_DIR_MAP[name];
    if (!dir) continue;

    const presetDir = path.join(presetsRootDir, dir);
    const files = await glob('**/*.md', {
      cwd: presetDir,
      absolute: true,
      ignore: ['**/_placeholder.md'],
    });

    for (const filePath of files) {
      const raw = await readFile(filePath);
      const source = parseRuleSource(raw, filePath, name);
      if (source) {
        allSources.push(source);
      }
    }
  }

  // 加载用户自定义规则文件（include）
  if (options?.include && options.include.length > 0 && options.projectRoot) {
    for (const includePath of options.include) {
      const absPath = path.resolve(options.projectRoot, includePath);
      try {
        const raw = await readFile(absPath);
        // 先检查原始 frontmatter 是否显式指定了 layer/priority
        const { data: rawMeta } = matter(raw);
        const source = parseRuleSource(raw, absPath, 'base');
        if (source) {
          // 自定义规则默认放在 domain 层级末尾（高优先级）
          // 仅在 frontmatter 未显式指定时覆盖默认值
          if (!rawMeta.layer) {
            source.meta.layer = 'domain';
          }
          if (rawMeta.priority == null) {
            source.meta.priority = 999;
          }
          allSources.push(source);
        }
      } catch {
        // 自定义文件不存在或读取失败，静默跳过
      }
    }
  }

  // 按层级 + 优先级排序
  allSources.sort((a, b) => {
    const layerDiff = LAYER_ORDER[a.meta.layer] - LAYER_ORDER[b.meta.layer];
    if (layerDiff !== 0) return layerDiff;
    return a.meta.priority - b.meta.priority;
  });

  // 应用 exclude 过滤
  if (options?.exclude && options.exclude.length > 0) {
    const excludeSet = new Set(options.exclude);
    return allSources.filter((s) => !excludeSet.has(s.meta.id));
  }

  return allSources;
}

/**
 * 解析单个规则源文件
 */
function parseRuleSource(
  raw: string,
  filePath: string,
  presetName: PresetName,
): RuleSource | null {
  const { data, content } = matter(raw);

  // frontmatter 校验：至少需要 id
  const tags = (data.tags as string[]) || [];

  const meta: RuleSourceMeta = {
    id: (data.id as string) || generateId(filePath, presetName),
    title: (data.title as string) || '',
    description: (data.description as string) || '',
    layer: (data.layer as PresetLayer) || inferLayer(presetName),
    priority: (data.priority as number) ?? 50,
    platforms: (data.platforms as AIPlatform[]) || [],
    tags,
    version: (data.version as string) || '1.0.0',
    variables: data.variables as RuleSourceMeta['variables'],
    resourceType:
      (data.resourceType as ResourceType) || inferResourceType(tags),
    skillMeta: data.skillMeta as SkillMeta | undefined,
  };

  return { meta, content: content.trim(), filePath };
}

/** 从 tags 推断资源类型（fallback） */
function inferResourceType(tags: string[]): ResourceType {
  if (tags.includes('command')) return 'command';
  if (tags.includes('skill')) return 'skill';
  if (tags.includes('agent')) return 'agent';
  return 'rules';
}

/** 从文件路径生成规则 ID */
function generateId(filePath: string, presetName: PresetName): string {
  const basename = path.basename(filePath, '.md');
  return `${presetName}/${basename}`;
}

/** 从预设名推断层级 */
function inferLayer(name: PresetName): PresetLayer {
  if (name === 'base') return 'base';
  if (['vue3', 'react', 'node'].includes(name)) return 'framework';
  return 'domain';
}

/**
 * 过滤规则源：按 exclude 和目标平台过滤
 *
 * 各命令在传给适配器之前应调用此函数
 */
export function filterRulesForPlatform(
  sources: RuleSource[],
  targetPlatform: AIPlatform,
  userConfig?: UserConfig,
): RuleSource[] {
  const excludeSet = new Set(userConfig?.exclude ?? []);

  return sources.filter((s) => {
    if (excludeSet.has(s.meta.id)) return false;

    if (
      s.meta.platforms.length > 0 &&
      !s.meta.platforms.includes(targetPlatform)
    ) {
      return false;
    }

    return true;
  });
}

/**
 * 合并规则源为统一结果
 *
 * 处理流程：
 * 1. 按 exclude 列表过滤
 * 2. 按目标平台过滤
 * 3. 每个 source 作为独立 section（不做 heading 合并，保持清晰的模块边界）
 */
export function mergeRuleSources(
  sources: RuleSource[],
  userConfig: UserConfig,
  targetPlatforms: AIPlatform[],
): MergedPresetResult {
  const excludeSet = new Set(userConfig.exclude ?? []);

  // 过滤
  const filtered = sources.filter((s) => {
    // 排除用户 exclude 的规则
    if (excludeSet.has(s.meta.id)) return false;

    // 平台过滤：空数组表示全平台，否则需要与目标平台有交集
    if (s.meta.platforms.length > 0) {
      const hasIntersection = s.meta.platforms.some((p) =>
        targetPlatforms.includes(p),
      );
      if (!hasIntersection) return false;
    }

    return true;
  });

  // 每个规则源作为一个独立的 section
  const sections: MergedSection[] = filtered.map((source) => ({
    heading: source.meta.title || source.meta.id,
    level: 2,
    content: source.content,
    sourceRules: [source.meta.id],
    tags: source.meta.tags,
  }));

  // 收集所有变量声明
  const variables: Record<string, string> = {};
  for (const source of filtered) {
    if (source.meta.variables) {
      for (const [key, decl] of Object.entries(source.meta.variables)) {
        // 后加载的覆盖先加载的（domain > framework > base）
        variables[key] = decl.default;
      }
    }
  }

  // 用户 override 最优先
  if (userConfig.variables) {
    Object.assign(variables, userConfig.variables);
  }

  return {
    sections,
    ruleIds: filtered.map((s) => s.meta.id),
    variables,
  };
}
