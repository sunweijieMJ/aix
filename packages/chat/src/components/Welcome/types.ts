/**
 * @fileoverview Welcome 组件类型定义
 */

import type { VNode, Component } from 'vue';

/** 功能特性项 */
export interface WelcomeFeature {
  key: string;
  icon?: string | VNode | Component;
  title: string;
  description?: string;
  disabled?: boolean;
}

/**
 * Welcome 变体样式
 */
export type WelcomeVariant = 'filled' | 'outlined' | 'borderless';

/**
 * 功能项渲染参数
 */
export interface WelcomeFeatureRenderProps {
  /** 功能项数据 */
  feature: WelcomeFeature;
  /** 点击处理函数 */
  onClick: () => void;
}

/**
 * 功能项渲染函数
 */
export type WelcomeFeatureRender = (props: WelcomeFeatureRenderProps) => VNode;

/** Welcome 组件 Props */
export interface WelcomeProps {
  /** 主标题 */
  title?: string;
  /** 描述文本 */
  description?: string;
  /** 组件图标 */
  icon?: string | VNode | Component;
  /** 功能特性列表 */
  features?: WelcomeFeature[];
  /** 布局方式 */
  layout?: 'grid' | 'list';
  /** 网格列数 */
  columns?: number;
  /** 变体样式 */
  variant?: WelcomeVariant;
  /** 是否显示边框 */
  bordered?: boolean;
  /** 自定义功能项渲染 */
  featureRender?: WelcomeFeatureRender;
  /** 自定义类名 */
  className?: string;
  /** 语义化类名 */
  classNames?: {
    root?: string;
    header?: string;
    icon?: string;
    title?: string;
    description?: string;
    features?: string;
    featureItem?: string;
    extra?: string;
  };
  /** 语义化样式 */
  styles?: {
    root?: Record<string, string>;
    header?: Record<string, string>;
    icon?: Record<string, string>;
    title?: Record<string, string>;
    description?: Record<string, string>;
    features?: Record<string, string>;
    featureItem?: Record<string, string>;
    extra?: Record<string, string>;
  };
}

/** Welcome 组件 Emits */
export interface WelcomeEmits {
  (e: 'featureClick', feature: WelcomeFeature): void;
}
