import fs from 'fs';
import type { ResolvedConfig } from '../config';
import type { FrameworkAdapter } from '../adapters';
import { CommonASTUtils } from './common-ast-utils';
import { FileUtils } from './file-utils';

/**
 * 扫描源码目录，抽出所有 t()/$t() 调用使用的字面量 key。
 * 已剥离 namespace 前缀（i18next 'ns:key' → 'key'）、剔除注释中的调用。
 * doctor 对账与 prune 孤儿清理共用此口径。
 */
export function collectUsedKeys(config: ResolvedConfig, adapter: FrameworkAdapter): Set<string> {
  const used = new Set<string>();
  const nsPrefix = config.framework.namespace ? `${config.framework.namespace}:` : '';
  const files = FileUtils.getFrameworkFiles(
    config.io.sourceDir,
    adapter.getSupportedExtensions(),
    config.io.exclude,
    config.io.include,
    config.root,
  );
  const i18nKeyPattern = /(?:\$t|(?<!\w)t)\s*\(\s*['"]([^'"]+)['"]/g;
  for (const filePath of files) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const content = CommonASTUtils.stripComments(raw);
      let match: RegExpExecArray | null;
      while ((match = i18nKeyPattern.exec(content)) !== null) {
        if (match[1]) {
          used.add(
            nsPrefix && match[1].startsWith(nsPrefix) ? match[1].slice(nsPrefix.length) : match[1],
          );
        }
      }
    } catch {
      /* 读取失败的文件跳过，不影响其他文件 */
    }
  }
  return used;
}

/** key 是否命中动态 key 白名单（可能被 t(prefix+var) 动态引用，不应判为孤儿）。 */
export function matchesDynamicAllowlist(config: ResolvedConfig, key: string): boolean {
  const list = config.keys.dynamicKeyAllowlist;
  if (list.length === 0) return false;
  for (const pattern of list) {
    if (typeof pattern === 'string') {
      if (key.startsWith(pattern)) return true;
    } else if (pattern.test(key)) {
      return true;
    }
  }
  return false;
}
