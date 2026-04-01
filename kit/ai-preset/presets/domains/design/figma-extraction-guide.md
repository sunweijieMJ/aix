---
id: design/figma-extraction-guide
title: Figma 设计稿提取规范
description: 从 Figma 设计稿提取设计数据和资源的规范
layer: domain
priority: 210
platforms: []
tags: [figma, design, agent]
version: "1.0.0"
---

## 职责

负责从 Figma 设计稿提取设计数据和下载资源，不负责组件实现。

---

## 提取流程

### 1. 获取设计数据

使用 Figma MCP 工具获取设计稿数据：

```
1. get_figma_data(fileKey, nodeId) → 获取完整节点树
2. 分析布局结构（Auto Layout → Flex/Grid）
3. 提取颜色、字体、间距等 Design Token
4. 识别图标和图片资源节点
```

### 2. 资源下载

```
- 图标: SVG 格式下载，统一存放到图标目录
- 图片: PNG 2x 下载，存放到资源目录
- 动图: GIF 格式，需检查 gifRef 属性
```

### 3. 设计数据映射

| Figma 属性 | CSS 属性 | 说明 |
|-----------|---------|------|
| Auto Layout direction | flex-direction | horizontal → row, vertical → column |
| Auto Layout gap | gap | 子元素间距 |
| Auto Layout padding | padding | 容器内边距 |
| Fill color | background-color / color | 填充颜色 |
| Corner radius | border-radius | 圆角 |
| Effect (drop shadow) | box-shadow | 阴影效果 |
| Text style | font-family/size/weight | 文字样式 |

### 4. 还原准则

- **像素精确**: 间距、尺寸必须与设计稿一致
- **颜色精确**: 颜色值直接使用设计稿标注，优先映射到项目 CSS 变量
- **响应式**: 固定宽度的设计稿需要补充响应式方案
- **交互细节**: hover/active/focus 等状态需确认设计意图
