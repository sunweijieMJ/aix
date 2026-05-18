import fs from 'fs';
import path from 'path';
import { FileUtils } from './file-utils';

/**
 * 失败发生的阶段（与三个 Processor 内已有的失败分支一一对应）：
 * - transform：Generate 的 AST 转换失败
 * - write：    Generate 的源码写盘失败
 * - translate：Translate 的批次翻译失败
 * - restore：  Restore 的单文件还原失败
 */
export type FailureStage = 'transform' | 'write' | 'translate' | 'restore';

/**
 * 落盘的失败记录条目。
 *
 * 错误字段只保留 `name + message`，与 LoggerUtils.error 的安全策略一致：
 * OpenAI / Axios 等 SDK 抛出的对象可能在序列化时带出 URL token / Authorization
 * header，不能整对象写盘。`stack` 同样不落盘——一旦后续需要保留 stack 可单独
 * 加一个 `--debug` 开关，但首版不引入这条风险面。
 */
export interface FailureRecord {
  stage: FailureStage;
  file?: string;
  batchIndex?: number;
  keys?: string[];
  error: {
    name: string;
    message: string;
  };
}

/**
 * 「需要人工处理」的结构化条目分类。
 *
 * 工具主动放弃自动化处理的场景需要给用户一份清单，附「为什么放弃 + 推荐改写
 * 模式」，比单纯抛 console.warn 更可操作。category 用枚举字符串，便于报告聚合
 * 与未来 doctor 自动归并：
 *
 * - comparison-operand   `xxx === '中文'` 比较操作数（运行时切语言后分支永远不命中）
 * - mixed-content        混合内容字符串（中英符号交错，无法机械拆分）
 * - html-in-template     源码模板字符串含 HTML 标签（含拼装结构）
 * - html-tag-in-value    locale value 已含 HTML 标签（运行时 innerHTML = t()）
 * - long-value           locale value 超长（建议拆分）
 * - semantic-duplicate   语义重复 key（占位符变量名/空白差异）
 * - cross-module-reuse   跨模块复用候选（同一 value 多前缀使用）
 * - hardcoded-comparison 硬编码中文与已 i18n 文案比较（脱钩风险）
 */
export type ManualCategory =
  | 'comparison-operand'
  | 'mixed-content'
  | 'html-in-template'
  | 'html-tag-in-value'
  | 'long-value'
  | 'semantic-duplicate'
  | 'cross-module-reuse'
  | 'hardcoded-comparison';

/**
 * 单条「需要人工处理」记录。结构尽量贴合 IDE 跳转所需信息（file:line:column），
 * suggestion 给一个可拷贝的改写模板，避免用户每次都得查文档。
 */
export interface ManualEntry {
  category: ManualCategory;
  /** 相对 rootDir 的路径；locale 级问题（无具体源文件）允许填 '<locale>' 等占位 */
  file: string;
  line?: number;
  column?: number;
  /** 原文 / locale key 等定位字符串 */
  text: string;
  /** 一句话「为什么本工具没有自动处理」 */
  reason: string;
  /** 推荐修复模板（多行字符串，含 ❌/✅ 对照） */
  suggestion?: string;
}

/**
 * generate 流程的覆盖率指标。统一以「中文片段」为单位（避免按文件/按 key 维度
 * 在不同口径间来回换算）。
 *
 * 计算口径：
 *   totalChineseSegments = alreadyI18n + newlyGenerated + skipped
 *   coverageRate         = (alreadyI18n + newlyGenerated) / totalChineseSegments
 *
 * 其中 skipped 包含被 needsManual 各 category 拒收的、以及命中黑名单（注释、
 * console、import、type literal 等）的中文。当 totalChineseSegments = 0 时
 * coverageRate 返回 1（无内容默认视为完全覆盖，避免 NaN）。
 */
