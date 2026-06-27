import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { FileUtils } from '../utils/file-utils';
import { LoggerUtils } from '../utils/logger';
import type { ExtractedString } from '../utils/types';

/**
 * 单条「拟替换记录」。一条 Hit 对应 ExtractedString 一一映射，只是把对外
 * review 用得着的字段挑出来；transform 阶段的 AST 中间状态（如
 * templateVariables 用于占位符回填）也一并保留，apply 路径要复用。
 *
 * origin 字段是 dry-run 模式的核心 review 信号——告诉用户每个 key 是新生成
 * 还是复用了历史，新增 key 是 review 的重点关注对象。
 */
export interface GeneratePlanHit {
  semanticId: string;
  /** 中文原文（与源码完全一致，含引号/反引号；用于 transform 时精确匹配 AST 节点） */
  original: string;
  /** 占位符规范化后的形态（仅模板字符串有此字段） */
  processedMessage?: string;
  context: ExtractedString['context'];
  templateContext?: ExtractedString['templateContext'];
  componentType: ExtractedString['componentType'];
  line: number;
  column: number;
  isTemplateString?: boolean;
  templateVariables?: string[];
  attributeName?: string;
  /** 命中的 modules.rules 名（未启用 modules 时为空） */
  module?: string;
}

/**
 * 单个源文件的待转换条目。transformedCodeRef 指向 plan 目录下的相对路径，
 * apply 阶段读取该文件作为新的源码内容直接落盘，不重新做 AST 解析——这是
 * dry-run/apply 模式相对于直接重跑 generate 的核心价值：审过的代码不再变化。
 */
export interface GeneratePlanFileEntry {
  /** 源文件相对 rootDir 的 POSIX 路径 */
  file: string;
  /** 拟替换的 hit 列表（数量 = ExtractedString 数）*/
  hits: GeneratePlanHit[];
  /**
   * 该文件 transform 后的代码在 plan 目录中的相对存放位置（如 `sources/views/Login.vue`）。
   * apply 阶段直接读这个文件作为新源码落盘——绕过 AST 解析与 LLM 决策。
   */
  transformedCodeRef: string;
  /** 转换前源文件内容的 SHA-256 指纹，apply 时校验源文件未被外部改过 */
  sourceHash: string;
}

/**
 * generate dry-run 落盘的完整 plan 结构。
 *
 * schemaVersion：未来字段语义变更需要升级；apply 路径在读取时按 schemaVersion
 * 兼容（不识别的版本直接拒绝运行，引导用户重跑 generate）。
 *
 * Why 把 localeDelta 单独列出：apply 阶段直接把这部分合并到 source locale，
 * 不再依赖 ExtractedString 重新计算 message——避免占位符规范化逻辑在
 * dry-run 与 apply 之间漂移。
 */
export interface GeneratePlan {
  schemaVersion: 2;
  command: 'generate';
  finishedAt: string;
  /** 项目根目录（绝对路径），与 ResolvedConfig.root 对应 */
  root: string;
  isCustom: boolean;
  /** 框架类型字面值，与 framework.type 对应（'vue' | 'react' | 其他扩展） */
  framework: string;
  /**
   * 生成 plan 时使用的 @kit/i18n-tools 版本号。
   *
   * Review 时如果发现 plan 由与当前工具明显不同的版本生成，可以选择重跑
   * dry-run 后再 apply，避免因工具行为差异导致非预期 diff。
   */
  toolVersion?: string;
  /**
   * 本次 ID 生成使用的 LLM model 名（如 `gpt-4o-mini` / `deepseek-chat`）。
   *
   * 给 reviewer 的提示信号：不同 model 的 ID 命名风格、规范化程度差异较大；
   * 看到 plan 用的是较弱模型时，reviewer 可以决定是否升级 model 后重跑。
   * 跳过 LLM（本地 ID 兜底）时填 `'local'`。
   */
  llmModel?: string;
  summary: {
    files: number;
    hits: number;
    /** 本轮 plan 中拟新增到 locale 的 key 数（去重后） */
    newKeys: number;
  };
  entries: GeneratePlanFileEntry[];
  /** key → source message，apply 阶段直接合并到 source locale 文件 */
  localeDelta: Record<string, string>;
  /** key → bucket 名，仅启用 buckets 时非空；apply 阶段透传给 LanguageFileManager */
  keyBucketMap?: Record<string, string>;
  /**
   * 影响 locale 落盘形态的配置快照（buckets 开关 / 段分隔符 / 源语种）。
   *
   * 源文件指纹（entries[].sourceHash）只覆盖源码、不覆盖配置：dry-run 与 apply 之间若改了
   * 这些配置，apply 会用 plan 里旧的 keyBucketMap 叠加新配置，写出与 dry-run 预览不一致的
   * locale 形态（桶被开/关、嵌套分隔符变化、源 locale 文件名变化）。apply 时比对并告警。
   * 可选：兼容缺该字段的旧 plan（缺失即跳过比对）。
   */
  outputShape?: {
    bucketsEnabled: boolean;
    separator: string;
    source: string;
  };
}

