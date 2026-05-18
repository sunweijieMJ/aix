import fs from 'node:fs';
import path from 'node:path';
import type { FeatureId, FileList, ProjectConfig, TemplateConfig } from '../types';
import { patchPackageJson } from './pkg-patcher';
import { runEntryBuilder } from './entry-builders';

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

/** 对文本内容执行变量字符串替换 */
function applyVariables(content: string, vars: Record<string, string>): string {
  let result = content;
  for (const [placeholder, value] of Object.entries(vars)) {
    const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), value);
  }
  return result;
}

/** `_xxx` → `.xxx` 命名约定转换（仿 create-vite/create-vue） */
function resolveOutputName(name: string): string {
  if (name.startsWith('_')) return '.' + name.slice(1);
  return name;
}

/**
 * 将模板目录组合为最终文件列表（FileList）：
 * 1. 递归读取所有文件（跳过 .template/ .git/ node_modules/）
 * 2. 排除未选特性的 dirs/files
 * 3. 对 entryFiles 中的文件，用程序化 builder 生成替换
 * 4. 对所有文本文件执行变量字符串替换
 * 5. 对 package.json 执行 patchPackageJson
 * 6. 重命名：_xxx → .xxx
 */
export class Composer {
  async compose(
    templateDir: string,
    manifest: TemplateConfig,
    config: ProjectConfig,
  ): Promise<FileList> {
    // 确定要排除的路径集合（相对于 templateDir）
    const excludedPaths = new Set<string>();
    for (const [featureId, def] of Object.entries(manifest.features)) {
      if (!config.features.includes(featureId as FeatureId)) {
        def.dirs?.forEach((d) => excludedPaths.add(d));
        def.files?.forEach((f) => excludedPaths.add(f));
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

    // 合并变量（config.ts 声明的变量 + 项目名）
    const variables: Record<string, string> = {
      '{{project-name}}': config.name,
      ...manifest.variables,
    };

    // 遍历所有文件
    const allFiles = walkDir(templateDir, ['.template', '.git', 'node_modules']);
    const fileList: FileList = [];

    for (const fullPath of allFiles) {
      const relPath = path.relative(templateDir, fullPath);
      const normalizedRel = relPath.split(path.sep).join('/');

      if (isExcluded(normalizedRel)) continue;

      // 计算输出路径（_xxx → .xxx）
      const outputPath = normalizedRel.split('/').map(resolveOutputName).join('/');

      // entryFiles 中的文件用程序化 builder 生成替换
      if (outputPath in manifest.entryFiles) {
        const builderName = manifest.entryFiles[outputPath]!;
        const generated = runEntryBuilder(builderName, config);
        fileList.push({ path: outputPath, content: applyVariables(generated, variables) });
        continue;
      }

      const buf = fs.readFileSync(fullPath);
      const stat = fs.statSync(fullPath);

      if (outputPath === 'package.json') {
        const pkgJson = JSON.parse(buf.toString('utf-8'));
        const patched = patchPackageJson(pkgJson, manifest, config);
        fileList.push({ path: outputPath, content: JSON.stringify(patched, null, 2) + '\n' });
        continue;
      }

      if (isTextFile(buf)) {
        const text = applyVariables(buf.toString('utf-8'), variables);
        fileList.push({ path: outputPath, content: text, mode: stat.mode });
      } else {
        fileList.push({ path: outputPath, content: buf, mode: stat.mode });
      }
    }

    return fileList;
  }
}
