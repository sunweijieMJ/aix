import fs from 'node:fs';
import path from 'node:path';
import type { FileList, ProjectConfig, TemplateConfig } from '../types';
import { CreateAppError } from '../utils/errors';
import { applyConditionalBlocks } from './conditional';
import { patchPackageJson } from './pkg-patcher';

/** 递归读取目录下所有文件，跳过指定目录 */
function walkDir(dir: string, skip: string[] = []): string[] {
  const results: string[] = [];

  function walk(current: string): void {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const relFromDir = path.relative(dir, fullPath);

      if (skip.some((s) => relFromDir === s || relFromDir.startsWith(s + path.sep))) continue;

      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
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

    // 合并变量（config.ts 声明的变量 + 项目名）。
    // CLI 注入项必须放在展开之后：模板若声明了同名 {{project-name}}，
    // 不能让它压掉用户输入的项目名
    const variables: Record<string, string> = {
      ...manifest.variables,
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
        const text = applyVariables(JSON.stringify(patched, null, 2) + '\n', variables);
        // 变量是在序列化之后注入的，值里带 `"` / `\` 会把 JSON 弄坏且无人报错——
        // 用户要到 pnpm install 才发现产物损坏，必须在写盘前回验
        try {
          JSON.parse(text);
        } catch {
          throw new CreateAppError(
            'E_INVALID_TEMPLATE_CONFIG',
            'variables 注入后 package.json 不再是合法 JSON（变量值含 " 或 \\ 等 JSON 特殊字符？）',
            '请检查 .template/config.ts 的 variables 值，避免 JSON 特殊字符',
          );
        }
        fileList.push({ path: outputPath, content: text });
        continue;
      }

      if (isTextFile(buf)) {
        // 顺序固定：substitutions → 条件注释块 → 变量替换（协议 1.2.4 / 1.3）
        const substituted = applySubstitutions(buf.toString('utf-8'), outputPath, subs, hits);
        const trimmed = applyConditionalBlocks(substituted, outputPath, selected);
        const text = applyVariables(trimmed, variables);
        fileList.push({ path: outputPath, content: text, mode: stat.mode });
      } else {
        fileList.push({ path: outputPath, content: buf, mode: stat.mode });
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
