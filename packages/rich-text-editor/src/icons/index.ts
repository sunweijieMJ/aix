import { h, type FunctionalComponent } from 'vue';

/** 创建 SVG 图标的辅助函数 */
function createIcon(pathD: string, viewBox = '0 0 24 24'): FunctionalComponent {
  return () =>
    h(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox,
        width: '1em',
        height: '1em',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '2',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      },
      [h('path', { d: pathD })],
    );
}

/** 创建多子节点 SVG 图标 */
function createIconMulti(
  children: Array<{ tag: string; attrs: Record<string, string> }>,
  viewBox = '0 0 24 24',
): FunctionalComponent {
  return () =>
    h(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox,
        width: '1em',
        height: '1em',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '2',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      },
      children.map((c) => h(c.tag, c.attrs)),
    );
}

// ===== 文本格式 =====
export const IconBold: FunctionalComponent = () =>
  h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 24 24',
      width: '1em',
      height: '1em',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
    [
      h('path', { d: 'M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z' }),
      h('path', { d: 'M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z' }),
    ],
  );

export const IconItalic = createIcon('M19 4h-9M14 20H5M15 4L9 20');

export const IconUnderline = createIconMulti([
  { tag: 'path', attrs: { d: 'M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3' } },
  { tag: 'line', attrs: { x1: '4', y1: '21', x2: '20', y2: '21' } },
]);

export const IconStrikethrough = createIconMulti([
  { tag: 'path', attrs: { d: 'M16 4H9a3 3 0 0 0-2.83 4' } },
  { tag: 'path', attrs: { d: 'M14 12a4 4 0 0 1 0 8H6' } },
  { tag: 'line', attrs: { x1: '4', y1: '12', x2: '20', y2: '12' } },
]);

export const IconCode = createIconMulti([
  { tag: 'polyline', attrs: { points: '16 18 22 12 16 6' } },
  { tag: 'polyline', attrs: { points: '8 6 2 12 8 18' } },
]);

// ===== 清除格式 =====
export const IconClearFormat = createIconMulti([
  { tag: 'path', attrs: { d: 'M4 7V4h16v3' } },
  { tag: 'path', attrs: { d: 'M9 20h6' } },
  { tag: 'path', attrs: { d: 'M12 4v16' } },
  { tag: 'line', attrs: { x1: '17', y1: '17', x2: '22', y2: '22' } },
  { tag: 'line', attrs: { x1: '22', y1: '17', x2: '17', y2: '22' } },
]);

// ===== 标题 =====
export const IconHeading = createIconMulti([
  { tag: 'path', attrs: { d: 'M6 12h12' } },
  { tag: 'path', attrs: { d: 'M6 4v16' } },
  { tag: 'path', attrs: { d: 'M18 4v16' } },
]);

// ===== 列表 =====
export const IconBulletList = createIconMulti([
  { tag: 'line', attrs: { x1: '8', y1: '6', x2: '21', y2: '6' } },
  { tag: 'line', attrs: { x1: '8', y1: '12', x2: '21', y2: '12' } },
  { tag: 'line', attrs: { x1: '8', y1: '18', x2: '21', y2: '18' } },
  { tag: 'line', attrs: { x1: '3', y1: '6', x2: '3.01', y2: '6' } },
  { tag: 'line', attrs: { x1: '3', y1: '12', x2: '3.01', y2: '12' } },
  { tag: 'line', attrs: { x1: '3', y1: '18', x2: '3.01', y2: '18' } },
]);

export const IconOrderedList = createIconMulti([
  { tag: 'line', attrs: { x1: '10', y1: '6', x2: '21', y2: '6' } },
  { tag: 'line', attrs: { x1: '10', y1: '12', x2: '21', y2: '12' } },
  { tag: 'line', attrs: { x1: '10', y1: '18', x2: '21', y2: '18' } },
  { tag: 'path', attrs: { d: 'M4 6h1v4' } },
  { tag: 'path', attrs: { d: 'M4 10h2' } },
  { tag: 'path', attrs: { d: 'M6 18H4c0-1 2-2 2-3s-1-1.5-2-1' } },
]);