/**
 * GeneratePlan 落盘 / 回读 / 校验工具。
 *
 * 目录结构（baseDir 形如 `<rootDir>/.i18n-tools/plans/<timestamp>/`）：
 *   plan.json              主 JSON
 *   sources/<relPath>      每个文件 transform 后的完整源码
 *
 * Why 把 transformed 源码与 plan.json 分文件：主 JSON 给人 review 结构，
 * 源码 diff 太长会淹没结构；想看代码就直接对比 sources/ 目录。
 */
export class GeneratePlanWriter {
  /** plan 主文件名，固定。apply 路径通过这个名字寻址 */
  static readonly PLAN_FILENAME = 'plan.json';
  /** transform 后源码的存放子目录 */
  static readonly SOURCES_DIRNAME = 'sources';
  /**
   * `<plansRoot>/.last.json` 记录最近一次 dry-run 写入的 plan 目录绝对路径。
   *
   * Why 用文件而非 symlink：Windows 下创建 symlink 需要管理员权限或开发者
   * 模式，部分企业 IT 策略会禁用；普通 JSON 文件跨平台无障碍。
   *
   * 内容格式：`{ "path": "<absolute plan dir>", "writtenAt": "<ISO>" }`。
   * 用户通过 `--apply-plan latest` 触发 resolveLatest() 读取此文件。
   */
  static readonly LAST_POINTER_FILENAME = '.last.json';

  /**
   * 落盘 plan：写 plan.json + 写每个文件的 transform 后代码到 sources/，
   * 并更新 `<plansRoot>/.last.json` 指向本次目录。
   *
   * @param baseDir   plan 目录（如 `<rootDir>/.i18n-tools/plans/generate-xxx/`）
   * @param plan      plan 主结构
   * @param transformedSources file 相对路径 → transform 后代码内容
   */
  static write(baseDir: string, plan: GeneratePlan, transformedSources: Map<string, string>): void {
    FileUtils.ensureDirectoryExists(baseDir);
    const sourcesDir = path.join(baseDir, this.SOURCES_DIRNAME);
    FileUtils.ensureDirectoryExists(sourcesDir);

    for (const [relPath, code] of transformedSources) {
      const target = path.join(sourcesDir, relPath);
      FileUtils.ensureDirectoryExists(path.dirname(target));
      fs.writeFileSync(target, code, 'utf-8');
    }

    FileUtils.writeJsonFile(path.join(baseDir, this.PLAN_FILENAME), plan);

    // 更新 latest 指针。失败不向上抛错——指针只是便捷功能，主流程不依赖它。
    try {
      const plansRoot = path.dirname(baseDir);
      FileUtils.writeJsonFile(path.join(plansRoot, this.LAST_POINTER_FILENAME), {
        path: baseDir,
        writtenAt: new Date().toISOString(),
      });
    } catch {
      /* 静默吞掉：用户仍可显式传完整路径 */
    }
  }

  /**
   * 从 plan.json 路径读取 plan + 每个 entry 的 transform 后代码。
   *
   * @param planPath plan.json 的绝对路径
   * @returns plan 主结构 + (entry → transform 后代码) 的 Map
   */
  static read(planPath: string): {
    plan: GeneratePlan;
    transformedSources: Map<string, string>;
  } {
    if (!fs.existsSync(planPath)) {
      throw new Error(`Plan 文件不存在：${planPath}`);
    }
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8')) as GeneratePlan;
    if (plan.schemaVersion !== 2) {
      throw new Error(
        `Plan schemaVersion=${plan.schemaVersion} 不受支持。请重新运行 generate --dry-run 生成新版 plan。`,
      );
    }

    const baseDir = path.dirname(planPath);
    const transformedSources = new Map<string, string>();
    for (const entry of plan.entries) {
      const refPath = path.join(baseDir, entry.transformedCodeRef);
      if (!fs.existsSync(refPath)) {
        throw new Error(
          `Plan 引用的转换后源码缺失：${entry.transformedCodeRef}（绝对路径 ${refPath}）。Plan 目录可能不完整。`,
        );
      }
      transformedSources.set(entry.file, fs.readFileSync(refPath, 'utf-8'));
    }

    return { plan, transformedSources };
  }

  /**
   * 校验 plan 中记录的 sourceHash 与当前磁盘文件一致。
   *
   * 返回不一致的文件列表；空数组表示一致，可安全 apply。
   * 不一致意味着 plan 生成后源码被外部修改过——继续 apply 会用 plan 里旧的
   * transform 结果覆盖新内容，产生静默丢失。所以这里只报告差异，由 caller
   * 决定是否中止。
   */
  static verifyFingerprint(plan: GeneratePlan): { mismatched: string[] } {
    const mismatched: string[] = [];
    for (const entry of plan.entries) {
      const abs = path.join(plan.root, entry.file);
      if (!fs.existsSync(abs)) {
        mismatched.push(`${entry.file} (文件不存在)`);
        continue;
      }
      const current = fs.readFileSync(abs, 'utf-8');
      const currentHash = this.sha256(current);
      if (currentHash !== entry.sourceHash) {
        mismatched.push(entry.file);
      }
    }
    return { mismatched };
  }

