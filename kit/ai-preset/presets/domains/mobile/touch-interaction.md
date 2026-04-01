---
id: mobile/touch-interaction
title: 触控交互规范
description: 手势交互、点击区域和滚动优化
layer: domain
priority: 210
platforms: []
tags: [mobile, touch, interaction]
version: "1.0.0"
---

## 点击区域

- 最小可点击区域: **44 × 44 px**（Apple HIG 推荐）
- 相邻可点击元素间距 ≥ **8px**
- 使用 `padding` 扩大点击区域，而非视觉尺寸

```scss
// ✅ 视觉 24px 图标，点击区域 44px
.icon-button {
  width: 24px;
  height: 24px;
  padding: 10px;
  box-sizing: content-box;
}
```

## 手势交互

| 手势 | 用途 | 实现方式 |
|------|------|---------|
| 点击 | 主要操作 | click 事件 |
| 长按 | 二级操作（菜单/选择） | touchstart + 定时器 |
| 左滑 | 删除/操作 | touch 事件计算位移 |
| 下拉 | 刷新 | 下拉刷新组件 |
| 上拉 | 加载更多 | 滚动监听 |

## 300ms 点击延迟

```css
/* 消除 iOS 300ms 延迟 */
* { touch-action: manipulation; }
```

## 滚动优化

```scss
// 弹性滚动
.scroll-container {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain; // 防止连锁滚动
}
```

## 移动端性能

- 首屏加载 ≤ **3 秒**（3G 网络）
- 图片懒加载（`loading="lazy"` 或 IntersectionObserver）
- 骨架屏替代 loading spinner
- 虚拟列表（≥ 50 项列表）
- 预加载关键资源（`<link rel="preload">`）
