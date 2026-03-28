import type { RichTextEditorLocale } from './types';

const zhCN: RichTextEditorLocale = {
  // Toolbar 按钮
  bold: '粗体',
  italic: '斜体',
  underline: '下划线',
  strikethrough: '删除线',
  code: '行内代码',
  heading: '标题',
  heading1: '标题 1',
  heading2: '标题 2',
  heading3: '标题 3',
  heading4: '标题 4',
  heading5: '标题 5',
  heading6: '标题 6',
  paragraph: '正文',
  bulletList: '无序列表',
  orderedList: '有序列表',
  taskList: '任务列表',
  blockquote: '引用',
  codeBlock: '代码块',
  horizontalRule: '分隔线',
  undo: '撤销',
  redo: '重做',

  // 链接
  link: '链接',
  linkUrl: '链接地址',
  linkText: '链接文本',
  linkOpen: '在新窗口打开',
  linkRemove: '移除链接',
  linkEdit: '编辑链接',

  // 插入
  image: '图片',
  video: '视频',
  table: '表格',
  insertTable: '插入表格',
  deleteTable: '删除表格',
  addColumnBefore: '在左侧插入列',
  addColumnAfter: '在右侧插入列',
  deleteColumn: '删除列',
  addRowBefore: '在上方插入行',
  addRowAfter: '在下方插入行',
  deleteRow: '删除行',
  mergeCells: '合并单元格',
  splitCell: '拆分单元格',

  // 文本样式
  textAlign: '对齐',
  alignLeft: '左对齐',
  alignCenter: '居中',
  alignRight: '右对齐',
  alignJustify: '两端对齐',
  textColor: '文字颜色',
  highlightColor: '背景颜色',
  fontSize: '字号',
  fontFamily: '字体',
  superscript: '上标',
  subscript: '下标',
  highlight: '高亮',
  mention: '提及',

  // 通用
  placeholder: '请输入内容...',
  confirm: '确定',
  cancel: '取消',
  characters: '字符',
  words: '字数',
  clearColor: '清除颜色',
  clearFormat: '清除格式',
  videoUrl: '请输入视频地址',

  // 上传提示
  uploadSizeExceeded: '文件大小超过限制',
  uploadTypeMismatch: '不支持的文件类型',
  uploadFailed: '上传失败，请重试',
};

export default zhCN;
