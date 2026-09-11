/**
 * Fidelity（设计还原度）数据模型
 *
 * DesignSpec：Figma 侧归一化；RenderSpec：DOM 侧提取；
 * NodeMatch / PropertyDiff / FidelityResult：匹配与差异。
 */

/** 相对于根节点左上角、CSS 像素的矩形 */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 0-255 通道 + 0-1 alpha，hex 为 #rrggbb（alpha < 1 时为 #rrggbbaa） */
export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
  hex: string;
}

export type FillKind = 'solid' | 'gradient' | 'image' | 'none';

export type DesignNodeType =
  | 'FRAME'
  | 'GROUP'
  | 'TEXT'
  | 'RECTANGLE'
  | 'ELLIPSE'
  | 'VECTOR'
  | 'INSTANCE'
  | 'COMPONENT'
  | 'BOOLEAN_OPERATION'
  | 'LINE'
  | 'OTHER';

export interface DesignEffect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'BLUR';
  color?: Color;
  offset?: { x: number; y: number };
  radius: number;
}

export interface DesignLayout {
  mode: 'HORIZONTAL' | 'VERTICAL';
  /** top right bottom left */
  padding: [number, number, number, number];
  /** SPACE_BETWEEN 时为 null（itemSpacing 无意义） */
  gap: number | null;
  primaryAlign: string;
  counterAlign: string;
}

export interface DesignText {
  content: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  /** AUTO（INTRINSIC_%）时为 null */
  lineHeight: number | null;
  letterSpacing: number;
  align: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
  color: Color | null;
}

/**
 * Figma 的布局伸缩意图（仅自动布局节点有值）
 * - FIXED：固定尺寸
 * - HUG：由内容撑开
 * - FILL：填满父容器剩余空间，实现侧不应写死尺寸
 */
export type DesignSizing = 'FIXED' | 'HUG' | 'FILL';

export interface DesignNode {
  id: string;
  name: string;
  type: DesignNodeType;
  visible: boolean;
  bounds: Bounds;
  /** 设计稿声明的伸缩意图，用于判断实现是否不该写死尺寸 */
  sizing?: { horizontal?: DesignSizing; vertical?: DesignSizing };
  opacity: number;
  fills: Color[];
  fillKind: FillKind;
  strokes: { color: Color; weight: number }[];
  /** top-left top-right bottom-right bottom-left */
  cornerRadius: [number, number, number, number];
  effects: DesignEffect[];
  layout?: DesignLayout;
  text?: DesignText;
  /** 图标 / 图片等只比 bounds 的叶子节点 */
  isLeaf: boolean;
  componentId?: string;
  children: DesignNode[];
}

export interface DesignSpec {
  fileKey: string;
  nodeId: string;
  version: string;
  lastModified: string;
  root: DesignNode;
  imagePath: string;
}

// ---- DOM 侧 ----

export interface RenderStyles {
  color: Color | null;
  backgroundColor: Color | null;
  backgroundKind: FillKind;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  /** line-height: normal 时为 null */
  lineHeight: number | null;
  letterSpacing: number;
  textAlign: string;
  borderRadius: [number, number, number, number];
  /** 第一条可见边的颜色 */
  borderColor: Color | null;
  /** 四边中最大的宽度 */
  borderWidth: number;
  /** top right bottom left */
  borderWidths: [number, number, number, number];
  /** 仅 flex / grid 容器有值 */
  padding: [number, number, number, number] | null;
  /** 仅 flex / grid 容器有值；diff 时按 Figma layoutMode 选轴 */
  rowGap: number | null;
  columnGap: number | null;
  display: string;
  flexDirection: string | null;
  boxShadow: string;
  opacity: number;
}

export interface RenderNode {
  selector: string;
  figmaId?: string;
  tag: string;
  /** 直接文本子节点拼接，归一化空白 */
  text?: string;
  /** 整棵子树的文本，保留文档顺序 */
  fullText?: string;
  bounds: Bounds;
  styles: RenderStyles;
  children: RenderNode[];
}

export interface RenderSpec {
  url: string;
  rootSelector: string;
  viewport: { width: number; height: number };
  root: RenderNode;
  screenshotPath: string;
  /** 超出 maxDepth / maxNodes 时为 true */
  truncated: boolean;
  nodeCount: number;
}

