import type { FeatureId, ProjectConfig, TemplateConfig } from '../types';

type PkgJson = Record<string, any>;

/**
 * 深度合并（仿 create-vue 策略）：
 * - 数组：拼接去重
 * - 对象：递归合并
 * - 标量：后者覆盖前者
 */
export function deepMerge<T extends PkgJson>(target: T, ...sources: PkgJson[]): T {
  for (const source of sources) {
    for (const key of Object.keys(source)) {
      const src = source[key];
      const tgt = (target as PkgJson)[key];

      if (Array.isArray(src) && Array.isArray(tgt)) {
        (target as PkgJson)[key] = [...new Set([...tgt, ...src])];
      } else if (isObject(src) && isObject(tgt)) {
        (target as PkgJson)[key] = deepMerge({ ...tgt }, src);
      } else if (isObject(src)) {
        // tgt 不存在或非对象时，深拷贝 src 避免共享引用
        (target as PkgJson)[key] = deepMerge({}, src);
      } else {
        (target as PkgJson)[key] = src;
      }
    }
  }
  return target;
}

function isObject(val: unknown): val is PkgJson {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

/**
 * 对 dependencies/devDependencies 按包名排序（仿 create-vue）
 */
export function sortDependencies(pkg: PkgJson): PkgJson {
  const result = { ...pkg };
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
    if (result[key]) {
      result[key] = Object.fromEntries(
        Object.entries(result[key] as Record<string, string>).sort(([a], [b]) =>
          a.localeCompare(b),
        ),
      );
    }
  }
  return result;
}

/**
 * 根据用户选择的特性，裁剪 package.json 中未选特性的依赖，
 * 并替换 {{project-name}} 占位符
 */
export function patchPackageJson(
  pkgJson: PkgJson,
  manifest: TemplateConfig,
  config: ProjectConfig,
): PkgJson {
  const pkg = deepMerge({} as PkgJson, pkgJson);

  // 替换项目名占位符
  if (typeof pkg['name'] === 'string') {
    pkg['name'] = (pkg['name'] as string).replace(/\{\{project-name\}\}/g, config.name);
  }

  // 裁剪未选特性的依赖
  for (const [featureId, def] of Object.entries(manifest.features)) {
    if (!config.features.includes(featureId as FeatureId)) {
      for (const dep of def.deps ?? []) {
        delete (pkg['dependencies'] as Record<string, string> | undefined)?.[dep];
      }
      for (const dep of def.devDeps ?? []) {
        delete (pkg['devDependencies'] as Record<string, string> | undefined)?.[dep];
      }
    }
  }

  return sortDependencies(pkg);
}