export const IconTaskList = createIconMulti([
  { tag: 'rect', attrs: { x: '3', y: '5', width: '6', height: '6', rx: '1' } },
  { tag: 'path', attrs: { d: 'M3 17l2 2 4-4' } },
  { tag: 'line', attrs: { x1: '13', y1: '6', x2: '21', y2: '6' } },
  { tag: 'line', attrs: { x1: '13', y1: '12', x2: '21', y2: '12' } },
  { tag: 'line', attrs: { x1: '13', y1: '18', x2: '21', y2: '18' } },
]);

// ===== 引用和代码块 =====
export const IconBlockquote = createIconMulti([
  {
    tag: 'path',
    attrs: {
      d: 'M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z',
    },
  },
  {
    tag: 'path',
    attrs: {
      d: 'M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z',
    },
  },
]);

export const IconCodeBlock = createIconMulti([
  { tag: 'path', attrs: { d: 'M10 9.5 8 12l2 2.5' } },
  { tag: 'path', attrs: { d: 'M14 9.5l2 2.5-2 2.5' } },
  {
    tag: 'rect',
    attrs: { x: '2', y: '4', width: '20', height: '16', rx: '2' },
  },
]);

// ===== 撤销/重做 =====
export const IconUndo = createIconMulti([
  { tag: 'path', attrs: { d: 'M3 7v6h6' } },
  { tag: 'path', attrs: { d: 'M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13' } },
]);

export const IconRedo = createIconMulti([
  { tag: 'path', attrs: { d: 'M21 7v6h-6' } },
  { tag: 'path', attrs: { d: 'M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7' } },
]);