  /**
   * SHA-256 计算工具（utf-8）。
   * 抽出独立方法是为了 apply 校验与 plan 生成共用一套实现，避免漂移。
   */
  static sha256(text: string): string {
    return crypto.createHash('sha256').update(text, 'utf-8').digest('hex');
  }

  /**
   * 生成 plan 目录名（基于时间戳 + pid，并发运行不会互相覆盖）。
   * Caller 自行决定根目录（一般是 `<rootDir>/.i18n-tools/plans/`）。
   */
  static generateDirName(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `generate-${timestamp}-${process.pid}`;
  }

  /** 默认 plan 根目录：`<rootDir>/.i18n-tools/plans/` */
  static getDefaultPlansRoot(rootDir: string): string {
    return path.join(rootDir, '.i18n-tools', 'plans');
  }

  /** 把绝对路径转换为相对 rootDir 的 POSIX 形式（plan 内部统一格式） */
  static toRelPosix(rootDir: string, absPath: string): string {
    return path.relative(rootDir, absPath).split(path.sep).join('/');
  }

  /** 把 plan 内相对路径解析回绝对路径（适配 windows 反斜杠） */
  static fromRelPosix(rootDir: string, relPosix: string): string {
    return path.join(rootDir, ...relPosix.split('/'));
  }

  /**
   * 解析 `latest` 关键字到具体 plan.json 路径。
   *
   * 优先读 `<plansRoot>/.last.json`；若文件缺失（如指针写失败 / 用户手动删过），
   * 退回到按目录名时间戳排序找最新，保证 latest 关键字在合理状况下都能命中。
   *
   * 返回 null 表示完全没有可 apply 的 plan，由 caller 决定如何提示用户。
   */
  static resolveLatest(plansRoot: string): string | null {
    // 优先级 1：指针文件
    const pointerPath = path.join(plansRoot, this.LAST_POINTER_FILENAME);
    if (fs.existsSync(pointerPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(pointerPath, 'utf-8')) as { path?: string };
        if (data.path && fs.existsSync(data.path)) {
          const planFile = path.join(data.path, this.PLAN_FILENAME);
          if (fs.existsSync(planFile)) return planFile;
        }
      } catch {
        /* 指针损坏 → 回退到目录扫描 */
      }
    }

    // 优先级 2：扫 plans/ 下所有 generate-* 目录，按 mtime 倒序取首个有 plan.json 的
    if (!fs.existsSync(plansRoot)) return null;
    const candidates = fs
      .readdirSync(plansRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('generate-'))
      .map((e) => {
        const abs = path.join(plansRoot, e.name);
        return { abs, mtime: fs.statSync(abs).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    for (const c of candidates) {
      const planFile = path.join(c.abs, this.PLAN_FILENAME);
      if (fs.existsSync(planFile)) return planFile;
    }
    return null;
  }

  /**
   * 删除 plan 目录及其内容（apply 成功后默认清理）。
   *
   * 同时清掉 `.last.json` 中对该目录的引用，避免后续 `apply-plan latest` 解析
   * 到已删除的目录。
   *
   * 失败不抛错——清理只是空间维护，失败时打 warn 即可，不阻塞主流程。
   */
  static cleanup(planDir: string): void {
    try {
      const plansRoot = path.dirname(planDir);
      const pointerPath = path.join(plansRoot, this.LAST_POINTER_FILENAME);
      if (fs.existsSync(pointerPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(pointerPath, 'utf-8')) as { path?: string };
          // 仅在指针指向当前被清理的目录时才删；指向其它 plan 时保留
          if (data.path === planDir) {
            fs.unlinkSync(pointerPath);
          }
        } catch {
          /* 指针损坏：连同损坏的指针一起删，恢复干净状态 */
          try {
            fs.unlinkSync(pointerPath);
          } catch {
            /* 删指针失败也不抛——下次 write 会覆盖 */
          }
        }
      }
      fs.rmSync(planDir, { recursive: true, force: true });
    } catch (error) {
      LoggerUtils.warn(`⚠️  清理 plan 目录失败（已忽略）${planDir}: ${error}`);
    }
  }

  /**
   * 友好的命令行提示：plan 写入完成后告知用户 apply 命令。
   *
   * 抽出独立方法避免在 Processor 里硬编码字符串模板，便于未来调整提示文案
   * （如增加 review 工具集成、链接到文档）时集中改动。
   */
  static logPlanReadyMessage(baseDir: string): void {
    const planPath = path.join(baseDir, this.PLAN_FILENAME);
    LoggerUtils.success('✅ Dry-run 完成，未修改任何源文件');
    LoggerUtils.info(`📋 Plan 已写入: ${planPath}`);
    LoggerUtils.info(`📂 转换后源码:  ${path.join(baseDir, this.SOURCES_DIRNAME)}/`);
    LoggerUtils.info('');
    LoggerUtils.info('💡 Review 后可用以下命令回放：');
    LoggerUtils.info(`   npx i18n-tools --mode generate --apply-plan "${planPath}"`);
  }
}
