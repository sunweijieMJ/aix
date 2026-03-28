import type { ChainedCommands, Editor } from '@tiptap/core';
import type { ComputedRef, FunctionalComponent, Ref } from 'vue';
import { computed } from 'vue';
import { DEFAULT_FONT_SIZES, DEFAULT_FONT_FAMILIES } from '../constants';
import {
  IconBold,
  IconItalic,
  IconUnderline,
  IconStrikethrough,
  IconCode,
  IconHeading,
  IconBulletList,
  IconOrderedList,
  IconTaskList,
  IconBlockquote,
  IconCodeBlock,
  IconHorizontalRule,
  IconUndo,
  IconRedo,
  IconLink,
  IconImage,
  IconVideo,
  IconTable,
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
  IconAlignJustify,
  IconTextColor,
  IconHighlightColor,
  IconSuperscript,
  IconSubscript,
  IconFontSize,
  IconFontFamily,
  IconClearFormat,
} from '../icons';
import type { RichTextEditorLocale } from '../locale/types';
import type {
  DropdownOption,
  RichTextEditorProps,
  VideoConfig,
} from '../types';
import { resolveUploadFn, processFileUpload } from '../utils/upload';

/**
 * 扩展命令的链式调用类型
 * 动态加载的扩展（fontSize/fontFamily/textAlign 等）在 ChainedCommands 上没有类型声明，
 * 通过统一的 helper 收敛类型断言，避免散落的 as any。
 */
type ExtendedChainedCommands = ChainedCommands &
  Record<string, (...args: unknown[]) => ExtendedChainedCommands>;

/** 获取带扩展命令的 chain，集中处理类型断言 */
function chainFocus(ed: Editor): ExtendedChainedCommands {
  return ed.chain().focus() as unknown as ExtendedChainedCommands;
}

/** 工具栏按钮项 */
export interface ToolbarItem {
  key: string;
  type: 'button' | 'dropdown' | 'color-picker';
  icon?: FunctionalComponent;
  label: string;
  isActive: () => boolean;
  isDisabled: () => boolean;
  action: () => void;
  // dropdown 专用
  options?: DropdownOption[];
  currentValue?: () => string;
  displayLabel?: () => string;
  onSelect?: (value: string) => void;
  // color-picker 专用
  currentColor?: () => string;
  colors?: string[];
  onColorSelect?: (color: string) => void;
}

/** 工具栏分组 */
export interface ToolbarGroup {
  id: string;
  items: ToolbarItem[];
}

/** 默认颜色面板 */
const TEXT_COLORS = [
  '#000000',
  '#434343',
  '#666666',
  '#999999',
  '#b7b7b7',
  '#cccccc',
  '#d9d9d9',
  '#efefef',
  '#f3f3f3',
  '#ffffff',
  '#980000',
  '#ff0000',
  '#ff9900',
  '#ffff00',
  '#00ff00',
  '#00ffff',
  '#4a86e8',
  '#0000ff',
  '#9900ff',
  '#ff00ff',
  '#e6b8af',
  '#f4cccc',
  '#fce5cd',
  '#fff2cc',
  '#d9ead3',
  '#d0e0e3',
  '#c9daf8',
  '#cfe2f3',
  '#d9d2e9',
  '#ead1dc',
];

export interface UseEditorToolbarReturn {
  toolbarGroups: ComputedRef<ToolbarGroup[]>;
}

/**
 * 管理 Toolbar 按钮分组、激活态、显隐逻辑
 */
export interface UseEditorToolbarOptions {
  /** 链接按钮点击回调（用于打开 LinkEditPopover） */
  onLinkClick?: () => void;
}

