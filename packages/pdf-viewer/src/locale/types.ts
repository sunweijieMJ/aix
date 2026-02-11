export interface PdfViewerLocaleText {
  /** 工具栏：上一页按钮 title */
  prev: string;
  /** 工具栏：下一页按钮 title */
  next: string;
  /** 工具栏：放大按钮 title */
  zoomIn: string;
  /** 工具栏：缩小按钮 title */
  zoomOut: string;
  /** 工具栏：适应页面按钮 title */
  fitPage: string;

  /** 搜索栏：输入框 placeholder */
  searchPlaceholder: string;
  /** 搜索栏：上一个匹配项按钮 title */
  prevMatch: string;
  /** 搜索栏：下一个匹配项按钮 title */
  nextMatch: string;
  /** 搜索栏：无搜索结果文案 */
  noResults: string;
  /** 搜索栏：关闭搜索按钮 title */
  closeSearch: string;
  /** 搜索栏：清除输入按钮 title */
  clearSearch: string;

  /** 右键菜单：复制文本 */
  copy: string;
  /** 右键菜单：复制图片 */
  copyImage: string;
  /** 右键菜单：保存图片 */
  saveImage: string;
}
