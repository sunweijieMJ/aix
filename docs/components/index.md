---
title: 组件总览
outline: deep
---

# 组件总览

Aix 提供了丰富的企业级 UI 组件，覆盖常见的业务场景。

## 基础组件

| 组件 | 包名 | 说明 |
|------|------|------|
| [Button 按钮](/components/button) | `@aix/button` | 触发业务逻辑时使用 |
| [Icons 图标](/components/icons) | `@aix/icons` | 580+ SVG 图标组件 |

## 导航组件

| 组件 | 包名 | 说明 |
|------|------|------|
| [Menu 菜单](/components/menu) | `@aix/menu` | 侧边导航，支持分组、flyout 子菜单、搜索与拖拽宽度 |

## AI 组件

| 组件 | 包名 | 说明 |
|------|------|------|
| [AiChat AI 对话](/components/ai-chat) | `@aix/ai-chat` | 流式对话、深度思考、附件与语音、会话列表 |

## 媒体组件

| 组件 | 包名 | 说明 |
|------|------|------|
| [VideoPlayer 视频播放器](/components/video) | `@aix/video` | 支持 HLS/FLV/DASH/RTSP 等多协议 |
| [Audio 语音](/components/audio) | `@aix/audio` | ASR / TTS / 录音 / 波形，含 AudioPlayer 与 WaveformCanvas |
| [Subtitle 字幕](/components/subtitle) | `@aix/subtitle` | 支持 VTT/SRT/ASS 等多格式字幕 |
| [PdfViewer PDF 预览器](/components/pdf-viewer) | `@aix/pdf-viewer` | PDF 预览、文本选择、图片提取 |

## 编辑器组件

| 组件 | 包名 | 说明 |
|------|------|------|
| [CodeEditor 代码编辑器](/components/code-editor) | `@aix/code-editor` | 基于 CodeMirror 的代码编辑器 |
| [RichTextEditor 富文本编辑器](/components/rich-text-editor) | `@aix/rich-text-editor` | 富文本编辑器 |

## 弹出层组件

| 组件 | 包名 | 说明 |
|------|------|------|
| [Popper 弹出层](/components/popper) | `@aix/popper` | Popper / Tooltip / Popover / Dropdown / ContextMenu |

## 图形组件

| 组件 | 包名 | 说明 |
|------|------|------|
| [FlowGraph 流程图](/components/flow-graph) | `@aix/flow-graph` | 基于 Vue Flow 的节点 / 边编辑，支持连线、搜索、多路径着色 |

## 工具包

| 包名 | 说明 | 文档 |
|------|------|------|
| `@aix/theme` | 主题系统，CSS Variables + 亮暗模式 | [主题定制](/guide/theme) |
| `@aix/hooks` | 公共 Composition API Hooks | [国际化](/guide/i18n) |

## 安装

```bash
# 按需安装
pnpm add @aix/button
pnpm add @aix/video
pnpm add @aix/pdf-viewer

# 主题系统（推荐所有项目安装）
pnpm add @aix/theme
```

## 快速使用

```vue
<script setup lang="ts">
import { Button } from '@aix/button';
import { VideoPlayer } from '@aix/video';
import { PdfViewer } from '@aix/pdf-viewer';
</script>

<template>
  <Button type="primary">点击我</Button>
  <VideoPlayer src="https://example.com/video.m3u8" />
  <PdfViewer src="https://example.com/document.pdf" />
</template>
```