// ===== 链接 =====
export const IconLink = createIconMulti([
  {
    tag: 'path',
    attrs: { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' },
  },
  {
    tag: 'path',
    attrs: {
      d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    },
  },
]);

// ===== 水平线 =====
export const IconHorizontalRule = createIconMulti([
  { tag: 'line', attrs: { x1: '2', y1: '12', x2: '22', y2: '12' } },
]);

// ===== 插入 =====
export const IconImage = createIconMulti([
  {
    tag: 'rect',
    attrs: { x: '3', y: '3', width: '18', height: '18', rx: '2', ry: '2' },
  },
  { tag: 'circle', attrs: { cx: '8.5', cy: '8.5', r: '1.5' } },
  { tag: 'polyline', attrs: { points: '21 15 16 10 5 21' } },
]);

export const IconVideo = createIconMulti([
  { tag: 'polygon', attrs: { points: '23 7 16 12 23 17 23 7' } },
  {
    tag: 'rect',
    attrs: { x: '1', y: '5', width: '15', height: '14', rx: '2', ry: '2' },
  },
]);

export const IconTable = createIconMulti([
  {
    tag: 'rect',
    attrs: { x: '3', y: '3', width: '18', height: '18', rx: '2' },
  },
  { tag: 'line', attrs: { x1: '3', y1: '9', x2: '21', y2: '9' } },
  { tag: 'line', attrs: { x1: '3', y1: '15', x2: '21', y2: '15' } },
  { tag: 'line', attrs: { x1: '9', y1: '3', x2: '9', y2: '21' } },
  { tag: 'line', attrs: { x1: '15', y1: '3', x2: '15', y2: '21' } },
]);

// ===== 表格操作 =====

// 在上方插入行（表格 + 上箭头）
export const IconRowBefore = createIconMulti([
  {
    tag: 'rect',
    attrs: { x: '3', y: '8', width: '18', height: '13', rx: '2' },
  },
  { tag: 'line', attrs: { x1: '3', y1: '14', x2: '21', y2: '14' } },
  { tag: 'line', attrs: { x1: '12', y1: '8', x2: '12', y2: '21' } },
  { tag: 'path', attrs: { d: 'M12 5V1m0 0l-3 3m3-3l3 3' } },
]);

// 在下方插入行
export const IconRowAfter = createIconMulti([
  {
    tag: 'rect',
    attrs: { x: '3', y: '3', width: '18', height: '13', rx: '2' },
  },
  { tag: 'line', attrs: { x1: '3', y1: '10', x2: '21', y2: '10' } },
  { tag: 'line', attrs: { x1: '12', y1: '3', x2: '12', y2: '16' } },
  { tag: 'path', attrs: { d: 'M12 19v4m0 0l-3-3m3 3l3-3' } },
]);

// 删除行
export const IconRowDelete = createIconMulti([
  {
    tag: 'rect',
    attrs: { x: '3', y: '3', width: '18', height: '18', rx: '2' },
  },
  { tag: 'line', attrs: { x1: '3', y1: '9', x2: '21', y2: '9' } },
  { tag: 'line', attrs: { x1: '3', y1: '15', x2: '21', y2: '15' } },
  { tag: 'line', attrs: { x1: '8', y1: '11', x2: '16', y2: '13' } },
  { tag: 'line', attrs: { x1: '16', y1: '11', x2: '8', y2: '13' } },
]);

// 在左侧插入列
export const IconColumnBefore = createIconMulti([
  {
    tag: 'rect',
    attrs: { x: '8', y: '3', width: '13', height: '18', rx: '2' },
  },
  { tag: 'line', attrs: { x1: '14', y1: '3', x2: '14', y2: '21' } },
  { tag: 'line', attrs: { x1: '8', y1: '12', x2: '21', y2: '12' } },
  { tag: 'path', attrs: { d: 'M5 12H1m0 0l3-3m-3 3l3 3' } },
]);

// 在右侧插入列
export const IconColumnAfter = createIconMulti([
  {
    tag: 'rect',
    attrs: { x: '3', y: '3', width: '13', height: '18', rx: '2' },
  },
  { tag: 'line', attrs: { x1: '10', y1: '3', x2: '10', y2: '21' } },
  { tag: 'line', attrs: { x1: '3', y1: '12', x2: '16', y2: '12' } },
  { tag: 'path', attrs: { d: 'M19 12h4m0 0l-3-3m3 3l-3 3' } },
]);

// 删除列
export const IconColumnDelete = createIconMulti([
  {
    tag: 'rect',
    attrs: { x: '3', y: '3', width: '18', height: '18', rx: '2' },
  },
  { tag: 'line', attrs: { x1: '9', y1: '3', x2: '9', y2: '21' } },
  { tag: 'line', attrs: { x1: '15', y1: '3', x2: '15', y2: '21' } },
  { tag: 'line', attrs: { x1: '11', y1: '8', x2: '13', y2: '16' } },
  { tag: 'line', attrs: { x1: '13', y1: '8', x2: '11', y2: '16' } },
]);

// 合并单元格
export const IconMergeCells = createIconMulti([
  {
    tag: 'rect',
    attrs: { x: '3', y: '3', width: '18', height: '18', rx: '2' },
  },
  { tag: 'line', attrs: { x1: '3', y1: '12', x2: '21', y2: '12' } },
  { tag: 'path', attrs: { d: 'M8 7l4 5-4 5' } },
  { tag: 'path', attrs: { d: 'M16 7l-4 5 4 5' } },
]);

// 拆分单元格
export const IconSplitCell = createIconMulti([
  {
    tag: 'rect',
    attrs: { x: '3', y: '3', width: '18', height: '18', rx: '2' },
  },
  { tag: 'line', attrs: { x1: '12', y1: '3', x2: '12', y2: '21' } },
  { tag: 'path', attrs: { d: 'M8 8l-4 4 4 4' } },
  { tag: 'path', attrs: { d: 'M16 8l4 4-4 4' } },
]);

// 删除表格
export const IconTableDelete = createIconMulti([
  {
    tag: 'rect',
    attrs: { x: '3', y: '3', width: '18', height: '18', rx: '2' },
  },
  { tag: 'line', attrs: { x1: '3', y1: '9', x2: '21', y2: '9' } },
  { tag: 'line', attrs: { x1: '3', y1: '15', x2: '21', y2: '15' } },
  { tag: 'line', attrs: { x1: '9', y1: '3', x2: '9', y2: '21' } },
  { tag: 'line', attrs: { x1: '15', y1: '3', x2: '15', y2: '21' } },
  { tag: 'line', attrs: { x1: '7', y1: '7', x2: '17', y2: '17' } },
  { tag: 'line', attrs: { x1: '17', y1: '7', x2: '7', y2: '17' } },
]);

// ===== 对齐 =====
export const IconAlignLeft = createIconMulti([
  { tag: 'line', attrs: { x1: '17', y1: '10', x2: '3', y2: '10' } },
  { tag: 'line', attrs: { x1: '21', y1: '6', x2: '3', y2: '6' } },
  { tag: 'line', attrs: { x1: '21', y1: '14', x2: '3', y2: '14' } },
  { tag: 'line', attrs: { x1: '17', y1: '18', x2: '3', y2: '18' } },
]);

export const IconAlignCenter = createIconMulti([
  { tag: 'line', attrs: { x1: '18', y1: '10', x2: '6', y2: '10' } },
  { tag: 'line', attrs: { x1: '21', y1: '6', x2: '3', y2: '6' } },
  { tag: 'line', attrs: { x1: '21', y1: '14', x2: '3', y2: '14' } },
  { tag: 'line', attrs: { x1: '18', y1: '18', x2: '6', y2: '18' } },
]);

export const IconAlignRight = createIconMulti([
  { tag: 'line', attrs: { x1: '21', y1: '10', x2: '7', y2: '10' } },
  { tag: 'line', attrs: { x1: '21', y1: '6', x2: '3', y2: '6' } },
  { tag: 'line', attrs: { x1: '21', y1: '14', x2: '3', y2: '14' } },
  { tag: 'line', attrs: { x1: '21', y1: '18', x2: '7', y2: '18' } },
]);

export const IconAlignJustify = createIconMulti([
  { tag: 'line', attrs: { x1: '21', y1: '10', x2: '3', y2: '10' } },
  { tag: 'line', attrs: { x1: '21', y1: '6', x2: '3', y2: '6' } },
  { tag: 'line', attrs: { x1: '21', y1: '14', x2: '3', y2: '14' } },
  { tag: 'line', attrs: { x1: '21', y1: '18', x2: '3', y2: '18' } },
]);

// ===== 颜色 =====
export const IconTextColor: FunctionalComponent = () =>
  h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 24 24',
      width: '1em',
      height: '1em',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
    [
      h('path', { d: 'M4 20h16' }),
      h('path', { d: 'M9.354 4h5.292L18 16H6l3.354-12z', fill: 'none' }),
    ],
  );

