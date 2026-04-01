---
id: commands/optimize
title: 性能优化指南
description: 性能优化提示，包含组件、API、构建优化等最佳实践
resourceType: command
layer: base
priority: 300
platforms: [claude]
tags: [command, performance]
version: "1.0.0"
---

# 性能优化最佳实践

> 先**测量性能**，找出真正的瓶颈，避免过早优化。

## 测量工具

```bash
# 构建分析
pnpm build && du -sh dist/

# Chrome DevTools
# - Performance 面板: 录制性能
# - Lighthouse: 综合评分
# - Network 面板: 网络请求分析
```

## 组件优化

- [ ] **computed 缓存** — 避免模板中直接调用函数
- [ ] **v-memo** — 只在依赖变化时重新渲染
- [ ] **v-once** — 静态内容只渲染一次
- [ ] **shallowRef** — 大型对象避免深层响应
- [ ] **虚拟滚动** — 列表 > 100 项时使用

```vue
<!-- ✅ computed 缓存 -->
<ChildComponent :data="computedData" />

<!-- ✅ v-memo 条件渲染 -->
<UserCard v-memo="[user.id]" :user="user" />
```

## API 优化

- [ ] **请求去重** — 相同参数不重复请求
- [ ] **请求取消** — 组件卸载时取消未完成请求
- [ ] **缓存策略** — 不常变的数据设置 staleTime
- [ ] **分页/虚拟滚动** — 大数据量分页加载

## 路由优化

- [ ] **路由懒加载** — `() => import('@/views/xxx.vue')`
- [ ] **预加载** — 鼠标悬停时预加载目标页面
- [ ] **骨架屏** — 路由切换时显示骨架屏

## 构建优化

- [ ] **Tree-shaking** — 使用命名导出，避免 `export default { ... }`
- [ ] **代码分割** — 路由级别 + 大型组件库按需导入
- [ ] **图片优化** — WebP 格式 + 压缩 + 懒加载
- [ ] **Gzip/Brotli** — 服务端开启压缩

## 网络优化

- [ ] **CDN** — 静态资源上 CDN
- [ ] **HTTP/2** — 多路复用
- [ ] **预加载关键资源** — `<link rel="preload">`
- [ ] **DNS 预解析** — `<link rel="dns-prefetch">`
