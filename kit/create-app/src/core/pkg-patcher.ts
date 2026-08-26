import type { ProjectConfig, TemplateConfig } from '../types';
import { toValidPackageName } from '../utils/validate';

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

      if (Array.isArray(src)) {
        // 数组一律新建：与已有数组合并去重，否则复制一份。
        // 直接把 src 赋过去会让「深拷贝」的承诺落空——产物与入参共享同一个数组，
        // 后续任何一侧的 push 都会串到另一侧（元素为标量，package.json 场景足够）
        (target as PkgJson)[key] = Array.isArray(tgt) ? [...new Set([...tgt, ...src])] : [...src];
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
 * 根据用户选择的特性，裁剪 package.json 中未选特性的依赖与 scripts，
 * 并替换 {{project-name}} 占位符
 */
export function patchPackageJson(
  pkgJson: PkgJson,
  manifest: TemplateConfig,
  config: ProjectConfig,
): PkgJson {
  const pkg = deepMerge({} as PkgJson, pkgJson);

  // 替换项目名占位符
  //
  // 用派生出的合法包名而不是原始项目名：目录名允许大写与点号（`MyApp`），
  // 而 npm / pnpm 的 name 不允许——直接写进去会让产物的 `pnpm install` 当场失败。
  // 其余文件里的 `{{project-name}}` 仍是原始名（localforage 库名等场景要的就是原样）
  if (typeof pkg['name'] === 'string') {
    pkg['name'] = (pkg['name'] as string).replace(
      /\{\{project-name\}\}/g,
      toValidPackageName(config.name),
    );
  }

  // 项目描述写进产物：`-d` / 问答收集的值是产物 package.json 的 description，
  // 这也是它唯一的消费点。留空时不动模板原值（模板可能有意自带一份）
  if (config.description.trim().length > 0) {
    pkg['description'] = config.description;
  }

  // 无条件移除只服务模板真源自身的脚本（它们依赖的文件已被 exclude 挡在产物外）
  for (const script of manifest.removeScripts ?? []) {
    delete (pkg['scripts'] as Record<string, string> | undefined)?.[script];
  }

  // 裁剪未选特性的依赖与 scripts
  for (const [featureId, def] of Object.entries(manifest.features)) {
    if (!config.features.includes(featureId)) {
      for (const dep of def.deps ?? []) {
        delete (pkg['dependencies'] as Record<string, string> | undefined)?.[dep];
      }
      for (const dep of def.devDeps ?? []) {
        delete (pkg['devDependencies'] as Record<string, string> | undefined)?.[dep];
      }
      for (const script of def.scripts ?? []) {
        delete (pkg['scripts'] as Record<string, string> | undefined)?.[script];
      }
    }
  }

  return sortDependencies(pkg);
}
