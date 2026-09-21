/** 尺寸档位 */
export type DemoSize = 'sm' | 'lg';

/** 卡片条目 */
export interface DemoItem {
  /** 唯一标识 */
  key: string;
  label?: string;
}

export interface DemoCardProps {
  /** 标题 */
  title?: string;
  /**
   * 尺寸
   * @default 'sm'
   */
  size?: DemoSize;
  items?: DemoItem[];
  /** 列数，默认 3；由父级兜底 */
  columns?: number;
}

export interface DemoCardEmits {
  /** 选中条目 */
  (e: 'select', item: DemoItem): void;
}

export interface DemoCardExpose {
  /** 聚焦标题 */
  focus: () => void;
}

/** 组件内部不暴露给业务的状态 */
export type DemoInternalState = 'idle' | 'busy';
