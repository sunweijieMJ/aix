---
id: mobile/responsive-design
title: 响应式设计规范
description: 移动端自适应布局、视口配置和断点策略
layer: domain
priority: 200
platforms: []
tags: [mobile, responsive, agent]
version: "1.0.0"
---

## 职责

负责移动端/H5 响应式设计和自适应布局指导。

---

## 视口配置

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
```

## 适配方案

### rem + vw 混合方案

```scss
// 设计稿基准: 375px
html { font-size: calc(100vw / 375 * 16); }

// 使用 rem 单位
.container {
  padding: 0.75rem; // = 12px @375
  font-size: 0.875rem; // = 14px @375
}
```

### 断点策略

| 断点 | 宽度 | 设备 |
|------|------|------|
| xs | < 375px | 小屏手机 |
| sm | 375-413px | 标准手机 |
| md | 414-767px | 大屏手机/小平板 |
| lg | 768-1023px | 平板 |
| xl | ≥ 1024px | 桌面 |

### 安全区域

```scss
// iOS 刘海屏适配
.footer-bar {
  padding-bottom: env(safe-area-inset-bottom);
}

.header-bar {
  padding-top: env(safe-area-inset-top);
}
```

## 布局规范

- 弹性布局优先（Flexbox）
- 避免固定宽度，使用百分比或 min/max
- 图片使用 `max-width: 100%` 防溢出
- 横向滚动仅在轮播/列表等特定场景使用
- 文字最小 12px（iOS 限制），推荐 14px 正文