export interface CoverageMetric {
  scannedFiles: number;
  totalChineseSegments: number;
  alreadyI18n: number;
  newlyGenerated: number;
  skipped: number;
  coverageRate: number;
}

/**
 * 单次运行的失败 / 警告收集器。
 *
 * 设计原则：
 * 1. 出现失败或警告即写盘；都没有时返回 null，不产生空文件。
 * 2. 落盘位置：`<rootDir>/.i18n-tools/logs/`。
 *
 *    放在 `.i18n-tools/logs/` 对齐 .next/ / .turbo/ / .vite/ 等工具的根目录
 *    自有命名空间约定：用户在项目根一眼能找到，grep / 分享 / CI artifact 上传
 *    都方便。首次落盘时自动写一份 `.i18n-tools/.gitignore`（内容 `*`）保持
 *    自包含——不侵入业务的根 `.gitignore`，也避免日志意外入库。
 *
 * 3. 错误字段统一走 safe-extract，避免泄露凭据。
 * 4. 文件名带时间戳 + command + pid，避免并发运行互相覆盖。
 */
export class RunReport {
  private failures: FailureRecord[] = [];
  private warnings: string[] = [];
  private needsManual: ManualEntry[] = [];
  private coverage?: CoverageMetric;

  constructor(
    private readonly command: string,
    private readonly rootDir: string,
  ) {}

  addFailure(record: Omit<FailureRecord, 'error'> & { error: unknown }): void {
    this.failures.push({
      ...record,
      error: RunReport.safeExtractError(record.error),
    });
  }

  addWarning(message: string): void {
    this.warnings.push(message);
  }

  /**
   * 追加一条「需要人工处理」记录。重复定位（file:line:column:text）会被去重，
   * 避免同一位置被多次扫描重复入库。
   */
  addManualEntry(entry: ManualEntry): void {
    const key = `${entry.file}:${entry.line ?? ''}:${entry.column ?? ''}:${entry.category}:${entry.text}`;
    if (!this.needsManual.some((e) => RunReport.manualKey(e) === key)) {
      this.needsManual.push(entry);
    }
  }

  /** 批量追加，便于 extractor / linter 一次性 drain。 */
  addManualEntries(entries: ManualEntry[]): void {
    for (const entry of entries) this.addManualEntry(entry);
  }

  /** 设置覆盖率指标。重复调用以最后一次为准（generate 末尾一次性写入）。 */
  setCoverage(metric: CoverageMetric): void {
    this.coverage = metric;
  }

  getCoverage(): CoverageMetric | undefined {
    return this.coverage;
  }

  /** 按 category 分组聚合，供 summary 渲染。 */
  groupManualByCategory(): Record<string, ManualEntry[]> {
    const groups: Record<string, ManualEntry[]> = {};
    for (const e of this.needsManual) {
      (groups[e.category] ||= []).push(e);
    }
    return groups;
  }

  hasFailures(): boolean {
    return this.failures.length > 0;
  }

  hasWarnings(): boolean {
    return this.warnings.length > 0;
  }

  hasManualEntries(): boolean {
    return this.needsManual.length > 0;
  }

  private static manualKey(e: ManualEntry): string {
    return `${e.file}:${e.line ?? ''}:${e.column ?? ''}:${e.category}:${e.text}`;
  }

  /**
   * 保留的日志文件数上限。超过此数的旧 logs/run-*.json 会按 mtime 倒序清理。
   *
   * 选 20 而非"按天数滚动"：
   *  - 单文件体积小（KB 级），20 个总占用可忽略
   *  - 按天数需要解析文件名时间戳，更复杂
   *  - 用户日常排查通常只看最近几次，20 个对"上周那次失败"也够用
   * 用户需要全部历史时可关闭——但目前没暴露成配置，YAGNI。
   */
  private static readonly LOGS_RETENTION_COUNT = 20;

