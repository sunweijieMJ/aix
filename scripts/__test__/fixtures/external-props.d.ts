/**
 * 模拟外部依赖包提供的 props 类型：只有类型声明、磁盘上没有对应模块，
 * 于是 vue-docgen 与包级类型索引都解析不到它的成员——正是 `NodeProps<NodeData>`
 * 那类真实场景的最小复现。
 */
declare module 'fixture-external-props' {
  export interface ExternalNodeProps {
    /** 节点数据 */
    data: unknown;
  }
}
