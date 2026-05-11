import fs from 'fs';
import path from 'path';
import type { ResolvedConfig } from '../config';
import { FileUtils } from './file-utils';
import { LoggerUtils } from './logger';
import { ModuleResolver } from './module-resolver';
import type { ExtractedString, ILangMap, LocaleMap } from './types';
import { CommonASTUtils } from './common-ast-utils';

type KeyModuleMap = Record<string, string>;

/**
 * 语言文件管理器
 * 整合语言文件的所有操作，包括读取、写入、合并、备份等功能
 *
 * 所有路径通过 ResolvedConfig 传入，不再使用硬编码路径
 */
export class LanguageFileManager {
  /**
   * 获取语言消息
   * 读取指定目录下的语言文件，自动扁平化嵌套结构。
   * 若 config.modules 已配置，则从模块化子目录读取并合并；
   * 同时负责把遗留单文件自动迁移到模块化格式（一次性，幂等）。
   */
  static getMessages(config: ResolvedConfig, isCustom: boolean): ILangMap {
    const translationsDirectory = FileUtils.getDirectoryPath(config, isCustom);
    const sourceLocale = config.locale.source;
    const targetLocale = config.locale.target;

    if (config.modules) {
      // source 先迁，保留其扁平 map 以驱动 target 的分桶——若 matchKey/match 规则
      // 依赖 message 文本内容，target 用自己的英文反推会出现 source/target 分桶不一致。
      const sourceFlat = this.migrateToModular(config, translationsDirectory, sourceLocale);
      this.migrateToModular(config, translationsDirectory, targetLocale, sourceFlat);
      const layout = config.modules.layout;
      return {
        [sourceLocale]: this.readModularLocaleFlat(
          config,
          translationsDirectory,
          sourceLocale,
          layout,
        ),
        [targetLocale]: this.readModularLocaleFlat(
          config,
          translationsDirectory,
          targetLocale,
          layout,
        ),
      };
    }

    const sourcePath = path.join(translationsDirectory, `${sourceLocale}.json`);
    const targetPath = path.join(translationsDirectory, `${targetLocale}.json`);
    const sourceData = FileUtils.safeLoadJsonFile<Record<string, any>>(sourcePath, {
      silent: true,
    });
    const targetData = FileUtils.safeLoadJsonFile<Record<string, any>>(targetPath, {
      silent: true,
    });
    return {
      [sourceLocale]: FileUtils.flattenObject(sourceData),
      [targetLocale]: FileUtils.flattenObject(targetData),
    };
  }

  /**
   * 把遗留单文件（`<lang>.json`）迁移到模块化格式。
   * 迁移是幂等的：只要 `.bak` 文件已存在就跳过。
   *
   * @param bucketingMessages - 用于驱动分桶的扁平 map。未传时用当前 locale 自身内容。
   *   传入 source locale 数据可保证 target locale 分桶与 source 完全一致。
   * @returns 当前 locale 迁移后的扁平 map（供 caller 复用，避免重新读取 .bak）。
   */
  private static migrateToModular(
    config: ResolvedConfig,
    baseDir: string,
    locale: string,
    bucketingMessages?: LocaleMap,
  ): LocaleMap | undefined {
    const singleFilePath = path.join(baseDir, `${locale}.json`);
    const bakPath = `${singleFilePath}.bak`;

    if (!fs.existsSync(singleFilePath) || fs.existsSync(bakPath)) return undefined;

    const existingData = FileUtils.safeLoadJsonFile<Record<string, any>>(singleFilePath, {
      silent: true,
    });
    const flatData = FileUtils.flattenObject(existingData) as LocaleMap;

    if (Object.keys(flatData).length > 0) {
      // 用 source 数据驱动分桶（不传时回落到当前 locale 自身）。
      // matchKey 函数依赖 message 文本内容时，source/target 分桶必须一致。
      const keyModuleMap = LanguageFileManager.buildKeyModuleMap(
        config,
        bucketingMessages ?? flatData,
      );
      LanguageFileManager.writeModularLocaleFile(config, baseDir, flatData, locale, keyModuleMap);
    } else {
      // 空文件：只需创建目录占位，不写入任何 module 文件
      fs.mkdirSync(path.join(baseDir, locale), { recursive: true });
    }

    fs.renameSync(singleFilePath, bakPath);
    LoggerUtils.info(`✅ 已将 ${locale} 迁移到模块化格式，备份: ${bakPath}`);
    return flatData;
  }

