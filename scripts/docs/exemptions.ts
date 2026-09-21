/**
 * 文档管线的豁免登记。所有「找不到就当没有」的情形都必须在这里显式声明，
 * 未登记的缺失一律按解析失败处理，避免 API 表被悄悄清空而门禁照样通过。
 */

export interface Exemptions {
  /** 不是组件的包：没有组件 API，也没有 docs/components/<name>.md */
  nonComponentPackages: ReadonlySet<string>;
  /** 组件由脚本批量生成、API 段在 README 里人工维护的包 */
  handwrittenApiPackages: ReadonlySet<string>;
  /** 组件包，但 docs/components/<name>.md 尚未撰写 */
  componentDocPending: ReadonlySet<string>;
  /**
   * props 类型来自外部包、包内类型索引查不到声明的组件，
   * 键为 `<包目录>/<相对包根的文件路径>`，值是代替 Props 表展示的说明
   */
  externalPropsComponents: ReadonlyMap<string, string>;
  /**
   * 组件内部自用、不作为定制入口的 CSS 变量，键为包目录名。
   * 这些变量或由组件在模板里内联赋值，或只是样式内部的中间量，业务覆盖没有意义，
   * 因此不要求出现在文档页的「主题变量定制」表里
   */
  internalCssVars: ReadonlyMap<string, ReadonlySet<string>>;
}

export const NON_COMPONENT_PACKAGES: ReadonlySet<string> = new Set(['hooks', 'theme']);

/** icons 的 580 个图标组件属性完全一致，逐个列表没有意义 */
export const PACKAGES_WITH_HANDWRITTEN_API: ReadonlySet<string> = new Set(['icons']);

export const COMPONENT_DOC_PENDING: ReadonlySet<string> = new Set();

export const COMPONENTS_WITH_EXTERNAL_PROPS: ReadonlyMap<string, string> = new Map([
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

export const INTERNAL_CSS_VARS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  [
    'menu',
    new Set([
      // MenuIcon 在模板里内联赋值
      '--aix-menu-icon-src',
      // menu.scss 内部算出来给自己用的高度中间量
      '--aix-menu-popup-rows',
    ]),
  ],
  [
    'ai-chat',
    new Set([
      // 消息大纲的声波刻度：JS 按到波峰的距离逐帧下发
      '--aix-outline-dist',
      '--aix-outline-wave',
      // 刻度基准尺寸，只参与 outline 自身的 calc
      '--aix-outline-tick-base',
      '--aix-outline-tick-grow',
    ]),
  ],
]);

export const DEFAULT_EXEMPTIONS: Exemptions = {
  nonComponentPackages: NON_COMPONENT_PACKAGES,
  handwrittenApiPackages: PACKAGES_WITH_HANDWRITTEN_API,
  componentDocPending: COMPONENT_DOC_PENDING,
  externalPropsComponents: COMPONENTS_WITH_EXTERNAL_PROPS,
  internalCssVars: INTERNAL_CSS_VARS,
};

/** 该包不产出组件 API */
export function producesNoComponentApi(exemptions: Exemptions, dirName: string): boolean {
  return (
    exemptions.nonComponentPackages.has(dirName) || exemptions.handwrittenApiPackages.has(dirName)
  );
}

/** 该包缺 docs/components/<name>.md 不算失败 */
export function docPageOptional(exemptions: Exemptions, dirName: string): boolean {
  return (
    exemptions.nonComponentPackages.has(dirName) || exemptions.componentDocPending.has(dirName)
  );
}