  /**
   * 写入诊断报告到磁盘，返回绝对路径；无失败 + 无警告 + 无人工待办时返回 null。
   * 写入失败不向上抛错——日志体系不应放大主流程的错误面。
   *
   * 覆盖率指标不会单独触发落盘：用户在控制台看到 summary 已经够用，避免成功
   * 路径每次都产 logs（与原"零产物"语义保持一致）；但只要有 failure/warning/
   * needsManual 任一存在，落盘 payload 会顺便带上 coverage 作为上下文。
   *
   * 写入成功后会按 mtime 倒序裁剪 logs/，保留最近 LOGS_RETENTION_COUNT 个。
   */
  flush(): string | null {
    if (!this.hasFailures() && !this.hasWarnings() && !this.hasManualEntries()) return null;
    try {
      const baseDir = path.join(this.rootDir, '.i18n-tools');
      const logsDir = path.join(baseDir, 'logs');
      // 写 self-contained .gitignore，确保整个 .i18n-tools/ 不被业务侧无意中
      // 提交。幂等：已存在则跳过，避免每次跑都改 mtime 触发其他工具的 watcher。
      RunReport.ensureGitignore(baseDir);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = path.join(logsDir, `run-${timestamp}-${this.command}-${process.pid}.json`);
      const payload = {
        command: this.command,
        finishedAt: new Date().toISOString(),
        rootDir: this.rootDir,
        summary: {
          failed: this.failures.length,
          warnings: this.warnings.length,
          needsManual: this.needsManual.length,
        },
        coverage: this.coverage,
        failures: this.failures,
        warnings: this.warnings,
        needsManual: this.needsManual,
      };
      FileUtils.writeJsonFile(filePath, payload);
      RunReport.pruneOldLogs(logsDir);
      return filePath;
    } catch {
      // 写报告本身失败不应破坏主流程；调用方已经通过 console 看到原始错误，
      // 这里再吞掉即可。
      return null;
    }
  }