  /**
   * 用 ModuleResolver 为 localeMap 中每个 key 分配模块。
   *
   * 反推策略：从 key 前缀重建虚拟 filePath，但**单一形态**无法兼容所有真实文件结构。
   * 假设 anchor='src'、separator='__'、key='views__order__list__title'：
   *   - 真实文件可能是 `src/views/order/list.vue` 或 `src/views/order/list/index.vue`
   *   - 配置 `match: 'src/views/order/**'` 两种形态都命中
   *   - 配置 `match: 'src/views/order/*.vue'` 只有带 .vue 后缀候选命中
   *
   * 因此本函数对每个 key 依次尝试多种虚拟路径候选，**首个非 defaultModule 命中即采用**。
   * matchKey 规则与 filePath 候选无关，循环外也能正确命中。
   *
   * 仍然存在的限制：若用户用 `idPrefix.value` 覆盖了目录前缀（key 不再保留目录结构），
   * 反推无法工作；loader 已在该场景输出警告，建议改用 matchKey。
   */
  static buildKeyModuleMap(config: ResolvedConfig, localeMap: LocaleMap): KeyModuleMap {
    const modules = config.modules!;
    const resolver = new ModuleResolver(modules);
    const sep = config.idPrefix.separator;
    const anchor = config.idPrefix.anchor;
    const keyModuleMap: KeyModuleMap = {};
    for (const [key, message] of Object.entries(localeMap)) {
      const parts = key.split(sep);
      let resolved = modules.defaultModule;

      if (parts.length > 1) {
        const dirPath = `${anchor}/${parts.slice(0, -1).join('/')}`;
        // 候选顺序：尝试匹配带扩展名（精确 *.vue/*.tsx glob 友好）、裸路径、index 形态。
        // matchKey 规则与候选无关，任意候选下都会命中。
        const candidates = [
          `${dirPath}.vue`,
          `${dirPath}.tsx`,
          `${dirPath}.ts`,
          dirPath,
          `${dirPath}/index`,
        ];
        for (const candidate of candidates) {
          const m = resolver.resolve(candidate, key, message);
          if (m !== modules.defaultModule) {
            resolved = m;
            break;
          }
        }
      } else {
        // 单段 key（极少见，通常是用户自定义）：只能靠 matchKey
        resolved = resolver.resolve('', key, message);
      }

      keyModuleMap[key] = resolved;
    }
    return keyModuleMap;
  }

