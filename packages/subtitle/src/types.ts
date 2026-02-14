/**
 * 字幕组件类型定义
 */

/** 字幕条目 */
export interface SubtitleCue {
  /** 唯一标识 (可选) */
  id?: string;
  /** 开始时间 (秒) */
  startTime: number;
  /** 结束时间 (秒) */
  endTime: number;
  /** 字幕文本 */
  text: string;
  /** 扩展数据 (用于存储 PPT 索引等业务数据) */
  data?: Record<string, unknown>;
}

/** 字幕文件格式 */
export type SubtitleFormat = 'vtt' | 'srt' | 'json' | 'sbv' | 'ass';

/** 字幕来源类型 */
export type SubtitleSource =
  | { type: 'url'; url: string; format?: SubtitleFormat }
  | { type: 'text'; content: string; format: SubtitleFormat }
  | { type: 'cues'; cues: SubtitleCue[] };

/** 字幕组件 Props */
export interface SubtitleProps {
  /** 字幕来源 */
  source?: SubtitleSource;
  /** 当前播放时间 (秒)，用于外部控制字幕显示 */
  currentTime?: number;
  /**
   * 是否显示字幕
   * @default true
   */
  visible?: boolean;
  /**
   * 字幕位置
   * @default 'bottom'
   */
  position?: 'top' | 'bottom' | 'center';
  /**
   * 字体大小，可以是数字(px)或 CSS 字符串
   * @default 20
   */
  fontSize?: number | string;
  /**
   * 背景样式：blur-毛玻璃、solid-渐变、none-透明
   * @default 'blur'
   */
  background?: 'blur' | 'solid' | 'none';
  /**
   * 最大宽度，可以是数字(px)或 CSS 字符串
   * @default '1200px'
   */
  maxWidth?: number | string;
  /**
   * 是否单行显示（固定高度场景下启用，需配合 fixedHeight 使用）
   * @default false
   */
  singleLine?: boolean;
  /** 固定高度（用于计算分段，单位 px） */
  fixedHeight?: number;
  /**
   * 是否自动分段（文字过长时分多段轮播显示）
   * @default false
   */
  autoSegment?: boolean;
  /**
   * 每段显示时长（毫秒）
   * @default 3000
   */
  segmentDuration?: number;
}

/** 字幕组件 Emits */
export interface SubtitleEmits {
  /** 字幕加载完成，返回所有字幕条目 */
  (e: 'loaded', cues: SubtitleCue[]): void;
  /** 字幕加载失败，返回错误信息 */
  (e: 'error', error: Error): void;
  /** 当前字幕变化，返回当前字幕条目和索引（null 表示无字幕） */
  (e: 'change', cue: SubtitleCue | null, index: number): void;
}

/** 字幕组件暴露的方法 */
export interface SubtitleExpose {
  /** 获取所有字幕条目 */
  getCues: () => SubtitleCue[];
  /** 获取当前字幕 */
  getCurrentCue: () => SubtitleCue | null;
  /** 获取当前字幕索引 */
  getCurrentIndex: () => number;
  /** 根据时间获取字幕 */
  getCueAtTime: (time: number) => SubtitleCue | null;
  /** 重新加载字幕 */
  reload: () => Promise<void>;
  /** 是否正在加载 */
  loading: import('vue').Ref<boolean>;
  /** 加载错误 */
  error: import('vue').Ref<Error | null>;
}

/** 字幕解析器接口 */
export interface SubtitleParser {
  /** 解析字幕内容 */
  parse: (content: string) => SubtitleCue[];
}
