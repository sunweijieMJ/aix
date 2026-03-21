/**
 * RichTextEditor 组件国际化配置
 */
export interface RichTextEditorLocale {
  // ===== Toolbar 按钮 tooltip =====

  /** 粗体按钮提示 */
  bold: string;
  /** 斜体按钮提示 */
  italic: string;
  /** 下划线按钮提示 */
  underline: string;
  /** 删除线按钮提示 */
  strikethrough: string;
  /** 行内代码按钮提示 */
  code: string;
  /** 标题下拉菜单提示 */
  heading: string;
  /** 一级标题选项文案 */
  heading1: string;
  /** 二级标题选项文案 */
  heading2: string;
  /** 三级标题选项文案 */
  heading3: string;
  /** 四级标题选项文案 */
  heading4: string;
  /** 五级标题选项文案 */
  heading5: string;
  /** 六级标题选项文案 */
  heading6: string;
  /** 正文段落选项文案 */
  paragraph: string;
  /** 无序列表按钮提示 */
  bulletList: string;
  /** 有序列表按钮提示 */
  orderedList: string;
  /** 任务列表按钮提示 */
  taskList: string;
  /** 引用块按钮提示 */
  blockquote: string;
  /** 代码块按钮提示 */
  codeBlock: string;
  /** 分隔线按钮提示 */
  horizontalRule: string;
  /** 撤销按钮提示 */
  undo: string;
  /** 重做按钮提示 */
  redo: string;

  // ===== 链接 =====

  /** 链接按钮提示 */
  link: string;
  /** 链接地址输入框占位符 */
  linkUrl: string;
  /** 链接文本输入框占位符 */
  linkText: string;
  /** "在新窗口打开"选项文案 */
  linkOpen: string;
  /** 移除链接按钮文案 */
  linkRemove: string;
  /** 编辑链接按钮文案 */
  linkEdit: string;

  // ===== 插入 =====

  /** 图片按钮提示 */
  image: string;
  /** 视频按钮提示 */
  video: string;
  /** 表格按钮提示 */
  table: string;
  /** 插入表格菜单项文案 */
  insertTable: string;
  /** 删除表格菜单项文案 */
  deleteTable: string;
  /** 在左侧插入列菜单项文案 */
  addColumnBefore: string;
  /** 在右侧插入列菜单项文案 */
  addColumnAfter: string;
  /** 删除列菜单项文案 */
  deleteColumn: string;
  /** 在上方插入行菜单项文案 */
  addRowBefore: string;
  /** 在下方插入行菜单项文案 */
  addRowAfter: string;
  /** 删除行菜单项文案 */
  deleteRow: string;
  /** 合并单元格菜单项文案 */
  mergeCells: string;
  /** 拆分单元格菜单项文案 */
  splitCell: string;

  // ===== 文本样式 =====

  /** 对齐方式下拉菜单提示 */
  textAlign: string;
  /** 左对齐按钮提示 */
  alignLeft: string;
  /** 居中对齐按钮提示 */
  alignCenter: string;
  /** 右对齐按钮提示 */
  alignRight: string;
  /** 两端对齐按钮提示 */
  alignJustify: string;
  /** 文字颜色按钮提示 */
  textColor: string;
  /** 背景高亮颜色按钮提示 */
  highlightColor: string;
  /** 字号下拉菜单提示 */
  fontSize: string;
  /** 字体下拉菜单提示 */
  fontFamily: string;
  /** 上标按钮提示 */
  superscript: string;
  /** 下标按钮提示 */
  subscript: string;
  /** 高亮标记按钮提示 */
  highlight: string;
  /** @提及按钮提示 */
  mention: string;

  // ===== 通用 =====

  /** 编辑器空内容时的占位提示文案 */
  placeholder: string;
  /** 确认按钮文案 */
  confirm: string;
  /** 取消按钮文案 */
  cancel: string;
  /** 字符统计标签文案 */
  characters: string;
  /** 字数统计标签文案 */
  words: string;
  /** 清除颜色按钮文案 */
  clearColor: string;
  /** 视频链接输入提示 */
  videoUrl: string;
}
