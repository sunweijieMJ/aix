import fs from 'fs';
import path from 'path';
import { LoggerUtils } from './logger';

/**
 * JSON / 文本文件的读写栈：解析、四态判别、降级读取、原子写入。
 *
 * 职责边界：只认「路径 → 内容」，不认 locale、bucket、glob 或任何业务语义
 * （那些归 file-utils / language-file-manager）。这里同时是全库**唯一**的写盘出口——
 * 所有落盘都经 atomicWriteText，避免有的路径直接 writeFileSync 而失去原子性。
 *
 * 依赖方向单向：file-utils 引用本模块，本模块不反向引用 file-utils。
 */

/**
 * classifyJsonFile 的判别式结果：四态明确区分，调用方据 status 分流。
 */
export type JsonFileClassification<T = any> =
  { status: 'missing' } | { status: 'empty' } | { status: 'corrupt' } | { status: 'ok'; data: T };

/**
 * 解析 JSON，用 `{ ok }` 判别式区分「解析失败」与「解析出 null」。
 *
 * safeParseJson 用 null 双关这两种情况：内容为合法 `null` 的文件会被判成损坏。
 * 需要精确分类的调用方（classifyJsonFile）走这里，不要用返回值判空。
 */
function tryParseJson(content: string): { ok: true; value: any } | { ok: false } {
  try {
    // 剥离 UTF-8 BOM（U+FEFF）：Windows 外部编辑器（PowerShell 5.1、VS、记事本）写出的
    // locale/glossary/translations 文件常带 BOM，带 BOM 的内容直接 JSON.parse 会抛错，
    // 导致整条读链路误判文件损坏。此处单点收口，覆盖经 safeParseJson 的全部读路径。
    const normalized = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
    return { ok: true, value: JSON.parse(normalized) };
  } catch (error) {
    LoggerUtils.error('JSON解析失败:', error);
    return { ok: false };
  }
}

export function safeParseJson(content: string): any {
  const result = tryParseJson(content);
  return result.ok ? result.value : null;
}

/**
 * 判别式 JSON 文件读取：区分「不存在 / 空 / 损坏 / 正常」四态，收口散落在 glossary 与
 * language-file-manager 多处的「readFileSync → trim 判空 → safeParseJson → null 即损坏」骨架。
 *
 * 与 safeLoadJsonFile 的区别：后者把「不存在」「空」「损坏」一律降级为 defaultValue，
 * 无法区分——凡需对损坏 fail-fast（抛错/中止/回调）的调用方都只能绕过它自己手写。
 * 本方法把分类逻辑收一处，各调用方仅 switch on status、保留各自的后续动作。
 */
export function classifyJsonFile<T = any>(filePath: string): JsonFileClassification<T> {
  if (!fs.existsSync(filePath)) return { status: 'missing' };
  const content = fs.readFileSync(filePath, 'utf-8');
  if (content.trim() === '') return { status: 'empty' };
  const parsed = tryParseJson(content);
  if (!parsed.ok) return { status: 'corrupt' };
  // 内容为合法 `null` 的文件不是损坏：判 corrupt 会让 loadJsonDictOrThrow 抛错中止整条命令。
  // 它同样不是可用字典，归入 empty（与「空文件」同档，调用方一律降级为 {}）。
  if (parsed.value === null) return { status: 'empty' };
  return { status: 'ok', data: parsed.value as T };
}

/**
 * 严格加载「字典型」JSON 中间文件（untranslated / translations 等）：
 *   - 不存在 / 空 → `{}`（视为「尚无条目」，安全继续）
 *   - 损坏（存在且非空却解析失败）→ 抛错中止（绝不降级为 `{}`，否则下游会用空对象覆写、
 *     销毁在途译文 / 把损坏误判为「无条目」而 CI 伪绿灯）
 *   - 正常 → 解析结果
 *
 * 统一 Merge / Translate / CsvExport / CsvImport 共用的
 * 「readFileSync → trim 判空 → safeParseJson → null 即损坏」骨架。corrupt 报错信息由调用方
 * 按场景定制（各命令对「会销毁什么」的描述不同）。
 */
export function loadJsonDictOrThrow<T = Record<string, unknown>>(
  filePath: string,
  buildCorruptMessage: (filePath: string) => string,
): T {
  const cls = classifyJsonFile<T>(filePath);
  if (cls.status === 'corrupt') {
    throw new Error(buildCorruptMessage(filePath));
  }
  if (cls.status === 'ok') {
    return cls.data;
  }
  return {} as T;
}

