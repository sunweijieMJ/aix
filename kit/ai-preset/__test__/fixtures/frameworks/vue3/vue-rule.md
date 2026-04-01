---
id: vue3/vue-rule
title: Vue 示例规则
description: 测试用的 Vue 框架规则
layer: framework
priority: 110
platforms: []
tags: [vue, test]
version: "1.0.0"
variables:
  componentPrefix:
    default: "app"
    description: "CSS 前缀"
---

## Vue 组件规范

使用 `.{{componentPrefix}}-` 前缀命名 CSS 类。
