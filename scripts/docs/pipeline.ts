import path from 'path';
import { glob } from 'glob';
import type { ApiPackage } from './api-model';
import { discoverComponents, readPackageName } from './component-files';
import { DEFAULT_EXEMPTIONS, producesNoComponentApi, type Exemptions } from './exemptions';
import { extractPackageApi } from './extract-api';

/** 一个组件包的解析结果 */
export interface PackageApi {
  /** packages/ 下的目录名 */
  dirName: string;
  /** 包根的绝对路径 */
  packageDir: string;
  api: ApiPackage;
}

export interface CollectResult {
  packages: PackageApi[];
  /** 声明为不产出组件 API 的包目录名 */
  withoutComponents: string[];
  failures: Array<{ dirName: string; message: string }>;
}

export interface CollectOptions {
  /** 仓库根，默认当前工作目录 */
  root?: string;
  exemptions?: Exemptions;
}

/**
 * 解析 packages/ 下所有包的组件 API。结果只存在内存里，由调用方决定渲染到哪里。
 * `packages` 与 `failures` 互斥：解析残缺的包只进 failures，不外发半张表。
 */
export async function collectPackageApis(options: CollectOptions = {}): Promise<CollectResult> {
  const root = path.resolve(options.root ?? process.cwd());
  const exemptions = options.exemptions ?? DEFAULT_EXEMPTIONS;

  const packageDirs = (await glob('packages/*/package.json', { cwd: root }))
    .map((p) => path.join(root, path.dirname(p)))
    .sort();
  if (packageDirs.length === 0) {
    throw new Error(`${root} 下没有 packages/*/package.json，本命令须在仓库根目录运行`);
  }

  const result: CollectResult = { packages: [], withoutComponents: [], failures: [] };

  for (const packageDir of packageDirs) {
    const dirName = path.basename(packageDir);
    const declaredEmpty = producesNoComponentApi(exemptions, dirName);
    try {
      const components = declaredEmpty ? [] : await discoverComponents(packageDir);
      if (components.length === 0) {
        if (declaredEmpty) {
          result.withoutComponents.push(dirName);
        } else {
          result.failures.push({
            dirName,
            message:
              'src/index.ts 没有导出任何 .vue 组件，包根也没有 src/*.vue。' +
              '请补上组件导出，或把包名登记进 exemptions.ts',
          });
        }
        continue;
      }
      const { api, unresolvedProps } = await extractPackageApi(
        packageDir,
        await readPackageName(packageDir),
        components,
      );
      let usable = true;
      for (const file of unresolvedProps) {
        const note = exemptions.externalPropsComponents.get(`${dirName}/${file}`);
        if (!note) {
          result.failures.push({
            dirName,
            message:
              `${file}：defineProps 的类型参数一个成员都解析不出来，API 表会整张为空。` +
              '请把 props 类型改为本包内的声明，或把该文件登记进 exemptions.ts 的 COMPONENTS_WITH_EXTERNAL_PROPS',
          });
          usable = false;
          continue;
        }
        const component = api.components.find((c) => c.file === file);
        if (component) component.propsNote = note;
      }
      if (!usable) continue;
      result.packages.push({ dirName, packageDir, api });
    } catch (error: any) {
      result.failures.push({ dirName, message: error.message });
    }
  }

  return result;
}
