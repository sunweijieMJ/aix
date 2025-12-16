/**
 * @fileoverview Attachments 组件类型定义
 */

import type { VNode, Component } from 'vue';

/** 附件项 */
export interface AttachmentItem {
  /** 唯一标识 */
  id: string;
  /** 文件名 */
  name: string;
  /** 文件大小（字节） */
  size: number;
  /** 文件类型 */
  type: string;
  /** 文件 URL */
  url?: string;
  /** 上传状态 */
  status?: 'uploading' | 'success' | 'error';
  /** 上传进度（0-100） */
  progress?: number;
  /** 错误信息 */
  error?: string;
  /** 原始文件对象 */
  file?: File;
  /** 缩略图 URL（图片类型） */
  thumbUrl?: string;
  /** 自定义数据 */
  meta?: Record<string, unknown>;
}

/**
 * 附件布局类型
 */
export type AttachmentsLayout = 'horizontal' | 'vertical' | 'grid';

/**
 * 预览配置
 */
export interface AttachmentsPreviewConfig {
  /** 是否启用预览 */
  enabled?: boolean;
  /** 预览模式 */
  mode?: 'modal' | 'inline' | 'new-tab';
  /** 图片预览缩放 */
  zoom?: boolean;
  /** 是否显示下载按钮 */
  showDownload?: boolean;
}

/**
 * 附件项渲染参数
 */
export interface AttachmentItemRenderProps {
  /** 附件项数据 */
  item: AttachmentItem;
  /** 移除处理函数 */
  onRemove: () => void;
  /** 预览处理函数 */
  onPreview: () => void;
}

/**
 * 附件项渲染函数
 */
export type AttachmentItemRender = (props: AttachmentItemRenderProps) => VNode;

/**
 * 占位符配置
 */
export interface AttachmentsPlaceholder {
  /** 占位符图标 */
  icon?: VNode | Component | string;
  /** 占位符标题 */
  title?: string;
  /** 占位符描述 */
  description?: string;
}

/** Attachments 组件 Props */
export interface AttachmentsProps {
  /** 附件列表 */
  items?: AttachmentItem[];
  /** 允许的文件类型 */
  accept?: string[];
  /** 最大文件大小（字节） */
  maxSize?: number;
  /** 最大文件数量 */
  maxCount?: number;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否显示上传按钮 */
  showUploadButton?: boolean;
  /** 是否支持拖拽上传 */
  draggable?: boolean;
  /** 是否支持多文件上传 */
  multiple?: boolean;
  /** 布局方式 */
  layout?: AttachmentsLayout;
  /** 占位符配置 */
  placeholder?: AttachmentsPlaceholder;
  /** 预览配置 */
  preview?: AttachmentsPreviewConfig;
  /** 自定义附件项渲染 */
  itemRender?: AttachmentItemRender;
  /** 是否显示文件大小 */
  showSize?: boolean;
  /** 是否显示下载按钮 */
  showDownload?: boolean;
  /** 获取拖拽容器 */
  getDropContainer?: () => HTMLElement | null;
  /** 自定义类名 */
  className?: string;
  /** 语义化类名 */
  classNames?: {
    root?: string;
    list?: string;
    item?: string;
    upload?: string;
    dropzone?: string;
    placeholder?: string;
  };
  /** 语义化样式 */
  styles?: {
    root?: Record<string, string>;
    list?: Record<string, string>;
    item?: Record<string, string>;
    upload?: Record<string, string>;
    dropzone?: Record<string, string>;
    placeholder?: Record<string, string>;
  };
}

/** Attachments 组件 Emits */
export interface AttachmentsEmits {
  (e: 'update:items', items: AttachmentItem[]): void;
  (e: 'upload', file: File): void;
  (e: 'remove', item: AttachmentItem): void;
  (e: 'preview', item: AttachmentItem): void;
  (e: 'download', item: AttachmentItem): void;
  (e: 'error', error: Error): void;
  (e: 'drop', files: File[]): void;
}
