import fs from 'node:fs';
import path from 'node:path';
import type { FileList, ProjectConfig, TemplateConfig } from '../types';
import { CreateAppError } from '../utils/errors';
import { applyConditionalBlocks } from './conditional';
import { patchPackageJson } from './pkg-patcher';

/**
 * 递归读取目录下所有文件
 *
 * skipNames 按 **basename** 匹配而非根相对路径：`node_modules` / `.git` 这类目录在
 * 任意层级都不该进产物。按根相对路径比对的话，模板一旦是 monorepo，
 * 子包下的 node_modules 与子模块的 `.git` 就会被整个打进新项目。
 *
 * 符号链接按解引用后的类型处理：指向文件的链接照旧当普通文件收进来（历史行为，
 * readFileSync 本就会跟随链接）；指向目录或悬空的链接跳过——前者会让 readFileSync
 * 直接 EISDIR 崩掉，后者读不到内容。不一律跳过，是为了不把原本可用的形态变成静默丢文件。
 */
function walkDir(dir: string, skipNames: string[] = []): string[] {
  const results: string[] = [];

  function walk(current: string): void {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (skipNames.includes(entry.name)) continue;

      const fullPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        let target: fs.Stats;
        try {
          target = fs.statSync(fullPath);
        } catch {
          continue; // 悬空链接
        }
        if (target.isFile()) results.push(fullPath);
        continue;
      }

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

/** 判断文件内容是否为文本（通过检测 null 字节） */
function isTextFile(buf: Buffer): boolean {
  return !buf.includes(0);
}

/**
 * 对文本内容执行变量字符串替换
 *
 * 用 split/join 而非 RegExp：占位符与值都是字面量。正则通路需要转义占位符，
 * 且替换串里的 `$&` / `$'` 会被 String.replace 解释成特殊模式——模板作者在
 * variables 值里写个 `$&` 产物就悄悄坏掉。
 */
function applyVariables(content: string, vars: Record<string, string>): string {
  let result = content;
  for (const [placeholder, value] of Object.entries(vars)) {
    // 空键会让 split('') 把值插进每个字符之间，整个产物逐字符损坏。
    // schema 已拦（variables 键 min(1)），这里是绕过 schema 直调 API 时的兜底
    if (placeholder === '') continue;
    result = result.split(placeholder).join(value);
  }
  return result;
}

/**
 * 在 **解析后的对象** 上做变量替换（键与字符串值都替换），供 package.json 专用
 *
 * 必须走对象而不是序列化后的文本：变量值有一路来自 `--param`（调用方输入），
 * 拼进 JSON 文本里的 `"` 能闭合字符串再开新键——实测可注入 `scripts.postinstall`，
 * 而 CLI 紧接着就会执行 `pnpm install`。在对象上替换后由 JSON.stringify 负责转义，
 * 值里的引号只会变成字面量。
 */
function applyVariablesDeep<T>(node: T, vars: Record<string, string>): T {
  if (typeof node === 'string') return applyVariables(node, vars) as T;
  if (Array.isArray(node)) return node.map((item) => applyVariablesDeep(item, vars)) as T;
  if (node !== null && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [
        applyVariables(key, vars),
        applyVariablesDeep(value, vars),
      ]),
    ) as T;
  }
  return node;
}

/**
 * 命中账本：外层下标与 subs 对齐，内层按白名单文件逐个记数
 *
 * 必须逐文件记，不能只记一个总数：白名单里任一文件失配（真源改写了那一处），
 * 只要别的文件还命中，总数就 > 0，漏配会被完全掩盖。
 */
type SubstitutionHits = Array<Map<string, number>>;

/**
 * 应用 config.ts 声明的 substitutions（真名 → 占位符）
 *
 * 只对 `files` 白名单内的文件生效；命中次数按 (substitution, file) 记进 hits，
 * 由调用方在遍历完成后逐文件检查零命中。
 */
function applySubstitutions(
  content: string,
  relPath: string,
  subs: NonNullable<TemplateConfig['substitutions']>,
  hits: SubstitutionHits,
): string {
  let result = content;
  subs.forEach((sub, i) => {
    if (!sub.files.includes(relPath)) return;
    const perFile = hits[i]!;
    const parts = result.split(sub.from);
    if (parts.length === 1) return;
    perFile.set(relPath, (perFile.get(relPath) ?? 0) + parts.length - 1);
    result = parts.join(sub.to);
  });
  return result;
}

/**
 * 将模板目录组合为最终文件列表（FileList）：
 * 1. 递归读取所有文件（跳过 .template/ .git/ node_modules/）
 * 2. 排除未选特性的 dirs/files
 * 3. 对所有文本文件依次执行：substitutions → 条件注释块 → 变量替换
 * 4. 对 package.json 执行 patchPackageJson（substitutions 先于 JSON.parse 应用）
 *
 * 输出路径即模板内的相对路径：模板经 git/本地路径直连拉取，点文件原样保留，
 * 不存在 create-vite 那套 `_gitignore` → `.gitignore` 的改名约定。
 */
