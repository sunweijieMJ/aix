/**
 * 模拟 Figma REST /v1/files/:key/nodes 返回的 Hero 区块节点树
 *
 * 结构：
 *   Hero (FRAME 1200x400, auto-layout vertical, padding 48, gap 16, bg #FFFFFF)
 *   ├── Title (TEXT "欢迎使用管理后台", 28px/600, #1F2329)
 *   ├── Subtitle (TEXT "一站式数据管理", 16px/400, #646A73, lineHeight AUTO)
 *   ├── CTA (INSTANCE 120x40, bg #005826, radius 8)
 *   │   └── Label (TEXT "立即开始", 14px/500, #FFFFFF)
 *   ├── Badge (FRAME 96x24, hidden)
 *   └── Icon (VECTOR 24x24)
 */

import type { FigmaNode } from '../../src/core/figma/types';

const color = (r: number, g: number, b: number, a = 1) => ({
  r: r / 255,
  g: g / 255,
  b: b / 255,
  a,
});

export const heroFixture: FigmaNode = {
  id: '12:34',
  name: 'Hero',
  type: 'FRAME',
  absoluteBoundingBox: { x: 100, y: 200, width: 1200, height: 400 },
  fills: [{ type: 'SOLID', color: color(255, 255, 255) }],
  layoutMode: 'VERTICAL',
  primaryAxisAlignItems: 'MIN',
  counterAxisAlignItems: 'MIN',
  paddingTop: 48,
  paddingRight: 48,
  paddingBottom: 48,
  paddingLeft: 48,
  itemSpacing: 16,
  cornerRadius: 0,
  opacity: 1,
  children: [
    {
      id: '12:36',
      name: 'Title',
      type: 'TEXT',
      absoluteBoundingBox: { x: 148, y: 248, width: 300, height: 40 },
      characters: '欢迎使用  管理后台',
      fills: [{ type: 'SOLID', color: color(31, 35, 41) }],
      style: {
        fontFamily: 'PingFang SC',
        fontWeight: 600,
        fontSize: 28,
        lineHeightPx: 40,
        lineHeightUnit: 'PIXELS',
        letterSpacing: 0,
        textAlignHorizontal: 'LEFT',
      },
    },
    {
      id: '12:37',
      name: 'Subtitle',
      type: 'TEXT',
      absoluteBoundingBox: { x: 148, y: 304, width: 200, height: 24 },
      characters: '一站式数据管理',
      fills: [{ type: 'SOLID', color: color(100, 106, 115) }],
      style: {
        fontFamily: 'PingFang SC',
        fontWeight: 400,
        fontSize: 16,
        lineHeightPx: 22.4,
        lineHeightUnit: 'INTRINSIC_%',
        letterSpacing: 0,
        textAlignHorizontal: 'LEFT',
      },
    },
    {
      id: '12:40',
      name: 'CTA',
      type: 'INSTANCE',
      componentId: '9:1',
      absoluteBoundingBox: { x: 148, y: 344, width: 120, height: 40 },
      fills: [{ type: 'SOLID', color: color(0, 88, 38), opacity: 1 }],
      cornerRadius: 8,
      effects: [
        { type: 'DROP_SHADOW', radius: 4, offset: { x: 0, y: 2 }, color: color(0, 0, 0, 0.1) },
      ],
      layoutMode: 'HORIZONTAL',
      primaryAxisAlignItems: 'SPACE_BETWEEN',
      itemSpacing: 8,
      paddingLeft: 16,
      paddingRight: 16,
      paddingTop: 0,
      paddingBottom: 0,
      children: [
        {
          id: '12:41',
          name: 'Label',
          type: 'TEXT',
          absoluteBoundingBox: { x: 180, y: 354, width: 56, height: 20 },
          characters: '立即开始',
          fills: [{ type: 'SOLID', color: color(255, 255, 255) }],
          style: {
            fontFamily: 'PingFang SC',
            fontWeight: 500,
            fontSize: 14,
            lineHeightPx: 20,
            lineHeightUnit: 'PIXELS',
          },
        },
      ],
    },
    {
      id: '12:38',
      name: 'Badge',
      type: 'FRAME',
      visible: false,
      absoluteBoundingBox: { x: 420, y: 248, width: 96, height: 24 },
    },
    {
      id: '12:50',
      name: 'Icon',
      type: 'VECTOR',
      absoluteBoundingBox: { x: 1240, y: 248, width: 24, height: 24 },
      fills: [{ type: 'SOLID', color: color(0, 88, 38) }],
      children: [
        {
          id: '12:51',
          name: 'path',
          type: 'VECTOR',
          absoluteBoundingBox: { x: 1240, y: 248, width: 24, height: 24 },
        },
      ],
    },
  ],
};