export function safeLoadJsonFile<T extends object>(
  filePath: string,
  options: {
    defaultValue?: T;
    errorMessage?: string;
    logSuccess?: boolean;
    silent?: boolean;
  } = {},
): T {
  const { defaultValue = {} as T, errorMessage, logSuccess = false, silent = false } = options;

  try {
    if (!fs.existsSync(filePath)) {
      if (!silent) {
        LoggerUtils.warn(`⚠️ 文件不存在: ${filePath}`);
      }
      return defaultValue;
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const parsed = safeParseJson(fileContent);

    if (parsed === null) {
      if (!silent) {
        LoggerUtils.error(
          errorMessage
            ? `❌ ${errorMessage}（JSON格式损坏）: ${filePath}`
            : `❌ JSON格式损坏，无法加载: ${filePath}`,
        );
      }
      return defaultValue;
    }

    if (logSuccess && !silent) {
      const itemCount = Object.keys(parsed).length;
      LoggerUtils.success(`📄 已加载 ${path.basename(filePath)}, 包含 ${itemCount} 个条目`);
    }

    return parsed as T;
  } catch (error) {
    if (!silent) {
      LoggerUtils.error(
        errorMessage ? `❌ ${errorMessage}: ${filePath}` : `❌ 加载JSON文件失败: ${filePath}`,
        error,
      );
    }
    return defaultValue;
  }
}

export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function createOrEmptyFile(filePath: string, content: string = '{}'): void {
  ensureDirectoryExists(path.dirname(filePath));
  const contentWithNewline = content.endsWith('\n') ? content : content + '\n';
  atomicWriteText(filePath, contentWithNewline);
}

/**
 * 原子写入：先写到同目录的临时文件，fsync 落盘后 rename 替换目标。
 *
 * Why: 直接 writeFileSync 在写入过程中若进程崩溃 / 同名并发写，
 *      目标文件会处于"半截"状态。rename 在大多数 POSIX 与 Windows
 *      文件系统上都是原子的，能保证读端永远看到完整的旧或新内容。
 *      fsync 显式刷新内核缓冲区到物理介质，避免 rename 后断电仍丢内容。
 *      显式 utf8 编码可避免 Windows 下默认 ANSI 解码的 mojibake。
 */
export function atomicWriteText(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    const fd = fs.openSync(tmpPath, 'w');
    try {
      fs.writeFileSync(fd, content, 'utf8');
      // FlushFileBuffers / fdatasync：rename 仅保证目录项原子切换，
      // 文件内容真正落盘要靠 fsync。
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    // 失败时清理临时文件，不向上吞没原始错误
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // 临时文件清理失败不影响主流程错误传播
    }
    throw error;
  }
}

/**
 * 统一的 JSON 写入：保证父目录存在、缩进一致、末尾换行。
 *
 * Why: 早期实现散落在多个 Processor 内联拼装 `JSON.stringify(data, null, 2) + '\n'`，
 * 一旦换行/编码/缩进策略需要调整就要多处改动；统一入口避免漂移。
 */
export function writeJsonFile(
  filePath: string,
  data: unknown,
  options: { indent?: number; ensureDir?: boolean } = {},
): void {
  const { indent = 2, ensureDir = true } = options;
  if (ensureDir) {
    ensureDirectoryExists(path.dirname(filePath));
  }
  const content = JSON.stringify(data, null, indent) + '\n';
  atomicWriteText(filePath, content);
}

/**
 * 写 translations.json / untranslated.json 这类「条目字典」文件：
 * 落盘前按顶层 key 字母序排序，使顺序与「哪个步骤最后写」解耦。
 *
 * Why: pick 按源 locale 装配顺序写、merge 按「已有 + 末尾追加」写，两者顺序
 * 不一致——merge 之后再跑 pick 会把追加的 key 重排回中部，产生大 no-op diff。
 * 统一排序后，pick / merge / translate / csv-import 写出的顺序恒定一致。
 * 内层值对象（{ zh, en, ... }）顺序保持不变。
 */
export function writeTranslationsFile(filePath: string, data: Record<string, unknown>): void {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(data).sort()) {
    sorted[key] = data[key];
  }
  writeJsonFile(filePath, sorted);
}