  /**
   * 模块化目录扫描的统一入口：对每个模块文件调用回调。
   *
   * by-locale 布局：baseDir/<locale>/<module>.json
   * by-module 布局：baseDir/<module>/<locale>.json
   *
   * Why 抽出：readModularLocaleFlat 与 readModularLocaleWithModuleMap 的扫描逻辑
   * 完全一致（仅消费回调时是否记录 moduleName 不同），分支同步漂移的风险高。
   */
  private static iterateModularFiles(
    baseDir: string,
    locale: string,
    layout: 'by-locale' | 'by-module',
    onFile: (moduleName: string, data: Record<string, any>) => void,
  ): void {
    if (layout === 'by-locale') {
      const dirPath = path.join(baseDir, locale);
      if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) return;
      for (const file of fs.readdirSync(dirPath).filter((f) => f.endsWith('.json'))) {
        const moduleName = path.basename(file, '.json');
        const data = FileUtils.safeLoadJsonFile<Record<string, any>>(path.join(dirPath, file), {
          silent: true,
        });
        onFile(moduleName, data);
      }
      return;
    }
    // by-module
    if (!fs.existsSync(baseDir)) return;
    for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const langFile = path.join(baseDir, entry.name, `${locale}.json`);
      if (!fs.existsSync(langFile)) continue;
      const data = FileUtils.safeLoadJsonFile<Record<string, any>>(langFile, { silent: true });
      onFile(entry.name, data);
    }
  }

  /**
   * 读取模块化目录下所有 JSON 文件并合并为扁平 map。
   */
  private static readModularLocaleFlat(
    _config: ResolvedConfig,
    baseDir: string,
    locale: string,
    layout: 'by-locale' | 'by-module',
  ): Record<string, string> {
    const merged: Record<string, string> = {};
    this.iterateModularFiles(baseDir, locale, layout, (_moduleName, data) => {
      Object.assign(merged, FileUtils.flattenObject(data));
    });
    return merged;
  }

  /**
   * 读取单文件语言文件并返回 { flat, isNested }。
   * 单文件场景下保留原结构信息（嵌套/扁平），供调用方决定写回格式。
   *
   * Why: MergeProcessor.updateFlatLanguagePackage 此前散落了 safeLoadJsonFile +
   * isNestedStructure + flattenObject 三步胶水代码；提到 LanguageFileManager 形成
   * 统一入口，未来需要调整"读 locale 文件"语义时只改一处。
   */
  static readFlatLocale(
    filePath: string,
    errorMessage?: string,
  ): { flat: Record<string, string>; isNested: boolean } {
    if (!fs.existsSync(filePath)) return { flat: {}, isNested: false };
    const data = FileUtils.safeLoadJsonFile<Record<string, any>>(filePath, {
      errorMessage,
      silent: false,
    });
    if (Object.keys(data).length === 0) return { flat: {}, isNested: false };
    const isNested = FileUtils.isNestedStructure(data);
    const flattened = FileUtils.flattenObject(data);
    const flat: Record<string, string> = Object.fromEntries(
      Object.entries(flattened)
        .filter(([, value]) => typeof value === 'string')
        .map(([key, value]) => [key, String(value)]),
    );
    return { flat, isNested };
  }

  /**
   * 读取语言文件内容（单文件或模块化目录均支持）。
   * 模块化模式时额外返回 keyModuleMap，供 writeLocaleFile 回写时还原分桶。
   */
  static readLocaleFile(
    config: ResolvedConfig,
    isCustom: boolean,
    locale?: string,
  ): LocaleMap | null {
    locale = locale || config.locale.source;
    const workingDir = FileUtils.getDirectoryPath(config, isCustom);

    if (config.modules) {
      return this.readModularLocaleFlat(config, workingDir, locale, config.modules.layout);
    }

    const localeFilePath = path.join(workingDir, `${locale}.json`);
    try {
      if (!fs.existsSync(localeFilePath)) {
        LoggerUtils.warn(`语言文件不存在，将创建新文件: ${localeFilePath}`);
        return {};
      }
      const content = fs.readFileSync(localeFilePath, 'utf-8');
      return FileUtils.safeParseJson(content);
    } catch (error) {
      LoggerUtils.error(`❌ 读取语言文件失败: ${localeFilePath}`, error);
      LoggerUtils.error('👉 为防止数据丢失，本次将不会更新语言文件。请检查JSON文件格式是否正确。');
      return null;
    }
  }

  /**
   * 读取模块化目录，同时返回 key → module 的归属关系（供 writeLocaleFile 回写时复用）。
   */
  static readModularLocaleWithModuleMap(
    config: ResolvedConfig,
    isCustom: boolean,
    locale?: string,
  ): { flat: LocaleMap; keyModuleMap: KeyModuleMap } {
    locale = locale || config.locale.source;
    const workingDir = FileUtils.getDirectoryPath(config, isCustom);
    const flat: LocaleMap = {};
    const keyModuleMap: KeyModuleMap = {};
    const layout = config.modules?.layout ?? 'by-locale';

    this.iterateModularFiles(workingDir, locale, layout, (moduleName, data) => {
      const flatData = FileUtils.flattenObject(data);
      for (const key of Object.keys(flatData)) {
        flat[key] = flatData[key];
        keyModuleMap[key] = moduleName;
      }
    });

    return { flat, keyModuleMap };
  }

  /**
   * 写入语言文件内容。落盘格式由 config.output.format 统一决定。
   * @param keyModuleMap - 可选：key → module 名，启用后按模块分桶写入；
   *   未提供时写入单文件。
   */
  static writeLocaleFile(
    config: ResolvedConfig,
    isCustom: boolean,
    localeMap: LocaleMap,
    locale?: string,
    keyModuleMap?: KeyModuleMap,
  ): void {
    locale = locale || config.locale.source;
    const workingDir = FileUtils.getDirectoryPath(config, isCustom);

    if (config.modules && keyModuleMap) {
      this.writeModularLocaleFile(config, workingDir, localeMap, locale, keyModuleMap);
      return;
    }

    const localeFilePath = path.join(workingDir, `${locale}.json`);
    try {
      FileUtils.writeJsonFile(localeFilePath, this.serialize(config, localeMap));
    } catch (error) {
      LoggerUtils.error(`❌ 写入语言文件失败: ${localeFilePath}`, error);
      throw error;
    }
  }

  /**
   * 按 keyModuleMap 分桶写入到模块化目录。
   * by-locale: `<baseDir>/<locale>/<module>.json`
   * by-module: `<baseDir>/<module>/<locale>.json`
   */
  private static writeModularLocaleFile(
    config: ResolvedConfig,
    baseDir: string,
    localeMap: LocaleMap,
    locale: string,
    keyModuleMap: KeyModuleMap,
  ): void {
    const { layout, defaultModule } = config.modules!;
    const buckets = new Map<string, LocaleMap>();

    for (const [key, value] of Object.entries(localeMap)) {
      const moduleName = keyModuleMap[key] ?? defaultModule;
      if (!buckets.has(moduleName)) buckets.set(moduleName, {});
      buckets.get(moduleName)![key] = value;
    }

    for (const [moduleName, moduleMap] of buckets) {
      const filePath =
        layout === 'by-module'
          ? path.join(baseDir, moduleName, `${locale}.json`)
          : path.join(baseDir, locale, `${moduleName}.json`);
      FileUtils.writeJsonFile(filePath, this.serialize(config, moduleMap));
    }
  }

  /**
   * 落盘前统一序列化：按 config.output.format 决定扁平 / 嵌套。
   *
   * 'nested' 模式下额外做前缀冲突校验——unflattenObject 对 `a.b` 与 `a.b.c`
   * 同时存在的扁平 map 会静默覆盖（叶子 vs 子树）导致数据丢失，必须前置拦截。
   */
  private static serialize(config: ResolvedConfig, flat: LocaleMap): Record<string, any> {
    if (config.output.format === 'flat') return flat;
    this.assertNoPrefixConflict(flat, config.idPrefix.separator);
    return FileUtils.unflattenObject(flat, config.idPrefix.separator);
  }

  /**
   * 校验扁平 key 集合是否存在前缀冲突：排序后相邻两项若满足
   * `curr.startsWith(prev + sep)`，说明 prev 同时作为叶子和 curr 的祖先。
   */
  private static assertNoPrefixConflict(flat: LocaleMap, separator: string): void {
    const keys = Object.keys(flat).sort();
    for (let i = 1; i < keys.length; i++) {
      const prev = keys[i - 1];
      const curr = keys[i];
      if (curr.startsWith(prev + separator)) {
        throw new Error(
          `[i18n-tools] 嵌套输出存在前缀冲突：'${prev}' 同时作为叶子和 '${curr}' 的祖先。\n` +
            `  unflatten 时叶子值会被子树覆盖，必然丢数据。\n` +
            `  解决方案：重命名其中一个 key，或将 output.format 切换为 'flat'。`,
        );
      }
    }
  }

  /**
   * 更新语言文件。
   * @param keyModuleMap - 可选：key → module，启用模块化写入
   */
  static updateLanguageFiles(
    config: ResolvedConfig,
    isCustom: boolean,
    extractedStrings: ExtractedString[],
    keyModuleMap?: KeyModuleMap,
  ): void {
    if (extractedStrings.length === 0) return;

    // 读取阶段：模块化模式需要同时拿到 flat map 和现有 key→module 归属，
    // 单文件模式保持原有语义（null 表示文件损坏，应终止写入防止数据丢失）。
    let localeMap: LocaleMap;
    let effectiveKeyModuleMap: KeyModuleMap | undefined;

    if (config.modules) {
      const { flat, keyModuleMap: existingKeyModuleMap } = this.readModularLocaleWithModuleMap(
        config,
        isCustom,
      );
      localeMap = flat;
      // 新 key 的 module 归属来自调用方传入的 keyModuleMap；
      // 已有 key 的归属保留原文件中的记录。
      effectiveKeyModuleMap = { ...existingKeyModuleMap, ...(keyModuleMap ?? {}) };
    } else {
      const read = this.readLocaleFile(config, isCustom);
      if (read === null) return;
      localeMap = read;
    }

    const newEntries: LocaleMap = {};
    let updatedCount = 0;
    let addedCount = 0;

    for (const extracted of extractedStrings) {
      if (!extracted.semanticId) continue;

      const rawMessage = extracted.processedMessage || extracted.original;

      const { message } =
        extracted.isTemplateString && extracted.templateVariables
          ? CommonASTUtils.createMessageWithOptions(rawMessage, extracted.templateVariables)
          : { message: rawMessage.replace(/^['"`]|['"`]$/g, '') };

      if (!localeMap[extracted.semanticId]) {
        newEntries[extracted.semanticId] = message;
        addedCount++;
      } else if (localeMap[extracted.semanticId] !== message) {
        localeMap[extracted.semanticId] = message;
        updatedCount++;
      }
    }

    if (addedCount === 0 && updatedCount === 0) {
      LoggerUtils.info('✅ 语言文件已是最新状态，无需更新');
      return;
    }

    const finalMap = { ...localeMap, ...newEntries };
    this.writeLocaleFile(config, isCustom, finalMap, undefined, effectiveKeyModuleMap);

    LoggerUtils.success(`✅ 语言文件更新成功！`);
    if (addedCount > 0) LoggerUtils.info(`   - 新增条目: ${addedCount}`);
    if (updatedCount > 0) LoggerUtils.info(`   - 更新条目: ${updatedCount}`);
  }
}
