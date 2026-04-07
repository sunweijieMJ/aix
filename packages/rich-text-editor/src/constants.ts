import type { AnyExtension } from '@tiptap/core';
import type {
  TableConfig,
  ImageConfig,
  FontSizeConfig,
  FontFamilyConfig,
  MentionConfig,
  MentionItem,
  CharacterCountConfig,
} from './types';

/** 增强功能名称 */
export type EnhancedFeatureName =
  | 'table'
  | 'taskList'
  | 'image'
  | 'video'
  | 'textAlign'
  | 'textColor'
  | 'fontSize'
  | 'fontFamily'
  | 'superscriptSubscript'
  | 'characterCount'
  | 'mention'
  | 'highlight'
  | 'markdown';

/** 功能配置联合类型 */
type FeatureConfig =
  | TableConfig
  | ImageConfig
  | FontSizeConfig
  | FontFamilyConfig
  | MentionConfig
  | CharacterCountConfig
  | undefined;

/** 功能加载器：动态 import + 配置 → 返回扩展数组 */
type FeatureLoader = (config?: FeatureConfig) => Promise<AnyExtension[]>;

/** 默认字号列表 */
export const DEFAULT_FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'];

/** 默认字体列表 */
export const DEFAULT_FONT_FAMILIES = [
  { label: '默认', value: '' },
  { label: '宋体', value: 'SimSun, serif' },
  { label: '黑体', value: 'SimHei, sans-serif' },
  { label: '微软雅黑', value: '"Microsoft YaHei", sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
];

/** 增强功能动态加载器映射 */
const FEATURE_LOADERS: Record<EnhancedFeatureName, FeatureLoader> = {
  table: async (config) => {
    const tableConfig = config as TableConfig | undefined;
    const [{ Table }, { TableRow }, { TableHeader }, { TableCell }] = await Promise.all([
      import('@tiptap/extension-table'),
      import('@tiptap/extension-table-row'),
      import('@tiptap/extension-table-header'),
      import('@tiptap/extension-table-cell'),
    ]);
    return [
      Table.configure({ resizable: tableConfig?.resizable ?? true }),
      TableRow,
      TableHeader,
      TableCell,
    ];
  },

  taskList: async () => {
    const [{ TaskList }, { TaskItem }] = await Promise.all([
      import('@tiptap/extension-task-list'),
      import('@tiptap/extension-task-item'),
    ]);
    return [TaskList, TaskItem.configure({ nested: true })];
  },

  image: async (config) => {
    const imageConfig = config as ImageConfig | undefined;
    const { Image } = await import('@tiptap/extension-image');
    return [
      Image.configure({
        inline: true,
        allowBase64: imageConfig?.allowBase64 ?? false,
      }),
    ];
  },

  video: async () => {
    const { Video } = await import('./extensions/video');
    return [Video];
  },

  textAlign: async () => {
    const { TextAlign } = await import('@tiptap/extension-text-align');
    return [
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ];
  },

  textColor: async () => {
    const [{ Color }, { TextStyle }] = await Promise.all([
      import('@tiptap/extension-color'),
      import('@tiptap/extension-text-style'),
    ]);
    return [TextStyle, Color];
  },

  fontSize: async () => {
    const [{ FontSize }, { TextStyle }] = await Promise.all([
      import('@tiptap/extension-font-size'),
      import('@tiptap/extension-text-style'),
    ]);
    return [TextStyle, FontSize];
  },

  fontFamily: async () => {
    const [{ FontFamily }, { TextStyle }] = await Promise.all([
      import('@tiptap/extension-font-family'),
      import('@tiptap/extension-text-style'),
    ]);
    return [TextStyle, FontFamily];
  },

  superscriptSubscript: async () => {
    const [{ Subscript }, { Superscript }] = await Promise.all([
      import('@tiptap/extension-subscript'),
      import('@tiptap/extension-superscript'),
    ]);
    return [Subscript, Superscript];
  },

  characterCount: async (config) => {
    const countConfig = config as CharacterCountConfig | undefined;
    const { CharacterCount } = await import('@tiptap/extension-character-count');
    return [
      CharacterCount.configure({
        limit: countConfig?.limit,
        mode: countConfig?.mode,
      }),
    ];
  },

  mention: async (config) => {
    const mentionConfig = config as MentionConfig | undefined;
    const [{ Mention }, { createMentionSuggestion }] = await Promise.all([
      import('@tiptap/extension-mention'),
      import('./extensions/mentionSuggestion'),
    ]);
    return [
      Mention.configure({
        suggestion: createMentionSuggestion(mentionConfig),
        renderLabel: mentionConfig?.renderLabel
          ? ({ node }: { node: { attrs: Record<string, unknown> } }) =>
              mentionConfig.renderLabel!(node.attrs as MentionItem)
          : undefined,
      }),
    ];
  },

  highlight: async () => {
    const { Highlight } = await import('@tiptap/extension-highlight');
    return [Highlight.configure({ multicolor: true })];
  },

  markdown: async () => {
    const { Markdown } = await import('tiptap-markdown');
    return [Markdown];
  },
};

/**
 * 异步加载增强功能扩展（按需加载）
 * 动态 import() 本身已被 JS 运行时缓存，无需额外缓存层
 * @param name 功能名称
 * @param config 功能配置
 */
export async function loadFeatureExtensions(
  name: EnhancedFeatureName,
  config?: FeatureConfig,
): Promise<AnyExtension[]> {
  const loader = FEATURE_LOADERS[name];
  return loader(config);
}