export const IconHighlightColor: FunctionalComponent = () =>
  h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 24 24',
      width: '1em',
      height: '1em',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
    [
      h('path', { d: 'M12 20h9' }),
      h('path', {
        d: 'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z',
      }),
    ],
  );

// ===== 上下标 =====
export const IconSuperscript: FunctionalComponent = () =>
  h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 24 24',
      width: '1em',
      height: '1em',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
    [
      h('path', { d: 'M4 19l8-8' }),
      h('path', { d: 'M12 19l-8-8' }),
      h('path', {
        d: 'M20 12h-4c0-1.5.442-2 1.5-2.5S20 8.334 20 7.002c0-.472-.17-.93-.484-1.29a2.105 2.105 0 0 0-2.617-.436c-.42.239-.738.614-.899 1.06',
      }),
    ],
  );

export const IconSubscript: FunctionalComponent = () =>
  h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 24 24',
      width: '1em',
      height: '1em',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
    [
      h('path', { d: 'M4 5l8 8' }),
      h('path', { d: 'M12 5l-8 8' }),
      h('path', {
        d: 'M20 19h-4c0-1.5.44-2 1.5-2.5S20 15.33 20 14c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.06',
      }),
    ],
  );

export const IconChevronDown = createIcon('M6 9l6 6 6-6');

export const IconFontSize: FunctionalComponent = () =>
  h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 24 24',
      width: '1em',
      height: '1em',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
    [
      h('path', { d: 'M4 7V4h16v3' }),
      h('path', { d: 'M9 20h6' }),
      h('path', { d: 'M12 4v16' }),
    ],
  );

export const IconFontFamily: FunctionalComponent = () =>
  h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 24 24',
      width: '1em',
      height: '1em',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
    [
      h('polyline', { points: '4 7 4 4 20 4 20 7' }),
      h('line', { x1: '9', y1: '20', x2: '15', y2: '20' }),
      h('line', { x1: '12', y1: '4', x2: '12', y2: '20' }),
    ],
  );
