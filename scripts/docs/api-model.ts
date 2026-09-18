/**
 * 组件 API 的结构化模型。
 *
 * `pnpm docs:gen` 在内存里解析出这份数据，README 表格、VitePress 文档页由它渲染，
 * MCP Server 通过 `print-api.ts` 拿同一份数据；Markdown 只是展示层。
 */

export interface ApiProp {
  name: string;
  /** 源码里声明的类型文本 */
  type: string;
  /** 本包内类型别名展开一层后的文本，与 `type` 相同时省略 */
  resolvedType?: string;
  /** 字符串字面量联合的可选值 */
  values?: string[];
  defaultValue?: string;
  required: boolean;
  description: string;
}

export interface ApiEvent {
  name: string;
  /** 回调参数的声明文本，如 `payload: MenuSelectPayload<M>` */
  params?: string;
  description: string;
}

export interface ApiSlot {
  name: string;
  /** 作用域参数的声明文本 */
  params?: string;
  description: string;
}

export interface ApiExposeMember {
  name: string;
  type?: string;
  description: string;
}

export interface ApiComponent {
  /** 组件显示名，`index.vue` 取包名的 PascalCase */
  name: string;
  /** 相对包根的源文件路径 */
  file: string;
  description?: string;
  props: ApiProp[];
  /** props 不在本包内声明时（类型来自外部包）的说明，代替 Props 表展示 */
  propsNote?: string;
  events: ApiEvent[];
  slots: ApiSlot[];
  expose: ApiExposeMember[];
}

export interface ApiPackage {
  /** npm 包名 */
  package: string;
  generatedBy: 'pnpm docs:gen';
  components: ApiComponent[];
}
