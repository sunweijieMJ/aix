import fs from 'fs';
import path from 'path';
import type { ResolvedConfig } from '../config';
import type { FrameworkAdapter } from '../adapters';
import { formatWithPrettier } from '../utils/command-utils';
import { FileUtils } from '../utils/file-utils';
import { LoggerUtils } from '../utils/logger';
import type { LocaleMap } from '../utils/types';
import { BaseProcessor } from './BaseProcessor';
import { ensureDirectoryExists } from '../utils/json-io';

interface RestoreOptions {
  sourceDir: string;
  outputDir: string;
  overwrite: boolean;
  dryRun: boolean;
}

/** 单文件还原结果；dry-run 用它把「将还原多少」汇总出来，落盘路径只关心 modified。 */
interface FileRestoreResult {
  modified: boolean;
  /** 本文件将被还原的 i18n 调用点数（源码与还原结果的调用点数之差） */
  restoredCalls: number;
  /** 本文件将被清理掉的 import / i18n hook 声明行（原样文本，供预览点名） */
  removedDeclarations: string[];
}

/**
 * dry-run 预览里要点名的「工具注入声明」：import 语句，以及从 i18n hook 解构出 t 的声明。
 * 只用于**预览文案**，不参与还原本身的判定——还原结果始终以 transformer 输出为准。
 */
