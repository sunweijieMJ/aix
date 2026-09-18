import path from 'path';
import { glob } from 'glob';
import type { ApiPackage } from './api-model';
import { discoverComponents, readPackageName } from './component-files';
import { extractPackageApi } from './extract-api';

/** 一个组件包的解析结果 */
export interface PackageApi {
  /** packages/ 下的目录名 */
  dirName: string;
  packageDir: string;
  api: ApiPackage;
}

export interface CollectResult {
  packages: PackageApi[];
  /** 声明为不产出组件 API 的包目录名 */
  withoutComponents: string[];
  failures: Array<{ dirName: string; message: string }>;
}

/**
 * 不产出组件 API 的包。hooks / theme 不是组件包；icons 的 580 个图标组件由脚本生成、
 * 属性完全一致，逐个列表毫无意义，其 API 段在 README 里人工维护。
 *
 * 必须显式声明：不在此列的包一旦发现不到组件就是解析失败，不能静默当成「这个包没有组件」，
 * 否则整张 API 表会被悄悄清空而门禁照样通过。
 */
const PACKAGES_WITHOUT_COMPONENTS = new Set(['hooks', 'theme', 'icons']);

/**
 * props 类型来自外部包、包内类型索引查不到声明的组件，按 `<包目录>/<相对包根的文件路径>` 登记，
 * 值是替代 Props 表展示的说明。
 *
 * 同样必须显式声明：不在此列的组件一旦解析不出 props 就是失败，不能任由 API 表整张空着，
 * 读者会把「解析不到」错读成「没有 props」。
 */
const COMPONENTS_WITH_EXTERNAL_PROPS = new Map([
  [
    'flow-graph/src/components/nodes/CircleNode.vue',
    'Props 为 `@vue-flow/core` 的 `NodeProps<NodeData>`，由 VueFlow 在渲染节点时注入，业务侧不直接传。',
  ],
  [
    'flow-graph/src/components/nodes/HexagonNode.vue',
    'Props 为 `@vue-flow/core` 的 `NodeProps<NodeData>`，由 VueFlow 在渲染节点时注入，业务侧不直接传。',
  ],
  [
    'flow-graph/src/components/edges/ColorEdge.vue',
    'Props 为 `@vue-flow/core` 的 `EdgeProps<EdgeData>`，由 VueFlow 在渲染边时注入，业务侧不直接传。',
  ],
]);

/**
 * 解析 packages/ 下所有包的组件 API。结果只存在内存里，由调用方决定渲染到哪里。
 */
export async function collectPackageApis(): Promise<CollectResult> {
  const packageDirs = (await glob('packages/*/package.json')).map((p) => path.dirname(p)).sort();
  if (packageDirs.length === 0) {
    throw new Error('packages/ 下没有找到任何包，本命令须在仓库根目录运行');
  }

  const result: CollectResult = { packages: [], withoutComponents: [], failures: [] };

  for (const packageDir of packageDirs) {
    const dirName = path.basename(packageDir);
    const declaredEmpty = PACKAGES_WITHOUT_COMPONENTS.has(dirName);
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
              '请补上组件导出，或把包名加进 pipeline.ts 的 PACKAGES_WITHOUT_COMPONENTS',
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
        const note = COMPONENTS_WITH_EXTERNAL_PROPS.get(`${dirName}/${file}`);
        if (!note) {
          result.failures.push({
            dirName,
            message:
              `${file}：defineProps 的类型参数一个成员都解析不出来，API 表会整张为空。` +
              '请把 props 类型改为本包内的声明，或把该文件加进 pipeline.ts 的 COMPONENTS_WITH_EXTERNAL_PROPS',
          });
          usable = false;
          continue;
        }
        const component = api.components.find((c) => c.file === file);
        if (component) component.propsNote = note;
      }
      // 解析残缺的包一律不外发：调用方拿到它就会把空表写进 README，报错只是在日志里滚过去。
      // `packages` 与 `failures` 也因此保持互斥，print-api 的消费方靠这条区分「有源码 API」
      // 与「退回 README 解析」
      if (!usable) continue;
      result.packages.push({ dirName, packageDir, api });
    } catch (error: any) {
      result.failures.push({ dirName, message: error.message });
    }
  }

  return result;
}
