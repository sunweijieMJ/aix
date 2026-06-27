import fs from 'fs';
import path from 'path';
import type { ResolvedConfig } from '../config';
import { FileUtils } from '../utils/file-utils';
import { LoggerUtils } from '../utils/logger';
import type { Translations } from '../utils/types';
import { serializeCsv } from '../utils/csv-utils';
import { FileProcessor } from './FileProcessor';

export interface CsvExportOptions {
  /** 数据源文件 */
  source: 'untranslated' | 'translations';
  /** 按所选语言列过滤行，判据 = FileUtils.isValidTranslation */
  filter: 'all' | 'untranslated' | 'translated';
  /** 限定导出的目标语言；不传 = config.locales.targets 全部 */
  langs?: string[];
  /** CSV 输出：目录或 .csv 文件路径；不传 = 工作目录 */
  output?: string;
}

/**
 * CSV 导出处理器：把 untranslated.json / translations.json 导出为 CSV 发人翻译/审核。
 *
 * - 单语言：列 key/source/lang/reason
 * - 多语言：一个文件、每个语言一列 key/source/<langs...>（无 reason）
 * - reason 仅在目标值为「非空但无效」时标 invalid，其余留空
 * - 不碰 locale 包；key 原样镜像（untranslated.json 已是扁平 string map）
 */
export class CsvExportProcessor extends FileProcessor {
  private readonly options: CsvExportOptions;

  constructor(config: ResolvedConfig, isCustom: boolean, options: CsvExportOptions) {
    super(config, isCustom);
    this.options = options;
  }

  protected getOperationName(): string {
    return 'CSV 导出';
  }

  async execute(): Promise<void> {
    return this.executeWithLifecycle(() => this.run());
  }

  private run(): void {
    const sourceLocale = this.config.locales.source;
    const langs = this.resolveLangs();

    const sourcePath =
      this.options.source === 'translations'
        ? FileUtils.getTranslatedPath(this.config, this.isCustom)
        : FileUtils.getUntranslatedPath(this.config, this.isCustom);

    if (!fs.existsSync(sourcePath)) {
      throw new Error(
        `CSV 数据源不存在: ${sourcePath}，请先运行 ` +
          `${this.options.source === 'translations' ? 'pick/merge' : 'pick'} 生成。`,
      );
    }
    // 必须区分「损坏」与「空」：不能用 safeLoadJsonFile（解析失败回退 {}），否则损坏的数据源
    // 会被当成 0 条目导出仅含表头的空 CSV 并伪报成功。与 Translate/Merge/Pick 的「损坏即中止」
    // 守卫对齐：有内容却解析失败时抛错中止。
    const rawContent = fs.readFileSync(sourcePath, 'utf-8');
    let data: Translations;
    if (rawContent.trim() === '') {
      data = {};
    } else {
      const parsed = FileUtils.safeParseJson(rawContent) as Translations | null;
      if (parsed === null) {
        throw new Error(
          `CSV 数据源解析失败（JSON 格式错误）: ${sourcePath}\n` +
            '👉 为防止把损坏文件误判为「无可导出条目」，已中止 csv-export。请修复该文件的 JSON 格式后重试。',
        );
      }
      data = parsed;
    }
    const keys = Object.keys(data);
    LoggerUtils.info(`📊 数据源 ${path.basename(sourcePath)}：${keys.length} 个条目`);

    if (langs.length === 1) {
      this.writeSingleLang(data, keys, sourceLocale, langs[0]!);
    } else {
      this.writeMultiLang(data, keys, sourceLocale, langs);
    }
  }

  /** 解析并校验目标语言列表 */
  private resolveLangs(): string[] {
    const targets = this.config.locales.targets;
    if (!this.options.langs || this.options.langs.length === 0) return targets;
    const invalid = this.options.langs.filter((l) => !targets.includes(l));
    if (invalid.length > 0) {
      throw new Error(
        `[i18n-tools] --langs 含未配置的目标语言：${invalid.join(', ')}（可选：${targets.join(', ')}）`,
      );
    }
    return this.options.langs;
  }

  /** 该 key 对某 lang 是否应保留（依据 filter） */
  private keep(translated: boolean): boolean {
    if (this.options.filter === 'all') return true;
    if (this.options.filter === 'translated') return translated;
    return !translated; // untranslated
  }

  /**
   * 单语言 reason：只标注需要注意的情况——目标值非空但无效（垃圾值，需重填）。
   * 空值本身在目标列已可见，无需再写 'empty'；已翻译的行同样留空。
   */
  private reasonFor(value: string, translated: boolean): string {
    if (translated) return '';
    return value.trim() !== '' ? 'invalid' : '';
  }

  private writeSingleLang(
    data: Translations,
    keys: string[],
    sourceLocale: string,
    lang: string,
  ): void {
    const rows: string[][] = [['key', sourceLocale, lang, 'reason']];
    for (const key of keys) {
      const entry = data[key]!;
      const value = entry[lang] ?? '';
      const translated = FileUtils.isValidTranslation(value);
      if (!this.keep(translated)) continue;
      rows.push([key, entry[sourceLocale] ?? '', value, this.reasonFor(value, translated)]);
    }
    this.writeCsv(this.outputPath(), rows);
  }

  private writeMultiLang(
    data: Translations,
    keys: string[],
    sourceLocale: string,
    langs: string[],
  ): void {
    const rows: string[][] = [['key', sourceLocale, ...langs]];
    for (const key of keys) {
      const entry = data[key]!;
      // 多语言：任一所选 lang 满足 filter 即保留该行
      const anyKeep = langs.some((l) => this.keep(FileUtils.isValidTranslation(entry[l] ?? '')));
      if (!anyKeep) continue;
      rows.push([key, entry[sourceLocale] ?? '', ...langs.map((l) => entry[l] ?? '')]);
    }
    this.writeCsv(this.outputPath(), rows);
  }

  /**
   * 计算输出文件路径：output 为 .csv 文件则直接用；否则当目录拼 i18n.csv。
   * 始终单文件，语言体现为列，故文件名不含语言。
   */
  private outputPath(): string {
    const out = this.options.output;
    if (out && out.toLowerCase().endsWith('.csv')) return out;
    const dir = out ?? this.workingDir;
    return path.join(dir, 'i18n.csv');
  }

  private writeCsv(filePath: string, rows: string[][]): void {
    FileUtils.ensureDirectoryExists(path.dirname(filePath));
    FileUtils.atomicWriteText(filePath, serializeCsv(rows));
    LoggerUtils.success(`📄 已导出 ${rows.length - 1} 行 → ${filePath}`);
  }
}