export function useEditorToolbar(
  editor: Ref<Editor | null>,
  props: RichTextEditorProps,
  t: ComputedRef<RichTextEditorLocale>,
  options?: UseEditorToolbarOptions,
): UseEditorToolbarReturn {
  const toolbarGroups = computed<ToolbarGroup[]>(() => {
    const ed = editor.value;
    if (!ed) return [];

    const groups: ToolbarGroup[] = [];

    // G1: 撤销/重做
    groups.push({
      id: 'history',
      items: [
        {
          key: 'undo',
          type: 'button',
          icon: IconUndo,
          label: t.value.undo,
          isActive: () => false,
          isDisabled: () => !ed.can().undo(),
          action: () => ed.chain().focus().undo().run(),
        },
        {
          key: 'redo',
          type: 'button',
          icon: IconRedo,
          label: t.value.redo,
          isActive: () => false,
          isDisabled: () => !ed.can().redo(),
          action: () => ed.chain().focus().redo().run(),
        },
      ],
    });

    // G2: 文本格式
    groups.push({
      id: 'format',
      items: [
        {
          key: 'bold',
          type: 'button',
          icon: IconBold,
          label: t.value.bold,
          isActive: () => ed.isActive('bold'),
          isDisabled: () => false,
          action: () => ed.chain().focus().toggleBold().run(),
        },
        {
          key: 'italic',
          type: 'button',
          icon: IconItalic,
          label: t.value.italic,
          isActive: () => ed.isActive('italic'),
          isDisabled: () => false,
          action: () => ed.chain().focus().toggleItalic().run(),
        },
        {
          key: 'underline',
          type: 'button',
          icon: IconUnderline,
          label: t.value.underline,
          isActive: () => ed.isActive('underline'),
          isDisabled: () => false,
          action: () => ed.chain().focus().toggleUnderline().run(),
        },
        {
          key: 'strike',
          type: 'button',
          icon: IconStrikethrough,
          label: t.value.strikethrough,
          isActive: () => ed.isActive('strike'),
          isDisabled: () => false,
          action: () => ed.chain().focus().toggleStrike().run(),
        },
        {
          key: 'code',
          type: 'button',
          icon: IconCode,
          label: t.value.code,
          isActive: () => ed.isActive('code'),
          isDisabled: () => false,
          action: () => ed.chain().focus().toggleCode().run(),
        },
        {
          key: 'clearFormat',
          type: 'button',
          icon: IconClearFormat,
          label: t.value.clearFormat,
          isActive: () => false,
          isDisabled: () => false,
          action: () => ed.chain().focus().clearNodes().unsetAllMarks().run(),
        },
      ],
    });

    // G3: 标题下拉
    const headingOptions: DropdownOption[] = [
      { label: t.value.paragraph, value: 'paragraph' },
      { label: t.value.heading1, value: '1' },
      { label: t.value.heading2, value: '2' },
      { label: t.value.heading3, value: '3' },
      { label: t.value.heading4, value: '4' },
      { label: t.value.heading5, value: '5' },
      { label: t.value.heading6, value: '6' },
    ];

    groups.push({
      id: 'heading',
      items: [
        {
          key: 'heading',
          type: 'dropdown',
          icon: IconHeading,
          label: t.value.heading,
          isActive: () => ed.isActive('heading'),
          isDisabled: () => false,
          action: () => {},
          options: headingOptions,
          currentValue: () => {
            for (let i = 1; i <= 6; i++) {
              if (ed.isActive('heading', { level: i })) return String(i);
            }
            return 'paragraph';
          },
          displayLabel: () => {
            for (let i = 1; i <= 6; i++) {
              if (ed.isActive('heading', { level: i })) return `H${i}`;
            }
            return t.value.paragraph;
          },
          onSelect: (value: string) => {
            if (value === 'paragraph') {
              ed.chain().focus().setParagraph().run();
            } else {
              ed.chain()
                .focus()
                .toggleHeading({
                  level: Number(value) as 1 | 2 | 3 | 4 | 5 | 6,
                })
                .run();
            }
          },
        },
      ],
    });

    // G4: 字体样式（按需）
    const fontItems: ToolbarItem[] = [];
    if (props.fontSize) {
      const sizes =
        typeof props.fontSize === 'object' && props.fontSize.sizes
          ? props.fontSize.sizes
          : DEFAULT_FONT_SIZES;
      fontItems.push({
        key: 'fontSize',
        type: 'dropdown',
        icon: IconFontSize,
        label: t.value.fontSize,
        isActive: () => false,
        isDisabled: () => false,
        action: () => {},
        options: sizes.map((s) => ({ label: s, value: s })),
        currentValue: () => ed.getAttributes('textStyle').fontSize ?? '',
        displayLabel: () =>
          ed.getAttributes('textStyle').fontSize ?? t.value.fontSize,
        onSelect: (value: string) => {
          chainFocus(ed).setFontSize(value).run();
        },
      });
    }
    if (props.fontFamily) {
      const families =
        typeof props.fontFamily === 'object' && props.fontFamily.families
          ? props.fontFamily.families
          : DEFAULT_FONT_FAMILIES;
      fontItems.push({
        key: 'fontFamily',
        type: 'dropdown',
        icon: IconFontFamily,
        label: t.value.fontFamily,
        isActive: () => false,
        isDisabled: () => false,
        action: () => {},
        options: families.map((f) => ({ label: f.label, value: f.value })),
        currentValue: () => ed.getAttributes('textStyle').fontFamily ?? '',
        displayLabel: () => {
          const current = ed.getAttributes('textStyle').fontFamily;
          const found = families.find((f) => f.value === current);
          return found?.label ?? t.value.fontFamily;
        },
        onSelect: (value: string) => {
          if (value) {
            chainFocus(ed).setFontFamily(value).run();
          } else {
            chainFocus(ed).unsetFontFamily().run();
          }
        },
      });
    }
    if (fontItems.length) {
      groups.push({ id: 'font', items: fontItems });
    }

    // G5: 颜色（按需，textColor 和 highlight 独立控制）
    const colorItems: ToolbarItem[] = [];
    if (props.textColor) {
      colorItems.push({
        key: 'textColor',
        type: 'color-picker',
        icon: IconTextColor,
        label: t.value.textColor,
        isActive: () => false,
        isDisabled: () => false,
        action: () => {},
        currentColor: () => ed.getAttributes('textStyle').color ?? '',
        colors: TEXT_COLORS,
        onColorSelect: (color: string) => {
          if (color) {
            chainFocus(ed).setColor(color).run();
          } else {
            chainFocus(ed).unsetColor().run();
          }
        },
      });
    }
    if (props.highlight) {
      colorItems.push({
        key: 'highlightColor',
        type: 'color-picker',
        icon: IconHighlightColor,
        label: t.value.highlightColor,
        isActive: () => ed.isActive('highlight'),
        isDisabled: () => false,
        action: () => {},
        currentColor: () => ed.getAttributes('highlight').color ?? '',
        colors: TEXT_COLORS,
        onColorSelect: (color: string) => {
          if (color) {
            chainFocus(ed).setHighlight({ color }).run();
          } else {
            chainFocus(ed).unsetHighlight().run();
          }
        },
      });
    }
    if (colorItems.length) {
      groups.push({ id: 'color', items: colorItems });
    }

    // G6: 对齐（按需）
    if (props.textAlign) {
      groups.push({
        id: 'align',
        items: [
          {
            key: 'alignLeft',
            type: 'button',
            icon: IconAlignLeft,
            label: t.value.alignLeft,
            isActive: () => ed.isActive({ textAlign: 'left' }),
            isDisabled: () => false,
            action: () => chainFocus(ed).setTextAlign('left').run(),
          },
          {
            key: 'alignCenter',
            type: 'button',
            icon: IconAlignCenter,
            label: t.value.alignCenter,
            isActive: () => ed.isActive({ textAlign: 'center' }),
            isDisabled: () => false,
            action: () => chainFocus(ed).setTextAlign('center').run(),
          },
          {
            key: 'alignRight',
            type: 'button',
            icon: IconAlignRight,
            label: t.value.alignRight,
            isActive: () => ed.isActive({ textAlign: 'right' }),
            isDisabled: () => false,
            action: () => chainFocus(ed).setTextAlign('right').run(),
          },
          {
            key: 'alignJustify',
            type: 'button',
            icon: IconAlignJustify,
            label: t.value.alignJustify,
            isActive: () => ed.isActive({ textAlign: 'justify' }),
            isDisabled: () => false,
            action: () => chainFocus(ed).setTextAlign('justify').run(),
          },
        ],
      });
    }

    // G7: 列表
    const listItems: ToolbarItem[] = [
      {
        key: 'bulletList',
        type: 'button',
        icon: IconBulletList,
        label: t.value.bulletList,
        isActive: () => ed.isActive('bulletList'),
        isDisabled: () => false,
        action: () => ed.chain().focus().toggleBulletList().run(),
      },
      {
        key: 'orderedList',
        type: 'button',
        icon: IconOrderedList,
        label: t.value.orderedList,
        isActive: () => ed.isActive('orderedList'),
        isDisabled: () => false,
        action: () => ed.chain().focus().toggleOrderedList().run(),
      },
    ];
    if (props.taskList) {
      listItems.push({
        key: 'taskList',
        type: 'button',
        icon: IconTaskList,
        label: t.value.taskList,
        isActive: () => ed.isActive('taskList'),
        isDisabled: () => false,
        action: () => chainFocus(ed).toggleTaskList().run(),
      });
    }
    groups.push({ id: 'list', items: listItems });

    // G9: 插入
    const insertItems: ToolbarItem[] = [
      {
        key: 'link',
        type: 'button',
        icon: IconLink,
        label: t.value.link,
        isActive: () => ed.isActive('link'),
        isDisabled: () => false,
        action: () => {
          if (options?.onLinkClick) {
            options.onLinkClick();
          } else {
            const url = window.prompt(t.value.linkUrl);
            if (url) {
              ed.chain().focus().setLink({ href: url }).run();
            }
          }
        },
      },
    ];
    if (props.image) {
      const imageConfig = props.image;
      const imageUploadFn = resolveUploadFn(imageConfig);
      const hasImageAbility = !!(imageConfig.customPicker || imageUploadFn);
      if (!hasImageAbility) {
        console.warn(
          '[RichTextEditor] image 已配置但未提供有效的上传方式（customPicker / upload / server），图片按钮将被禁用。',
        );
      }
      insertItems.push({
        key: 'image',
        type: 'button',
        icon: IconImage,
        label: t.value.image,
        isActive: () => false,
        isDisabled: () => !hasImageAbility,
        action: async () => {
          // 优先级最高：customPicker 完全接管选择和上传
          if (imageConfig.customPicker) {
            const url = await imageConfig.customPicker();
            if (url) chainFocus(ed).setImage({ src: url }).run();
            return;
          }
          if (!imageUploadFn) return;
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = imageConfig.acceptedTypes?.join(',') ?? 'image/*';
          input.onchange = async () => {
            const rawFile = input.files?.[0];
            if (!rawFile) return;
            await processFileUpload(
              rawFile,
              imageConfig,
              imageUploadFn,
              (url) => chainFocus(ed).setImage({ src: url }).run(),
              t.value,
              5 * 1024 * 1024,
            );
          };
          input.click();
        },
      });
    }
    if (props.video) {
      const videoConfig: VideoConfig =
        typeof props.video === 'object' ? props.video : {};
      // Bug fix: 视频默认超时 60s，通过显式传入确保不被 fetchUpload 的 30s 默认值覆盖
      const videoUploadFn = resolveUploadFn({
        ...videoConfig,
        timeout: videoConfig.timeout ?? 60000,
      });
      insertItems.push({
        key: 'video',
        type: 'button',
        icon: IconVideo,
        label: t.value.video,
        isActive: () => false,
        isDisabled: () => false,
        action: async () => {
          // 优先级最高：customPicker 完全接管
          if (videoConfig.customPicker) {
            const url = await videoConfig.customPicker();
            if (url) chainFocus(ed).setVideo({ src: url }).run();
            return;
          }
          if (videoUploadFn) {
            // 有上传能力 → 走文件上传
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = videoConfig.acceptedTypes?.join(',') ?? 'video/*';
            input.onchange = async () => {
              const rawFile = input.files?.[0];
              if (!rawFile) return;
              await processFileUpload(
                rawFile,
                videoConfig,
                videoUploadFn,
                (url) => chainFocus(ed).setVideo({ src: url }).run(),
                t.value,
                100 * 1024 * 1024,
              );
            };
            input.click();
          } else {
            // 无上传能力 → 输入视频 URL
            const url = window.prompt(t.value.videoUrl);
            if (url) {
              chainFocus(ed).setVideo({ src: url }).run();
            }
          }
        },
      });
    }
    if (props.table) {
      insertItems.push({
        key: 'table',
        type: 'button',
        icon: IconTable,
        label: t.value.table,
        isActive: () => ed.isActive('table'),
        isDisabled: () => false,
        action: () =>
          chainFocus(ed)
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run(),
      });
    }
    insertItems.push(
      {
        key: 'horizontalRule',
        type: 'button',
        icon: IconHorizontalRule,
        label: t.value.horizontalRule,
        isActive: () => false,
        isDisabled: () => false,
        action: () => ed.chain().focus().setHorizontalRule().run(),
      },
      {
        key: 'blockquote',
        type: 'button',
        icon: IconBlockquote,
        label: t.value.blockquote,
        isActive: () => ed.isActive('blockquote'),
        isDisabled: () => false,
        action: () => ed.chain().focus().toggleBlockquote().run(),
      },
      {
        key: 'codeBlock',
        type: 'button',
        icon: IconCodeBlock,
        label: t.value.codeBlock,
        isActive: () => ed.isActive('codeBlock'),
        isDisabled: () => false,
        action: () => ed.chain().focus().toggleCodeBlock().run(),
      },
    );
    groups.push({ id: 'insert', items: insertItems });

    // G10: 上下标（按需）
    if (props.superscriptSubscript) {
      groups.push({
        id: 'script',
        items: [
          {
            key: 'superscript',
            type: 'button',
            icon: IconSuperscript,
            label: t.value.superscript,
            isActive: () => ed.isActive('superscript'),
            isDisabled: () => false,
            action: () => chainFocus(ed).toggleSuperscript().run(),
          },
          {
            key: 'subscript',
            type: 'button',
            icon: IconSubscript,
            label: t.value.subscript,
            isActive: () => ed.isActive('subscript'),
            isDisabled: () => false,
            action: () => chainFocus(ed).toggleSubscript().run(),
          },
        ],
      });
    }

    return groups;
  });

  return {
    toolbarGroups,
  };
}