const DECLARATION_LINE_PATTERN =
  /^\s*(?:import\b|(?:const|let|var)\b[^;]*\buse[A-Za-z]*(?:I18n|Intl|Translation)\s*\()/;

/**
 * i18n 调用点的粗粒度形态：`t(` / `$t(`（排除 `xxx.t(` 这类成员访问误命中）与
 * `.formatMessage(`。仅用于 dry-run 计数，宁可粗略也不引入第二套 AST 解析。
 */
const I18N_CALL_PATTERN = /(?<![\w$.])\$?t\s*\(|\.formatMessage\s*\(/g;

/**
 * 还原处理器
 * 负责将国际化代码还原为原始文本
 */
export class RestoreProcessor extends BaseProcessor {
  /**
   * @param config - 已解析的配置
   * @param isCustom - 是否为定制目录
   * @param adapter - 可选的框架适配器，未提供则按 config.framework 自动构建
   */
  constructor(config: ResolvedConfig, isCustom: boolean = false, adapter?: FrameworkAdapter) {
    super(config, isCustom, adapter);
  }

  protected getOperationName(): string {
    return '还原';
  }

  /**
   * @param overwrite - true 就地改写源文件；false（默认）写到 outputDir 副本
   * @param opts.dryRun - 只在内存中完成还原并逐文件报告，不写任何文件（含不建输出目录）
   */
  async execute(
    targets: string[] = [],
    outputDir?: string,
    overwrite: boolean = false,
    opts: { dryRun?: boolean } = {},
  ): Promise<void> {
    return this.executeWithLifecycle(() =>
      this._execute(targets, outputDir, overwrite, Boolean(opts.dryRun)),
    );
  }

  private async _execute(
    targets: string[] = [],
    outputDir?: string,
    overwrite: boolean = false,
    dryRun: boolean = false,
  ): Promise<void> {
    const options: RestoreOptions = {
      sourceDir: this.config.root,
      outputDir: outputDir || path.join(this.config.root, 'restored'),
      overwrite,
      dryRun,
    };

    const targetFiles = targets.length > 0 ? await this.resolveTargetFiles(targets) : undefined;
    await this.restoreFiles(options, targetFiles);
  }

  private async resolveTargetFiles(targets: string[]): Promise<string[]> {
    const files: string[] = [];
    const unresolved: string[] = [];

    for (const target of targets) {
      try {
        const resolvedTarget = path.resolve(target);
        const stat = fs.statSync(resolvedTarget);

        if (stat.isFile()) {
          files.push(resolvedTarget);
        } else if (stat.isDirectory()) {
          files.push(
            ...FileUtils.getFrameworkFiles(
              resolvedTarget,
              this.adapter.getSupportedExtensions(),
              this.config.io.exclude,
              this.config.io.include,
              this.config.root,
            ),
          );
        }
      } catch (error) {
        // 显式指定的 target 路径不存在 / 不可访问（如拼错文件名）。绝不能静默吞掉：
        // 否则返回空集合，restoreFiles 走「没有找到需要处理的文件」早退、进程 exit 0，
        // CI 会把「restore 目标拼错」误判为成功。计入失败收集器并在循环后硬失败，
        // 与本类对处理失败 throw 非零退出的口径一致。
        LoggerUtils.error(`无法解析目标: ${target}`, error);
        unresolved.push(target);
        this.report.addFailure({ stage: 'restore', file: target, error });
      }
    }

    if (unresolved.length > 0) {
      throw new Error(
        `${unresolved.length} 个还原目标无法解析（路径不存在或不可访问）：${unresolved.join(', ')}`,
      );
    }

    return files;
  }

  private async restoreFiles(options: RestoreOptions, targetFiles?: string[]): Promise<void> {
    try {
      const localeMap = this.loadLocaleMap();
      if (Object.keys(localeMap).length === 0) {
        // 此处只会是「真正为空」：解析失败已在 loadLocaleMap 抛错中止，不会落到这里。
        LoggerUtils.warn('语言文件为空，无可还原条目');
        return;
      }

      LoggerUtils.info(`📖 加载了 ${Object.keys(localeMap).length} 个语言条目`);

      let filesToProcess: string[];
      if (targetFiles !== undefined) {
        // 用户显式指定了 target：即便解析为空（typo / 不存在的路径 / 空目录），也只处理这个
        // （空）集合，绝不回退到全量扫描。否则 `restore <typo>` 会静默扫描整个 config.root，
        // 配合 overwrite 就地改写整个项目——与用户「只还原这几个文件」的意图完全相反。
        // 空集合由下方 `filesToProcess.length === 0` 早退分支优雅处理。
        filesToProcess = targetFiles;
      } else {
        filesToProcess = FileUtils.getFrameworkFiles(
          options.sourceDir,
          this.adapter.getSupportedExtensions(),
          this.config.io.exclude,
          this.config.io.include,
          this.config.root,
        );
      }

      // 默认 outputDir（`<root>/restored/`）就落在扫描根内：二次全量 restore 会把上一次的
      // 还原副本当成源文件再处理一遍，产出 restored/restored/… 套娃。故非 overwrite 模式下
      // 按 resolved 前缀剔除输出目录内的文件（overwrite 模式不使用 outputDir，无此风险）。
      if (!options.overwrite) {
        const outputRoot = path.resolve(options.outputDir);
        const kept = filesToProcess.filter((file) => {
          const resolved = path.resolve(file);
          return resolved !== outputRoot && !resolved.startsWith(outputRoot + path.sep);
        });
        const excluded = filesToProcess.length - kept.length;
        if (excluded > 0) {
          // 不静默：排除数为全部时下方会走「没有找到需要处理的文件」早退，用户需要知道原因。
          LoggerUtils.warn(
            `⚠️  已排除 ${excluded} 个位于输出目录内的文件（${FileUtils.getRelativePath(options.outputDir)}），避免把上次还原产物再还原一遍`,
          );
        }
        filesToProcess = kept;
      }

      const frameworkName = this.adapter.getDisplayName();
      LoggerUtils.info(`📁 找到 ${filesToProcess.length} 个${frameworkName}文件待处理`);

      if (filesToProcess.length === 0) {
        LoggerUtils.info('✅ 没有找到需要处理的文件');
        return;
      }

      // 仅非 overwrite 模式才需要输出目录：overwrite 就地改写原文件、根本不读 options.outputDir，
      // 无条件创建会在每次 `--overwrite` 后凭空留下一个空 `restored/`。
      // dry-run 承诺「零写盘」，连输出目录都不能建。
      if (!options.overwrite && !options.dryRun) {
        ensureDirectoryExists(options.outputDir);
      }

      let processedCount = 0;
      let modifiedCount = 0;
      let restoredCallCount = 0;
      let removedDeclarationCount = 0;
      const failedFiles: string[] = [];

      for (const filePath of filesToProcess) {
        try {
          let outputPath: string;
          if (options.overwrite) {
            outputPath = filePath;
          } else {
            const relative = path.relative(options.sourceDir, filePath);
            // 防御：显式传入 sourceDir 之外的 target 时，path.relative 产出 `../..`，
            // join 后会逃逸 outputDir、把内容写到目标目录之外。拒绝此类文件（计入
            // failedFiles，非零退出），而非静默写到非预期位置。
            if (relative.startsWith('..') || path.isAbsolute(relative)) {
              throw new Error(
                `目标文件位于源目录之外，非 overwrite 模式无法安全映射到输出目录：${filePath}`,
              );
            }
            outputPath = path.join(options.outputDir, relative);
          }

          const result = await this.processFile(filePath, localeMap, options, outputPath);
          processedCount++;
          if (result.modified) {
            modifiedCount++;
            restoredCallCount += result.restoredCalls;
            removedDeclarationCount += result.removedDeclarations.length;
          }

          if (processedCount % 10 === 0) {
            LoggerUtils.info(`📈 进度: ${processedCount}/${filesToProcess.length} 文件已处理`);
          }
        } catch (error) {
          // processFile 刻意不吞错（见其内部注释），AST / IO 异常一律逃逸到这里，
          // 逐个计入 failedFiles，最终统一以非零退出码上抛。绝不 silent skip——
          // 否则 CI 会把"几乎全部失败"误判为成功。
          failedFiles.push(filePath);
          LoggerUtils.error(`处理文件失败: ${FileUtils.getRelativePath(filePath)}`, error);
          this.report.addFailure({
            stage: 'restore',
            file: FileUtils.getRelativePath(filePath),
            error,
          });
        }
      }

      LoggerUtils.success(`\n✅ 处理完成！`);
      LoggerUtils.info(`📊 总计处理: ${processedCount} 个文件`);
      LoggerUtils.info(`📊 ${options.dryRun ? '将修改' : '已修改'}: ${modifiedCount} 个文件`);
      if (options.dryRun) {
        LoggerUtils.info(`📊 将还原调用点: ${restoredCallCount} 处`);
        LoggerUtils.info(`📊 将清理声明: ${removedDeclarationCount} 行`);
        LoggerUtils.warn('🔍 dry-run：以上仅为预览，未写入任何文件（也未创建输出目录）');
      }
      if (failedFiles.length > 0) {
        LoggerUtils.error(`📊 处理失败: ${failedFiles.length} 个文件`);
      }

      if (!options.overwrite && !options.dryRun && modifiedCount > 0) {
        LoggerUtils.info(`📂 输出目录: ${options.outputDir}`);
      }

      if (failedFiles.length > 0) {
        throw new Error(`${failedFiles.length} 个文件还原失败，请检查上方日志`);
      }
    } catch (error) {
      LoggerUtils.error('还原过程中发生错误:', error);
      throw error;
    }
  }

  private loadLocaleMap(): LocaleMap {
    const sourceLocale = this.config.locales.source;
    // 损坏守卫：restore 仅读 source locale（target 不参与还原），故只校验 source。
    // 否则损坏的 source locale 会被下游 `length === 0` 误判为「空」→ restore 静默 no-op
    // 且打印成功（exit 0），用户以为已还原、实则源码原封未动。
    // 探测口径（桶式 / 遗留单文件 / 单文件）统一收口于 findCorruptLocale。
    this.langFiles.assertLocalesNotCorrupt([sourceLocale], {
      checkLegacy: true,
      buildMessage: (locale, file) =>
        `源 locale「${locale}」解析失败：${file}，已中止还原以防误判为空而跳过。请先修复 JSON 格式。`,
    });
    // 守卫已确保非损坏，readLocaleFile 不会返回 null（仅「不存在/空 → {}」或解析结果）。
    return this.langFiles.readLocaleFile(sourceLocale) ?? {};
  }

  /**
   * 对比源码与还原结果，给出 dry-run 预览用的粗粒度摘要。
   *
   * 只做文本层面的对账（调用点计数 + 消失的声明行），不复用 AST：还原本身已由
   * transformer 完成，这里的数字仅服务于"用户在落盘前想知道会发生什么"。
   */
  private static summarizeRestore(
    source: string,
    transformed: string,
  ): Pick<FileRestoreResult, 'restoredCalls' | 'removedDeclarations'> {
    const countCalls = (text: string): number => (text.match(I18N_CALL_PATTERN) ?? []).length;
    const restoredCalls = Math.max(0, countCalls(source) - countCalls(transformed));

    // 用多重集合抵消：同一行文本出现多次时，只把「净减少」的那几行算作被清理。
    const remaining = new Map<string, number>();
    for (const line of transformed.split('\n')) {
      const key = line.trim();
      remaining.set(key, (remaining.get(key) ?? 0) + 1);
    }
    const removedDeclarations: string[] = [];
    for (const line of source.split('\n')) {
      const key = line.trim();
      const left = remaining.get(key) ?? 0;
      if (left > 0) {
        remaining.set(key, left - 1);
        continue;
      }
      if (DECLARATION_LINE_PATTERN.test(line)) removedDeclarations.push(key);
    }

    return { restoredCalls, removedDeclarations };
  }

  private async processFile(
    filePath: string,
    localeMap: LocaleMap,
    options: RestoreOptions,
    outputPath?: string,
  ): Promise<FileRestoreResult> {
    const actualOutputPath = outputPath || filePath;

    // 不吞错：让异常向上传播到 restoreFiles 的循环处理器，由其计入 failedFiles 并最终
    // 非零退出。内部 return false 与上层 continue 的双重静默会让 CI 把"全部失败"显示为成功。
    const restoreTransformer = this.adapter.getRestoreTransformer();
    const sourceText = fs.readFileSync(filePath, 'utf-8');
    // 复用已读取的 sourceText，避免 transform 内对同一文件二次读盘（接口已与 ITransformer 对齐）。
    const transformedCode = restoreTransformer.transform(filePath, localeMap, sourceText);

    if (transformedCode === sourceText) {
      LoggerUtils.info(`⚪ 跳过: ${FileUtils.getRelativePath(filePath)} (无需修改)`);
      return { modified: false, restoredCalls: 0, removedDeclarations: [] };
    }

    const summary = RestoreProcessor.summarizeRestore(sourceText, transformedCode);

    // dry-run 在落盘前短路：转换已在内存完成，只报告不写盘。
    if (options.dryRun) {
      const declSuffix =
        summary.removedDeclarations.length > 0
          ? `，清理 ${summary.removedDeclarations.length} 行 import/hook 声明`
          : '';
      LoggerUtils.info(
        `🔍 将还原: ${FileUtils.getRelativePath(filePath)}（${summary.restoredCalls} 处调用${declSuffix}）`,
      );
      for (const decl of summary.removedDeclarations) {
        LoggerUtils.info(`     - ${decl}`);
      }
      return { modified: true, ...summary };
    }

    ensureDirectoryExists(path.dirname(actualOutputPath));
    fs.writeFileSync(actualOutputPath, transformedCode, 'utf-8');

    if (this.config.io.prettify) {
      try {
        // 格式化失败不算文件还原失败：源已写盘且语义正确，仅美观问题。
        await formatWithPrettier(actualOutputPath);
      } catch (error) {
        LoggerUtils.error(
          `格式化失败，但文件已保存: ${FileUtils.getRelativePath(actualOutputPath)}`,
          error,
        );
      }
    }

    LoggerUtils.success(`✅ 还原: ${FileUtils.getRelativePath(filePath)}`);
    return { modified: true, ...summary };
  }
}