// ---- 匹配与差异 ----

/** root：根节点没有 data-figma 时的默认绑定（未做任何几何计算） */
export type MatchMethod = 'attr' | 'text' | 'geometry' | 'root';

export type FidelitySeverity = 'major' | 'minor' | 'info';

export type DiffProperty =
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'color'
  | 'backgroundColor'
  | 'fontSize'
  | 'fontWeight'
  | 'fontFamily'
  | 'lineHeight'
  | 'letterSpacing'
  | 'borderRadius'
  | 'padding'
  | 'gap'
  | 'borderColor'
  | 'borderWidth'
  | 'boxShadow'
  | 'opacity'
  | 'text';

export interface PropertyDiff {
  property: DiffProperty;
  expected: string | number;
  actual: string | number;
  /** 数值属性为绝对差；颜色为 ΔE2000 */
  delta?: number;
  tolerance: number;
  severity: FidelitySeverity;
  /** 期望值命中的 CSS 变量名 */
  token?: string;
  /** 规则生成的一句话建议 */
  hint?: string;
}

export interface NodeMatch {
  design: DesignNode;
  /** null = missing */
  render: RenderNode | null;
  method?: MatchMethod;
  confidence: number;
  diffs: PropertyDiff[];
}

export interface FidelityRegion {
  bounds: Bounds;
  pixels: number;
  cropDesign?: string;
  cropRender?: string;
  relatedNodeIds: string[];
  /** 可选的 LLM 视觉描述 */
  note?: string;
}

// ---- 工程质量探测（与设计稿无关的兜底检查）----

export type ResponsiveFindingType =
  /** 页面在该宽度下出现横向滚动 */
  | 'overflow'
  /** 视口变窄但根元素宽度纹丝不动，基本是写死了宽度 */
  | 'no-reflow'
  /** 设计稿声明 FILL，实现却不随视口变化 */
  | 'fixed-width-should-fill'
  /** 元素超出根容器右边界 */
  | 'clipped';

export interface ResponsiveFinding {
  type: ResponsiveFindingType;
  /** 探测时使用的视口宽度 */
  width: number;
  selector?: string;
  figmaId?: string;
  designSizing?: DesignSizing;
  detail: string;
  severity: FidelitySeverity;
}

export type InteractionFindingType = 'no-hover-feedback' | 'missing-pointer-cursor';

export interface InteractionFinding {
  type: InteractionFindingType;
  selector: string;
  /** 元素文案，便于人工定位 */
  label?: string;
  detail: string;
  severity: FidelitySeverity;
}

export interface FidelitySummary {
  total: number;
  matched: number;
  /** 未匹配到 DOM 的设计节点总数（含叶子） */
  missing: number;
  /** 其中图标 / 图片等叶子节点的数量，按 minor 权重计分 */
  missingLeaf: number;
  major: number;
  minor: number;
  info: number;
  /** 响应式健壮性问题数（不计入 score，独立呈现） */
  responsive: number;
  /** 交互反馈问题数（不计入 score，独立呈现） */
  interaction: number;
  /** 0-100，仅反映与设计稿的静态吻合度，不含上面两项 */
  score: number;
}

export interface FidelityResult {
  meta: {
    figma: { fileKey: string; nodeId: string; version: string; name: string };
    url: string;
    viewport: { width: number; height: number };
    deviceScaleFactor: number;
    generatedAt: string;
    durationMs: number;
  };
  warnings: string[];
  matches: NodeMatch[];
  /** DOM 有、设计没有的元素（只列出，不判 severity） */
  unmatchedRender: RenderNode[];
  /** 多宽度健壮性探测；未开启时为 undefined */
  responsive?: {
    widths: number[];
    findings: ResponsiveFinding[];
  };
  /** 交互反馈探测；未开启时为 undefined */
  interaction?: {
    /** 检出的可交互元素总数 */
    total: number;
    /** 其中 hover 有视觉反馈的数量 */
    withFeedback: number;
    findings: InteractionFinding[];
  };
  pixel: {
    mismatchPercentage: number;
    diffPath: string | null;
    designImage: string;
    renderImage: string;
    regions: FidelityRegion[];
  };
  summary: FidelitySummary;
}
