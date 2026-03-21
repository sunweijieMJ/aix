import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import type { CodeEditorTheme } from '../types';

/** 浅色主题 */
const lightEditorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--aix-colorBgContainer, #ffffff)',
      color: 'var(--aix-colorText, #1f2937)',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--aix-colorPrimary, #1677ff)',
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      {
        backgroundColor: 'var(--aix-colorPrimaryBg, #e6f4ff)',
      },
    '.cm-activeLine': {
      backgroundColor: 'var(--aix-colorBgTextHover, #f5f5f5)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--aix-colorBgLayout, #f5f5f5)',
      color: 'var(--aix-colorTextQuaternary, #bfbfbf)',
      borderRight: '1px solid var(--aix-colorBorderSecondary, #f0f0f0)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--aix-colorBgTextHover, #f5f5f5)',
      color: 'var(--aix-colorTextSecondary, #595959)',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'var(--aix-colorBgTextHover, #f5f5f5)',
      border: 'none',
      color: 'var(--aix-colorTextTertiary, #8c8c8c)',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--aix-colorBgElevated, #ffffff)',
      border: '1px solid var(--aix-colorBorderSecondary, #f0f0f0)',
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li[aria-selected]': {
        backgroundColor: 'var(--aix-colorPrimaryBg, #e6f4ff)',
      },
    },
  },
  { dark: false },
);

/**
 * 浅色代码高亮（GitHub 配色）
 * 注意：CodeMirror HighlightStyle 通过 JS 对象定义 token 颜色，无法使用 CSS Variables，
 * 如需主题化需替换整个 HighlightStyle 实例。
 */
const lightHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#d73a49' },
  {
    tag: [tags.name, tags.deleted, tags.character, tags.macroName],
    color: '#24292e',
  },
  { tag: [tags.function(tags.variableName), tags.labelName], color: '#6f42c1' },
  {
    tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)],
    color: '#005cc5',
  },
  { tag: [tags.definition(tags.name), tags.separator], color: '#24292e' },
  {
    tag: [
      tags.typeName,
      tags.className,
      tags.number,
      tags.changed,
      tags.annotation,
      tags.modifier,
      tags.self,
      tags.namespace,
    ],
    color: '#e36209',
  },
  {
    tag: [
      tags.operator,
      tags.operatorKeyword,
      tags.url,
      tags.escape,
      tags.regexp,
      tags.link,
      tags.special(tags.string),
    ],
    color: '#d73a49',
  },
  { tag: [tags.meta, tags.comment], color: '#6a737d' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: '#032f62', textDecoration: 'underline' },
  { tag: tags.heading, fontWeight: 'bold', color: '#005cc5' },
  {
    tag: [tags.atom, tags.bool, tags.special(tags.variableName)],
    color: '#005cc5',
  },
  {
    tag: [tags.processingInstruction, tags.string, tags.inserted],
    color: '#032f62',
  },
  { tag: tags.invalid, color: '#cb2431' },
]);

/** 深色主题 */
const darkEditorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--aix-colorBgContainer, #1e1e1e)',
      color: 'var(--aix-colorText, #d4d4d4)',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--aix-colorPrimary, #aeafad)',
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      {
        backgroundColor: 'var(--aix-colorPrimaryBg, #264f78)',
      },
    '.cm-activeLine': {
      backgroundColor: 'var(--aix-colorBgTextHover, #2a2d2e)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--aix-colorBgLayout, #1e1e1e)',
      color: 'var(--aix-colorTextQuaternary, #858585)',
      borderRight: '1px solid var(--aix-colorBorderSecondary, #333333)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--aix-colorBgTextHover, #2a2d2e)',
      color: 'var(--aix-colorTextSecondary, #c6c6c6)',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'var(--aix-colorBgTextHover, #3c3c3c)',
      border: 'none',
      color: 'var(--aix-colorTextTertiary, #c5c5c5)',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--aix-colorBgElevated, #252526)',
      border: '1px solid var(--aix-colorBorderSecondary, #454545)',
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li[aria-selected]': {
        backgroundColor: 'var(--aix-colorPrimaryBg, #04395e)',
      },
    },
  },
  { dark: true },
);

/**
 * 深色代码高亮（VS Code Dark+ 配色）
 * 同上，CodeMirror HighlightStyle API 限制，无法使用 CSS Variables。
 */
const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#569cd6' },
  {
    tag: [tags.name, tags.deleted, tags.character, tags.macroName],
    color: '#d4d4d4',
  },
  { tag: [tags.function(tags.variableName), tags.labelName], color: '#dcdcaa' },
  {
    tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)],
    color: '#4fc1ff',
  },
  { tag: [tags.definition(tags.name), tags.separator], color: '#d4d4d4' },
  {
    tag: [
      tags.typeName,
      tags.className,
      tags.number,
      tags.changed,
      tags.annotation,
      tags.modifier,
      tags.self,
      tags.namespace,
    ],
    color: '#4ec9b0',
  },
  { tag: [tags.operator, tags.operatorKeyword], color: '#c586c0' },
  {
    tag: [
      tags.url,
      tags.escape,
      tags.regexp,
      tags.link,
      tags.special(tags.string),
    ],
    color: '#d7ba7d',
  },
  { tag: [tags.meta, tags.comment], color: '#6a9955' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: '#569cd6', textDecoration: 'underline' },
  { tag: tags.heading, fontWeight: 'bold', color: '#569cd6' },
  {
    tag: [tags.atom, tags.bool, tags.special(tags.variableName)],
    color: '#569cd6',
  },
  {
    tag: [tags.processingInstruction, tags.string, tags.inserted],
    color: '#ce9178',
  },
  { tag: tags.invalid, color: '#f44747' },
]);

/** 获取主题扩展（编辑器主题 + 语法高亮） */
export function getThemeExtension(theme: CodeEditorTheme): Extension[] {
  if (theme === 'dark') {
    return [darkEditorTheme, syntaxHighlighting(darkHighlightStyle)];
  }
  return [lightEditorTheme, syntaxHighlighting(lightHighlightStyle)];
}