export class Composer {
  async compose(
    templateDir: string,
    manifest: TemplateConfig,
    config: ProjectConfig,
  ): Promise<FileList> {
    // 选中特性集合，供条件注释块求值
    const selected = new Set(config.features);
    // 模板声明的全部特性 id：条件块里出现未声明的 id 一律硬报，
    // 不能按「未选中」静默把整块删掉（拼错一个字母就少一段代码，且 CLI 零输出）
    const declared = new Set(Object.keys(manifest.features));

    // 确定要排除的路径集合（相对于 templateDir）。
    // 统一剥尾部 `/`：作者把目录写成 `src/locale/` 时，前缀比对会拼出 `//` 而静默失效——
    // exclude 与特性 dirs/files 必须同一套归一化，不能只归一其中一处
    const excludedPaths = new Set<string>();
    const addExcluded = (p: string): void => {
      excludedPaths.add(p.replace(/\/+$/, ''));
    };
    // 模板级排除：真源仓库工作区里的构建产物 / 生成文件 / 锁文件，与特性无关
    manifest.exclude?.forEach(addExcluded);
    // 特性级排除：未选中特性的 dirs/files
    for (const [featureId, def] of Object.entries(manifest.features)) {
      if (!selected.has(featureId)) {
        def.dirs?.forEach(addExcluded);
        def.files?.forEach(addExcluded);
      }
    }

    // caller 传入的 relPath 已被 normalizedRel 归一化为 POSIX 风格（`/` 分隔），
    // 这里也必须用 `/` 比对——不要用 path.sep，否则 Windows 下永远不命中前缀
    function isExcluded(relPath: string): boolean {
      for (const excluded of excludedPaths) {
        if (relPath === excluded || relPath.startsWith(excluded + '/')) return true;
      }
      return false;
    }

    // 合并变量：模板固定值（variables）→ 参数取值（params，问答/--param/default 解出）
    // → CLI 注入的项目名。用户输入必须放在展开之后，模板同名声明不得压掉它
    // （params 与 variables 的 key 冲突已被 schema 拒绝，这里的顺序只是防御）
    const variables: Record<string, string> = {
      ...manifest.variables,
      // `?? {}`：ProjectConfig 是公共导出，未走类型检查的外部调用方可能不带 params
      ...Object.fromEntries(
        Object.entries(config.params ?? {}).map(([key, value]) => [`{{${key}}}`, value]),
      ),
      '{{project-name}}': config.name,
    };

    // 遍历所有文件
    const allFiles = walkDir(templateDir, ['.template', '.git', 'node_modules']);
    const fileList: FileList = [];
    const subs = manifest.substitutions ?? [];
    const hits: SubstitutionHits = subs.map(() => new Map<string, number>());

    for (const fullPath of allFiles) {
      const relPath = path.relative(templateDir, fullPath);
      const outputPath = relPath.split(path.sep).join('/');

      if (isExcluded(outputPath)) continue;

      const buf = fs.readFileSync(fullPath);
      const stat = fs.statSync(fullPath);

      if (outputPath === 'package.json') {
        // substitutions 必须先于 JSON.parse 应用：真名（如包名）就在待解析的原文本里
        const raw = applySubstitutions(buf.toString('utf-8'), outputPath, subs, hits);
        const pkgJson = JSON.parse(raw);
        const patched = patchPackageJson(pkgJson, manifest, config);
        // 变量替换在序列化之前、作用于对象：值里的引号交给 JSON.stringify 转义，
        // 杜绝 `--param` 输入闭合字符串注入新键（见 applyVariablesDeep）
        const text = JSON.stringify(applyVariablesDeep(patched, variables), null, 2) + '\n';
        fileList.push({ path: outputPath, content: text });
        continue;
      }

      // 只保留权限位：stat.mode 还带着文件类型位（普通文件 0o100000），
      // 原样传给 writeFileSync 依赖的是 open(2) 对多余位的静默忽略，属未定义行为
      const mode = stat.mode & 0o777;

      if (isTextFile(buf)) {
        // 顺序固定：substitutions → 条件注释块 → 变量替换（协议 1.2.4 / 1.3）
        const substituted = applySubstitutions(buf.toString('utf-8'), outputPath, subs, hits);
        const trimmed = applyConditionalBlocks(substituted, outputPath, selected, declared);
        const text = applyVariables(trimmed, variables);
        fileList.push({ path: outputPath, content: text, mode });
      } else {
        fileList.push({ path: outputPath, content: buf, mode });
      }
    }

    // 零命中说明真源改名/改写了而 config.ts 没跟着更新——此时产物会带着真名发出去，
    // 必须硬失败，不能静默通过。
    //
    // 例外：某个 file 被未选中的特性整体裁掉时，零命中是合法的，不能误报；
    // 但 file 在模板里压根不存在，则是失效路径，照样要报。
    const allRel = new Set(
      allFiles.map((f) => path.relative(templateDir, f).split(path.sep).join('/')),
    );
    const problems: string[] = [];
    subs.forEach((sub, i) => {
      const perFile = hits[i]!;

      const stale = sub.files.filter((f) => !allRel.has(f));
      if (stale.length > 0) {
        problems.push(`  "${sub.from}"：模板中不存在这些文件 → ${stale.join(', ')}`);
      }

      // 逐文件判定：参与了本次生成（存在、未被裁掉）却零命中即失配
      const missed = sub.files.filter(
        (f) => allRel.has(f) && !isExcluded(f) && (perFile.get(f) ?? 0) === 0,
      );
      if (missed.length > 0) {
        problems.push(`  "${sub.from}"：在这些文件中一次都没匹配到 → ${missed.join(', ')}`);
      }
    });
    if (problems.length > 0) {
      throw new CreateAppError(
        'E_SUBSTITUTION_MISS',
        `substitutions 校验失败:\n${problems.join('\n')}`,
        '模板源文件可能已改名或改写，请更新 .template/config.ts 的 substitutions',
      );
    }

    return fileList;
  }
}