  /**
   * 按 mtime 倒序保留最近 LOGS_RETENTION_COUNT 个 `run-*.json`，删除其余。
   *
   * 仅清理符合命名规则的文件（`run-*.json`），不动其它内容——给用户在 logs/
   * 下放自己笔记 / 临时文件留余地。
   *
   * 清理本身失败不抛错：只是空间维护，主流程已经落盘成功。
   */
  private static pruneOldLogs(logsDir: string): void {
    try {
      const entries = fs
        .readdirSync(logsDir, { withFileTypes: true })
        .filter((e) => e.isFile() && /^run-.*\.json$/.test(e.name))
        .map((e) => {
          const abs = path.join(logsDir, e.name);
          return { abs, mtime: fs.statSync(abs).mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);

      for (const stale of entries.slice(this.LOGS_RETENTION_COUNT)) {
        try {
          fs.unlinkSync(stale.abs);
        } catch {
          /* 单个删除失败不影响其他 */
        }
      }
    } catch {
      /* 列目录失败：logs/ 不存在或无权限，都不影响主流程 */
    }
  }

  /**
   * 在 `.i18n-tools/` 写一份 `.gitignore`（内容 `*`），让整个目录自动被忽略。
   *
   * 已存在时不覆盖：用户可能微调过（例如临时取消忽略某次报告），尊重既有内容；
   * 同时避免每次运行都改 mtime 触发 IDE / watcher 重渲染。
   */
  private static ensureGitignore(baseDir: string): void {
    try {
      fs.mkdirSync(baseDir, { recursive: true });
      const giPath = path.join(baseDir, '.gitignore');
      if (!fs.existsSync(giPath)) {
        fs.writeFileSync(giPath, '*\n', 'utf-8');
      }
    } catch {
      // gitignore 写失败不应阻断主流程；最坏情况是用户看到未提交的 logs/。
    }
  }

  /**
   * 每个 ManualCategory 的标题（中文展示用）与默认建议模板。
   *
   * 建议模板用 ❌/✅ 对照风格，方便用户直接照搬。多行字符串遵守缩进对齐，
   * 不要随便改格式——它们最终会原样进入 JSON 报告与控制台输出。
   *
   * 这些是「兜底建议」：具体 ManualEntry 可以在 suggestion 字段写更针对性的
   * 修复模板，覆盖默认值。
   */
  static readonly MANUAL_LABELS: Record<ManualCategory, string> = {
    'comparison-operand': '比较运算符跳过的中文字面量',
    'mixed-content': '混合内容字符串（无法机械拆分）',
    'html-in-template': '模板字符串含 HTML 标签',
    'html-tag-in-value': 'locale value 含 HTML 标签',
    'long-value': 'locale value 过长',
    'semantic-duplicate': '语义重复 key（占位符/空白差异）',
    'cross-module-reuse': '跨模块复用候选',
    'hardcoded-comparison': '硬编码中文 ↔ i18n 文案脱钩风险',
  };

  static readonly MANUAL_DEFAULT_SUGGESTIONS: Record<ManualCategory, string> = {
    'comparison-operand': `❌  if (status === '进行中') { ... }    // 翻译后分支失效
✅  改用枚举常量 / key 比较 / 索引比较：
    const STATUS = { running: 'running' };
    if (status === STATUS.running) { ... }`,
    'mixed-content': `混合内容（中英符号交错），工具无法机械拆分翻译粒度。
建议手工决定拆分点，或在 locale 文件新增完整 key 由人工翻译：
    'AI自动提取'    →  整段作为 key 翻译，或拆为 'AI' + '自动提取'
    'TCP/IP协议'    →  保留为整段
    '请输入\${name}' →  原工具已支持，确认占位符变量名规范`,
    'html-in-template': `模板字符串含 HTML 标签（如 \`<div>...<span>中文</span></div>\`）。
整段提取会把 HTML/CSS/SVG 写进 locale value，多语言下样式不可控。
建议改造源码：模板字符串包裹结构，只把文案放入 t() 调用：
    ❌  innerHTML = \`<span class="x">\${title}</span>\`
    ✅  innerHTML = \`<span class="x">\${t('xxx')}</span>\``,
    'html-tag-in-value': `locale value 已经混入了 HTML 标签，翻译质量难保证。
处理方式同 html-in-template：把样式结构留在源码模板，t() 只包文案。`,
    'long-value': `locale value 超过 200 字符。长文本翻译质量差且不便维护。
建议拆分为多个语义化 key（按段落 / 句子），或者用 i18n 复合插值组装。`,
    'semantic-duplicate': `多个 key 对应同一句中文（占位符变量名或空白差异）。
不自动合并是因为 vue-i18n / react-intl 按 named placeholder 名匹配，
合并需同步改 call site 发射代码，风险较大。
建议在源码中统一变量名 / 空白，重跑 generate 即可自动复用同一 key。`,
    'cross-module-reuse': `同一 value 在 ≥ 3 个不同目录前缀下都被使用，可以提升到 common。
在 i18n.config 启用：
    idPrefix: { promoteToCommon: { threshold: 3, namespace: 'common' } }
让新增使用点自动归入 common namespace。`,
    'hardcoded-comparison': `比较运算符两侧字面量不会被提取（避免破坏分支判断），
但同句中文若在别处（如数组初值 / ref 默认值）被提取为 t(...)，
运行时切语言后比较一定为假。建议改用 key 比较 / 索引比较 / 枚举常量：
    ❌  v-if="activeTab === '教学路径'"
    ✅  v-if="activeTabKey === 'teachingpath'"  或  v-if="activeIdx === 0"`,
  };

  private static safeExtractError(error: unknown): FailureRecord['error'] {
    if (error instanceof Error) {
      return { name: error.name, message: error.message };
    }
    if (typeof error === 'string') {
      return { name: 'StringError', message: error };
    }
    return { name: 'NonError', message: Object.prototype.toString.call(error) };
  }
}
